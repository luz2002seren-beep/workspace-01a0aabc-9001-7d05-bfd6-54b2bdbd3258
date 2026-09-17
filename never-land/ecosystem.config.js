/**
 * إعداد PM2 لتشغيل المشروع على سيرفر حقيقي
 * الاستخدام:  pm2 start ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'never-land',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      time: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
    },
  ],
};
