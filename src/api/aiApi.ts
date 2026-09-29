import api from './axios'

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

export interface AiChatResponse {
  answer: string
  sources: string[]
  model: string
  toolCount: number
  periodAssumed: boolean
  chatLogId?: number
  numberCheck?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

const CHAT_TIMEOUT = 300_000

export const chatWithAi = (messages: AiChatMessage[]) =>
  api
    .post<{ success: boolean; data: AiChatResponse }>('/ai/chat', { messages }, { timeout: CHAT_TIMEOUT })
    .then((res) => res.data.data)

export const sendAiFeedback = (chatLogId: number, thumb: 1 | -1) =>
  api
    .post<{ success: boolean }>('/ai/feedback', { chatLogId, thumb }, { timeout: CHAT_TIMEOUT })
    .then((res) => res.data.success)

// Menggunakan endpoint /ai/chat reguler (non-streaming) agar lebih stabil
// dan tidak terputus oleh proxy/koneksi mobile.
export const chatWithAiStream = async (
  messages: AiChatMessage[],
  handlers: { onDelta: (t: string) => void; onClear: () => void },
  signal?: AbortSignal
): Promise<AiChatResponse> => {
  try {
    // Panggil chat reguler
    const res = await api.post<{ success: boolean; data: AiChatResponse }>(
      '/ai/chat',
      { messages },
      { timeout: CHAT_TIMEOUT, signal }
    )

    const data = res.data.data
    if (data && data.answer) {
      handlers.onDelta(data.answer)
    }
    return data
  } catch (e: any) {
    // Tampilkan pesan asli dari backend (bukan pesan generic axios)
    const backendMsg = e?.response?.data?.message
    throw new Error(backendMsg || e?.message || 'Gagal terhubung ke AI.')
  }
}
