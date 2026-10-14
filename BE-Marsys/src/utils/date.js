const DEFAULT_TZ = process.env.APP_TIMEZONE || 'Asia/Jakarta'

function today(timeZone = DEFAULT_TZ) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
  } catch {
    const d = new Date()
    const off = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - off).toISOString().slice(0, 10)
  }
}

module.exports = { today, DEFAULT_TZ }
