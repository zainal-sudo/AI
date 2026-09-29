const { query } = require('../db')

function escFilters({ idCustomer, idMarketing, searchCustomer, searchMarketing }) {
  const where = []
  const params = []
  if (idMarketing) { where.push('f.mkt_id = ?'); params.push(idMarketing) }
  if (searchCustomer) { where.push('f.cus_nama LIKE ?'); params.push(`%${searchCustomer}%`) }
  if (searchMarketing) { where.push('f.mkt_nama LIKE ?'); params.push(`%${searchMarketing}%`) }
  return { where, params }
}

async function rekapPenjualan({ tanggalAwal, tanggalAkhir, groupBy = 'none', idCustomer, idMarketing, searchCustomer, searchMarketing }) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = tanggalAkhir || new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAwal || tanggalAkhir.slice(0, 8) + '01'
  }
  const period = { tanggalAwal, tanggalAkhir }

  const base = {
    none: {
      select: `
        COUNT(*) AS jumlah_faktur,
        ROUND(SUM(f.fp_amount), 0) AS total_omzet,
        ROUND(SUM(f.fp_bayar), 0) AS total_bayar,
        ROUND(SUM(f.fp_amount - f.fp_bayar), 0) AS total_piutang,
        ROUND(SUM(f.fp_ppn), 0) AS total_ppn,
        ROUND(SUM(f.fp_amount), 0) - ROUND(SUM(f.fp_bayar), 0) AS sisa_belum_dibayar`,
      group: false,
      order: false
    },
    bulan: {
      select: `CONCAT(YEAR(f.fp_tanggal), '-', LPAD(MONTH(f.fp_tanggal), 2, '0')) AS periode,
        COUNT(*) AS jumlah_faktur, ROUND(SUM(f.fp_amount),0) AS omzet,
        ROUND(SUM(f.fp_bayar),0) AS bayar, ROUND(SUM(f.fp_amount - f.fp_bayar),0) AS piutang`,
      group: 'YEAR(f.fp_tanggal), MONTH(f.fp_tanggal)',
      order: 'periode DESC'
    },
    customer: {
      select: `f.cus_nama AS customer, COUNT(*) AS jumlah_faktur, ROUND(SUM(f.fp_amount),0) AS omzet,
        ROUND(SUM(f.fp_bayar),0) AS bayar, ROUND(SUM(f.fp_amount - f.fp_bayar),0) AS piutang`,
      group: 'f.cus_nama',
      order: 'omzet DESC'
    },
    marketing: {
      select: `IFNULL(f.mkt_nama, '(tanpa marketing)') AS marketing, COUNT(*) AS jumlah_faktur,
        ROUND(SUM(f.fp_amount),0) AS omzet, ROUND(SUM(f.fp_bayar),0) AS bayar, ROUND(SUM(f.fp_amount - f.fp_bayar),0) AS piutang`,
      group: 'f.mkt_id',
      order: 'omzet DESC'
    },
    detail: {
      select: `f.fp_nomor AS nomor_faktur, f.fp_tanggal AS tanggal, f.fp_jthtempo AS jatuh_tempo,
        f.cus_nama AS customer, IFNULL(f.so_nama, '') AS pekerjaan, IFNULL(f.mkt_nama, '') AS marketing,
        f.IsPPn, f.IsRetail, ROUND(f.fp_amount,0) AS omzet, ROUND(f.fp_bayar,0) AS bayar, ROUND(f.fp_amount - f.fp_bayar,0) AS piutang`,
      group: false,
      order: 'f.fp_tanggal DESC, f.fp_nomor'
    }
  }

  const cfg = base[groupBy] || base.none
  const { where, params } = escFilters({ idCustomer, idMarketing, searchCustomer, searchMarketing })
  const whereSql = [
    'f.fp_tanggal BETWEEN ? AND ?',
    ...where
  ].join(' AND ')

  const sql = `
    SELECT ${cfg.select}
      FROM rptpenjualan f
     WHERE ${whereSql}
     ${cfg.group ? `GROUP BY ${cfg.group}` : ''}
     ${cfg.order ? `ORDER BY ${cfg.order}` : ''}
     LIMIT 500`
  const rows = await query(sql, [period.tanggalAwal, period.tanggalAkhir, ...params])
  return { params: period, rows }
}

