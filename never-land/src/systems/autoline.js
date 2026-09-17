'use strict';

/**
 * systems/autoline.js
 * -------------------------------------------------------------
 * خط فاصل تلقائي (AutoLine):
 * بعد كل رسالة في قناة محدّدة يرسل البوت خطًا فاصلًا، وعند وصول
 * رسالة جديدة يُحذف الخط السابق (حتى لا تتكدّس الخطوط).
 *
 * مثال الاستخدام: قنوات التقديمات أو الطلبات ليكون كل طلب مفصولًا.
 * -------------------------------------------------------------
 */

const db = require('../database');
const { stripCustomEmojis } = require('../lib/emojis');

/** تخزين مؤقّت: channelId -> messageId للخط الأخير */
const lastLines = new Map();
/** تخزين مؤقّت: messageId للرسالة -> messageId للخط التابع لها */
const lineByMessage = new Map();

/** بناء محتوى الخط (نص أو لون) */
function buildLineContent(settings) {
  const cfg = settings.autoline;
  const raw = cfg.line || '─'.repeat(24);
  const text = stripCustomEmojis(raw) || '─'.repeat(24);
  return cfg.color ? { content: text, embeds: [] } : { content: text };
}

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
    const lineMessage = await message.channel.send(buildLineContent(settings)).catch(() => null);
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

/** إرسال خط تجريبي (لأمر الإعداد) */
async function sendTestLine(channel) {
  const settings = db.getGuildSettings(channel.guild.id);
  return channel.send(buildLineContent(settings)).catch(() => null);
}

module.exports = { handleMessage, handleMessageDelete, sendTestLine, removeLastLine, buildLineContent, lastLines };
