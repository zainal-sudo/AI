module.exports = {
  apps: [
    {
      name:"BE-AI",
      script: "npx",
      args: "serve dist -s -l 5174",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