async function detailPenjualan({ tanggalAwal, tanggalAkhir, searchCustomer, searchMarketing, searchProduk, limit = 200 }) {
  const dates = { tanggalAwal, tanggalAkhir }
  const where = ['f.Tanggal BETWEEN ? AND ?']
  const params = [tanggalAwal, tanggalAkhir]
  if (searchCustomer) { where.push('f.Customer LIKE ?'); params.push(`%${searchCustomer}%`) }
  if (searchMarketing) { where.push('f.Marketing LIKE ?'); params.push(`%${searchMarketing}%`) }
  if (searchProduk) { where.push('f.Produk LIKE ?'); params.push(`%${searchProduk}%`) }

  const rows = await query(
    `SELECT f.Tanggal, f.Nomor AS nomor_faktur, f.NomorSo AS nomor_so, f.Customer, f.Marketing,
            f.Produk, f.Satuan, ROUND(f.Qty,2) AS qty, ROUND(f.Discount,0) AS discount,
            ROUND(f.Nilai,0) AS nilai, ROUND(f.Nilaiblmppn,0) AS nilai_sebelum_ppn, f.IsRetail
       FROM rptpenjualanitem f
      WHERE ${where.join(' AND ')}
      ORDER BY f.Tanggal DESC
      LIMIT ${parseInt(limit, 10) || 200}`,
    params
  )
  return { params: dates, rows }
}

async function rekapMargin({ tanggalAwal, tanggalAkhir, groupBy = 'none' }) {
  const group = {
    none: { sel: `COUNT(*) AS jumlah_faktur`, g: null },
    bulan: { sel: `CONCAT(YEAR(f.fp_tanggal), '-', LPAD(MONTH(f.fp_tanggal),2,'0')) AS periode`, g: 'YEAR(f.fp_tanggal), MONTH(f.fp_tanggal)' },
    customer: { sel: `f.cus_nama AS customer`, g: 'f.cus_nama' },
    marketing: { sel: `IFNULL(f.mkt_nama, '(tanpa marketing)') AS marketing`, g: 'IFNULL(f.mkt_nama, "(tanpa marketing)")' }
  }[groupBy] || { sel: `COUNT(*) AS jumlah_faktur`, g: null }

  const rows = await query(
    `SELECT ${group.sel},
            ROUND(SUM(f.fp_amount),0) AS omzet,
            ROUND(SUM(IFNULL(f.hpp,0)),0) AS hpp,
            ROUND(SUM(f.fp_amount - IFNULL(f.hpp,0)),0) AS margin,
            ROUND(100 * SUM(f.fp_amount - IFNULL(f.hpp,0)) / NULLIF(SUM(f.fp_amount),0), 1) AS margin_persen
       FROM rptpenjualanwithhpp f
      WHERE f.fp_tanggal BETWEEN ? AND ?
      ${group.g ? `GROUP BY ${group.g}` : ''}
      ORDER BY 1
      LIMIT 500`,
    [tanggalAwal, tanggalAkhir]
  )
  return { params: { tanggalAwal, tanggalAkhir }, rows }
}

async function daftarCustomer(search = '', limit = 100) {
  return query(
    `SELECT cus_id AS id, cus_nama AS nama, cus_alamat AS alamat, cus_telp AS telepon, cus_cp AS kontak
       FROM tcustomer
      WHERE (? = '' OR cus_nama LIKE ?)
      ORDER BY cus_nama
      LIMIT ${parseInt(limit, 10) || 100}`,
    [search, `%${search}%`]
  )
}

async function daftarMarketing() {
  return query(`SELECT mkt_id AS id, mkt_nama AS nama, mkt_notelp AS telepon FROM tmarketing ORDER BY mkt_nama`)
}

async function daftarBarang(search = '', limit = 100) {
  return query(
    `SELECT brg_id AS id, brg_kode AS kode, brg_nama AS nama, brg_satuan AS satuan,
            ROUND(brg_hargajual,0) AS harga_jual
       FROM tbarang
      WHERE (? = '' OR brg_nama LIKE ?)
      ORDER BY brg_nama
      LIMIT ${parseInt(limit, 10) || 100}`,
    [search, `%${search}%`]
  )
}

module.exports = {
  rekapPenjualan,
  detailPenjualan,
  rekapMargin,
  daftarCustomer,
  daftarMarketing,
  daftarBarang
}
