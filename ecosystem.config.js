module.exports = {
  apps: [
    {
      name: "lwc-data-server",
      script: "dist/src/index.js",
      cwd: __dirname, // so dotenv resolves .env at repo root
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
