<template>
  <div class="chat-app">
    <!-- Header -->
    <header class="chat-header">
      <div class="header-left">
        <div class="avatar">🤖</div>
        <div>
          <h2>AMP AI Assistant</h2>
          <span class="status-indicator">Online &bull; Siap Membantu</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" @click="clearChat" title="Hapus Riwayat">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
        <button class="icon-btn logout" @click="logout" title="Keluar / Ganti Token">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    </header>

    <!-- Quick Chips -->
    <div class="quick-chips-container" v-if="messages.length === 0">
      <p class="quick-title">Pertanyaan Cepat:</p>
      <div class="chips-grid">
        <button
          v-for="chip in QUICK_CHIPS"
          :key="chip"
          class="chip-btn"
          @click="send(chip)"
        >
          {{ chip }}
        </button>
      </div>
    </div>

    <!-- Messages List -->
    <div class="messages-container" ref="listEl">
      <div v-if="messages.length === 0" class="welcome-box">
        <div class="welcome-icon">💬</div>
        <h3>Selamat Datang di AMP AI</h3>
        <p>Tanyakan ringkasan penjualan, saldo piutang, kartu stok, atau data operasional cabang Anda.</p>
      </div>

      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="message-row"
        :class="msg.role"
      >
        <div class="message-bubble">
          <div class="message-content" v-html="renderMd(msg.content)"></div>

          <!-- Sources -->
          <div v-if="msg.sources && msg.sources.length > 0" class="sources-list">
            <span class="source-tag" v-for="src in msg.sources" :key="src">
              📎 {{ SOURCE_LABELS[src] || src }}
            </span>
          </div>

          <!-- Message Footer / Feedback -->
          <div class="message-footer" v-if="msg.role === 'assistant'">
            <div class="feedback-buttons" v-if="msg.chatLogId">
              <button
                class="fb-btn"
                :class="{ active: msg.thumb === 1 }"
                @click="feedback(idx, 1)"
                title="Bagus"
              >
                👍
              </button>
              <button
                class="fb-btn"
                :class="{ active: msg.thumb === -1 }"
                @click="feedback(idx, -1)"
                title="Kurang"
              >
                👎
              </button>
            </div>
            <button class="copy-btn" @click="copyText(msg.content)" title="Salin Teks">
              📋 Salin
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="message-row assistant">
        <div class="message-bubble typing">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="typing-text">Sedang menganalisis data...</span>
        </div>
      </div>
    </div>

    <!-- Input Box -->
    <footer class="chat-input-footer">
      <div class="input-wrapper">
        <textarea
          v-model="input"
          rows="1"
          placeholder="Ketik pertanyaan ke AI..."
          @keydown.enter.exact.prevent="send()"
          @keydown.up.prevent="handleKeyUp"
          @keydown.down.prevent="handleKeyDown"
          ref="inputEl"
        ></textarea>
        <button
          v-if="loading"
          class="send-btn stop"
          @click="stop"
          title="Berhenti"
        >
          ⏹
        </button>
        <button
          v-else
          class="send-btn"
          :disabled="!canSend"
          @click="send()"
          title="Kirim"
        >
          🚀
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useToast } from 'vue-toastification'
import { chatWithAiStream, sendAiFeedback, type AiChatMessage } from '@/api/aiApi'

interface UiMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  chatLogId?: number
  thumb?: 1 | -1
}

const emit = defineEmits(['logout'])
const toast = useToast()

const input = ref('')
const loading = ref(false)
const messages = ref<UiMessage[]>([])
const historyIndex = ref<number>(-1)
const tempInput = ref('')
const listEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const abortCtrl = ref<AbortController | null>(null)

const SOURCE_LABELS: Record<string, string> = {
  realisasi_penjualan: 'Realisasi Penjualan',
  faktur_outstanding: 'Faktur Outstanding',
  saldo_piutang: 'Saldo Piutang',
  kartu_stok: 'Kartu Stok',
  dashboard_summary: 'Dashboard/Briefing',
}

const QUICK_CHIPS = [
  'Briefing hari ini',
  'Penjualan bulan ini',
  'Faktur >120 hari',
  'Top penunggak piutang',
  'Stok kritis',
]

