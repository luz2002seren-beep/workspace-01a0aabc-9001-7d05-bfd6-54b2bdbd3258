'use strict';

/**
 * index.js — نقطة تشغيل المشروع
 * -------------------------------------------------------------
 * يقلع: قاعدة البيانات → البوت (الأوامر + الأحداث) → لوحة الويب.
 * خيارات التشغيل:
 *   node src/index.js            (البوت + اللوحة)
 *   node src/index.js --no-web   (البوت فقط)
 *   node src/index.js --no-bot   (اللوحة فقط)
 *   RUN_BOT=false / RUN_WEB=false عبر متغيّرات البيئة (نفس التأثير — للنشر)
 * -------------------------------------------------------------
 */

const { Events } = require('discord.js');
const config = require('./config');
const db = require('./database');
const { loadCommands } = require('./handlers/commands');
const { loadEvents } = require('./handlers/events');
const { deployCommands } = require('./deploy-commands');

const args = process.argv.slice(2);
const off = (v) => String(v ?? '').trim().toLowerCase() === 'false';
/* يمكن التحكم من متغيّرات البيئة أيضًا (مفيد على Railway/Render):
   RUN_BOT=false لتشغيل الموقع فقط • RUN_WEB=false لتشغيل البوت فقط */
const runBot = !args.includes('--no-bot') && !off(process.env.RUN_BOT);
const runWeb = !args.includes('--no-web') && config.web.enabled && !off(process.env.RUN_WEB);

/* ------------------------- حماية من الأخطاء غير المتوقّعة ------------------------- */
process.on('unhandledRejection', (err) => {
 console.error('[تنبيه] Promise مرفوض بدون معالجة:', err?.message || err);
});
process.on('uncaughtException', (err) => {
 console.error('[خطأ عام] خطأ غير متوقّع:', err);
});

async function startBot() {
  const problems = config.validate();

  if (!config.bot.token || !config.bot.clientId) {
    console.error('');
  console.error('[خطأ] لا يمكن تشغيل البوت: معلومات ناقصة في ملف .env');
    problems.forEach((p) => console.error(`   • ${p}`));
    console.error('');
    console.error('انسخ ملف .env.example إلى .env واملأ: DISCORD_TOKEN و CLIENT_ID');
    console.error('');
    return null;
  }

  const client = require('./client');

 console.log('[تشغيل] جارٍ تشغيل Never Land ...');
  db.init();

  // تحميل الأوامر والأحداث
  loadCommands(client);
  loadEvents(client);

  // تسجيل أوامر السلاش (بعد ربط الحساب)
  client.once(Events.ClientReady, async () => {
    try {
      await deployCommands(client);
    } catch (err) {
   console.error('[تنبيه] فشل تسجيل أوامر السلاش:', err.message);
    }
  });

  await client.login(config.bot.token).catch((err) => {
  console.error('[خطأ] فشل تسجيل الدخول:', err.message);
    console.error('   تأكد من صحة DISCORD_TOKEN وأن Intents مفعّلة في Developer Portal.');
    return null;
  });

  if (problems.length) {
  console.warn('[تنبيه] ملاحظات على الإعدادات:');
    problems.forEach((p) => console.warn(`   • ${p}`));
  }

  return client;
}

function startWeb() {
  try {
    const { startServer } = require('./web/server');
    return startServer();
  } catch (err) {
  console.error('[تنبيه] فشل تشغيل لوحة التحكم:', err.message);
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
 else console.log('[ملاحظة] تم تجاوز تشغيل البوت (--no-bot)');

  if (runWeb) {
    startWeb();
  } else {
    console.log('[تنبيه] الموقع غير شغّال في هذه الجلسة (--no-web أو web.enabled=false).');
    console.log('        لذلك زر «افتح الموقع» في ديسكورد لن يفتح شيئًا حتى تشغّله.');
  }

  console.log('');
  console.log('[تم] كل شيء جاهز. اضغط Ctrl+C للإيقاف.');
  if (runWeb) {
    const port = config.web.port;
    console.log(`[الموقع] افتح في المتصفح: http://localhost:${port}`);
    if (config.web.url && !/localhost|127\.0\.0\.1/.test(config.web.url)) {
      console.log(`[الموقع] الرابط العام: ${config.web.url}`);
    } else {
      console.log('[ملاحظة] هذا الرابط يعمل على جهازك فقط. لنشر الموقع على الإنترنت: railway.com أو أي سيرفر.');
    }
  }
  console.log('');
})();

/* إغلاق نظيف */
const shutdown = (signal) => {
 console.log(`\n[إيقاف] استلام ${signal} — إغلاق نظيف...`);
  try {
    db.close();
  } catch {
    /* تجاهل */
  }
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
