const { query } = require('../db')

// Cari barang jadi yang punya komposisi (resep).
async function cariBarangJadi(search = '', limit = 10) {
  const lim = Math.min(parseInt(limit, 10) || 10, 50)
  return query(
    `SELECT b.brg_id AS id, b.brg_kode AS kode, b.brg_nama AS nama, b.brg_satuan AS satuan,
            ROUND(b.brg_hargajual,0) AS harga_jual,
            COUNT(k.brgk_id) AS jumlah_bahan
       FROM tbarang b
       LEFT JOIN tbarangkomposisi k ON k.brgk_brg_id = b.brg_id
      WHERE (? = '' OR b.brg_nama LIKE ? OR b.brg_kode LIKE ?)
      GROUP BY b.brg_id, b.brg_kode, b.brg_nama, b.brg_satuan, b.brg_hargajual
      ORDER BY jumlah_bahan DESC, b.brg_nama
      LIMIT ${lim}`,
    [search, `%${search}%`, `%${search}%`]
  )
}

// Komposisi / resep satu produk: kebutuhan bahan per 1 ton (1000 kg).
// brgk_jumlah umumnya dalam % (atau NULL yang berarti %). Kebutuhan per ton = brgk_jumlah/100*1000 kg.
async function komposisiProduk({ barang = '', idBarang = 0 }) {
  const id = parseInt(idBarang, 10) || 0
  let barangRow = null
  if (id) {
    const rows = await query(`SELECT brg_id AS id, brg_kode AS kode, brg_nama AS nama, brg_satuan AS satuan FROM tbarang WHERE brg_id = ?`, [id])
    barangRow = rows[0] || null
    if (!barangRow) return { error: `Barang dengan id ${id} tidak ditemukan.` }
  } else {
    if (!barang) return { error: 'Sebutkan nama produk, misal AC-WC, AC-BC, HRS-WC, SS A.' }
    const candidates = await cariBarangJadi(barang, 5)
    if (!candidates.length) return { error: `Produk "${barang}" tidak ditemukan di tbarang.` }
    // Pilih yang punya komposisi dulu
    barangRow = candidates.find((c) => c.jumlah_bahan > 0) || candidates[0]
  }

  const rows = await query(
    `SELECT k.brgk_bhn_id AS id_bahan, h.bhn_kode AS kode_bahan, h.bhn_nama AS bahan, h.bhn_satuan AS satuan_bahan,
            ROUND(k.brgk_jumlah, 3) AS persen,
            k.brgk_satuan AS satuan_resep,
            ROUND(k.brgk_jumlah / 100 * 1000, 2) AS kebutuhan_kg_per_ton
       FROM tbarangkomposisi k
       JOIN tbahan h ON h.bhn_id = k.brgk_bhn_id
      WHERE k.brgk_brg_id = ?
        AND (k.brgk_end_date IS NULL OR k.brgk_end_date >= CURDATE())
        AND k.brgk_start_date <= CURDATE()
      ORDER BY k.brgk_jumlah DESC`,
    [barangRow.id]
  )
  if (!rows.length) return { barang: barangRow, rows: [], catatan: 'Produk ini tidak punya resep di tbarangkomposisi (umumnya jasa, bukan campuran aspal).' }

  const totalPersen = rows.reduce((s, r) => s + (parseFloat(r.persen) || 0), 0)
  return {
    barang: barangRow,
    total_persen: Math.round(totalPersen * 100) / 100,
    catatan: 'kebutuhan_kg_per_ton = persen/100 x 1000 kg. Berlaku untuk 1 ton produk.',
    rows
  }
}

// Stok total per bahan (semua gudang, s/d hari ini) untuk daftar id bahan.
async function stokPerBahan(idBahanList) {
  if (!idBahanList.length) return {}
  const placeholders = idBahanList.map(() => '?').join(',')
  const rows = await query(
    `SELECT m.mst_bhn_id AS id_bahan, ROUND(SUM(m.mst_qty), 2) AS stok_total
       FROM tmasterstokbahan m
      WHERE m.mst_tanggal <= CURDATE() AND m.mst_bhn_id IN (${placeholders})
      GROUP BY m.mst_bhn_id`,
    idBahanList
  )
  const breakdown = await query(
    `SELECT m.mst_bhn_id AS id_bahan, g.gdg_nama AS gudang, ROUND(SUM(m.mst_qty), 2) AS stok
       FROM tmasterstokbahan m JOIN tgudang g ON g.gdg_id = m.mst_gdg_id
      WHERE m.mst_tanggal <= CURDATE() AND m.mst_bhn_id IN (${placeholders})
      GROUP BY m.mst_bhn_id, g.gdg_nama`,
    idBahanList
  )
  const rincian = {}
  for (const b of breakdown) {
    if (!rincian[b.id_bahan]) rincian[b.id_bahan] = []
    rincian[b.id_bahan].push(`${b.gudang}: ${b.stok}`)
  }
  const map = {}
  for (const r of rows) map[r.id_bahan] = { ...r, rincian_gudang: (rincian[r.id_bahan] || []).join(' | ') }
  // Bahan tanpa baris stok = stok 0
  for (const id of idBahanList) {
    if (!map[id]) map[id] = { id_bahan: id, stok_total: 0, rincian_gudang: 'stok kosong' }
  }
  return map
}

