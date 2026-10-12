const { query } = require('../db')

function defaultPeriod(tanggalAwal, tanggalAkhir) {
  if (!tanggalAwal && !tanggalAkhir) {
    tanggalAkhir = tanggalAkhir || new Date().toISOString().slice(0, 10)
    tanggalAwal = tanggalAwal || tanggalAkhir.slice(0, 8) + '01'
  }
  if (!tanggalAwal) tanggalAwal = tanggalAkhir
  if (!tanggalAkhir) tanggalAkhir = tanggalAwal
  return { tanggalAwal, tanggalAkhir }
}

// Rekap faktur pembelian dari tinv (faktur dari supplier), bisa per bulan/supplier/bahan.
async function rekapPembelian({ tanggalAwal, tanggalAkhir, groupBy = 'none', searchSupplier, searchBahan, limit = 500 }) {
  const period = defaultPeriod(tanggalAwal, tanggalAkhir)
  const { tanggalAwal: a, tanggalAkhir: b } = period
  const lim = Math.min(parseInt(limit, 10) || 500, 1000)

  if (groupBy === 'bahan') {
    const where = ['i.inv_tanggal BETWEEN ? AND ?']
    const params = [a, b]
    if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }
    if (searchBahan) { where.push('(bhn.bhn_nama LIKE ? OR bhn.bhn_kode LIKE ?)'); params.push(`%${searchBahan}%`, `%${searchBahan}%`) }
    const rows = await query(
      `SELECT bhn.bhn_nama AS bahan, bhn.bhn_satuan AS satuan,
              COUNT(DISTINCT i.inv_id) AS jumlah_faktur,
              ROUND(SUM(d.invd_qty), 2) AS total_qty,
              ROUND(SUM(d.invd_qty * d.invd_harga), 0) AS total_nilai
         FROM tinv_dtl d
         JOIN tinv i ON i.inv_id = d.invd_inv_id
         LEFT JOIN tsupplier s ON s.sup_id = i.inv_sup_id
         LEFT JOIN tbahan bhn ON bhn.bhn_id = d.invd_bhn_id
        WHERE ${where.join(' AND ')}
        GROUP BY bhn.bhn_id, bhn.bhn_nama, bhn.bhn_satuan
        ORDER BY total_nilai DESC
        LIMIT ${lim}`,
      params
    )
    return { params: period, groupBy, rows }
  }

  const base = {
    none: {
      select: `COUNT(*) AS jumlah_faktur,
        ROUND(SUM(i.inv_amount), 0) AS total_nilai,
        ROUND(SUM(i.inv_taxamount), 0) AS total_ppn,
        ROUND(SUM(i.inv_amount + i.inv_taxamount), 0) AS total_pembelian,
        ROUND(SUM(i.inv_bayar), 0) AS total_dibayar,
        ROUND(SUM(i.inv_amount - i.inv_bayar), 0) AS total_sisa_hutang`,
      group: false,
      order: false
    },
    bulan: {
      select: `CONCAT(YEAR(i.inv_tanggal), '-', LPAD(MONTH(i.inv_tanggal), 2, '0')) AS periode,
        COUNT(*) AS jumlah_faktur, ROUND(SUM(i.inv_amount), 0) AS nilai,
        ROUND(SUM(i.inv_taxamount), 0) AS ppn, ROUND(SUM(i.inv_bayar), 0) AS dibayar,
        ROUND(SUM(i.inv_amount - i.inv_bayar), 0) AS sisa_hutang`,
      group: 'YEAR(i.inv_tanggal), MONTH(i.inv_tanggal)',
      order: 'periode DESC'
    },
    supplier: {
      select: `IFNULL(s.sup_nama, CONCAT('Supplier #', i.inv_sup_id)) AS supplier,
        COUNT(*) AS jumlah_faktur, ROUND(SUM(i.inv_amount), 0) AS nilai,
        ROUND(SUM(i.inv_taxamount), 0) AS ppn, ROUND(SUM(i.inv_bayar), 0) AS dibayar,
        ROUND(SUM(i.inv_amount - i.inv_bayar), 0) AS sisa_hutang`,
      group: 'i.inv_sup_id, s.sup_nama',
      order: 'nilai DESC'
    }
  }

  const cfg = base[groupBy] || base.none
  const where = ['i.inv_tanggal BETWEEN ? AND ?']
  const params = [a, b]
  if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }

  const rows = await query(
    `SELECT ${cfg.select}
       FROM tinv i
       LEFT JOIN tsupplier s ON s.sup_id = i.inv_sup_id
      WHERE ${where.join(' AND ')}
      ${cfg.group ? `GROUP BY ${cfg.group}` : ''}
      ${cfg.order ? `ORDER BY ${cfg.order}` : ''}
      LIMIT ${lim}`,
    params
  )
  return { params: period, groupBy, rows }
}

