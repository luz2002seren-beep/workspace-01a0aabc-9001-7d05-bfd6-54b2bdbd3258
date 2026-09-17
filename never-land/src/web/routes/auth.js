'use strict';

/**
 * web/routes/auth.js
 * -------------------------------------------------------------
 * تسجيل الدخول عبر ديسكورد (OAuth2):
 *   1) الصلاحية العامة للوحة: القسم 0x20 (MANAGE_GUILD) أو 0x8 (ADMIN).
 *   2) شرط الاستخدام الفعلي: الرول المطلوب (REQUIRED_ROLE_ID) — يُفحص في
 *      web/access.js بعد الدخول، ومَن لا يملكه يرى صفحة «الوصول مقيّد».
 * -------------------------------------------------------------
 */

const express = require('express');
const config = require('../../config');

const router = express.Router();

const SCOPES = ['identify', 'guilds'];
const API = 'https://discord.com/api/v10';

/** كاش لروابط العودة المسجّلة في بوابة ديسكورد (نفحصها كل 5 دقائق) */
let redirectCache = { uris: null, at: 0 };
async function registeredRedirects() {
  if (!config.bot.hasToken) return null;
  if (redirectCache.uris && Date.now() - redirectCache.at < 300000) return redirectCache.uris;
  try {
    const res = await fetch(`${API}/applications/@me`, {
      headers: { Authorization: `Bot ${config.bot.token}` },
    });
    if (!res.ok) return null;
    const app = await res.json();
    redirectCache = { uris: Array.isArray(app.redirect_uris) ? app.redirect_uris : [], at: Date.now() };
    return redirectCache.uris;
  } catch {
    return null;
  }
}

/** صفحة إرشاد: رابط العودة غير مسجّل في بوابة ديسكورد (تظهر بدل خطأ ديسكورد المبهم) */
function redirectHelpPage(callbackUrl) {
  const portal = `https://discord.com/developers/applications/${config.bot.clientId || ''}/oauth2`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>خطوة واحدة قبل الدخول</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1017;color:#e7ebf3;
      font-family:system-ui,"Segoe UI",Tahoma,sans-serif;padding:24px}
 .card{max-width:660px;background:#141926;border:1px solid #232a3d;border-radius:16px;padding:28px}
 h1{margin:0 0 10px;font-size:22px}
 p{line-height:1.9;color:#aab3c5}
 code{display:block;background:#0b0f19;border:1px solid #232a3d;border-radius:10px;padding:12px;
       margin:12px 0;word-break:break-all;color:#8fb8ff;direction:ltr;text-align:left}
 .steps{background:#0f1421;border:1px solid #232a3d;border-radius:12px;padding:16px;margin:16px 0}
 .steps b{color:#fff}
 a.btn{display:inline-block;margin-top:8px;background:#5b6cff;color:#fff;text-decoration:none;
        padding:11px 20px;border-radius:10px;font-weight:700}
 a.ghost{background:#1b2233;color:#c8d0e0;margin-inline-start:8px}
</style></head><body><div class="card">
 <h1>خطوة واحدة قبل تسجيل الدخول 🔑</h1>
 <p>تسجيل الدخول ما يشتغل لأن <b>رابط العودة</b> غير مسجّل في تطبيق ديسكورد بعد. أضفه مرة واحدة وبعدها يفتح الدخول والتعديل:</p>
 <div class="steps">
   <b>1)</b> افتح بوابة ديسكورد → تطبيقك → <b>OAuth2</b><br>
   <b>2)</b> في خانة <b>Redirects</b> اضغط <b>Add Redirect</b> والصق هذا الرابط بالضبط:<br>
   <b>3)</b> اضغط <b>Save Changes</b> ثم ارجع هنا واضغط «أعد المحاولة».
 </div>
 <code>${callbackUrl}</code>
 <a class="btn" href="${portal}" target="_blank" rel="noopener">فتح صفحة OAuth2 في ديسكورد</a>
 <a class="btn ghost" href="/auth/login">أعد المحاولة</a>
 <a class="btn ghost" href="/">الصفحة الرئيسية</a>
</div></body></html>`;
}

/** رابط الدخول */
router.get('/login', async (req, res) => {
  if (config.web.demoMode) return res.redirect('/dashboard');
  if (!config.bot.clientSecret) {
    return res.status(400).send('لم يتم ضبط CLIENT_SECRET في ملف .env — لا يمكن تسجيل الدخول.');
  }

  const callbackUrl = `${config.web.url}/auth/callback`;

  // نتحقق أن رابط العودة مسجّل فعلًا — وإلا نعرض إرشادًا واضحًا بدل خطأ ديسكورد المبهم
  const registered = await registeredRedirects();
  if (registered && !registered.includes(callbackUrl)) {
    return res.status(200).send(redirectHelpPage(callbackUrl));
  }

  const state = require('../server').sessionToken();
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: config.bot.clientId,
    redirect_uri: `${config.web.url}/auth/callback`,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
  });

  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

/** نقطة العودة من ديسكورد */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) return res.status(400).send('لم يتم إرجاع كود التفويض من ديسكورد.');
  if (state !== req.session.oauthState) return res.status(400).send('حالة OAuth غير صحيحة (CSRF). أعد المحاولة.');

  try {
    const tokenResponse = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.bot.clientId,
        client_secret: config.bot.clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: `${config.web.url}/auth/callback`,
      }),
    });

    const token = await tokenResponse.json();
    if (!token.access_token) {
      console.error('فشل تبادل التوكن:', token);
      return res.status(401).send('فشل تسجيل الدخول مع ديسكورد.');
    }

    const [user, guilds] = await Promise.all([
      fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json()),
      fetch(`${API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json()),
    ]);

    // الصلاحيات: إدارة السيرفر أو مسؤول (0x20 / 0x8)
    const manageable = (Array.isArray(guilds) ? guilds : [])
      .filter((g) => (Number(g.permissions) & 0x20) === 0x20 || (Number(g.permissions) & 0x8) === 0x8)
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner }));

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      globalName: user.global_name || user.username,
    };
    req.session.guilds = manageable;
    req.session.accessToken = token.access_token;
    req.session.roleCheck = null; // فحص جديد للرول بعد كل دخول

    const back = req.session.returnTo && req.session.returnTo.startsWith('/') ? req.session.returnTo : '/dashboard';
    delete req.session.returnTo;
    return res.redirect(back);
  } catch (err) {
    console.error('خطأ OAuth:', err);
    return res.status(500).send('حدث خطأ أثناء تسجيل الدخول. جرّب مرة أخرى.');
  }
});

/** خروج */
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
