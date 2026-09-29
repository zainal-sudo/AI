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

module.exports = {
  rekapPiutang,
  rekapBiaya
}