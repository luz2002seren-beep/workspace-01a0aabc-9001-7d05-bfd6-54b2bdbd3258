'use strict';

/**
 * systems/autoreact.js
 * -------------------------------------------------------------
 * تفاعلات تلقائية (AutoReaction):
 *   • تفاعل تلقائي على كل رسالة في قنوات محدّدة بإيموجيات محدّدة
 *   • تفاعل عند احتواء الرسالة على كلمة معيّنة (word ➜ emoji)
 *   • دعم كامل للإيموجيات الخارجية (Custom/Animated Emojis)
 * -------------------------------------------------------------
 */

const { parseEmoji } = require('../lib/emojis');
const db = require('../database');

/** تحويل قائمة إيموجيات نصية إلى قيم يقبلها discord.js */
const toReactionValues = (emojis = []) =>
  emojis.map((raw) => parseEmoji(raw)).filter(Boolean);

/**
 * معالجة رسالة: إضافة التفاعلات المطلوبة.
 * @returns {Promise<boolean>} هل تم التفاعل؟
 */
async function handleMessage(client, message) {
  try {
    if (!message.guild) return false;

    const settings = db.getGuildSettings(message.guild.id);
    const cfg = settings.autoreact;
    if (!cfg?.enabled) return false;
    if (cfg.ignoreBots !== false && message.author?.bot) return false;

    let reacted = false;

    // 1) تفاعل على القناة (كل الرسائل)
    if ((cfg.channels || []).includes(message.channelId)) {
      for (const emoji of toReactionValues(cfg.emojis)) {
        await message.react(emoji).then(() => { reacted = true; }).catch(() => {});
      }
    }

    // 2) تفاعل حسب كلمة مفتاحية
    const content = String(message.content || '').toLowerCase();
    if (content && (cfg.words || []).length) {
      for (const rule of cfg.words) {
        if (!rule?.word || !rule?.emoji) continue;
        if (!content.includes(String(rule.word).toLowerCase())) continue;
        const emoji = parseEmoji(rule.emoji);
        if (!emoji) continue;
        if ((cfg.channels || []).length && !cfg.wordsTriggerEverywhere && !cfg.channels.includes(message.channelId)) continue;
        await message.react(emoji).then(() => { reacted = true; }).catch(() => {});
      }
    }

    return reacted;
  } catch (err) {
  console.error('[تنبيه] خطأ في AutoReaction:', err.message);
    return false;
  }
}

/** التفاعل على رسالة معيّنة يدويًا (للاختبار) */
async function reactNow(message, emojis = []) {
  for (const emoji of toReactionValues(emojis)) {
    await message.react(emoji).catch(() => {});
  }
}

module.exports = { handleMessage, reactNow, toReactionValues };
