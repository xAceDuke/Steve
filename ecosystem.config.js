module.exports = {
  apps: [{
    name: "steve-bot",
    script: "./index.js",
    watch: false,
    max_memory_restart: "1G",
    exp_backoff_restart_delay: 100,
    env: {
      NODE_ENV: "production",
    }
  }]
};
