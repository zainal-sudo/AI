const salesService = require('../services/salesService')
const stockService = require('../services/stockService')
const productionService = require('../services/productionService')
const financeService = require('../services/financeService')
const marketingService = require('../services/marketingService')

// Definisikan tools yang bisa dipakai AI agent.
// Setiap tool: name, description, parameters (JSON Schema function-calling), dan fn(args) -> data mentah
const tools = [
  {
    name: 'rekap_penjualan',
    description:
      'Rekap/rekap penjualan (faktur = FP/tfp) berdasarkan periode. Bisa diringkas total, per bulan, per customer, atau per marketing. ' +
      'Mengembalikan omzet, jumlah faktur, pembayaran, dan piutang. Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD) dari periode laporan' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD) dari periode laporan' },
        groupBy: {
          type: 'string',
          enum: ['none', 'bulan', 'customer', 'marketing'],
          description: 'Pengelompokan hasil: total (none), per bulan, per customer, atau per marketing'
        },
        customer: { type: 'string', description: 'Filter nama customer (sebagian nama boleh)' },
        marketing: { type: 'string', description: 'Filter nama marketing (sebagian nama boleh)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => salesService.rekapPenjualan({
      tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir,
      groupBy: a.groupBy || 'none',
      searchCustomer: a.customer, searchMarketing: a.marketing
    })
  },
  {
    name: 'detail_penjualan',
    description:
      'Detail item penjualan per baris (per produk dalam faktur) pada suatu periode, lengkap dengan qty dan nilai. ' +
      'Gunakan untuk pertanyaan per produk/customer/marketing. Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD)' },
        customer: { type: 'string', description: 'Filter nama customer' },
        marketing: { type: 'string', description: 'Filter nama marketing' },
        produk: { type: 'string', description: 'Filter nama produk/barang' },
        limit: { type: 'number', description: 'Jumlah baris maksimal (default 200)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => salesService.detailPenjualan({
      tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir,
      searchCustomer: a.customer, searchMarketing: a.marketing, searchProduk: a.produk, limit: a.limit
    })
  },
  {
    name: 'rekap_penjualan_hpp_margin',
    description:
      'Rekap penjualan lengkap dengan HPP (harga pokok penjualan) sehingga didapat MARGIN/keuntungan kotor dan persen margin. ' +
      'Bisa di total atau per bulan / customer / marketing. Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD)' },
        groupBy: {
          type: 'string',
          enum: ['none', 'bulan', 'customer', 'marketing'],
          description: 'Pengelompokan: none / bulan / customer / marketing'
        }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => salesService.rekapMargin({ tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir, groupBy: a.groupBy || 'none' })
  },
  {
    name: 'kartu_stok',
    description:
      'Kartu stok (mutasi persediaan bahan baku): saldo awal, kemudian transaksi masuk/keluar dengan saldo berjalan per bahan per gudang. ' +
      'idGudang dan idBahan opsional (0 = semua). Pakai daftar_gudang / daftar_bahan untuk mencari id.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD)' },
        idGudang: { type: 'number', description: 'ID gudang (0 = semua gudang)' },
        idBahan: { type: 'number', description: 'ID bahan (0 = semua bahan)' },
        limit: { type: 'number', description: 'Jumlah baris maksimal (default 1000)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => stockService.kartuStok({ tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir, idGudang: a.idGudang, idBahan: a.idBahan, limit: a.limit })
  },
  {
    name: 'history_stok',
    description:
      'Ringkasan pergerakan stok bahan per gudang dalam satu periode: saldo awal, koreksi, pembelian, pemakaian produksi, dan saldo akhir (qty + nilai).',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD)' },
        idGudang: { type: 'number', description: 'ID gudang (0 = semua gudang)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => stockService.historyStok({ tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir, idGudang: a.idGudang })
  },
  {
    name: 'saldo_stok',
    description:
      'Saldo stok bahan SAAT INI (sampai hari ini) per gudang. Opsional filter idGudang. ' +
      'Untuk laporan "stok kritis", pakai kritisDiBawah untuk hanya menampilkan bahan dengan saldo di bawah ambang (misal 100).',
    parameters: {
      type: 'object',
      properties: {
        idGudang: { type: 'number', description: 'ID gudang (0 = semua gudang)' },
        kritisDiBawah: { type: 'number', description: 'Tampilkan hanya bahan dengan saldo < nilai ini (opsional)' }
      },
      required: []
    },
    fn: (a) => stockService.saldoStok({ idGudang: a.idGudang, kritisDiBawah: a.kritisDiBawah })
  },
  {
    name: 'daftar_gudang',
    description: 'Daftar gudang yang tersedia (id + nama). Dipakai untuk mencari idGudang.',
    parameters: { type: 'object', properties: {}, required: [] },
    fn: () => stockService.daftarGudang()
  },
  {
    name: 'daftar_customer',
    description: 'Cari daftar customer (id + nama + alamat). Dipakai untuk mencari customer sebelum filter penjualan.',
    parameters: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Teks pencarian nama customer (opsional)' }, limit: { type: 'number' } },
      required: []
    },
    fn: (a) => salesService.daftarCustomer(a.search || '', a.limit)
  },
  {
    name: 'daftar_marketing',
    description: 'Daftar marketing/sales (id + nama).',
    parameters: { type: 'object', properties: {}, required: [] },
    fn: () => salesService.daftarMarketing()
  },
  {
    name: 'daftar_bahan',
    description: 'Cari daftar bahan baku (id + kode + nama + satuan). Dipakai untuk mencari idBahan pada kartu stok.',
    parameters: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Teks pencarian nama/kode bahan' }, limit: { type: 'number' } },
      required: []
    },
    fn: (a) => stockService.daftarBahan(a.search || '', a.limit)
  },
  {
    name: 'daftar_barang',
    description: 'Cari daftar barang jadi/produk yang dijual (id + kode + nama + harga jual).',
    parameters: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Teks pencarian nama/kode barang' }, limit: { type: 'number' } },
      required: []
    },
    fn: (a) => salesService.daftarBarang(a.search || '', a.limit)
  },
  {
    name: 'jadwal_produksi',
    description:
      'Melihat rekap / daftar jadwal produksi (tjadwalproduksi) berdasarkan rentang tanggal. ' +
      'Bisa difilter berdasarkan nama customer, nama barang, atau tujuan pengiriman. Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal jadwal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir jadwal (YYYY-MM-DD)' },
        customer: { type: 'string', description: 'Filter nama customer (opsional)' },
        barang: { type: 'string', description: 'Filter nama barang/produk (opsional)' },
        tujuan: { type: 'string', description: 'Filter lokasi tujuan pengiriman (opsional)' },
        limit: { type: 'number', description: 'Maksimal baris (default 200)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => productionService.rekapJadwalProduksi({
      tanggalAwal: a.tanggalAwal,
      tanggalAkhir: a.tanggalAkhir,
      searchCustomer: a.customer,
      searchBarang: a.barang,
      searchTujuan: a.tujuan,
      limit: a.limit
    })
  },
  {
    name: 'rekap_piutang',
    description:
      'Melihat daftar sisa piutang customer yang belum lunas (fp_amount - fp_bayar > 0). ' +
      'Bisa difilter berdasarkan nama customer.',
    parameters: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'Filter nama customer (opsional)' }
      },
      required: []
    },
    fn: (a) => financeService.rekapPiutang({ searchCustomer: a.customer })
  },
  {
    name: 'rekap_biaya',
    description:
      'Melihat rekap beban/biaya operasional, produksi, dan administrasi berdasarkan rentang tanggal dari jurnal. ' +
      'Bisa difilter berdasarkan nama akun biaya (opsional). Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD)' },
        akun: { type: 'string', description: 'Filter nama akun biaya (opsional)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => financeService.rekapBiaya({
      tanggalAwal: a.tanggalAwal,
      tanggalAkhir: a.tanggalAkhir,
      searchAkun: a.akun
    })
  },
  {
    name: 'laporan_laba_rugi',
    description:
      'Laporan Laba Rugi resmi dari tabel tlabarugi per bulan. Kategori: PENJUALAN, HARGA POKOK PENJUALAN (HPP), ' +
      'BIAYA PENJUALAN dan PEMASARAN, BIAYA ADMINISTRASI dan UMUM, BIAYA PENYUSUTAN, PENDAPATAN LAIN-LAIN. ' +
      'Mengembalikan ringkasan per kategori plus baris TOTAL (TOTAL PENJUALAN, TOTAL HPP, LABA KOTOR, LABA BERSIH). ' +
      'Gunakan untuk pertanyaan laba, rugi, untung, margin bersih, total pendapatan, total biaya. Tanggal format YYYY-MM-DD, otomatis dipetakan ke bulan.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal periode (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir periode (YYYY-MM-DD)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => financeService.labaRugi({ tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir })
  },
  {
    name: 'laporan_neraca',
    description:
      'Laporan Neraca / posisi keuangan dari tabel tneraca per akhir bulan. Kategori: KAS, BANK, PIUTANG, PERSEDIAAN, ' +
      'AKTIVA TETAP, HUTANG DAGANG, HUTANG PAJAK, HUTANG BIAYA, MODAL, dll. Mengembalikan ringkasan per kategori plus ' +
      'baris TOTAL (TOTAL ASET, TOTAL HUTANG, TOTAL MODAL, TOTAL HUTANG + MODAL). Gunakan untuk pertanyaan aset, hutang, modal, kas, bank.',
    parameters: {
      type: 'object',
      properties: {
        tanggal: { type: 'string', description: 'Tanggal posisi neraca (YYYY-MM-DD), dipakai bulannya. Contoh 2026-09-29 = neraca Sept 2026' },
        tahun: { type: 'number', description: 'Tahun neraca (alternatif selain tanggal), contoh 2026' },
        bulan: { type: 'number', description: 'Bulan neraca 1-12 (wajib jika pakai tahun)' }
      },
      required: []
    },
    fn: (a) => financeService.neraca({ tanggal: a.tanggal, tahun: a.tahun, bulan: a.bulan })
  },
  {
    name: 'buku_besar',
    description:
      'Buku besar / jurnal umum dari view alljurnal: daftar transaksi debet-kredit per akun per tanggal. ' +
      'Gunakan untuk pertanyaan mutasi akun, rincian jurnal, atau cek transaksi kas/bank/biaya tertentu. Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir (YYYY-MM-DD)' },
        akun: { type: 'string', description: 'Filter nama atau kode akun, contoh Kas, Bank, Beban Sewa (opsional)' },
        limit: { type: 'number', description: 'Maksimal baris (default 200, maks 1000)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => financeService.bukuBesar({ tanggalAwal: a.tanggalAwal, tanggalAkhir: a.tanggalAkhir, akun: a.akun, limit: a.limit })
  },
  {
    name: 'daftar_akun',
    description: 'Daftar Chart of Accounts / COA dari trekening (kode + nama akun). Dipakai untuk mencari kode akun sebelum cek buku besar.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Teks pencarian nama atau kode akun (opsional)' },
        limit: { type: 'number', description: 'Maksimal baris' }
      },
      required: []
    },
    fn: (a) => financeService.daftarAkun(a.search || '', a.limit)
  },
  {
    name: 'rekap_kunjungan_marketing',
    description:
      'Melihat rekap atau detail kunjungan marketing (tkunjungan) berdasarkan rentang tanggal. ' +
      'Bisa dikelompokkan (groupBy) per marketing, per customer, per keperluan, atau ditampilkan sebagai detail kunjungan lengkap dengan catatan dan lokasi. Tanggal format YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        tanggalAwal: { type: 'string', description: 'Tanggal awal kunjungan (YYYY-MM-DD)' },
        tanggalAkhir: { type: 'string', description: 'Tanggal akhir kunjungan (YYYY-MM-DD)' },
        groupBy: {
          type: 'string',
          enum: ['none', 'marketing', 'customer', 'keperluan', 'detail'],
          description: 'Pengelompokan hasil: total (none), per marketing, per customer, per keperluan, atau detail kunjungan'
        },
        marketing: { type: 'string', description: 'Filter nama/kode marketing (opsional)' },
        customer: { type: 'string', description: 'Filter nama/kode customer (opsional)' },
        keperluan: { type: 'string', description: 'Filter keperluan kunjungan misal ANJANGSANA, ORDER, PIUTANG, ONLINE (opsional)' }
      },
      required: ['tanggalAwal', 'tanggalAkhir']
    },
    fn: (a) => marketingService.rekapKunjungan({
      tanggalAwal: a.tanggalAwal,
      tanggalAkhir: a.tanggalAkhir,
      groupBy: a.groupBy || 'none',
      searchMarketing: a.marketing,
      searchCustomer: a.customer,
      keperluan: a.keperluan
    })
  }
]

function getToolFn(name) {
  const t = tools.find((x) => x.name === name)
  return t ? t.fn : null
}

function toOpenAiTools() {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

module.exports = { tools, getToolFn, toOpenAiTools }