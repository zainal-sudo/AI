module.exports = {
  apps: [
    {
      name:"FE-AI",
      script: "npx",
      args: "serve dist -s -l 5175",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
