'use strict';

/**
 * systems/autoline.js
 * -------------------------------------------------------------
 * خط فاصل تلقائي (AutoLine):
 * بعد كل رسالة في قناة محدّدة يرسل البوت خطًا فاصلًا، وعند وصول
 * رسالة جديدة يُحذف الخط السابق (حتى لا تتكدّس الخطوط).
 *
 * ثلاثة أوضاع للخط:
 *   1) gif   ← صورة GIF متحركة (الافتراضي الجديد) من assets/autoline
 *   2) custom ← رابط GIF/صورة خاص يضعه صاحب السيرفر
 *   3) text  ← خط نصّي (الوضع القديم: ───────)
 *
 * مثال الاستخدام: قنوات التقديمات أو الطلبات ليكون كل طلب مفصولًا.
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { stripCustomEmojis } = require('../lib/emojis');

/** مجلد خطوط GIF الجاهزة */
const GIF_DIR = path.join(__dirname, '..', '..', 'assets', 'autoline');

/** الأنماط المتاحة (اسم الملف + الوصف + الألوان للعرض) */
const GIF_STYLES = {
  glow: { file: 'glow.gif', label: 'توهّج', desc: 'توهّج أبيض يمرّ على الخط من اليمين لليسار', from: '#3b47c9', to: '#8ea0ff' },
  flow: { file: 'flow.gif', label: 'تدفّق', desc: 'تدرّج لوني متدفّق بلا توقّف', from: '#4c53e0', to: '#22d3ee' },
  pulse: { file: 'pulse.gif', label: 'نبض', desc: 'إضاءة تنبض بهدوء في المنتصف', from: '#2f3aa8', to: '#a5b4ff' },
  dash: { file: 'dash.gif', label: 'شرطات', desc: 'شرطات تتحرّك على طول الخط', from: '#3730a3', to: '#c7d2fe' },
};

/** تخزين مؤقّت: channelId -> messageId للخط الأخير */
const lastLines = new Map();
/** تخزين مؤقّت: messageId للرسالة -> messageId للخط التابع لها */
const lineByMessage = new Map();

/* ------------------------------- مصادر الخط ------------------------------- */

/** مسار ملف GIF جاهز من النمط المطلوب */
function gifPathFor(style) {
  const meta = GIF_STYLES[style] || GIF_STYLES.glow;
  const file = path.join(GIF_DIR, meta.file);
  return fs.existsSync(file) ? file : null;
}

/** هل الرابط صورة صالحة (gif/png/webp)؟ */
function isImageUrl(url) {
  return /^https?:\/\/\S+\.(gif|png|webp|jpg|jpeg)(\?\S*)?$/i.test(String(url || '').trim());
}

/**
 * يحدّد ما سيُرسل كخط فاصل حسب إعدادات السيرفر.
 * @returns {{ mode:'gif'|'custom'|'text', content?:string, file?:string, url?:string, style?:string }}
 */
function resolveLine(settings) {
  const cfg = settings.autoline || {};
  const mode = ['gif', 'custom', 'text'].includes(cfg.lineType) ? cfg.lineType : 'gif';

  if (mode === 'custom') {
    const url = String(cfg.customUrl || '').trim();
    if (isImageUrl(url)) return { mode: 'custom', url };
    // رابط غير صالح → نرجع لـ GIF الجاهز بدل خطأ
    return { mode: 'gif', ...pickGif(cfg) };
  }

  if (mode === 'text') {
    const raw = cfg.line || '─'.repeat(24);
    const text = stripCustomEmojis(raw).trim() || '─'.repeat(24);
    return { mode: 'text', content: text };
  }

  return { mode: 'gif', ...pickGif(cfg) };
}

/** يختار ملف GIF حسب النمط (مع بديل آمن) */
function pickGif(cfg) {
  const style = GIF_STYLES[cfg.gifStyle] ? cfg.gifStyle : 'glow';
  const file = gifPathFor(style);
  if (file) return { file, style };
  // لا يوجد ملف؟ نرجع للنص بدل ما يفشل الإرسال
  return { style: null };
}

