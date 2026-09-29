const { query } = require('../db')

function unwrapProc(rows) {
  if (Array.isArray(rows)) {
    if (Array.isArray(rows[0])) return rows[0]
    return rows
  }
  return []
}

async function kartuStok({ tanggalAwal, tanggalAkhir, idGudang = 0, idBahan = 0, limit = 1000 }) {
  const rows = unwrapProc(await query(
    'CALL `pkartuStok`(?, ?, ?, ?)',
    [tanggalAwal, tanggalAkhir, parseInt(idGudang, 10) || 0, parseInt(idBahan, 10) || 0]
  ))
  return {
    params: { tanggalAwal, tanggalAkhir, idGudang, idBahan },
    rows: rows.slice(0, parseInt(limit, 10) || 1000)
  }
}

async function historyStok({ tanggalAwal, tanggalAkhir, idGudang = 0 }) {
  const rows = unwrapProc(await query(
    'CALL `pGetHistoryStok`(?, ?, ?)',
    [tanggalAwal, tanggalAkhir, parseInt(idGudang, 10) || 0]
  ))
  return { params: { tanggalAwal, tanggalAkhir, idGudang }, rows }
}

async function saldoStok({ idGudang = 0, kritisDiBawah = 0 }) {
  const rows = await query(
    `SELECT b.bhn_id AS id_bahan, b.bhn_kode AS kode, b.bhn_nama AS nama_bahan, b.bhn_satuan AS satuan,
            g.gdg_id AS id_gudang, g.gdg_nama AS gudang,
            ROUND(SUM(m.mst_qty), 3) AS saldo_qty,
            ROUND(SUM(m.mst_qty * IFNULL(m.mst_avgcost, 0)), 0) AS nilai
       FROM tmasterstokbahan m
       JOIN tbahan b ON b.bhn_id = m.mst_bhn_id
       JOIN tgudang g ON g.gdg_id = m.mst_gdg_id
      WHERE m.mst_tanggal <= CURDATE()
        AND (? = 0 OR m.mst_gdg_id = ?)
      GROUP BY b.bhn_id, b.bhn_kode, b.bhn_nama, b.bhn_satuan, g.gdg_id, g.gdg_nama
      ${parseFloat(kritisDiBawah) > 0 ? `HAVING saldo_qty < ${parseFloat(kritisDiBawah)}` : ''}
      ORDER BY b.bhn_nama, g.gdg_nama
      LIMIT 1000`,
    [parseInt(idGudang, 10) || 0, parseInt(idGudang, 10) || 0]
  )
  return { params: { idGudang, kritisDiBawah }, rows }
}

async function daftarGudang() {
  return query(`SELECT gdg_id AS id, gdg_nama AS nama FROM tgudang ORDER BY gdg_nama`)
}

async function daftarBahan(search = '', limit = 100) {
  return query(
    `SELECT bhn_id AS id, bhn_kode AS kode, bhn_nama AS nama, bhn_satuan AS satuan,
            ROUND(bhn_hargabeli,0) AS harga_beli, ROUND(bhn_hargacosting,0) AS harga_costing
       FROM tbahan
      WHERE (? = '' OR bhn_nama LIKE ? OR bhn_kode LIKE ?)
      ORDER BY bhn_nama
      LIMIT ${parseInt(limit, 10) || 100}`,
    [search, `%${search}%`, `%${search}%`]
  )
}

module.exports = { kartuStok, historyStok, saldoStok, daftarGudang, daftarBahan }