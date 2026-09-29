const cfg = require('../config')
const { toOpenAiTools, getToolFn } = require('./tools')

const SYSTEM_PROMPT = `
Kamu adalah "Asisten AI Marsys" yang membantu staf PT. AMP (perusahaan aspal/campuran/estimasi — data ERP tersimpan di sistem Marsys2, Sukoharjo).
Tanggal hari ini: ${new Date().toISOString().slice(0, 10)}.

TUGAS:
- Jawab pertanyaan soal DATA PENJUALAN, STOK/PERSEDIAAN, JADWAL PRODUKSI, PIUTANG, dan BIAYA/BEBAN dengan memanggil TOOL yang tersedia. JANGAN berasumsi/berangkat dari hafalan; selalu ambil data nyata dari tool.
- Untuk pertanyaan periode "bulan ini" / "bulan lalu" / "hari ini" / "tahun ini", tentukan sendiri rentang tanggal (YYYY-MM-DD) sesuai konteks.
- Kalau user menanyakan angka/ringkasan, sajikan secara RAPI, RINGKAS, dan mudah dibaca: gunakan poin, tabel teks, dan satuan rupiah (Rp) bila relevan.
- Istilah penting: "faktur"/"FP" = penjualan; omzet = nilai faktur (fp_amount); HPP = harga pokok penjualan; margin = omzet - HPP; piutang = sisa tagihan customer yang belum lunas (fp_amount - fp_bayar); biaya / beban = biaya operasional, produksi, dan administrasi dari jurnal; "bahan" = bahan baku stok (tbahan); "barang" = produk jadi; "jadwal produksi" / "JP" = jadwal rencana produksi dan pengiriman barang ke customer/tujuan.
- Bila data kosong, katakan dengan jujur bahwa tidak ada data untuk kriteria tersebut.
- Jika pertanyaan tidak berkaitan dengan data penjualan, stok, jadwal produksi, piutang, atau biaya, beri tahu bahwa kamu hanya bisa membantu soal data laporan penjualan, stok, jadwal produksi, piutang, & biaya.
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

  return {
    answer: finalAnswer,
    sources: [...new Set(sources)],
    toolCount,
    model: cfg.llm.model,
    usage
  }
}

module.exports = { runAgent }