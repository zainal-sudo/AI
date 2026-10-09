const cfg = require('../config')
const { toOpenAiTools, getToolFn } = require('./tools')

const SYSTEM_PROMPT = `
Kamu adalah "Asisten AI Marsys" yang membantu staf PT. AMP (perusahaan aspal/campuran/estimasi — data ERP tersimpan di sistem Marsys2, Sukoharjo).
Tanggal hari ini: ${new Date().toISOString().slice(0, 10)}.

TUGAS:
- Jawab pertanyaan soal DATA PENJUALAN, STOK/PERSEDIAAN, JADWAL PRODUKSI, PIUTANG, BIAYA/BEBAN, dan LAPORAN KEUANGAN (laba rugi, neraca, buku besar/jurnal, kas/bank, hutang, modal) dengan memanggil TOOL yang tersedia. JANGAN berasumsi/berangkat dari hafalan; selalu ambil data nyata dari tool.
- Untuk pertanyaan periode "bulan ini" / "bulan lalu" / "hari ini" / "tahun ini", tentukan sendiri rentang tanggal (YYYY-MM-DD) sesuai konteks.
- Kalau user menanyakan angka/ringkasan, sajikan secara RAPI, RINGKAS, dan mudah dibaca dalam bentuk TEKS POLOS saja.
- FORMAT WAJIB TEKS POLOS:
  * DILARANG memakai tabel markdown (jangan pakai karakter | dan jangan pakai baris ---).
  * DILARANG memakai heading markdown (#), bold, italic, kode blok, link, atau gambar.
  * Gunakan daftar dengan tanda "- " atau "• " per baris, dan pisahkan tiap bagian dengan baris kosong.
  * Untuk perbandingan, tulis satu baris per item dengan format: "Nama data: nilai A menjadi nilai B (selisih/persen)".
  * Contoh yang benar:
    Hasil perbandingan YTD 01 Jan - 29 Sep 2025 vs 2026:
    - Jumlah Faktur: 2.042 faktur menjadi 1.348 faktur (turun 694 faktur, -33,99%)
    - Total Omzet: Rp 46.904.036.253 menjadi Rp 36.300.400.616 (turun Rp 10.603.635.637, -22,61%)
  * Contoh yang SALAH (jangan ditiru): "| Keterangan | YTD 2025 | YTD 2026 |".
- Satuan rupiah (Rp) bila relevan.
- Istilah penting: "faktur"/"FP" = penjualan; omzet = nilai faktur (fp_amount); HPP = harga pokok penjualan; margin = omzet - HPP; piutang = sisa tagihan customer yang belum lunas (fp_amount - fp_bayar); biaya / beban = biaya operasional, produksi, dan administrasi dari jurnal; "bahan" = bahan baku stok (tbahan); "barang" = produk jadi; "jadwal produksi" / "JP" = jadwal rencana produksi dan pengiriman barang ke customer/tujuan.
- PENGETAHUAN LAPORAN KEUANGAN (wajib dipakai saat jawab soal keuangan):
  * Laba Rugi pakai tool laporan_laba_rugi (sumber tabel tlabarugi, data per bulan 2024-2026). Kategori resmi: PENJUALAN, HARGA POKOK PENJUALAN (HPP), BIAYA PENJUALAN dan PEMASARAN, BIAYA ADMINISTRASI dan UMUM, BIAYA PENYUSUTAN, PENDAPATAN LAIN-LAIN.
  * Rumus laba: Laba Kotor = Penjualan - HPP. Laba Bersih = Laba Kotor - Biaya Penjualan Pemasaran - Biaya Administrasi Umum - Biaya Penyusutan + Pendapatan Lain-Lain. Baris TOTAL dan LABA BERSIH sudah tersedia di totalRows, jangan hitung ulang dari hafalan, ambil dari tool.
  * Neraca pakai tool laporan_neraca (sumber tabel tneraca, saldo akhir bulan). Kategori: KAS, BANK, PIUTANG, UANG MUKA PEMBELIAN, PERSEDIAAN, PAJAK DIBAYAR DIMUKA, BIAYA DIBAYAR DIMUKA, AKTIVA TETAP, PENYUSUTAN AKTIVA TETAP, HUTANG DAGANG, UANG MUKA PENJUALAN, HUTANG PAJAK, HUTANG BIAYA, HUTANG PIHAK III, MODAL.
  * Rumus neraca: TOTAL ASET = TOTAL ASET LANCAR + TOTAL AKTIVA TETAP. TOTAL ASET harus sama dengan TOTAL HUTANG + MODAL. Angka pembanding resmi ada di totalRows.
  * Buku besar dan jurnal umum pakai tool buku_besar (sumber view alljurnal: Tanggal, Nomor, Referensi, ACCOUNT/kode, AccountName/akun, Debet, Kredit, Kelompok). Pakai untuk rincian mutasi kas, bank, biaya, atau akun tertentu.
  * Daftar akun (COA) pakai tool daftar_akun (sumber trekening: kode + nama). Cari dulu di sini kalau nama akun tidak jelas.
  * Aturan periode: untuk laba rugi, tanggalAwal-tanggalAkhir dipetakan ke bulan (contoh 2026-01-01 sampai 2026-09-29 = bulan 1-9 tahun 2026). Untuk neraca, tanggal = posisi akhir bulan itu (contoh 2026-09-29 = neraca September 2026).
  * Data tlabarugi dan tneraca tersedia 2024-2026. Kalau user tanya bulan berjalan yang belum tutup buku, ambil bulan terakhir yang ada datanya dan katakan jujur periode yang dipakai.
  * Bedakan omzet penjualan (dari faktur, tool rekap_penjualan) dengan PENJUALAN akuntansi (dari laba rugi). Kalau user tanya laporan keuangan, utamakan angka laba rugi dan neraca.
- Bila data kosong, katakan dengan jujur bahwa tidak ada data untuk kriteria tersebut.
- Jika pertanyaan tidak berkaitan dengan data penjualan, stok, jadwal produksi, piutang, biaya, atau laporan keuangan (laba rugi, neraca, jurnal), beri tahu bahwa kamu hanya bisa membantu soal data laporan penjualan, stok, jadwal produksi, piutang, biaya, dan laporan keuangan.
- Jawab dalam Bahasa Indonesia yang sopan dan profesional.
`.trim()