// Detail baris item faktur pembelian (per bahan dalam faktur).
async function detailPembelian({ tanggalAwal, tanggalAkhir, searchSupplier, searchBahan, limit = 200 }) {
  const period = defaultPeriod(tanggalAwal, tanggalAkhir)
  const where = ['i.inv_tanggal BETWEEN ? AND ?']
  const params = [period.tanggalAwal, period.tanggalAkhir]
  if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }
  if (searchBahan) { where.push('(bhn.bhn_nama LIKE ? OR bhn.bhn_kode LIKE ?)'); params.push(`%${searchBahan}%`, `%${searchBahan}%`) }

  const rows = await query(
    `SELECT i.inv_tanggal AS tanggal, i.inv_nomor AS nomor_faktur, i.inv_jthtempo AS jatuh_tempo,
            IFNULL(s.sup_nama, CONCAT('Supplier #', i.inv_sup_id)) AS supplier,
            bhn.bhn_nama AS bahan, d.invd_bhn_satuan AS satuan,
            ROUND(d.invd_qty, 2) AS qty, ROUND(d.invd_harga, 0) AS harga,
            ROUND(d.invd_discpr, 2) AS disc_persen,
            ROUND(d.invd_qty * d.invd_harga, 0) AS nilai,
            i.inv_gdg_id AS id_gudang
       FROM tinv_dtl d
       JOIN tinv i ON i.inv_id = d.invd_inv_id
       LEFT JOIN tsupplier s ON s.sup_id = i.inv_sup_id
       LEFT JOIN tbahan bhn ON bhn.bhn_id = d.invd_bhn_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.inv_tanggal DESC, i.inv_nomor
      LIMIT ${Math.min(parseInt(limit, 10) || 200, 1000)}`,
    params
  )
  return { params: period, rows }
}

