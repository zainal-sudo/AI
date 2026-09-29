module.exports = {
  apps: [
    {
      name: 'marsys2-ai-api',
      script: 'src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '300M',
      autorestart: true,
      restart_delay: 3000
    }
  ]
}