function normalizeMessages(messages) {
  const roles = new Set(['user', 'assistant', 'system'])
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && roles.has(m.role) && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
}

function truncate(str, max) {
  const s = String(str ?? '')
  return s.length > max ? s.slice(0, max) + `\n...(hasil dipotong, total ${s.length} karakter)` : s
}

// Paksa jawaban akhir jadi TEKS POLOS saja (tanpa tabel markdown).
// Ini pengaman kalau model masih nekat mengeluarkan tabel markdown.
function toPlainText(answer) {
  let s = String(answer ?? '')

  // Hapus blok kode ```...```
  s = s.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))

  const lines = s.split('\n')
  const out = []
  for (let line of lines) {
    const t = line.trim()
    // Buang baris separator tabel markdown seperti |---|---| atau |:---|:---|
    if (/^\|?[\s:|\-]+(\|[\s:|\-]+)+\|?\s*$/.test(t) && t.includes('-')) continue
    // Ubah baris tabel markdown "| a | b | c |" menjadi "a: b, c"
    if ((t.startsWith('|') && t.endsWith('|') && t.includes('|')) || (t.startsWith('|') || (t.match(/\|/g) || []).length >= 2)) {
      const cells = line.split('|').map((c) => c.trim()).filter((c) => c && !/^:?-+:?$/.test(c))
      if (cells.length >= 2) {
        // Baris header seperti "| Keterangan | YTD 2025 | YTD 2026 |" -> jadikan judul teks biasa
        line = '- ' + cells.join(': ').replace(/\s+:\s+/g, ': ')
        // Rapikan "::" ganda
        line = line.replace(/:\s*-\s*/g, ': ')
      } else if (cells.length === 1) {
        line = '- ' + cells[0]
      }
    }
    out.push(line)
  }
  s = out.join('\n')

  // Bersihkan sisa markdown: bold/italic/heading/link/image
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/`([^`]+)`/g, '$1')

  // Rapikan baris kosong berlebih
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  return s
}

async function callLlm(messages, withTools = true) {
  const body = {
    model: cfg.llm.model,
    messages,
    temperature: 0.2
  }
  if (cfg.llm.maxTokens) body.max_tokens = cfg.llm.maxTokens
  if (withTools) {
    body.tools = toOpenAiTools()
    body.tool_choice = 'auto'
  }

  const res = await fetch(`${cfg.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      Authorization: `Bearer ${cfg.llm.apiKey}`
    },
    body: JSON.stringify({ ...body, stream: false }),
    signal: AbortSignal.timeout(cfg.llm.timeout)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM error ${res.status}: ${text.slice(0, 400)}`)
  }
  const json = await res.json()
  return json
}

async function runAgent({ messages }) {
  const history = normalizeMessages(messages)
  const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history]

  const sources = []
  let toolCount = 0
  let finalAnswer = ''
  let usage = null

  for (let i = 0; i < cfg.llm.maxIterations; i++) {
    const out = await callLlm(fullMessages, true)
    const choice = out.choices && out.choices[0]
    const msg = choice && choice.message
    usage = (out.usage || usage)

    if (!msg) throw new Error('LLM tidak mengembalikan respons.')

    const toolCalls = msg.tool_calls || []
    if (!toolCalls.length) {
      finalAnswer = msg.content || ''
      break
    }

    fullMessages.push({
      role: 'assistant',
      content: msg.content || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }))
    })

    for (const tc of toolCalls) {
      const fnName = tc.function && tc.function.name
      const fn = getToolFn(fnName)
      if (fnName) sources.push(fnName)
      toolCount++

      let resultText
      if (!fn) {
        resultText = JSON.stringify({ error: `Tool ${fnName} tidak dikenal` })
      } else {
        try {
          const args = JSON.parse(tc.function.arguments || '{}')
          const data = await fn(args)
          resultText = truncate(JSON.stringify(data), 6000)
        } catch (err) {
          resultText = JSON.stringify({ error: String(err && err.message || err) })
        }
      }
      fullMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultText
      })
    }
  }

  if (!finalAnswer && toolCount === 0) {
    finalAnswer = 'Maaf, saya belum mendapat jawaban dari sistem. Coba ulangi lagi ya.'
  }

  finalAnswer = toPlainText(finalAnswer)

  return {
    answer: finalAnswer,
    sources: [...new Set(sources)],
    toolCount,
    model: cfg.llm.model,
    usage
  }
}

module.exports = { runAgent }