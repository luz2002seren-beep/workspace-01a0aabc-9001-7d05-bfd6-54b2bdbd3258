'use strict';

/**
 * lib/discordIcon.js
 * -------------------------------------------------------------
 * بناء روابط صور ديسكورد (أيقونة سيرفر / صورة عضو) بشكل صحيح.
 *
 * المشكلة التي يحلّها: قيمة الأيقونة تأتي أحيانًا كـ«هاش» فقط
 * (‎0ae6617c…‎) وأحيانًا كرابط كامل جاهز، فإذا أضفنا لها بادئة CDN
 * مرة ثانية يتكوّن رابط مكسور وتظهر الصورة كإطار فارغ.
 * هذه الدالة تتعامل مع الحالتين + الأيقونات المتحركة (gif).
 * -------------------------------------------------------------
 */

const CDN = 'https://cdn.discordapp.com';

/**
 * رابط أيقونة سيرفر.
 * @param {string} guildId معرّف السيرفر
 * @param {?string} icon هاش الأيقونة أو رابط كامل أو null
 * @param {number} size المقاس (64..4096)
 * @returns {?string} رابط صالح أو null
 */
function guildIconUrl(guildId, icon, size = 128) {
  if (!icon || !guildId) return null;
  const value = String(icon).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;          // رابط جاهز → يُستخدم كما هو
  if (/^(a_|.*\.(png|gif|webp|jpg|jpeg)$)/i.test(value)) {  // هاش (متحرك أو ثابت)
    const ext = value.startsWith('a_') ? 'gif' : 'png';
    return `${CDN}/icons/${guildId}/${value}.${ext}?size=${size}`;
  }
  return `${CDN}/icons/${guildId}/${value}.png?size=${size}`;
}

/**
 * رابط صورة عضو.
 * @param {string} userId معرّف العضو
 * @param {?string} avatar هاش الصورة أو رابط كامل
 * @param {number} size المقاس
 */
function userAvatarUrl(userId, avatar, size = 128) {
  if (!avatar || !userId) return null;
  const value = String(avatar).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const ext = value.startsWith('a_') ? 'gif' : 'png';
  return `${CDN}/avatars/${userId}/${value}.${ext}?size=${size}`;
}

/**
 * الأحرف الأولى من اسم السيرفر (بديل الأيقونة عند فشل الصورة).
 * مثال: «Never Land» → NL • «سيرفر» → سي
 */
function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '؟';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]);
  return [...clean].slice(0, 2).join('');
}

module.exports = { guildIconUrl, userAvatarUrl, initials, CDN };
