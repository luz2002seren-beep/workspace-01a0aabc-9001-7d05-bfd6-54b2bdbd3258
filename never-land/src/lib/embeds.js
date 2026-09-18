'use strict';

/**
 * lib/embeds.js
 * -------------------------------------------------------------
 * مُنشئ الـ Embeds الموحّد لكل ردود البوت (تصميم ثابت وأنيق).
 * -------------------------------------------------------------
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  shield: '🛡️',
  mod: '🔨',
  ticket: '🎫',
  level: '📈',
};

/** Embed أساسي مع الهوية البصرية للمشروع */
function base({ color = config.bot.colors.primary, title, description, footer, thumbnail, fields, author, image } = {}) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (author) embed.setAuthor(author);
  if (fields?.length) embed.addFields(fields);
  /* footer: false ⇒ بلا فوتر إطلاقًا (يبقى وقت الرسالة فقط) */
  if (footer !== false) embed.setFooter({ text: footer || 'Never Land • لوحة تحكم وبوت متكامل' });
  return embed;
}

const success = (title, description, extra = {}) =>
  base({ color: config.bot.colors.success, title: `${ICONS.success} ${title}`, description, ...extra });

const error = (title, description, extra = {}) =>
  base({ color: config.bot.colors.danger, title: `${ICONS.error} ${title}`, description, ...extra });

const warning = (title, description, extra = {}) =>
  base({ color: config.bot.colors.warning, title: `${ICONS.warning} ${title}`, description, ...extra });

const info = (title, description, extra = {}) =>
  base({ color: config.bot.colors.info, title: `${ICONS.info} ${title}`, description, ...extra });

const mod = (title, description, extra = {}) =>
  base({ color: config.bot.colors.mod ?? config.bot.colors.danger, title, description, ...extra });

/** embed إعدادات: يعرض حالة ميزة معيّنة */
function settingsEmbed(title, rows = [], lang = 'ar') {
  const fields = rows.map(([name, value, inline = true]) => ({ name, value: String(value), inline }));
  return base({
    title: `⚙️ ${title}`,
    fields,
    footer: lang === 'ar' ? 'Never Land • عدّل هذه القيم من لوحة التحكم' : 'Never Land • Edit these from the dashboard',
  });
}

/** تفاعل بسيط للتأكيد على أن الأمر تحت التنفيذ (نص محلي بدون إيموجي مخصص) */
const mark = {
  loading: '<a:loading:0>',
  on: '🟢',
  off: '🔴',
};

module.exports = { base, success, error, warning, info, mod, settingsEmbed, ICONS, mark };
