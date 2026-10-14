import axios from 'axios'

const apiBase = (import.meta.env.VITE_API_URL as string) || '/api'

const api = axios.create({
  baseURL: apiBase,
  timeout: 300_000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('amp_token') || localStorage.getItem('finance_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(error)
  }
)

export default api
