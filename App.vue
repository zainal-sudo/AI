<template>
  <div class="app-root">
    <LoginView v-if="!isLoggedIn" @login-success="checkLogin" />
    <ChatApp v-else @logout="checkLogin" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import LoginView from './components/LoginView.vue'
import ChatApp from './components/ChatApp.vue'

const isLoggedIn = ref(false)

const checkLogin = () => {
  const token = localStorage.getItem('amp_token') || localStorage.getItem('finance_token')
  isLoggedIn.value = !!token
}

const handleAuthExpired = () => {
  localStorage.removeItem('amp_token')
  localStorage.removeItem('finance_token')
  isLoggedIn.value = false
}

onMounted(() => {
  checkLogin()
  window.addEventListener('auth:expired', handleAuthExpired)
})

onUnmounted(() => {
  window.removeEventListener('auth:expired', handleAuthExpired)
})
</script>

<style>
.app-root {
  width: 100vw;
  height: 100vh;
  background-color: #0f172a;
}
</style>
