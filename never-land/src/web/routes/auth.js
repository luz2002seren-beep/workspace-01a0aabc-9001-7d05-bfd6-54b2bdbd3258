'use strict';

/**
 * web/routes/auth.js
 * -------------------------------------------------------------
 * تسجيل الدخول عبر ديسكورد (OAuth2):
 *   القسم (0x20) = MANAGE_GUILD — شرط الوصول للوحة.
 * -------------------------------------------------------------
 */

const express = require('express');
const config = require('../../config');

const router = express.Router();

const SCOPES = ['identify', 'guilds'];
const API = 'https://discord.com/api/v10';

/** رابط الدخول */
router.get('/login', (req, res) => {
  if (config.web.demoMode) return res.redirect('/dashboard');
  if (!config.bot.clientSecret) {
    return res.status(400).send('لم يتم ضبط CLIENT_SECRET في ملف .env — لا يمكن تسجيل الدخول.');
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

    return res.redirect('/dashboard');
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
