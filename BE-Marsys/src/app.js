const express = require('express')
const cors = require('cors')
const cfg = require('./config')
const authRoutes = require('./routes/auth')
const aiRoutes = require('./routes/ai')

const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'marsys2-ai-api', time: new Date().toISOString() } })
})

app.use('/api/auth', authRoutes)
app.use('/api/ai', aiRoutes)

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Endpoint tidak ditemukan: ${req.method} ${req.path}` })
})

app.use((err, req, res, next) => {
  console.error('[ERROR]', err)
  const msgText = String(err.message || err)
  const llmMatch = msgText.match(/LLM error (\d{3}):/)
  if (llmMatch) {
    const code = parseInt(llmMatch[1], 10)
    let hint = 'Layanan AI gagal merespons. Coba lagi nanti.'
    if (code === 401) hint = 'API key LLM tidak valid. Periksa OPENAI_API_KEY di .env, lalu restart server.'
    else if (code === 429) hint = 'Kuota/kredit LLM habis (atau rate-limit). Tambah kredit di provider LLM / turunkan frekuensi, lalu coba lagi.'
    else if (code >= 500) hint = 'Server LLM sedang bermasalah. Tunggu sebentar lalu coba lagi.'
    return res.status(502).json({ success: false, message: hint, detail: msgText.slice(0, 500) })
  }
  res.status(500).json({ success: false, message: 'Terjadi kesalahan server', detail: msgText })
})

module.exports = app