'use strict';

/**
 * lib/welcomeCard.js
 * -------------------------------------------------------------
 * صورة الترحيب (Welcome Card) — بستايل بوتات الترحيب الاحترافية:
 *
 *   ┌───────────────────────────────┐
 *   │        أيقونة + اسم السيرفر   │
 *   │        ●  أفتار العضو  ●       │   ← أفتار دائري بإطار
 *   │      أهلاً بك أحمد في Never Land │   ← نص الترحيب مرسوم على الصورة
 *   │         العضو رقم ٤٨٢           │
 *   └───────────────────────────────┘
 *
 * - تُرسل الصورة كملف مرفق مع **رسالة نصية** (بلا Embed) — نفس طريقة البوتات المعروفة.
 * - الخطوط: مرفقة داخل المشروع (assets/fonts) فما تعتمد على خطوط السيرفر،
 *   وتدعم العربية والإنجليزية في كل السيرفرات (Docker بلا خطوط كذلك).
 * - بلا أي إيموجي مرسوم: عند غياب الأفتار نرسم أول حرف من الاسم.
 *
 * @returns {Promise<Buffer|null>}
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');

let CanvasLib = null;
try {
  CanvasLib = require('@napi-rs/canvas');
} catch {
  console.warn('[تنبيه] @napi-rs/canvas غير متوفّر — سيتم استخدام صورة الأفتار العادية في بطاقة الترحيب.');
}

/* ------------------------------ الخطوط المرفقة ------------------------------ */

const FONT_REGULAR = 'NeverLand';
const FONT_BOLD = 'NeverLandBold';
const FONT_FALLBACK = 'sans-serif';
let fontsReady = false;

/** نُسجّل خطوط المشروع مرة واحدة (وتشتغل حتى لو ما في خطوط بالنظام) */
function ensureFonts() {
  if (fontsReady || !CanvasLib) return;
  fontsReady = true;
  try {
    const dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
    for (const [file, family] of [['DejaVuSans.ttf', FONT_REGULAR], ['DejaVuSans-Bold.ttf', FONT_BOLD]]) {
      const full = path.join(dir, file);
      if (fs.existsSync(full)) CanvasLib.GlobalFonts.registerFromPath(full, family);
    }
  } catch (err) {
    console.warn('[تنبيه] تعذّر تسجيل خطوط بطاقة الترحيب:', err.message);
  }
}

const font = (size, bold = false) => `${bold ? 'bold ' : ''}${size}px ${bold ? FONT_BOLD : FONT_REGULAR}, ${FONT_FALLBACK}`;

/* ------------------------------ الأساسيات ------------------------------ */

const CARD_W = 1100;
const CARD_H = 500;

/** هل النص عربي؟ (نضبط اتجاه الرسم عليه) */
const isArabic = (text) => /[\u0600-\u06FF]/.test(String(text || ''));

