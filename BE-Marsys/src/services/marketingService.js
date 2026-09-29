const { query } = require('../db')

async function rekapKunjungan({ tanggalAwal, tanggalAkhir, groupBy = 'none', searchMarketing, searchCustomer, keperluan }) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = tanggalAkhir || new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAwal || tanggalAkhir.slice(0, 8) + '01'
  }
  const period = { tanggalAwal, tanggalAkhir }

  const base = {
    none: {
      select: `
        COUNT(*) AS total_kunjungan,
        COUNT(DISTINCT k.user) AS jumlah_marketing,
        COUNT(DISTINCT k.cus_kode) AS jumlah_customer_dikunjungi`,
      group: false,
      order: false
    },
    marketing: {
      select: `IFNULL(k.user, '(tanpa marketing)') AS marketing,
        COUNT(*) AS total_kunjungan,
        COUNT(DISTINCT k.cus_kode) AS jumlah_customer_dikunjungi`,
      group: 'k.user',
      order: 'total_kunjungan DESC'
    },
    customer: {
      select: `IFNULL(c.cus_nama, CONCAT('Kode: ', k.cus_kode)) AS customer,
        COUNT(*) AS total_kunjungan,
        COUNT(DISTINCT k.user) AS jumlah_marketing_mengunjungi`,
      group: 'k.cus_kode',
      order: 'total_kunjungan DESC'
    },
    keperluan: {
      select: `IFNULL(k.keperluan, '(tanpa keterangan)') AS keperluan,
        COUNT(*) AS total_kunjungan`,
      group: 'k.keperluan',
      order: 'total_kunjungan DESC'
    },
    detail: {
      select: `k.id, k.tanggal, IFNULL(k.user, '') AS marketing,
        IFNULL(c.cus_nama, CONCAT('Kode: ', k.cus_kode)) AS customer,
        IFNULL(k.keperluan, '') AS keperluan,
        IFNULL(k.catatan, '') AS catatan,
        IFNULL(k.note, '') AS note,
        IFNULL(k.latitude, '') AS latitude,
        IFNULL(k.longitude, '') AS longitude,
        IFNULL(k.foto2, '') AS foto_url`,
      group: false,
      order: 'k.tanggal DESC'
    }
  }

  const cfg = base[groupBy] || base.none
  const where = ['k.tanggal BETWEEN ? AND ?']
  const params = [tanggalAwal + ' 00:00:00', tanggalAkhir + ' 23:59:59']

  if (searchMarketing) {
    where.push('(k.user LIKE ? OR k.user_kode LIKE ?)')
    params.push(`%${searchMarketing}%`, `%${searchMarketing}%`)
  }
  if (searchCustomer) {
    where.push('(c.cus_nama LIKE ? OR k.cus_kode LIKE ?)')
    params.push(`%${searchCustomer}%`, `%${searchCustomer}%`)
  }
  if (keperluan) {
    where.push('k.keperluan LIKE ?')
    params.push(`%${keperluan}%`)
  }

  const sql = `
    SELECT ${cfg.select}
      FROM tkunjungan k
      LEFT JOIN tcustomer c ON k.cus_kode = c.cus_id
     WHERE ${where.join(' AND ')}
     ${cfg.group ? `GROUP BY ${cfg.group}` : ''}
     ${cfg.order ? `ORDER BY ${cfg.order}` : ''}
     LIMIT 500`

  const rows = await query(sql, params)
  return { params: period, rows }
}

module.exports = {
  rekapKunjungan
}
