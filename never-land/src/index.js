'use strict';

/**
 * index.js — نقطة تشغيل المشروع
 * -------------------------------------------------------------
 * يقلع: قاعدة البيانات → البوت (الأوامر + الأحداث) → لوحة الويب.
 * خيارات التشغيل:
 *   node src/index.js            (البوت + اللوحة)
 *   node src/index.js --no-web   (البوت فقط)
 *   node src/index.js --no-bot   (اللوحة فقط)
 * -------------------------------------------------------------
 */

const { Events } = require('discord.js');
const config = require('./config');
const db = require('./database');
const { loadCommands } = require('./handlers/commands');
const { loadEvents } = require('./handlers/events');
const { deployCommands } = require('./deploy-commands');

const args = process.argv.slice(2);
const runBot = !args.includes('--no-bot');
const runWeb = !args.includes('--no-web') && config.web.enabled;

/* ------------------------- حماية من الأخطاء غير المتوقّعة ------------------------- */
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Promise مرفوض بدون معالجة:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('💥 خطأ غير متوقّع:', err);
});

async function startBot() {
  const problems = config.validate();

  if (!config.bot.token || !config.bot.clientId) {
    console.error('');
    console.error('❌ لا يمكن تشغيل البوت: معلومات ناقصة في ملف .env');
    problems.forEach((p) => console.error(`   • ${p}`));
    console.error('');
    console.error('انسخ ملف .env.example إلى .env واملأ: DISCORD_TOKEN و CLIENT_ID');
    console.error('');
    return null;
  }

  const client = require('./client');

  console.log('🚀 جارٍ تشغيل Never Land ...');
  db.init();

  // تحميل الأوامر والأحداث
  loadCommands(client);
  loadEvents(client);

  // تسجيل أوامر السلاش (بعد ربط الحساب)
  client.once(Events.ClientReady, async () => {
    try {
      await deployCommands(client);
    } catch (err) {
      console.error('⚠️ فشل تسجيل أوامر السلاش:', err.message);
    }
  });

  await client.login(config.bot.token).catch((err) => {
    console.error('❌ فشل تسجيل الدخول:', err.message);
    console.error('   تأكد من صحة DISCORD_TOKEN وأن Intents مفعّلة في Developer Portal.');
    return null;
  });

  if (problems.length) {
    console.warn('⚠️ ملاحظات على الإعدادات:');
    problems.forEach((p) => console.warn(`   • ${p}`));
  }

  return client;
}

function startWeb() {
  try {
    const { startServer } = require('./web/server');
    return startServer();
  } catch (err) {
    console.error('⚠️ فشل تشغيل لوحة التحكم:', err.message);
    return null;
  }
}

(async () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║            N E V E R   L A N D                ║');
  console.log('║        بوت إدارة سيرفرات ديسكورد + لوحة       ║');
  console.log('║     مودريشن • حماية • تذاكر • مستويات • لوحة  ║');
  console.log('╚═══════════════════════════════════════════════╝');

  if (runBot) await startBot();
  else console.log('ℹ️  تم تجاوز تشغيل البوت (--no-bot)');

  if (runWeb) startWeb();
  else console.log('ℹ️  لوحة التحكم معطّلة');

  console.log('');
  console.log('✅ كل شيء جاهز. اضغط Ctrl+C للإيقاف.');
  console.log('');
})();

/* إغلاق نظيف */
const shutdown = (signal) => {
  console.log(`\n🛑 استلام ${signal} — إغلاق نظيف...`);
  try {
    db.close();
  } catch {
    /* تجاهل */
  }
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
