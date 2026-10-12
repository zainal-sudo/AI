const { query } = require('../db')

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS ai_chatlog (
       id INT PRIMARY KEY AUTO_INCREMENT,
       user_id INT NULL,
       user_nama VARCHAR(50) NULL,
       question TEXT NULL,
       answer TEXT NULL,
       sources TEXT NULL,
       model VARCHAR(100) NULL,
       tool_count INT NULL,
       thumb TINYINT NULL DEFAULT 0,
       feedback_at DATETIME NULL,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4`
  )
}

async function saveChat({ userId, userName, question, answer, sources, model, toolCount, chatLogId }) {
  await ensureTable()
  const payload = chatLogId
    ? await query('SELECT id FROM ai_chatlog WHERE id = ? LIMIT 1', [chatLogId])
    : []
  if (payload.length) {
    await query(
      `UPDATE ai_chatlog
          SET answer = ?, sources = ?, model = ?, tool_count = ?
        WHERE id = ?`,
      [answer, JSON.stringify(sources || []), model, toolCount, chatLogId]
    )
    return chatLogId
  }
  const r = await query(
    `INSERT INTO ai_chatlog (user_id, user_nama, question, answer, sources, model, tool_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId || null, userName || null, question, answer, JSON.stringify(sources || []), model, toolCount]
  )
  return r.insertId
}

async function saveFeedback({ chatLogId, thumb }) {
  await query(
    `UPDATE ai_chatlog SET thumb = ?, feedback_at = NOW() WHERE id = ?`,
    [thumb, chatLogId]
  )
  return true
}

async function getHistory({ userId, hours = 24, limit = 100 }) {
  await ensureTable()
  const h = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168)
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200)
  const rows = await query(
    `SELECT id, question, answer, sources, model, tool_count, thumb, created_at
       FROM ai_chatlog
      WHERE user_id = ?
        AND created_at >= (NOW() - INTERVAL ? HOUR)
      ORDER BY created_at ASC, id ASC
      LIMIT ${lim}`,
    [userId, h]
  )
  return rows.map((r) => {
    let sources = []
    try {
      const parsed = typeof r.sources === 'string' ? JSON.parse(r.sources) : r.sources
      if (Array.isArray(parsed)) sources = parsed
    } catch (e) { sources = [] }
    return {
      id: r.id,
      question: r.question,
      answer: r.answer,
      sources,
      model: r.model,
      toolCount: r.tool_count,
      thumb: r.thumb,
      createdAt: r.created_at
    }
  })
}

module.exports = { ensureTable, saveChat, saveFeedback, getHistory }