// Estimasi kemampuan produksi (ton) dari stok saat ini.
// Rumus: maks_ton = MIN(stok_bahan_kg / kebutuhan_kg_per_ton) -> bahan pembatas.
// Jika targetTon diisi: cek cukup/tidak untuk target tersebut.
async function estimasiProduksi({ barang = '', idBarang = 0, targetTon = 0 }) {
  const target = parseFloat(targetTon) || 0
  const id = parseInt(idBarang, 10) || 0

  // Tentukan daftar produk yang dihitung
  let produkList = []
  if (id) {
    const k = await komposisiProduk({ idBarang: id })
    if (k.error) return k
    if (!k.rows.length) return k
    produkList = [{ barang: k.barang, rows: k.rows }]
  } else if (barang && barang.toLowerCase() !== 'semua') {
    const candidates = await cariBarangJadi(barang, 5)
    const beresep = candidates.filter((c) => c.jumlah_bahan > 0)
    if (!beresep.length) {
      return { error: `Produk "${barang}" tidak ditemukan atau tidak punya resep. Produk beresep: SS A, SS B, SCS, HRS-WC, AC-WC, AC-BC, AC-BASE, ASPAL CRS/CSS.`, kandidat: candidates }
    }
    for (const c of beresep.slice(0, 3)) {
      const k = await komposisiProduk({ idBarang: c.id })
      produkList.push({ barang: k.barang, rows: k.rows })
    }
  } else {
    // Semua produk beresep
    const semua = await query(
      `SELECT DISTINCT b.brg_id AS id, b.brg_kode AS kode, b.brg_nama AS nama, b.brg_satuan AS satuan
         FROM tbarang b JOIN tbarangkomposisi k ON k.brgk_brg_id = b.brg_id ORDER BY b.brg_nama`
    )
    for (const c of semua) {
      const k = await komposisiProduk({ idBarang: c.id })
      if (k.rows && k.rows.length) produkList.push({ barang: k.barang, rows: k.rows })
    }
  }

  // Kumpulkan semua id bahan lalu ambil stok sekaligus
  const allIds = [...new Set(produkList.flatMap((p) => p.rows.map((r) => r.id_bahan)))]
  const stokMap = await stokPerBahan(allIds)

  const hasil = produkList.map((p) => {
    let maksTon = Infinity
    let pembatas = null
    const detail = p.rows.map((r) => {
      const stokInfo = stokMap[r.id_bahan] || {}
      const stok = parseFloat(stokInfo.stok_total) || 0
      const butuhPerTon = parseFloat(r.kebutuhan_kg_per_ton) || 0
      const tonMampu = butuhPerTon > 0 ? stok / butuhPerTon : 0
      if (tonMampu < maksTon) { maksTon = tonMampu; pembatas = r.bahan }
      return {
        bahan: r.bahan,
        persen: r.persen,
        kebutuhan_kg_per_ton: r.kebutuhan_kg_per_ton,
        stok_kg: Math.round(stok * 100) / 100,
        rincian_gudang: stokInfo.rincian_gudang || '-',
        mampu_ton: Math.floor(tonMampu * 100) / 100
      }
    })
    if (!isFinite(maksTon)) maksTon = 0
    maksTon = Math.max(0, Math.floor(maksTon * 100) / 100)
    const out = {
      produk: p.barang.nama,
      kode: p.barang.kode,
      estimasi_maks_ton: maksTon,
      estimasi_maks_kg: Math.round(maksTon * 1000),
      bahan_pembatas: pembatas,
      detail
    }
    if (target > 0) {
      const kebutuhan = p.rows.map((r) => ({
        bahan: r.bahan,
        butuh_kg: Math.round(parseFloat(r.kebutuhan_kg_per_ton) * target * 100) / 100,
        stok_kg: (detail.find((d) => d.bahan === r.bahan) || {}).stok_kg || 0
      })).map((k) => ({ ...k, kurang_kg: Math.round((k.butuh_kg - k.stok_kg) * 100) / 100, cukup: k.stok_kg >= k.butuh_kg }))
      out.target_ton = target
      out.target_terpenuhi = maksTon >= target
      out.kebutuhan_target = kebutuhan
    }
    return out
  })

  hasil.sort((a, b) => b.estimasi_maks_ton - a.estimasi_maks_ton)
  return { tanggal_stok: 's/d hari ini (CURDATE, semua gudang)', params: { barang, idBarang, targetTon: target }, hasil }
}

module.exports = { cariBarangJadi, komposisiProduk, estimasiProduksi }
