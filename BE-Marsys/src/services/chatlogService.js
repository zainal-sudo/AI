const { query } = require('../db')
const cfg = require('../config')

async function ensureTable() {
  if (!cfg.chatlogTable) return
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
  if (!cfg.chatlogTable) return chatLogId || null
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
  if (!cfg.chatlogTable) return true
  await query(
    `UPDATE ai_chatlog SET thumb = ?, feedback_at = NOW() WHERE id = ?`,
    [thumb, chatLogId]
  )
  return true
}

module.exports = { ensureTable, saveChat, saveFeedback }