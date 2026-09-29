const { query } = require('../db')

async function rekapJadwalProduksi({ tanggalAwal, tanggalAkhir, searchCustomer, searchBarang, searchTujuan, limit = 200 }) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = tanggalAkhir || new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAwal || tanggalAkhir.slice(0, 8) + '01'
  }
  const dates = { tanggalAwal, tanggalAkhir }
  const where = ['jp.jp_tanggal BETWEEN ? AND ?']
  const params = [tanggalAwal, tanggalAkhir]

  if (searchCustomer) {
    where.push('c.cus_nama LIKE ?')
    params.push(`%${searchCustomer}%`)
  }
  if (searchBarang) {
    where.push('b.brg_nama LIKE ?')
    params.push(`%${searchBarang}%`)
  }
  if (searchTujuan) {
    where.push('jpd.jpd_tujuan LIKE ?')
    params.push(`%${searchTujuan}%`)
  }

  const sql = `
    SELECT 
      jp.jp_id,
      jp.jp_nomor AS nomor_jadwal,
      jp.jp_tanggal AS tanggal,
      c.cus_nama AS customer,
      b.brg_nama AS barang,
      m.mkt_nama AS marketing,
      ROUND(jpd.jpd_jumlah, 2) AS jumlah,
      jpd.jpd_satuan AS satuan,
      jpd.jpd_tujuan AS tujuan,
      jpd.jpd_armada AS armada,
      jpd.jpd_keterangan AS keterangan
    FROM tjadwalproduksi jp
    JOIN tjadwalproduksi_dtl jpd ON jp.jp_id = jpd.jpd_jp_id
    LEFT JOIN tcustomer c ON jpd.jpd_cus_id = c.cus_id
    LEFT JOIN tbarang b ON jpd.jpd_brg_id = b.brg_id
    LEFT JOIN tmarketing m ON jpd.jpd_md_id = m.mkt_id
    WHERE ${where.join(' AND ')}
    ORDER BY jp.jp_tanggal DESC, jp.jp_nomor DESC
    LIMIT ${parseInt(limit, 10) || 200}
  `
  const rows = await query(sql, params)
  return { params: dates, rows }
}

module.exports = {
  rekapJadwalProduksi
}
