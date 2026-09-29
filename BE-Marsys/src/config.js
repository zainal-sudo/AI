require('dotenv').config()

function normalizeBaseUrl(u) {
  u = String(u || '').replace(/\/+$/, '')
  if (!/\/v1$/.test(u)) u += '/v1'
  return u
}

const cfg = {
  port: parseInt(process.env.PORT || '4000', 10),

  db: {
    host: process.env.DB_HOST || '143.198.220.117',
    port: parseInt(process.env.DB_PORT || '3321', 10),
    user: process.env.DB_USER || 'marsys',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'marsys2'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'marsys-ai-agent-default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES || '8h'
  },

  llm: {
    baseUrl: normalizeBaseUrl(
      process.env.NINEROUTER_URL || process.env.OPENAI_BASE_URL || 'http://localhost:20128'
    ),
    apiKey: process.env.NINEROUTER_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeout: parseInt(process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT || '90000', 10),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '0', 10) || undefined,
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '6', 10)
  },

  chatlogTable: (process.env.CHATLOG_TABLE || 'off').toLowerCase() === 'on'
}

module.exports = cfg