'use strict';

/**
 * lib/welcomeCard.js
 * -------------------------------------------------------------
 * توليد صورة ترحيب (Welcome Card) تحتوي على أفتار العضو.
 * تستخدم @napi-rs/canvas (مكتبة أصلية بدون أي خطوات بناء).
 * عند فشل التحميل يتم الرجوع تلقائيًا إلى صورة الأفتار العادية.
 *
 * الأنماط المتاحة:
 *   avatar — صورة أفتار العضو (بسيطة، بدون توليد)
 *   card   — بطاقة مولَّدة: أفتار دائري + الاسم + عدد الأعضاء + اسم السيرفر
 *   custom — صورة ثابتة يحدّدها الأدمن (رابط)
 *   none   — بدون صورة
 * -------------------------------------------------------------
 */

const config = require('../config');

let CanvasLib = null;
try {
  CanvasLib = require('@napi-rs/canvas');
} catch {
  console.warn('⚠️  @napi-rs/canvas غير متوفّر — سيتم استخدام صورة الأفتار العادية في بطاقة الترحيب.');
}

const CARD_W = 900;
const CARD_H = 320;

/** خطوط النظام المستخدمة في الرسم (بدون ملفات خطوط خارجية) */
const FONT = 'sans-serif';

/** تنزيل صورة إلى Buffer (للأفتار/الخلفية) */
async function fetchImage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Never Land/1.0' } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** تدرّج لوني من لون أساسي + تعتيم */
function drawGradient(ctx, c1, c2) {
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** طبقة شفافية سوداء لتسهيل قراءة النص */
function overlay(ctx, alpha = 0.45) {
  ctx.fillStyle = `rgba(10,12,20,${alpha})`;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/**
 * توليد بطاقة ترحيب.
 * @param {object} opts
 * @param {import('discord.js').User} opts.user العضو
 * @param {number} opts.memberCount عدد الأعضاء
 * @param {string} opts.guildName اسم السيرفر
 * @param {string} [opts.guildIcon] رابط أيقونة السيرفر
 * @param {string} [opts.background] رابط خلفية مخصّصة
 * @param {object} [opts.theme] ألوان: { from, to, accent }
 * @param {string} [opts.title] عنوان فرعي مخصّص
 * @returns {Promise<Buffer|null>}
 */
async function generateWelcomeCard({
  user,
  memberCount = 0,
  guildName = '',
  guildIcon = null,
  background = null,
  theme = null,
  title = 'أهلاً بك في',
} = {}) {
  if (!CanvasLib) return null;

  try {
    const { createCanvas, loadImage } = CanvasLib;
    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');

    /* ---------- الخلفية ---------- */
    const bgData = background ? await fetchImage(background) : null;
    if (bgData) {
      const bg = await loadImage(bgData).catch(() => null);
      if (bg) {
        // تغطية كاملة مع الحفاظ على النسبة
        const scale = Math.max(CARD_W / bg.width, CARD_H / bg.height);
        const w = bg.width * scale;
        const h = bg.height * scale;
        ctx.drawImage(bg, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
        overlay(ctx, 0.5);
      } else {
        drawGradient(ctx, theme?.from || '#5865f2', theme?.to || '#2b2f6b');
      }
    } else {
      drawGradient(ctx, theme?.from || '#5865f2', theme?.to || '#2b2f6b');
      // لمسة جمالية: دوائر خفيفة
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.arc(CARD_W - 90, -40, 220, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(40, CARD_H + 60, 160, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- الأفتار داخل دائرة ---------- */
    const avatarUrl = user?.displayAvatarURL?.({ size: 512, extension: 'png' }) ?? null;
    const avatarData = avatarUrl ? await fetchImage(avatarUrl) : null;
    const cx = 150;
    const cy = CARD_H / 2;
    const radius = 95;

    // حلقة خارجية
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = theme?.accent || '#ffffff';
    ctx.fill();

    // دائرة الأفتار
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatarData) {
      const img = await loadImage(avatarData).catch(() => null);
      if (img) {
        const size = radius * 2;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      } else {
        ctx.fillStyle = '#2b2d31';
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#2b2d31';
      ctx.fill();
    }
    ctx.restore();

    /* ---------- النصوص ---------- */
    const textX = 290;
    ctx.textAlign = 'left';

    // العنوان الفرعي
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `26px ${FONT}`;
    ctx.fillText(String(title).slice(0, 40), textX, 100);

    // اسم العضو
    const name = String(user?.username ?? '').slice(0, 24);
    ctx.fillStyle = theme?.accent || '#ffffff';
    ctx.font = `bold 54px ${FONT}`;
    ctx.fillText(name, textX, 162);

    // اسم السيرفر
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `28px ${FONT}`;
    ctx.fillText(`# ${String(guildName).slice(0, 30)}`, textX, 212);

    // شريط المعلومات
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, textX, 238, 540, 52, 14);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`👥 العضو رقم ${Number(memberCount).toLocaleString('en-US')}`, textX + 20, 272);

    if (guildIcon) {
      const iconData = await fetchImage(guildIcon);
      if (iconData) {
        const icon = await loadImage(iconData).catch(() => null);
        if (icon) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(CARD_W - 80, 70, 42, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(icon, CARD_W - 122, 28, 84, 84);
          ctx.restore();
        }
      }
    }

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('⚠️ فشل توليد بطاقة الترحيب:', err.message);
    return null;
  }
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

/** هل توليد الصور متاح؟ */
const available = () => Boolean(CanvasLib);

module.exports = { generateWelcomeCard, available, CARD_W, CARD_H };
