const { query } = require('../db')
const { marsysEncrypt } = require('../auth/marsys-crypto')

const COMPANY_NAME = 'PT. AMP'
const COMPANY_ADDRESS = 'Jl. Tawangsari - Bulu Km. 02, Desa Lorog, Tawangsari, Sukoharjo'

async function listCabang() {
  return [
    {
      id: 'COY',
      dbase: 'marsys2',
      cbg_nama: COMPANY_NAME,
      cbg_alamat: COMPANY_ADDRESS,
      title: 'Marsys2'
    }
  ]
}

async function listUsers() {
  const mobile = await query(
    `SELECT user_kode AS kode, user_nama AS nama, user_jabatan AS jabatan
       FROM tusermobile
      ORDER BY user_nama`
  )
  const desktop = await query(
    `SELECT u.user_nama AS kode, u.user_nama AS nama, IFNULL(j.jab_nama, 'USER') AS jabatan
       FROM tuser u
       LEFT JOIN tjabatan j ON j.jab_id = u.user_jab_id
      WHERE u.user_isaktif = 1
      ORDER BY u.user_nama`
  )
  const seen = new Set()
  return [...mobile, ...desktop].filter((u) => (seen.has(u.kode) ? false : (seen.add(u.kode), true)))
}

async function findUser(username) {
  const mobile = await query(
    `SELECT user_id AS id, user_kode AS username, user_password AS password, user_nama AS nama, user_jabatan AS role
       FROM tusermobile
      WHERE user_kode = ? OR user_nama = ?
      LIMIT 1`,
    [username, username]
  )
  if (mobile.length) return { type: 'mobile', ...mobile[0] }

  const desktop = await query(
    `SELECT user_id AS id, user_nama AS username, user_password AS password, user_nama AS nama, user_jab_id AS role_or_jab_id
       FROM tuser
      WHERE user_nama = ? AND user_isaktif = 1
      LIMIT 1`,
    [username]
  )
  if (desktop.length) {
    const roleRow = await query(
      `SELECT jab_nama AS role FROM tjabatan WHERE jab_id = ? LIMIT 1`,
      [desktop[0].role_or_jab_id]
    )
    return { type: 'desktop', ...desktop[0], role: roleRow[0] ? roleRow[0].role : 'user' }
  }
  return null
}

async function verifyPassword(user, plainPassword) {
  if (!user || !plainPassword) return false
  if (user.type === 'mobile') {
    return String(user.password) === String(plainPassword)
  }
  return marsysEncrypt(String(plainPassword)) === String(user.password)
}

module.exports = { listCabang, listUsers, findUser, verifyPassword, COMPANY_NAME, COMPANY_ADDRESS }