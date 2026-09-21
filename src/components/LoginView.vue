<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-area">
        <div class="logo-icon">🤖</div>
        <h1>BSM AI Mobile</h1>
        <p>Silakan login menggunakan akun BSM Cabang Anda</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="input-group">
          <label for="cabang">Pilih Cabang (Database)</label>
          <select id="cabang" v-model="selectedDbase" required @change="fetchUsers">
            <option value="" disabled>-- Pilih Cabang --</option>
            <option v-for="c in cabangList" :key="c.dbase" :value="c.dbase">
              {{ c.cbg_nama || c.dbase }}
            </option>
          </select>
        </div>

        <div class="input-group">
          <label for="username">Username / Kode User</label>
          <select id="username" v-model="form.username" required :disabled="!selectedDbase">
            <option value="" disabled>-- Pilih User --</option>
            <option v-for="u in userList" :key="u.kode" :value="u.kode">
              {{ u.nama ? `${u.nama} (${u.kode})` : u.kode }}
            </option>
          </select>
        </div>

        <div class="input-group">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            v-model="form.password"
            placeholder="Masukkan password..."
            required
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Sedang Masuk...' : 'Masuk ke Asisten' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import api from '@/api/axios'

const emit = defineEmits(['login-success'])
const toast = useToast()

const loading = ref(false)
const cabangList = ref<any[]>([])
const userList = ref<any[]>([])
const selectedDbase = ref('')

const form = reactive({
  username: '',
  password: '',
})

onMounted(async () => {
  try {
    const res = await api.get('/auth/cabang')
    if (res.data?.success) {
      const data = res.data.data
      // Mendukung format objek { cabangs: [...] } atau array [...] langsung dari backend
      cabangList.value = Array.isArray(data) ? data : (data?.cabangs || [])
      
      // Jika ada default dbase atau hanya 1 cabang, auto select
      if (data?.defaultDbase) {
        selectedDbase.value = data.defaultDbase
        fetchUsers()
      } else if (cabangList.value.length === 1) {
        selectedDbase.value = cabangList.value[0].dbase
        fetchUsers()
      }
    }
  } catch (e: any) {
    toast.error('Gagal mengambil daftar cabang: ' + (e?.message || 'Server error'))
  }
})

const fetchUsers = async () => {
  form.username = ''
  userList.value = []
  if (!selectedDbase.value) return
  try {
    const res = await api.get(`/auth/users`, { params: { dbase: selectedDbase.value } })
    if (res.data?.success) {
      userList.value = res.data.data || []
    }
  } catch (e: any) {
    toast.error('Gagal mengambil daftar user')
  }
}

const handleLogin = async () => {
  if (!selectedDbase.value || !form.username || !form.password) {
    toast.error('Semua kolom wajib diisi')
    return
  }

  loading.value = true
  try {
    const selectedCbg = cabangList.value.find((c: any) => c.dbase === selectedDbase.value)
    const res = await api.post('/auth/login', {
      username: form.username,
      password: form.password,
      dbase: selectedDbase.value,
      cbgNama: selectedCbg?.cbg_nama || '',
    })

    if (res.data?.success && res.data?.data?.token) {
      const token = res.data.data.token
      localStorage.setItem('bsm_token', token)
      localStorage.setItem('finance_token', token)
      toast.success('Login berhasil!')
      emit('login-success')
    } else {
      toast.error('Login gagal, periksa kembali data Anda')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.message || 'Login gagal. Periksa username/password.')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  padding: 1rem;
}

.login-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 16px;
  padding: 2rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
}

.logo-area {
  text-align: center;
  margin-bottom: 1.5rem;
}

.logo-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.logo-area h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f8fafc;
}

.logo-area p {
  font-size: 0.875rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25ktrem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #cbd5e1;
}

.input-group select,
.input-group input {
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 8px;
  padding: 0.75rem;
  color: #f8fafc;
  font-size: 0.875rem;
  font-family: inherit;
}

.input-group select:focus,
.input-group input:focus {
  outline: none;
  border-color: #38bdf8;
}

.btn-primary {
  background: format(#3b82f6);
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 0.5rem;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
