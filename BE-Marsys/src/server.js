const app = require('./app')
const cfg = require('./config')
const chatlog = require('./services/chatlogService')

async function main() {
  await chatlog.ensureTable()
  app.listen(cfg.port, () => {
    console.log(`[marsys2-ai-api] listening on http://0.0.0.0:${cfg.port}`)
    if (!cfg.llm.apiKey) {
      console.warn('[marsys2-ai-api] OPENAI_API_KEY belum diisi di .env — endpoint /api/ai/chat belum bisa memanggil LLM.')
    }
  })
}

main().catch((e) => {
  console.error('Gagal start server:', e)
  process.exit(1)
})