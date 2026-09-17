'use strict';

/**
 * lib/emojis.js
 * -------------------------------------------------------------
 * دعم الإيموجيات الخارجية (Custom Emojis) في الأزرار والقوائم والرسائل:
 *   <:name:123456789>        إيموجي مخصّص ثابت
 *   <a:name:123456789>       إيموجي متحرّك (Animated)
 *   ✅ ❤️ 🎉                 إيموجي يونيكود عادي
 * -------------------------------------------------------------
 */

const CUSTOM_REGEX = /^<(a?):([\w~]+):(\d{15,25})>$/;
const ANY_CUSTOM_REGEX = /<(a?):([\w~]+):(\d{15,25})>/g;

/**
 * تحويل نص إيموجي إلى كائن يفهمه discord.js (للأزرار والقوائم).
 * @param {string} input مثال: "<a:fire:123456789012345678>" أو "🔥"
 * @returns {{id: string, animated: boolean} | {name: string} | null}
 */
function parseEmoji(input) {
  if (!input) return null;
  const value = String(input).trim();
  if (!value) return null;

  const custom = value.match(CUSTOM_REGEX);
  if (custom) return { id: custom[3], animated: custom[1] === 'a' };

  // إيموجي يونيكود: نتحقق أنه ليس نصًا عاديًا طويلًا
  if ([...value].length <= 8) return { name: value };
  return null;
}

/** هل النص يحتوي إيموجي مخصّصًا؟ */
function hasCustomEmoji(text) {
  return ANY_CUSTOM_REGEX.test(String(text ?? ''));
}

/** استخراج كل الإيموجيات المخصّصة من نص */
function extractCustomEmojis(text) {
  const out = [];
  const str = String(text ?? '');
  let match;
  ANY_CUSTOM_REGEX.lastIndex = 0;
  while ((match = ANY_CUSTOM_REGEX.exec(str)) !== null) {
    out.push({ animated: match[1] === 'a', name: match[2], id: match[3] });
  }
  return out;
}

/** تنقية النص من الإيموجيات المخصّصة (للنسخ النصية) */
function stripCustomEmojis(text) {
  return String(text ?? '').replace(ANY_CUSTOM_REGEX, '');
}

/** تحويل الإيموجي المخصّص إلى رابطه (للـ embed thumbnails) */
function customEmojiUrl(input) {
  const parsed = parseEmoji(input);
  if (!parsed?.id) return null;
  return `https://cdn.discordapp.com/emojis/${parsed.id}.${parsed.animated ? 'gif' : 'png'}?size=128`;
}

/** تمثيل نصي موحّد للإيموجي (يُخزَّن في الإعدادات) */
function emojiToStorage(emoji) {
  if (!emoji) return '';
  if (emoji.id) return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  return emoji.name ?? '';
}

module.exports = {
  parseEmoji,
  hasCustomEmoji,
  extractCustomEmojis,
  stripCustomEmojis,
  customEmojiUrl,
  emojiToStorage,
  CUSTOM_REGEX,
  ANY_CUSTOM_REGEX,
};
