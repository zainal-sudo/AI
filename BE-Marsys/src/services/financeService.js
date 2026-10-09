const { query } = require('../db')

async function rekapPiutang({ searchCustomer }) {
  const where = []
  const params = []
  if (searchCustomer) {
    where.push('f.cus_nama LIKE ?')
    params.push(`%${searchCustomer}%`)
  }

  const sql = `
    SELECT 
      f.cus_nama AS customer_nama,
      COUNT(f.fp_nomor) AS jumlah_faktur,
      ROUND(SUM(f.fp_amount), 0) AS total_omzet,
      ROUND(SUM(f.fp_bayar), 0) AS total_bayar,
      ROUND(SUM(f.fp_amount), 0) - ROUND(SUM(f.fp_bayar), 0) AS sisa_piutang
    FROM rptpenjualan f
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY f.cus_nama
    HAVING sisa_piutang > 0
    ORDER BY sisa_piutang DESC
    LIMIT 200
  `
  const rows = await query(sql, params)
  const totalPiutang = rows.reduce((acc, r) => acc + Number(r.sisa_piutang || 0), 0)
  return { totalPiutang, rows }
}

async function rekapBiaya({ tanggalAwal, tanggalAkhir, searchAkun }) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = tanggalAkhir || new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAwal || tanggalAkhir.slice(0, 8) + '01'
  }
  const dates = { tanggalAwal, tanggalAkhir }
  const where = ['j.Tanggal BETWEEN ? AND ?']
  const params = [tanggalAwal, tanggalAkhir]

  if (searchAkun) {
    where.push('j.AccountName LIKE ?')
    params.push(`%${searchAkun}%`)
  }

  const sql = `
    SELECT 
      j.AccountName AS akun,
      ROUND(SUM(j.Debet), 0) AS total_debet,
      ROUND(SUM(j.Kredit), 0) AS total_kredit,
      ROUND(SUM(j.Debet), 0) - ROUND(SUM(j.Kredit), 0) AS total_bersih
    FROM alljurnal j
    WHERE ${where.join(' AND ')}
      AND (j.AccountName LIKE 'Biaya%' OR j.AccountName LIKE 'Beban%')
    GROUP BY j.AccountName
    ORDER BY total_bersih DESC
    LIMIT 200
  `
  const rows = await query(sql, params)
  const totalBiaya = rows.reduce((acc, r) => acc + Number(r.total_bersih || 0), 0)
  return { params: dates, totalBiaya, rows }
}

function parsePeriodeLR(tanggalAwal, tanggalAkhir) {
  const a = String(tanggalAwal || '').slice(0, 10)
  const b = String(tanggalAkhir || a).slice(0, 10)
  const y1 = parseInt(a.slice(0, 4), 10)
  const m1 = parseInt(a.slice(5, 7), 10)
  const y2 = parseInt(b.slice(0, 4), 10)
  const m2 = parseInt(b.slice(5, 7), 10)
  return { y1, m1, y2, m2, tanggalAwal: a, tanggalAkhir: b }
}

async function labaRugi({ tanggalAwal, tanggalAkhir }) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAkhir.slice(0, 8) + '01'
  }
  if (!tanggalAwal) tanggalAwal = tanggalAkhir
  if (!tanggalAkhir) tanggalAkhir = tanggalAwal
  const p = parsePeriodeLR(tanggalAwal, tanggalAkhir)
  const kodeAwal = p.y1 * 100 + p.m1
  const kodeAkhir = p.y2 * 100 + p.m2

  const rows = await query(
    `SELECT lr_tahun AS tahun, lr_periode AS bulan, lr_rek_kode AS kode, lr_rek_nama AS akun,
            lr_keterangan AS kategori, ROUND(SUM(lr_nilai),0) AS nilai
       FROM tlabarugi
      WHERE (lr_tahun * 100 + lr_periode) BETWEEN ? AND ?
      GROUP BY lr_rek_kode, lr_rek_nama, lr_keterangan, lr_tahun, lr_periode
      ORDER BY lr_tahun, lr_periode, lr_keterangan, lr_rek_nama
      LIMIT 2000`,
    [kodeAwal, kodeAkhir]
  )

  const rincian = rows.filter((r) => String(r.kode || '').trim() !== '')
  const totalRows = rows.filter((r) => String(r.kode || '').trim() === '')

  const sumKat = {}
  for (const r of rincian) {
    const k = r.kategori || '(tanpa kategori)'
    sumKat[k] = (sumKat[k] || 0) + Number(r.nilai || 0)
  }
  const ringkasan = Object.entries(sumKat).map(([kategori, total]) => ({ kategori, total: Math.round(total) }))

  return {
    params: { tanggalAwal: p.tanggalAwal, tanggalAkhir: p.tanggalAkhir },
    ringkasanPerKategori: ringkasan,
    totalRows: totalRows.map((r) => ({ akun: r.akun, nilai: Number(r.nilai || 0), tahun: r.tahun, bulan: r.bulan })),
    rincian: rincian.slice(0, 300),
    catatan: 'Nilai positif = pendapatan/laba, negatif = biaya/HPP. LABA BERSIH ada di totalRows.'
  }
}