/** بناء حمولة الرسالة (نص/صورة) */
function buildLineContent(settings) {
  const resolved = resolveLine(settings);

  if (resolved.mode === 'text') {
    return { payload: { content: resolved.content }, resolved };
  }

  if (resolved.mode === 'custom') {
    return { payload: { content: resolved.url }, resolved };
  }

  if (resolved.file) {
    return {
      payload: { files: [new AttachmentBuilder(resolved.file, { name: path.basename(resolved.file) })] },
      resolved,
    };
  }

  // احتياط أخير: خط نصّي
  const text = stripCustomEmojis(settings.autoline?.line || '─'.repeat(24)).trim() || '─'.repeat(24);
  return { payload: { content: text }, resolved: { mode: 'text', content: text } };
}

/* ------------------------------- التشغيل ------------------------------- */

/** حذف الخط الأخير في قناة معيّنة */
async function removeLastLine(channel) {
  const messageId = lastLines.get(channel.id);
  if (!messageId) return;
  try {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) await message.delete().catch(() => {});
  } finally {
    lastLines.delete(channel.id);
  }
}

/**
 * معالجة رسالة جديدة: إرسال الخط الفاصل أسفلها.
 * تُنادى من حدث messageCreate بعد كل الأنظمة الأخرى.
 */
async function handleMessage(client, message) {
  try {
    if (!message.guild || !message.channel?.isTextBased?.()) return false;

    const settings = db.getGuildSettings(message.guild.id);
    const cfg = settings.autoline;
    if (!cfg?.enabled) return false;
    if (!(cfg.channels || []).includes(message.channelId)) return false;

    // تجاهل رسائل البوت نفسه (الخط نفسه) لتجنّب الحلقة اللانهائية
    if (message.author?.id === client.user.id) return false;

    // حذف الخط السابق
    if (cfg.deletePrevious) await removeLastLine(message.channel);

    // إرسال الخط الجديد
    const { payload } = buildLineContent(settings);
    const lineMessage = await message.channel.send(payload).catch(() => null);
    if (!lineMessage) return false;

    lastLines.set(message.channelId, lineMessage.id);
    if (cfg.deleteLineWithMessage) {
      lineByMessage.set(message.id, lineMessage.id);
      // تنظيف الذاكرة
      if (lineByMessage.size > 2000) {
        const first = lineByMessage.keys().next().value;
        lineByMessage.delete(first);
      }
    }

    // حذف تلقائي بعد فترة
    if (cfg.deleteAfter > 0) {
      setTimeout(() => {
        lineMessage.delete().catch(() => {});
        if (lastLines.get(message.channelId) === lineMessage.id) lastLines.delete(message.channelId);
      }, cfg.deleteAfter * 1000).unref?.();
    }

    return true;
  } catch (err) {
  console.error('[تنبيه] خطأ في AutoLine:', err.message);
    return false;
  }
}

/** عند حذف رسالة: حذف الخط التابع لها */
async function handleMessageDelete(client, message) {
  try {
    const lineId = lineByMessage.get(message.id);
    if (!lineId) return;
    lineByMessage.delete(message.id);
    const settings = db.getGuildSettings(message.guild?.id);
    if (!settings.autoline?.deleteLineWithMessage) return;
    const lineMessage = await message.channel?.messages?.fetch(lineId).catch(() => null);
    if (lineMessage) await lineMessage.delete().catch(() => {});
    if (lastLines.get(message.channelId) === lineId) lastLines.delete(message.channelId);
  } catch {
    /* تجاهل */
  }
}

/** إرسال خط تجريبي (لأمر الإعداد ولوحة التحكم) */
async function sendTestLine(channel) {
  const settings = db.getGuildSettings(channel.guild.id);
  const { payload } = buildLineContent(settings);
  return channel.send(payload).catch(() => null);
}

/** معاينة بيانات الخط بدون إرسال (تستخدمها اللوحة والـAPI) */
function previewLine(settings) {
  const resolved = resolveLine(settings);
  return {
    ...resolved,
    styles: Object.entries(GIF_STYLES).map(([key, meta]) => ({ key, ...meta })),
  };
}

module.exports = {
  handleMessage,
  handleMessageDelete,
  sendTestLine,
  removeLastLine,
  buildLineContent,
  resolveLine,
  previewLine,
  gifPathFor,
  isImageUrl,
  GIF_STYLES,
  GIF_DIR,
  lastLines,
};
