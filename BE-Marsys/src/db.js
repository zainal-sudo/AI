const mysql = require('mysql2/promise')
const cfg = require('./config')

const pool = mysql.createPool({
  host: cfg.db.host,
  port: cfg.db.port,
  user: cfg.db.user,
  password: cfg.db.password,
  database: cfg.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4_general_ci'
})

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function queryOne(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows[0] || null
}

module.exports = { pool, query, queryOne }