// Rekap Purchase Order (tpo) per bulan/supplier/bahan, atau daftar detail PO.
async function rekapPo({ tanggalAwal, tanggalAkhir, groupBy = 'none', searchSupplier, searchBahan, limit = 200 }) {
  const period = defaultPeriod(tanggalAwal, tanggalAkhir)
  const { tanggalAwal: a, tanggalAkhir: b } = period
  const lim = Math.min(parseInt(limit, 10) || 200, 1000)

  if (groupBy === 'bahan') {
    const where = ['p.po_tanggal BETWEEN ? AND ?']
    const params = [a, b]
    if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }
    if (searchBahan) { where.push('(bhn.bhn_nama LIKE ? OR bhn.bhn_kode LIKE ?)'); params.push(`%${searchBahan}%`, `%${searchBahan}%`) }
    const rows = await query(
      `SELECT bhn.bhn_nama AS bahan, bhn.bhn_satuan AS satuan,
              COUNT(DISTINCT p.po_id) AS jumlah_po,
              ROUND(SUM(d.pod_qty), 2) AS total_qty,
              ROUND(SUM(d.pod_qty * d.pod_harga), 0) AS total_nilai
         FROM tpo_dtl d
         JOIN tpo p ON p.po_id = d.pod_po_id
         LEFT JOIN tsupplier s ON s.sup_id = p.po_sup_id
         LEFT JOIN tbahan bhn ON bhn.bhn_id = d.pod_bhn_id
        WHERE ${where.join(' AND ')}
        GROUP BY bhn.bhn_id, bhn.bhn_nama, bhn.bhn_satuan
        ORDER BY total_nilai DESC
        LIMIT ${lim}`,
      params
    )
    return { params: period, groupBy, rows }
  }

  if (groupBy === 'detail') {
    const where = ['p.po_tanggal BETWEEN ? AND ?']
    const params = [a, b]
    if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }
    const rows = await query(
      `SELECT p.po_nomor AS nomor_po, p.po_tanggal AS tanggal,
              IFNULL(s.sup_nama, CONCAT('Supplier #', p.po_sup_id)) AS supplier,
              IFNULL(p.po_keterangan, '') AS keterangan,
              p.po_istax AS kena_ppn,
              ROUND(p.po_amount, 0) AS nilai_dpp, ROUND(p.po_taxamount, 0) AS ppn,
              p.po_isjasa AS jasa, p.po_isclosed AS ditutup
         FROM tpo p
         LEFT JOIN tsupplier s ON s.sup_id = p.po_sup_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.po_tanggal DESC, p.po_nomor
        LIMIT ${lim}`,
      params
    )
    return { params: period, groupBy, rows }
  }

  const base = {
    none: {
      select: `COUNT(*) AS jumlah_po,
        ROUND(SUM(p.po_amount), 0) AS total_nilai,
        ROUND(SUM(p.po_taxamount), 0) AS total_ppn,
        ROUND(SUM(p.po_amount + p.po_taxamount), 0) AS total_po`,
      group: false,
      order: false
    },
    bulan: {
      select: `CONCAT(YEAR(p.po_tanggal), '-', LPAD(MONTH(p.po_tanggal), 2, '0')) AS periode,
        COUNT(*) AS jumlah_po, ROUND(SUM(p.po_amount), 0) AS nilai,
        ROUND(SUM(p.po_taxamount), 0) AS ppn`,
      group: 'YEAR(p.po_tanggal), MONTH(p.po_tanggal)',
      order: 'periode DESC'
    },
    supplier: {
      select: `IFNULL(s.sup_nama, CONCAT('Supplier #', p.po_sup_id)) AS supplier,
        COUNT(*) AS jumlah_po, ROUND(SUM(p.po_amount), 0) AS nilai,
        ROUND(SUM(p.po_taxamount), 0) AS ppn`,
      group: 'p.po_sup_id, s.sup_nama',
      order: 'nilai DESC'
    }
  }

  const cfg = base[groupBy] || base.none
  const where = ['p.po_tanggal BETWEEN ? AND ?']
  const params = [a, b]
  if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }

  const rows = await query(
    `SELECT ${cfg.select}
       FROM tpo p
       LEFT JOIN tsupplier s ON s.sup_id = p.po_sup_id
      WHERE ${where.join(' AND ')}
      ${cfg.group ? `GROUP BY ${cfg.group}` : ''}
      ${cfg.order ? `ORDER BY ${cfg.order}` : ''}
      LIMIT ${lim}`,
    params
  )
  return { params: period, groupBy, rows }
}

// Daftar supplier (id + nama + kontak).
async function daftarSupplier(search = '', limit = 100) {
  return query(
    `SELECT sup_id AS id, sup_nama AS nama, sup_alamat AS alamat, sup_telp AS telepon, sup_cp AS kontak, sup_npwp AS npwp
       FROM tsupplier
      WHERE (? = '' OR sup_nama LIKE ?)
      ORDER BY sup_nama
      LIMIT ${Math.min(parseInt(limit, 10) || 100, 500)}`,
    [search, `%${search}%`]
  )
}

