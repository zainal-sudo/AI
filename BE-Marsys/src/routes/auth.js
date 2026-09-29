const express = require('express')
const authService = require('../services/authService')
const { signToken } = require('../auth/jwt')

const router = express.Router()

router.get('/cabang', async (req, res, next) => {
  try {
    const data = await authService.listCabang()
    res.json({ success: true, data, message: 'Cabang berhasil dimuat' })
  } catch (e) { next(e) }
})

router.get('/users', async (req, res, next) => {
  try {
    const data = await authService.listUsers()
    res.json({ success: true, data, message: 'User berhasil dimuat' })
  } catch (e) { next(e) }
})

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })
    }
    const user = await authService.findUser(String(username))
    const ok = await authService.verifyPassword(user, String(password))
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Username / password salah' })
    }
    const token = signToken({
      sub: user.id,
      username: user.username,
      name: user.nama,
      role: user.role || 'user',
      type: user.type
    })
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nama: user.nama,
          role: user.role || 'user'
        }
      },
      message: 'Login berhasil'
    })
  } catch (e) { next(e) }
})

module.exports = router