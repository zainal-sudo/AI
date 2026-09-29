const jwt = require('jsonwebtoken')
const cfg = require('../config')

function signToken(payload) {
  return jwt.sign(payload, cfg.jwt.secret, { expiresIn: cfg.jwt.expiresIn })
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' })
  }
  try {
    const decoded = jwt.verify(token, cfg.jwt.secret)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Sesi tidak valid / kadaluarsa' })
  }
}

module.exports = { signToken, requireAuth }