/** تنزيل صورة إلى Buffer (الأفتار/الخلفية/الأيقونة) */
async function fetchImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Never Land/1.0' } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** تدرّج لوني قطري */
function drawGradient(ctx, c1, c2) {
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** دوائر خفيفة للزينة (بلا صور) */
function drawDecor(ctx, accent = 'rgba(255,255,255,0.06)') {
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(CARD_W - 70, -60, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(60, CARD_H + 80, 190, 0, Math.PI * 2);
  ctx.fill();
}

/** طبقة تعتيم لقراءة النص فوق صورة خلفية */
function overlay(ctx, alpha = 0.5) {
  ctx.fillStyle = `rgba(8,10,18,${alpha})`;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** مستطيل بزوايا دائرية */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** خلفية دائرية بلون افتراضي بدل الصورة */
function avatarPlaceholder(ctx, cx, cy, radius, name, accent) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  ctx.fillStyle = accent || '#ffffff';
  ctx.font = font(Math.round(radius * 0.95), true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + 4);
  ctx.textBaseline = 'alphabetic';
}

/** كسر النص إلى أسطر بحيث يناسب العرض المحدّد (يحترم الكلمات) */
function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth) {
      current = attempt;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  /* لو النص أطول من الأسطر المسموحة نضيف «…» على آخر سطر */
  if (lines.length === maxLines) {
    const joined = lines.join(' ');
    if (joined.length < String(text).trim().length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last.trim()}…`;
    }
  }
  return lines;
}

/* ------------------------------ البطاقة ------------------------------ */

/**
 * توليد بطاقة ترحيب.
 * @param {object} opts
 * @param {import('discord.js').User} opts.user العضو
 * @param {number} [opts.memberCount]
 * @param {string} [opts.guildName]
 * @param {string} [opts.guildIcon] رابط أيقونة السيرفر
 * @param {string} [opts.background] رابط خلفية مخصّصة
 * @param {object} [opts.theme] ألوان: { from, to, accent }
 * @param {string} [opts.message] نص الترحيب الذي يُرسم على الصورة (بعد تبديل المتغيّرات)
 * @param {string} [opts.footer] سطر صغير أسفل الصورة
 * @returns {Promise<Buffer|null>}
 */
async function generateWelcomeCard({
  user,
  memberCount = 0,
  guildName = '',
  guildIcon = null,
  background = null,
  theme = null,
  message = '',
  footer = '',
} = {}) {
  if (!CanvasLib) return null;
  ensureFonts();

  const from = theme?.from || '#5865f2';
  const to = theme?.to || '#2b2f6b';
  const accent = theme?.accent || '#ffffff';
  const displayName = user?.globalName || user?.username || user?.displayName || '';

  try {
    const { createCanvas, loadImage } = CanvasLib;
    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');

    /* ---------- ١) الخلفية ---------- */
    const bgData = await fetchImage(background);
    const bg = bgData ? await loadImage(bgData).catch(() => null) : null;
    if (bg) {
      const scale = Math.max(CARD_W / bg.width, CARD_H / bg.height);
      const w = bg.width * scale;
      const h = bg.height * scale;
      ctx.drawImage(bg, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
      overlay(ctx, 0.55);
    } else {
      drawGradient(ctx, from, to);
      drawDecor(ctx);
    }

    /* ---------- ٢) رأس البطاقة: أيقونة السيرفر + اسمه ---------- */
    const headerY = 54;
    let headerShift = 0;
    if (guildIcon) {
      const iconData = await fetchImage(guildIcon);
      const icon = iconData ? await loadImage(iconData).catch(() => null) : null;
      if (icon) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(CARD_W / 2, headerY, 26, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(icon, CARD_W / 2 - 26, headerY - 26, 52, 52);
        ctx.restore();
        headerShift = 0;
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = font(30, true);
    ctx.fillText(
      String(guildName || '').slice(0, 34),
      CARD_W / 2,
      guildIcon ? headerY + 70 : headerY + 8,
    );

    /* ---------- ٣) الأفتار بإطار ---------- */
    const cx = CARD_W / 2;
    const cy = 216;
    const radius = 70;

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 9, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    const avatarUrl = user?.displayAvatarURL?.({ size: 512, extension: 'png' }) || null;
    const avatarData = await fetchImage(avatarUrl);
    const avatarImg = avatarData ? await loadImage(avatarData).catch(() => null) : null;

    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const size = radius * 2;
      const scale = Math.max(size / avatarImg.width, size / avatarImg.height);
      const w = avatarImg.width * scale;
      const h = avatarImg.height * scale;
      ctx.drawImage(avatarImg, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
    } else {
      avatarPlaceholder(ctx, cx, cy, radius, displayName, accent);
    }

    /* ---------- ٤) نص الترحيب مرسوم على الصورة ---------- */
    const text = String(message || (displayName ? `أهلاً بك ${displayName} في ${guildName}` : '')).trim();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = font(38, true);
    if (isArabic(text)) ctx.direction = 'rtl';

    const lines = wrapText(ctx, text, CARD_W - 160, 2);
    const firstY = 344;
    lines.forEach((line, i) => ctx.fillText(line, CARD_W / 2, firstY + i * 46));
    ctx.direction = 'ltr';

    /* ---------- ٥) شريط العضو رقم كام ---------- */
    const chipText = footer || (memberCount ? `العضو رقم ${Number(memberCount).toLocaleString('en-US')}` : '');
    if (chipText) {
      ctx.font = font(26, true);
      const chipW = Math.max(280, ctx.measureText(chipText).width + 70);
      const chipH = 48;
      const chipX = (CARD_W - chipW) / 2;
      const chipY = CARD_H - 62;

      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      if (isArabic(chipText)) ctx.direction = 'rtl';
      ctx.fillText(chipText, CARD_W / 2, chipY + 35);
      ctx.direction = 'ltr';
    }

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[تنبيه] فشل توليد بطاقة الترحيب:', err.message);
    return null;
  }
}

/** هل توليد الصور متاح؟ */
const available = () => Boolean(CanvasLib);

module.exports = { generateWelcomeCard, available, ensureFonts, wrapText, CARD_W, CARD_H, FONT_REGULAR, FONT_BOLD };
