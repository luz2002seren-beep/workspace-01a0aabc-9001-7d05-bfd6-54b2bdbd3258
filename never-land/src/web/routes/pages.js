'use strict';

/**
 * web/routes/pages.js
 * -------------------------------------------------------------
 * صفحات لوحة التحكم (HTML مُصمّم مباشرة داخل الخادم — بدون محرّك قوالب).
 *   /                 صفحة الترحيب
 *   /dashboard        قائمة السيرفرات
 *   /dashboard/:id    لوحة إعداد السيرفر (SPA تعمل بـ public/app.js)
 * -------------------------------------------------------------
 */

const express = require('express');
const config = require('../../config');
const db = require('../../database');

const router = express.Router();
const { icon, logoMark } = require('../public/icons');

/** تخطيط الصفحة العام */
function layout({ title, body, user = null, extraHead = '', bodyClass = '' }) {
  const SITE_NAME = config.web.siteName;
  const siteUrl = config.web.url;
  const userBox = user
    ? `<div class="user-box">
         <span class="user-name">${escapeHtml(user.globalName || user.username || 'مستخدم')}</span>
         <a class="btn btn-ghost" href="/auth/logout">${icon('logout', { size: 17 })} خروج</a>
       </div>`
    : `<a class="btn btn-primary" href="/auth/login">${icon('login', { size: 17 })} تسجيل الدخول بـ Discord</a>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${SITE_NAME} — نظام إدارة سيرفرات ديسكورد: حماية تلقائية، سجلات، تذاكر، ترحيب، مستويات، ولوحة تحكم عربية كاملة.">
<meta name="theme-color" content="#0d1017">
<meta name="color-scheme" content="dark light">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${escapeHtml(title)} | ${SITE_NAME}">
<meta property="og:description" content="نظام إدارة سيرفرات ديسكورد متكامل مع لوحة تحكم عربية.">
<meta property="og:url" content="${escapeHtml(siteUrl)}/">
<meta property="og:image" content="${escapeHtml(siteUrl)}/icon.svg">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${escapeHtml(siteUrl)}/">
<title>${escapeHtml(title)} | ${SITE_NAME}</title>
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/style.css">
${bodyClass === 'dashboard' ? '<link rel="stylesheet" href="/dash.css">' : ''}
<script>
  try {
    var saved = localStorage.getItem('neverland-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (e) {}
</script>
${extraHead}
</head>
<body class="${bodyClass}">
<header class="topbar">
  <a class="brand" href="/" aria-label="Never Land">
    <span class="brand-logo">${logoMark(32)}</span>
    <span class="brand-text">Never<span class="accent">Land</span></span>
  </a>
  <nav class="nav">
    <a href="/">الرئيسية</a>
    <a href="/dashboard">لوحة التحكم</a>
    <a href="/api/status" target="_blank" rel="noopener">حالة الخدمة</a>
  </nav>
  <div class="auth">
    <button class="theme-toggle" id="themeToggle" title="تبديل الوضع الليلي والنهاري" aria-label="تبديل الوضع">${icon('moon', { size: 17 })}</button>
    ${userBox}
  </div>
</header>
<main class="container">
${body}
</main>
<footer class="footer">
  <span>${SITE_NAME} — نظام إدارة سيرفرات ديسكورد</span>
  <span class="muted">قاعدة البيانات: ${db.driverName}</span>
</footer>
<script>
  (function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    var moon = ${JSON.stringify(icon('moon', { size: 17 }))};
    var sun = ${JSON.stringify(icon('sun', { size: 17 }))};
    var paint = function () {
      var light = document.documentElement.dataset.theme === 'light';
      btn.innerHTML = light ? sun : moon;
    };
    paint();
    btn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('neverland-theme', next); } catch (e) {}
      paint();
    });
  })();
</script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** هل المستخدم مسجّلًا */
function requireAuth(req, res, next) {
  if (config.web.demoMode) {
    req.user = { id: '0', username: 'المسؤول', globalName: 'مسؤول السيرفر' };
    return next();
  }
  if (!req.session.user) return res.redirect('/auth/login');
  req.user = req.session.user;
  return next();
}

/* --------------------- ملفات الموقع الأساسية (أيقونة، مانيفست، روبوتات) --------------------- */

router.get('/icon.svg', (_req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=604800').send(logoMark(64));
});

router.get('/manifest.webmanifest', (_req, res) => {
  res.type('application/manifest+json').json({
    name: config.web.siteName,
    short_name: config.web.siteName,
    description: 'نظام إدارة سيرفرات ديسكورد مع لوحة تحكم عربية',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0d1017',
    theme_color: '#5b6cff',
    dir: 'rtl',
    lang: 'ar',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  });
});

router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\n\nSitemap: ${config.web.url}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (_req, res) => {
  const url = config.web.url;
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${url}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
      `  <url><loc>${url}/dashboard</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n` +
      `</urlset>\n`,
  );
});

/* ---------------------------------- الصفحة الرئيسية ---------------------------------- */
router.get('/', (req, res) => {
  const inviteUrl = config.web.inviteUrl || '#';
  const loggedIn = Boolean(req.user || config.web.demoMode);
  const supportUrl = config.web.supportUrl || null;

  const features = [
    { i: 'shield', t: 'حماية تلقائية', d: 'منع السبام والروابط والدعوات والمنشن الجماعي والكلمات الممنوعة، مع حماية من الهجمات.' },
    { i: 'hammer', t: 'أوامر إشراف', d: 'حظر دائم ومؤقت، طرد، إسكات، تحذيرات، وسجل حالات مرقّم لكل عضو.' },
    { i: 'scroll', t: 'سجلات شاملة', d: 'ثمانية وثلاثون حدثًا في تسع مجموعات، مع تحديد من نفّذ كل إجراء.' },
    { i: 'userPlus', t: 'ترحيب بالصورة', d: 'بطاقة ترحيب تُولَّد بالأفتار، ورسالة وداع، وشكر الدعم.' },
    { i: 'ticket', t: 'تذاكر بأربعة أنواع', d: 'الدعم الفني، التوثيق، الهدايا، وتقديم الإدارة، مع أرشيف محادثة عند الإغلاق.' },
    { i: 'clipboard', t: 'نموذج تقديم إدارة', d: 'نموذج من خمس خانات يصل لقناة الإدارة، مع قبول أو رفض ورسائل تلقائية.' },
    { i: 'lines', t: 'الخط الفاصل', d: 'خط تلقائي في قنوات التقديمات مع حذف الخط السابق في كل رسالة جديدة.' },
    { i: 'chart', t: 'مستويات وخبرة', d: 'خبرة على الرسائل والقنوات الصوتية، ومكافآت رتب، ولوحة متصدّرين.' },
    { i: 'sliders', t: 'لوحة تحكم عربية', d: 'تحكم كامل من المتصفح بثلاثة عشر قسمًا، مع وضع ليلي ونهاري، بدون أوامر.' },
    { i: 'server', t: 'استضافة ذاتية', d: 'يعمل على SQLite افتراضيًا مع بديل JSON، ودعم Docker وPM2.' },
  ];

  const stats = [
    { i: 'terminal', n: '27', l: 'أمر سلاش' },
    { i: 'scroll', n: '38', l: 'حدث سجلات' },
    { i: 'layers', n: '11', l: 'نظامًا' },
    { i: 'sliders', n: '13', l: 'قسمًا في اللوحة' },
  ];

  const steps = [
    { t: 'إضافة البوت', d: 'اضغط زر الإضافة واختر السيرفر، ثم اقبل الصلاحيات المطلوبة.' },
    { t: 'تسجيل الدخول', d: 'ادخل بحساب ديسكورد، وستظهر سيرفراتك التي تملك فيها صلاحية الإدارة.' },
    { t: 'تشغيل الأنظمة', d: 'فعّل ما تحتاجه من اللوحة: الترحيب، الحماية، التذاكر، السجلات.' },
    { t: 'الحفظ', d: 'اضغط حفظ التغييرات لتُطبَّق مباشرة على البوت.' },
  ];

  const commands = [
    ['/ban', 'العضو:@Ahmed', 'السبب:نشر روابط', 'المدة:7d'],
    ['/autoline add', 'القناة:#التقديمات'],
    ['/welcome image', 'النوع:بطاقة مولَّدة بالأفتار'],
    ['/tickets applychannel', 'القناة:#قبول-إدارة'],
    ['/logs events', 'تحديد أحداث السجلات بالمجموعات'],
    ['/automod word', 'العملية:إضافة', 'الكلمة:كلمة_ممنوعة'],
  ];

  const body = `
  <section class="site-hero">
    <div>
      <span class="pill">${icon('bolt', { size: 15 })} الإصدار 1.0 — مجاني بالكامل — واجهة عربية</span>
      <h1>بوت إدارة سيرفرات ديسكورد <span class="grad">متكامل وواضح</span></h1>
      <p class="lead">
        يجمع الحماية التلقائية، السجلات، التذاكر، تقديم الإدارة، الترحيب بالصورة، والمستويات في نظام واحد،
        ويُدار بالكامل من لوحة تحكم عربية بسيطة بدون أوامر إجبارية.
      </p>
      <div class="site-cta">
        <a class="btn btn-primary btn-lg" href="${loggedIn ? '/dashboard' : '/auth/login'}">
          ${icon(loggedIn ? 'dashboard' : 'login', { size: 18 })} ${loggedIn ? 'لوحة التحكم' : 'تسجيل الدخول'}
        </a>
        <a class="btn btn-ghost btn-lg" href="${inviteUrl}" target="_blank" rel="noopener">
          ${icon('plus', { size: 18 })} إضافة البوت
        </a>
      </div>
      <div class="stat-row" style="justify-content:flex-start;margin-top:26px">
        ${stats
          .map(
            (st) =>
              `<div class="stat">${icon(st.i, { size: 18, cls: 'stat-ico' })}<b>${st.n}</b><span>${st.l}</span></div>`,
          )
          .join('')}
      </div>
    </div>

    <div class="site-hero-art" aria-hidden="true">
      <div class="mock-bar"><i></i><i></i><i></i></div>
      <div class="mock-title">${icon('sliders', { size: 17 })} لوحة التحكم — مركز التحكم</div>
      ${[
        ['userPlus', 'الترحيب بالصورة', 'مُفعّل', 'ok'],
        ['shield', 'الحماية التلقائية', 'مُفعّل', 'ok'],
        ['ticket', 'التذاكر بأربعة أنواع', 'مُفعّل', 'ok'],
        ['scroll', 'السجلات', '31 / 38', 'val'],
        ['clipboard', 'تقديم الإدارة', 'مُفعّل', 'ok'],
        ['lines', 'الخط الفاصل', 'قناتان', 'val'],
      ]
        .map(
          ([i, label, badge, kind]) => `
        <div class="mock-row">
          ${icon(i, { size: 17, cls: 'mock-ico' })}
          <span class="lbl">${label}</span>
          ${kind === 'ok' ? `<span class="badge badge-ok">${badge}</span>` : `<span class="val">${badge}</span>`}
        </div>`,
        )
        .join('')}
    </div>
  </section>

  <div class="section-title"><h2>الأنظمة</h2><span class="hr"></span></div>
  <div class="site-features">
    ${features
      .map(
        (f) => `<div class="site-feature">
          <span class="fi">${icon(f.i, { size: 20 })}</span>
          <b>${f.t}</b>
          <p>${f.d}</p>
        </div>`,
      )
      .join('')}
  </div>

  <div class="section-title"><h2>البدء في أربع خطوات</h2><span class="hr"></span></div>
  <div class="site-steps">
    ${steps
      .map(
        (st, i) => `<div class="site-step">
          <span class="n">${i + 1}</span>
          <b>${st.t}</b>
          <p>${st.d}</p>
        </div>`,
      )
      .join('')}
  </div>

  <div class="section-title"><h2>أمثلة على الأوامر</h2><span class="hr"></span></div>
  <pre class="cmd-preview">${commands
    .map((parts) => `<b>${escapeHtml(parts[0])}</b>  ${parts.slice(1).map((x) => escapeHtml(x)).join('  ')}`)
    .join('\n')}</pre>

  <div class="cta" style="margin-top:30px">
    <a class="btn btn-primary btn-lg" href="/dashboard">${icon('dashboard', { size: 18 })} فتح لوحة التحكم</a>
    ${supportUrl ? `<a class="btn btn-ghost btn-lg" href="${supportUrl}" target="_blank" rel="noopener">${icon('lifeBuoy', { size: 18 })} الدعم</a>` : ''}
    <a class="btn btn-ghost btn-lg" href="/api/status" target="_blank" rel="noopener">${icon('activity', { size: 18 })} حالة الخدمة</a>
  </div>`;

  res.send(layout({ title: 'بوت إدارة سيرفرات ديسكورد', body, user: req.user }));
});

/* ---------------------------------- قائمة السيرفرات ---------------------------------- */
router.get('/dashboard', requireAuth, (req, res) => {
  const client = (() => {
    try {
      return require('../../client');
    } catch {
      return null;
    }
  })();

  let guilds = [];
  if (config.web.demoMode) {
    guilds = require('../demo').DEMO_META.guilds;
  } else {
    const botIds = new Set(client?.guilds?.cache?.keys?.() ?? []);
    guilds = (req.session.guilds || []).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      memberCount: client?.guilds?.cache?.get(g.id)?.memberCount ?? null,
      botPresent: botIds.has(g.id),
      owner: Boolean(g.owner),
    }));
  }

  const inviteUrl = config.web.inviteUrl || '#';
  const withBot = guilds.filter((g) => g.botPresent).length;

  const cards = guilds.length
    ? guilds
        .map((g) => {
          const thumb = g.icon
            ? `<img class="guild-icon" src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128" alt="">`
            : `<div class="guild-icon placeholder">${escapeHtml((g.name || '?').slice(0, 2))}</div>`;
          return `
      <div class="guild-card${g.botPresent ? '' : ' disabled'}" data-name="${escapeHtml(String(g.name || '').toLowerCase())}" data-bot="${g.botPresent ? '1' : '0'}">
        ${thumb}
        <div class="guild-info">
          <b>${escapeHtml(g.name)}</b>
          <span class="muted">
            ${g.memberCount ? `${Number(g.memberCount).toLocaleString('ar-EG')} عضو` : 'عدد الأعضاء غير متاح'}
            ${g.owner ? `— ${icon('crown', { size: 14 })} المالك` : ''}
          </span>
        </div>
        <div class="guild-actions">
          ${
            g.botPresent
              ? `<a class="btn btn-primary btn-sm" href="/dashboard/${g.id}">${icon('settings', { size: 16 })} إعداد</a>`
              : `<a class="btn btn-ghost btn-sm" href="${inviteUrl}" target="_blank" rel="noopener">${icon('plus', { size: 16 })} إضافة البوت</a>`
          }
        </div>
      </div>`;
        })
        .join('')
    : `<div class="empty">
         <h3>لا توجد سيرفرات متاحة</h3>
         <p>تظهر السيرفرات التي تملك فيها صلاحية «إدارة السيرفر» وكان البوت مضافًا إليها.</p>
         <a class="btn btn-primary" href="/auth/login">${icon('login', { size: 17 })} إعادة تسجيل الدخول</a>
       </div>`;

  const body = `
  <div class="page-head">
    <div>
      <h1>اختيار السيرفر</h1>
      <p class="muted">${guilds.length} سيرفر · البوت مضاف إلى ${withBot} منها</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost" href="${inviteUrl}" target="_blank" rel="noopener">${icon('plus', { size: 17 })} إضافة البوت</a>
      <a class="btn btn-ghost" href="/auth/logout">${icon('logout', { size: 17 })} خروج</a>
    </div>
  </div>

  ${
    guilds.length
      ? `<div class="servers-toolbar">
           <span class="search-wrap">${icon('search', { size: 16 })}<input type="text" id="guildSearch" placeholder="ابحث عن سيرفر بالاسم"></span>
           <div class="seg" id="guildFilter">
             <button class="active" data-filter="all">الكل</button>
             <button data-filter="with">البوت مضاف</button>
             <button data-filter="without">بدون البوت</button>
           </div>
         </div>`
      : ''
  }

  <div class="guild-grid" id="guildGrid">${cards}</div>

  ${
    guilds.length
      ? `<script>
           (function () {
             var search = document.getElementById('guildSearch');
             var filter = document.getElementById('guildFilter');
             var grid = document.getElementById('guildGrid');
             if (!search || !grid) return;
             var cards = Array.prototype.slice.call(grid.querySelectorAll('.guild-card'));
             var mode = 'all';
             var apply = function () {
               var q = (search.value || '').trim().toLowerCase();
               var shown = 0;
               cards.forEach(function (c) {
                 var okName = !q || (c.dataset.name || '').indexOf(q) !== -1;
                 var okBot = mode === 'all' || (mode === 'with' ? c.dataset.bot === '1' : c.dataset.bot === '0');
                 var visible = okName && okBot;
                 c.style.display = visible ? '' : 'none';
                 if (visible) shown++;
               });
               var empty = grid.querySelector('.no-result');
               if (!shown && !empty) {
                 empty = document.createElement('div');
                 empty.className = 'empty no-result';
                 empty.innerHTML = '<h3>لا نتائج</h3><p>جرّب اسمًا آخر أو غيّر الفلتر.</p>';
                 grid.appendChild(empty);
               } else if (shown && empty) {
                 empty.remove();
               }
             };
             search.addEventListener('input', apply);
             filter.addEventListener('click', function (e) {
               var btn = e.target.closest('button');
               if (!btn) return;
               mode = btn.dataset.filter;
               filter.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === btn); });
               apply();
             });
           })();
         </script>`
      : ''
  }`;

  res.send(layout({ title: 'السيرفرات', body, user: req.user }));
});

/* ---------------------------------- لوحة إعداد سيرفر ---------------------------------- */
router.get('/dashboard/:guildId', requireAuth, (req, res) => {
  const { guildId } = req.params;

  if (!config.web.demoMode && !(req.session.guilds || []).some((g) => g.id === guildId)) {
    return res.status(403).send('ما عندك صلاحية الوصول لهذا السيرفر.');
  }

  const body = `
  <div id="app" data-guild="${escapeHtml(guildId)}">
    <div class="loading">جارٍ تحميل الإعدادات...</div>
  </div>
  <script src="/app.js"></script>`;

  res.send(layout({ title: 'إعدادات السيرفر', body, user: req.user, bodyClass: 'dashboard' }));
});

// نُصدّر الراوتر نفسه مع إرفاق دوال مساعدة (يستخدمها خادم اللوحة)
module.exports = Object.assign(router, { layout, escapeHtml });