async function neraca({ tanggal, tahun, bulan }) {
  let y, m
  if (tahun && bulan) {
    y = parseInt(tahun, 10); m = parseInt(bulan, 10)
  } else {
    const t = String(tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
    y = parseInt(t.slice(0, 4), 10); m = parseInt(t.slice(5, 7), 10)
    tanggal = t
  }
  const rows = await query(
    `SELECT nr_rek_kode AS kode, nr_rek_nama AS akun, nr_keterangan AS kategori,
            ROUND(nr_nilai,0) AS nilai
       FROM tneraca
      WHERE nr_tahun = ? AND nr_periode = ?
      ORDER BY nr_keterangan, nr_rek_nama
      LIMIT 2000`,
    [y, m]
  )
  const rincian = rows.filter((r) => String(r.kode || '').trim() !== '')
  const totalRows = rows.filter((r) => String(r.kode || '').trim() === '')
  const sumKat = {}
  for (const r of rincian) {
    const k = r.kategori || '(tanpa kategori)'
    sumKat[k] = (sumKat[k] || 0) + Number(r.nilai || 0)
  }
  return {
    params: { tahun: y, bulan: m, tanggal: tanggal || `${y}-${String(m).padStart(2, '0')}-01` },
    ringkasanPerKategori: Object.entries(sumKat).map(([kategori, total]) => ({ kategori, total: Math.round(total) })),
    totalRows: totalRows.map((r) => ({ akun: r.akun, nilai: Number(r.nilai || 0) })),
    rincian: rincian.slice(0, 300),
    catatan: 'Neraca = posisi saldo akhir bulan. TOTAL ASET harus = TOTAL HUTANG + MODAL.'
  }
}

async function bukuBesar({ tanggalAwal, tanggalAkhir, akun, limit = 200 }) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAkhir.slice(0, 8) + '01'
  }
  const where = ['j.Tanggal BETWEEN ? AND ?']
  const params = [tanggalAwal, tanggalAkhir]
  if (akun) {
    where.push('(j.AccountName LIKE ? OR j.ACCOUNT LIKE ?)')
    params.push(`%${akun}%`, `%${akun}%`)
  }
  const lim = Math.min(parseInt(limit, 10) || 200, 1000)
  const rows = await query(
    `SELECT j.Tanggal AS tanggal, j.Nomor AS nomor, j.Referensi AS referensi,
            j.ACCOUNT AS kode, j.AccountName AS akun, j.Keterangan AS keterangan,
            ROUND(j.Debet,0) AS debet, ROUND(j.Kredit,0) AS kredit, j.Kelompok AS kelompok
       FROM alljurnal j
      WHERE ${where.join(' AND ')}
      ORDER BY j.Tanggal DESC, j.Nomor DESC
      LIMIT ${lim}`,
    params
  )
  const totalDebet = rows.reduce((a, r) => a + Number(r.debet || 0), 0)
  const totalKredit = rows.reduce((a, r) => a + Number(r.kredit || 0), 0)
  return { params: { tanggalAwal, tanggalAkhir, akun: akun || '' }, totalDebet, totalKredit, selisih: totalDebet - totalKredit, rows }
}

async function daftarAkun(search = '', limit = 100) {
  const lim = Math.min(parseInt(limit, 10) || 100, 500)
  return query(
    `SELECT r.rek_kode AS kode, r.rek_nama AS nama
       FROM trekening r
      WHERE (? = '' OR r.rek_nama LIKE ? OR r.rek_kode LIKE ?)
      ORDER BY r.rek_kode
      LIMIT ${lim}`,
    [search, `%${search}%`, `%${search}%`]
  )
}

module.exports = {
  rekapPiutang,
  rekapBiaya,
  labaRugi,
  neraca,
  bukuBesar,
  daftarAkun
}