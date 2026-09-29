const crypto = require('crypto')

const ENCRYPTION_KEY = 'MAKV2SPBNI99212'
const SALT = Buffer.from([
  0x49, 0x76, 0x61, 0x6e, 0x20, 0x4d, 0x65, 0x64, 0x76, 0x65, 0x64, 0x65, 0x76
]) // "Ivan Medvedev"

function deriveKeyIv() {
  const derived = crypto.pbkdf2Sync(ENCRYPTION_KEY, SALT, 1000, 48, 'sha1')
  return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) }
}

function marsysEncrypt(clearText) {
  const { key, iv } = deriveKeyIv()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const input = Buffer.from(clearText, 'utf16le')
  return Buffer.concat([cipher.update(input), cipher.final()]).toString('base64')
}

function marsysDecrypt(cipherText) {
  const { key, iv } = deriveKeyIv()
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const input = Buffer.from(cipherText, 'base64')
  return Buffer.concat([decipher.update(input), decipher.final()]).toString('utf16le')
}

module.exports = { marsysEncrypt, marsysDecrypt }