const canSend = computed(() => input.value.trim().length > 0 && !loading.value)

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderMd = (text: string) => {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/```[\s\S]*?```/g, (m) => `<code>${m.slice(3, -3)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n/g, '<br>')
}

const scrollBottom = () => {
  nextTick(() => {
    if (listEl.value) {
      listEl.value.scrollTop = listEl.value.scrollHeight
    }
  })
}

const stop = () => {
  abortCtrl.value?.abort()
  loading.value = false
}

const clearChat = () => {
  if (confirm('Hapus semua riwayat percakapan?')) {
    messages.value = []
  }
}

const logout = () => {
  localStorage.removeItem('amp_token')
  localStorage.removeItem('finance_token')
  emit('logout')
}

const copyText = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.success('Teks disalin ke clipboard!')
}

const handleKeyUp = () => {
  const userMsgs = messages.value.filter(m => m.role === 'user')
  if (userMsgs.length === 0) return

  if (historyIndex.value === -1) {
    tempInput.value = input.value
    historyIndex.value = userMsgs.length - 1
  } else if (historyIndex.value > 0) {
    historyIndex.value--
  }

  if (historyIndex.value >= 0 && historyIndex.value < userMsgs.length) {
    input.value = userMsgs[historyIndex.value].content
  }
}

const handleKeyDown = () => {
  if (historyIndex.value === -1) return

  const userMsgs = messages.value.filter(m => m.role === 'user')
  if (historyIndex.value < userMsgs.length - 1) {
    historyIndex.value++
    input.value = userMsgs[historyIndex.value].content
  } else {
    historyIndex.value = -1
    input.value = tempInput.value
  }
}

const feedback = async (idx: number, thumb: 1 | -1) => {
  const msg = messages.value[idx]
  if (!msg.chatLogId) return
  try {
    const success = await sendAiFeedback(msg.chatLogId, thumb)
    if (success) {
      msg.thumb = thumb
      toast.success('Terima kasih atas ulasan Anda!')
    }
  } catch (e: any) {
    toast.error(e?.message || 'Gagal mengirim umpan balik')
  }
}

const send = async (preset?: string) => {
  const text = (preset ?? input.value).trim()
  if (!text || loading.value) return
  input.value = ''
  historyIndex.value = -1
  tempInput.value = ''

  messages.value.push({ role: 'user', content: text })
  loading.value = true
  scrollBottom()

  const history: AiChatMessage[] = messages.value.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
    sources: m.sources,
  }))

  const assistantMsgIndex = messages.value.push({
    role: 'assistant',
    content: '',
  }) - 1

  abortCtrl.value = new AbortController()

  try {
    const res = await chatWithAiStream(
      history,
      {
        onDelta: (chunk) => {
          messages.value[assistantMsgIndex].content += chunk
          scrollBottom()
        },
        onClear: () => {
          messages.value[assistantMsgIndex].content = ''
        },
      },
      abortCtrl.value.signal
    )

    messages.value[assistantMsgIndex].content = res.answer
    messages.value[assistantMsgIndex].sources = res.sources
    messages.value[assistantMsgIndex].chatLogId = res.chatLogId
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      if (!messages.value[assistantMsgIndex].content) {
        messages.value.splice(assistantMsgIndex, 1)
      }
    } else {
      const errMsg = e?.message === 'AUTH_EXPIRED' ? 'Sesi berakhir, silakan login ulang.' : (e?.message || 'Gagal terhubung ke AI.')
      messages.value[assistantMsgIndex].content = `⚠️ ${errMsg}`
      if (e?.message === 'AUTH_EXPIRED') {
        setTimeout(logout, 2000)
      }
    }
  } finally {
    loading.value = false
    abortCtrl.value = null
    scrollBottom()
  }
}
</script>

<style scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background-color: #0f172a;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar {
  font-size: 1.75rem;
  background: #334155;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.header-left h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #f8fafc;
}

.status-indicator {
  font-size: 0.75rem;
  color: #38bdf8;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.icon-btn:hover {
  background: #334155;
  color: #f8fafc;
}

.icon-btn.logout:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* Quick Chips */
.quick-chips-container {
  padding: 0.75rem 1rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

.quick-title {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 0.5rem;
}

.chips-grid {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: none;
}

.chips-grid::-webkit-scrollbar {
  display: none;
}

.chip-btn {
  background: #334155;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 0.35rem 0.75rem;
  border-radius: 16px;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.2s;
}

.chip-btn:hover {
  background: #475569;
}

/* Messages */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.welcome-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin: auto;
  max-width: 300px;
  color: #94a3b8;
}

.welcome-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
}

.welcome-box h3 {
  color: #f8fafc;
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
}

.welcome-box p {
  font-size: 0.875rem;
  line-height: 1.4;
}

.message-row {
  display: flex;
  width: 100%;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 85%;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-size: 0.875rem;
  line-height: 1.5;
  word-break: break-word;
}

.message-row.user .message-bubble {
  background: #3b82f6;
  color: white;
  border-bottom-right-radius: 4px;
}

.message-row.assistant .message-bubble {
  background: #1e293b;
  color: #f8fafc;
  border: 1px solid #334155;
  border-bottom-left-radius: 4px;
}

.sources-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.source-tag {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.message-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.feedback-buttons {
  display: flex;
  gap: 0.25rem;
}

.fb-btn {
  background: transparent;
  border: none;
  font-size: 0.875rem;
  cursor: pointer;
  opacity: 0.6;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
  transition: opacity 0.2s, background 0.2s;
}

.fb-btn:hover, .fb-btn.active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.copy-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}

.copy-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.1);
}

/* Typing Indicator */
.message-bubble.typing {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #94a3b8;
}

.typing-dots {
  display: flex;
  gap: 0.25rem;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  background: #38bdf8;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.typing-dots span:nth-child(1) { animation-delay: -0.32s; }
.typing-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
}

.typing-text {
  font-size: 0.75rem;
}

/* Input Footer */
.chat-input-footer {
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom)) 1rem;
  background: #1e293b;
  border-top: 1px solid #334155;
}

.input-wrapper {
  display: flex;
  align-items: center;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 24px;
  padding: 0.35rem 0.5rem 0.35rem 1rem;
  gap: 0.5rem;
}

.input-wrapper textarea {
  flex: 1;
  background: transparent;
  border: none;
  color: #f8fafc;
  font-size: 0.875rem;
  resize: none;
  max-height: 100px;
  font-family: inherit;
  padding-top: 0.25rem;
}

.input-wrapper textarea:focus {
  outline: none;
}

.send-btn {
  background: #3b82f6;
  color: white;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #2563eb;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn.stop {
  background: #ef4444;
}
.send-btn.stop:hover {
  background: #dc2626;
}
</style>
