'use strict';

/**
 * web/server.js
 * -------------------------------------------------------------
 * خادم لوحة التحكم: Express + جلسات + OAuth2 (ديسكورد) + واجهة برمجية.
 *
 * ملاحظة مهمة للمعاينة:
 *   عند تفعيل DEMO_MODE=true تعمل اللوحة ببيانات تجريبية بدون توكن
 *   وبدون تسجيل دخول — مفيد لتجربة الواجهة قبل ربط البوت.
 * -------------------------------------------------------------
 */

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');

const config = require('../config');
const db = require('../database');

let server = null;

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // جلسات محفوظة على القرص (تبقى بعد إعادة التشغيل) — داخل نفس مجلد قاعدة البيانات/الـVolume
  const { FileSessionStore } = require('./sessionStore');
  const sessionFile = path.join(path.dirname(config.database.path), 'sessions.json');
  const store = new FileSessionStore(sessionFile, 7 * 24 * 60 * 60 * 1000);
  setInterval(() => store.cleanup(), 3600 * 1000).unref?.();

  app.use(
    session({
      name: 'neverland.sid',
      secret: config.web.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // كوكي آمن تلقائيًا عندما يكون الرابط العام https (Railway/نطاقك)
        secure: /^https:/i.test(config.web.url),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // الملفات الثابتة (CSS/JS)
  app.use(express.static(path.join(__dirname, 'public')));

  // فحص صحة عام (للنشر: Railway/Render/Docker) — بلا تسجيل دخول وبلا بيانات حساسة
  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      ok: true,
      site: config.web.siteName,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  });

  // بيانات تجريبية عند تفعيل وضع المعاينة
  if (config.web.demoData) {
    require('./demo').seed();
    console.log('[تهيئة] ما في توكن Discord بعد: الصفحات تعرض بيانات العرض حتى تربط حسابك.');
  } else if (config.web.demoMode && config.bot.hasToken) {
    console.log('[تهيئة] تم اكتشاف توكن Discord: بيانات العرض متوقّفة، والموقع يستخدم بياناتك الحقيقية.');
    require('./demo').cleanup?.();
  }

  // المسارات
  app.use('/auth', require('./routes/auth'));
  app.use('/api', require('./routes/api'));
  app.use('/', require('./routes/pages'));

  // 404
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
    const { layout, escapeHtml } = require('./routes/pages');
    const body = `
    <section class="site-hero" style="text-align:center">
      <span class="pill">خطأ 404</span>
      <h1>الصفحة غير موجودة</h1>
      <p class="muted">الرابط الذي فتحته غير صحيح أو تم نقله.</p>
      <div class="site-cta">
        <a class="btn btn-primary" href="/">العودة إلى الرئيسية</a>
        <a class="btn btn-ghost" href="/dashboard">لوحة التحكم</a>
      </div>
    </section>`;
    res.status(404).send(layout({ title: 'صفحة غير موجودة', body }));
  });

  // معالج الأخطاء
  app.use((err, req, res, _next) => {
  console.error('[خطأ] خطأ في لوحة التحكم:', err);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'server_error', message: err.message });
    return res.status(500).send('خطأ داخلي في الخادم');
  });

  return app;
}

function startServer() {
  if (server) return server;
  const app = createApp();
  const { port } = config.web;

  server = app.listen(port, '0.0.0.0', () => {
  console.log(`[الويب] الموقع شغّال على: ${config.web.url}`);
    console.log(`   (من نفس الجهاز: http://localhost:${port})`);
    if (!config.web.demoMode && !config.bot.clientSecret) {
   console.warn('[تنبيه] CLIENT_SECRET غير موجود — تسجيل الدخول لن يعمل. أضف DEMO_MODE=true للمعاينة.');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
   console.error(`[خطأ] المنفذ ${port} مستخدم بالفعل. غيّر DASHBOARD_PORT في .env`);
    } else {
   console.error('[خطأ] خطأ في خادم اللوحة:', err.message);
    }
  });

  return server;
}

/** إيقاف خادم اللوحة */
function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { createApp, startServer, stopServer, sessionToken: () => crypto.randomBytes(24).toString('hex') };
