'use strict';

/**
 * lib/security.js
 * -------------------------------------------------------------
 * حماية الموقع — طبقة واحدة تجمع كل الدفاعات:
 *
 *   ١) رؤوس أمان (CSP بلا unsafe-inline · منع التأطير · HSTS · nosniff…)
 *   ٢) تحديد معدّل الطلبات (Rate limit) لكل IP وعلى مسارات حسّاسة
 *   ٣) منع طلبات من مواقع ثانية (CSRF): فحص Origin/Referer + رأس خاص
 *   ٤) تنظيف المدخلات من التلوّث النموذجي (__proto__ / constructor / prototype)
 *      وقصر مفاتيح الإعدادات على المعروف فقط
 *   ٥) تجزئة الـIP قبل تخزينه في السجل (خصوصية + إمكانية التتبّع)
 *
 * كل شي بلا أي مكتبة خارجية — كود واضح وقابل للفحص.
 * -------------------------------------------------------------
 */

const crypto = require('node:crypto');

/* ============================ ١) رؤوس الأمان ============================ */

/** توليد nonce لكل طلب (لبناء CSP بلا unsafe-inline) */
function makeNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * بناء سياسة أمان المحتوى (CSP).
 * السكربتات الداخلية تعمل فقط بـ nonce، والخارجية من نفس الموقع فقط.
 */
function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'", // أنماط داخلية في القوالب (آمنة بلا تنفيذ كود)
    "img-src 'self' data: https:", // الصور: الموقع + Discord CDN
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'", // ما ينحط الموقع داخل إطار (منع النقر الخفي)
  ].join('; ');
}

/** هل الرابط العام https؟ (يحدّد HSTS والكوكي الآمن) */
function isHttps(config) {
  return /^https:/i.test(String(config?.web?.url || ''));
}

/**
 * Middleware: يضبط رؤوس الأمان + يجهّز nonce للقوالب.
 * @param {object} config إعدادات التطبيق
 */
function securityHeaders(config) {
  return (req, res, next) => {
    const nonce = makeNonce();
    res.locals.cspNonce = nonce;
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(nonce));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.removeHeader('X-Powered-By');
    if (isHttps(config)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/* ============================ ٢) تحديد المعدّل ============================ */

/**
 * محدّد طلبات بسيط وفعّال (ذاكرة فقط — يكفي ضد الإساءة والبوتات).
 * @param {{windowMs?:number, max?:number, message?:string, keyFn?:Function, skip?:Function}} options
 */
function rateLimit({ windowMs = 60_000, max = 100, message = 'طلبات كثيرة — جرّب بعد قليل.', keyFn = null, skip = null } = {}) {
  const hits = new Map();

  function cleanup(now) {
    if (hits.size < 2000) return;
    for (const [key, entry] of hits) if (now - entry.start > windowMs) hits.delete(key);
  }

  return (req, res, next) => {
    if (skip && skip(req)) return next();
    const now = Date.now();
    cleanup(now);
    const key = keyFn ? keyFn(req) : clientIp(req);
    const entry = hits.get(key);

    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(max - 1));
      return next();
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      if (isApiRequest(req)) {
        return res.status(429).json({ error: 'rate_limited', message, retryAfter });
      }
      return res.status(429).type('html').send(
        `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إيقاف مؤقت</title>
         <body style="font-family:system-ui,Tahoma,sans-serif;background:#0b0e17;color:#e6e9f5;display:grid;place-items:center;height:100vh;margin:0">
         <div style="text-align:center;max-width:460px;padding:24px">
           <h1 style="font-size:1.2rem">إيقاف مؤقت للحماية</h1>
           <p style="color:#8d97b4;line-height:1.9">عدد الطلبات من جهازك كثير خلال وقت قصير.<br>جرّب مرة ثانية بعد <b>${retryAfter}</b> ثانية.</p>
         </div></body></html>`,
      );
    }
    return next();
  };
}

/* ============================ ٣) منع CSRF ============================ */

/** هل الطلب على مسار الواجهة البرمجية؟ (يعمل حتى داخل المسارات المركّبة) */
function isApiRequest(req) {
  const full = String(req.originalUrl || req.url || '');
  return full.startsWith('/api/') || full === '/api';
}

/** عنوان الطلب (مع احترام البروكسي) */
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

/** تجزئة الـIP (نخزّن البصمة لا العنوان الصريح) */
function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 16);
}

/** هل الطلب من نفس الموقع؟ (Origin/Referer مقابل المضيف) */
function isSameOrigin(req) {
  const host = String(req.headers.host || '');
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  /* بلا Origin ولا Referer: نسمح فقط لو معه رأس fetch الخاص بالموقع */
  return req.headers['x-requested-with'] === 'neverland-dashboard';
}

/**
 * Middleware: يمنع أي طلب تغيير (POST/PUT/PATCH/DELETE) من موقع ثاني.
 * يشتغل مع SameSite=Lax للكوكي — طبقتان معًا.
 */
function csrfGuard() {
  const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    /* مسارات OAuth ترجع من ديسكورد — نستثني مسار الاستقبال فقط */
    if (req.path.startsWith('/auth/callback')) return next();
    if (isSameOrigin(req)) return next();

    console.warn(`[حماية] طلب مرفوض من أصل غير موثوق: ${req.method} ${req.originalUrl || req.path}`);
    if (isApiRequest(req)) {
      return res.status(403).json({ error: 'bad_origin', message: 'طلب من مصدر غير موثوق — رفضناه للحماية.' });
    }
    return res.status(403).send('طلب مرفوض للحماية.');
  };
}

/* ============================ ٤) تنظيف المدخلات ============================ */

/** مفاتيح خطيرة تلوّث النموذج (prototype pollution) */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * حذف المفاتيح الخطيرة من أي كائن (بشكل عميق) — يعدّل نسخة جديدة.
 * @param {*} value
 */
function stripDangerousKeys(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripDangerousKeys(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    out[key] = stripDangerousKeys(val, depth + 1);
  }
  return out;
}

/**
 * تجهيز رقعة الإعدادات القادمة من الواجهة:
 *   • شيل المفاتيح الخطيرة
 *   • قصر المفاتيح على الموجود في الافتراضيات (يمنع حقن أي إعداد غريب)
 * @param {object} patch الرقعة من الطلب
 * @param {object} defaults الإعدادات الافتراضية (مرجع المفاتيح المسموحة)
 * @returns {{ patch: object, rejected: string[] }}
 */
function sanitizeSettingsPatch(patch, defaults) {
  const rejected = [];
  const clean = stripDangerousKeys(patch || {});
  const out = {};

  for (const [key, value] of Object.entries(clean)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
      rejected.push(key);
      continue;
    }
    out[key] = value;
  }
  return { patch: out, rejected };
}

/** قصر النص على طول معيّن وتنظيف محارف التحكم */
function safeText(value, { max = 500, allowNewlines = true } = {}) {
  let text = String(value ?? '').slice(0, max);
  text = allowNewlines ? text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') : text.replace(/[\u0000-\u001F]/g, ' ');
  return text.trim();
}

module.exports = {
  makeNonce,
  isApiRequest,
  securityHeaders,
  contentSecurityPolicy,
  rateLimit,
  csrfGuard,
  isSameOrigin,
  clientIp,
  hashIp,
  stripDangerousKeys,
  sanitizeSettingsPatch,
  safeText,
  FORBIDDEN_KEYS,
  isHttps,
};