// Sisa hutang usaha (belum dibayar) per supplier, dihitung dari faktur pembelian tinv.
async function hutangSupplier({ searchSupplier } = {}) {
  const where = []
  const params = []
  if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }
  const rows = await query(
    `SELECT IFNULL(s.sup_nama, CONCAT('Supplier #', i.inv_sup_id)) AS supplier,
            COUNT(*) AS jumlah_faktur,
            ROUND(SUM(i.inv_amount), 0) AS total_pembelian,
            ROUND(SUM(i.inv_bayar), 0) AS total_dibayar,
            ROUND(SUM(i.inv_amount - i.inv_bayar), 0) AS sisa_hutang
       FROM tinv i
       LEFT JOIN tsupplier s ON s.sup_id = i.inv_sup_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY i.inv_sup_id, s.sup_nama
      HAVING sisa_hutang > 0
      ORDER BY sisa_hutang DESC
      LIMIT 200`,
    params
  )
  const totalHutang = rows.reduce((acc, r) => acc + Number(r.sisa_hutang || 0), 0)
  return { totalHutang, rows }
}

// Rekap pembayaran ke supplier dari tbayarsup, per bulan/supplier.
async function rekapPembayaranSupplier({ tanggalAwal, tanggalAkhir, groupBy = 'none', searchSupplier, limit = 500 }) {
  const period = defaultPeriod(tanggalAwal, tanggalAkhir)
  const { tanggalAwal: a, tanggalAkhir: b } = period
  const lim = Math.min(parseInt(limit, 10) || 500, 1000)

  const base = {
    none: {
      select: `COUNT(*) AS jumlah_pembayaran,
        ROUND(SUM(p.bys_cash), 0) AS total_tunai,
        ROUND(SUM(p.bys_transfer), 0) AS total_transfer,
        ROUND(SUM(p.bys_potongan), 0) AS total_potongan,
        ROUND(SUM(p.bys_cash + p.bys_transfer + p.bys_potongan), 0) AS total_bayar`,
      group: false,
      order: false
    },
    bulan: {
      select: `CONCAT(YEAR(p.bys_tanggal), '-', LPAD(MONTH(p.bys_tanggal), 2, '0')) AS periode,
        COUNT(*) AS jumlah_pembayaran, ROUND(SUM(p.bys_cash), 0) AS tunai,
        ROUND(SUM(p.bys_transfer), 0) AS transfer, ROUND(SUM(p.bys_potongan), 0) AS potongan,
        ROUND(SUM(p.bys_cash + p.bys_transfer + p.bys_potongan), 0) AS total_bayar`,
      group: 'YEAR(p.bys_tanggal), MONTH(p.bys_tanggal)',
      order: 'periode DESC'
    },
    supplier: {
      select: `IFNULL(s.sup_nama, CONCAT('Supplier #', p.bys_sup_id)) AS supplier,
        COUNT(*) AS jumlah_pembayaran, ROUND(SUM(p.bys_cash), 0) AS tunai,
        ROUND(SUM(p.bys_transfer), 0) AS transfer, ROUND(SUM(p.bys_potongan), 0) AS potongan,
        ROUND(SUM(p.bys_cash + p.bys_transfer + p.bys_potongan), 0) AS total_bayar`,
      group: 'p.bys_sup_id, s.sup_nama',
      order: 'total_bayar DESC'
    }
  }

  const cfg = base[groupBy] || base.none
  const where = ['p.bys_tanggal BETWEEN ? AND ?']
  const params = [a, b]
  if (searchSupplier) { where.push('s.sup_nama LIKE ?'); params.push(`%${searchSupplier}%`) }

  const rows = await query(
    `SELECT ${cfg.select}
       FROM tbayarsup p
       LEFT JOIN tsupplier s ON s.sup_id = p.bys_sup_id
      WHERE ${where.join(' AND ')}
      ${cfg.group ? `GROUP BY ${cfg.group}` : ''}
      ${cfg.order ? `ORDER BY ${cfg.order}` : ''}
      LIMIT ${lim}`,
    params
  )
  return { params: period, groupBy, rows }
}

module.exports = {
  rekapPembelian,
  detailPembelian,
  rekapPo,
  daftarSupplier,
  hutangSupplier,
  rekapPembayaranSupplier
}
