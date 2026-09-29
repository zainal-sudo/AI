const express = require('express')
const { requireAuth } = require('../auth/jwt')
const { runAgent } = require('../agent/chat')
const chatlog = require('../services/chatlogService')

const router = express.Router()

router.use(requireAuth)

router.post('/chat', async (req, res, next) => {
  try {
    const { messages, chatLogId } = req.body || {}
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ success: false, message: 'messages wajib berupa array' })
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const result = await runAgent({ messages })

    const savedId = await chatlog.saveChat({
      userId: req.user && req.user.sub,
      userName: req.user && req.user.name,
      question: lastUserMsg ? lastUserMsg.content : '',
      answer: result.answer,
      sources: result.sources,
      model: result.model,
      toolCount: result.toolCount,
      chatLogId: chatLogId || null
    })

    res.json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        model: result.model,
        toolCount: result.toolCount,
        periodAssumed: false,
        chatLogId: savedId || undefined,
        usage: result.usage || undefined
      }
    })
  } catch (e) { next(e) }
})

router.post('/feedback', async (req, res, next) => {
  try {
    const { chatLogId, thumb } = req.body || {}
    if (!chatLogId) {
      return res.status(400).json({ success: false, message: 'chatLogId wajib diisi' })
    }
    await chatlog.saveFeedback({ chatLogId, thumb: thumb === -1 ? -1 : 1 })
    res.json({ success: true, message: 'Feedback diterima' })
  } catch (e) { next(e) }
})

module.exports = router