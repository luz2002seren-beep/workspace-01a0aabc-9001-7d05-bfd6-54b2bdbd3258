'use strict';

/**
 * systems/automod.js
 * -------------------------------------------------------------
 * الحماية التلقائية (AutoModeration) — قلب المشروع:
 *   • مضاد السبام (Anti-Spam) بمعدل قابل للضبط
 *   • مضاد الروابط (Anti-Link) + قائمة دومينات مسموحة
 *   • مضاد دعوات السيرفرات (Anti-Invite)
 *   • مضاد منشن الجميع (Anti-Everyone)
 *   • مضاد منشن جماعي (Anti-Mention-Spam)
 *   • مضاد الحروف الكبيرة (Anti-Caps)
 *   • فلتر الكلمات الممنوعة (بالعربية والإنجليزية)
 *   • الحماية من الهجمات (Anti-Raid)
 *   • قوائم استثناء للقنوات والرتب
 *
 * العقوبات المتاحة: delete | warn | timeout | kick | ban
 * -------------------------------------------------------------
 */

const { PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../database');
const { t } = require('../lib/i18n');
const logging = require('./logging');
const { formatDuration } = require('../lib/utils');

const URL_REGEX = /(https?:\/\/[^\s]+)|(\bwww\.[^\s]+)|(\b[a-z0-9-]+\.(com|net|org|io|me|gg|tv|xyz|store|shop|link|site|info|online|app|dev|co|sa|ma|ae|eg|dz|tn|ly|jo|lb|sy|iq|kw|qa|bh|om|ye|sd|ps)\b)/gi;
const INVITE_REGEX = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-z0-9-]+/gi;
const EVERYONE_REGEX = /@everyone|@here/gi;

/** مرشّحات الكلمات: تُقارن بشكل مُطبّع (بدون تشكيل/همزات) لتشمل الكتابة العربية الشائعة */
function normalizeArabic(text = '') {
  return String(text)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** هل القناة أو العضو مستثنی؟ */
function isExempt(member, channelId, settings) {
  const am = settings.automod || {};
  if ((am.whitelistChannels || []).includes(channelId)) return true;
  if (member) {
    const roles = member.roles?.cache?.map((r) => r.id) ?? [];
    if (roles.some((id) => (am.whitelistRoles || []).includes(id))) return true;
    // الإداريون لا يُعاقبون من الحماية التلقائية
    if (
      member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.id === member.guild.ownerId
    ) {
      return true;
    }
  }
  return false;
}

/** هل الرابط في قائمة الدومينات المسموحة؟ */
function isWhitelistedLink(content, allowedDomains = []) {
  const links = content.match(URL_REGEX) || [];
  if (!links.length) return true;
  return links.every((link) => {
    const clean = link.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    return allowedDomains.some((domain) => clean.startsWith(String(domain).toLowerCase()));
  });
}

/** فحص السبام بالاعتماد على طوابع زمنية مخزّنة في الذاكرة */
function isSpamming(client, guildId, userId, message, settings) {
  const am = settings.automod;
  const windowMs = Math.max(1, am.spamIntervalSeconds) * 1000;
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const stamps = (client.spamTracker.get(key) || []).filter((ts) => now - ts < windowMs);
  stamps.push(now);
  client.spamTracker.set(key, stamps);

  // تنظيف دوري لتجنّب تضخّم الذاكرة
  if (client.spamTracker.size > 5000) {
    for (const [k, v] of client.spamTracker) {
      if (!v.length || now - v[v.length - 1] > 120000) client.spamTracker.delete(k);
    }
  }

  const sameContent = (client.cache.get(`${key}:last`) || []).filter((t2) => now - t2.ts < windowMs);
  sameContent.push({ ts: now, content: message.content?.slice(0, 60) ?? '' });
  client.cache.set(`${key}:last`, sameContent.slice(-10));
  const duplicates = sameContent.filter((s) => message.content && s.content === message.content.slice(0, 60)).length;

  return stamps.length >= Math.max(2, am.spamMessages) || duplicates >= 3;
}

/** استخراج الأخطاء (المخالفات) في رسالة واحدة */
function collectViolations(client, message, settings) {
  const am = settings.automod || {};
  const violations = [];
  const content = message.content || '';

  if (!content && !message.attachments?.size) return violations;

  if (am.antiSpam && isSpamming(client, message.guild.id, message.author.id, message, settings)) {
    violations.push({ key: 'spam', label: t('ar', 'automod.spam', { user: `<@${message.author.id}>` }) });
  }

  if (am.antiInvite && INVITE_REGEX.test(content)) {
    violations.push({ key: 'invite', label: t('ar', 'automod.invite', { user: `<@${message.author.id}>` }) });
  } else if (am.antiLink && URL_REGEX.test(content) && !isWhitelistedLink(content, am.whitelistDomains)) {
    violations.push({ key: 'link', label: t('ar', 'automod.link', { user: `<@${message.author.id}>` }) });
  }

  if (am.antiEveryone && EVERYONE_REGEX.test(content)) {
    violations.push({ key: 'everyone', label: t('ar', 'automod.everyone', { user: `<@${message.author.id}>` }) });
  }

  if (am.antiMentionSpam) {
    const mentions = message.mentions?.users?.size ?? 0;
    if (mentions >= Math.max(2, am.mentionLimit || 5)) {
      violations.push({ key: 'mentionSpam', label: t('ar', 'automod.mentionSpam', { user: `<@${message.author.id}>` }) });
    }
  }

  if (am.antiCaps) {
    const letters = content.replace(/[^\p{L}]/gu, '');
    if (letters.length >= 12) {
      const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
      const percent = (upper / letters.length) * 100;
      if (percent >= (am.capsPercent || 70)) {
        violations.push({ key: 'caps', label: t('ar', 'automod.caps', { user: `<@${message.author.id}>` }) });
      }
    }
  }

  if (am.bannedWords?.length) {
    const normalized = normalizeArabic(content);
    const hit = am.bannedWords.find((word) => {
      const w = normalizeArabic(word).trim();
      if (!w) return false;
      // مطابقة الكلمة كاملة أو جزء منها مع حدود بسيطة
      return new RegExp(`(^|\\s|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(normalized);
    });
    if (hit) {
      violations.push({ key: 'bannedWord', label: t('ar', 'automod.bannedWord', { user: `<@${message.author.id}>` }), word: hit });
    }
  }

  return violations;
}

/** تطبيق العقوبة المحددة */
async function applyPunishment(client, message, settings, violations) {
  const am = settings.automod;
  const punishment = am.punishment || 'delete';
  const { guild, member, channel, author } = message;
  const lang = db.locale(guild.id);
  const result = { punishment, deleted: false, caseId: null };

  try {
    if (['delete', 'warn', 'timeout', 'kick', 'ban'].includes(punishment)) {
      if (channel?.isTextBased?.()) {
        await message.delete().catch(() => {});
        result.deleted = true;
      }
    }

    const reason = `[الحماية التلقائية] ${violations.map((v) => v.key).join(', ')}`;

    if (punishment === 'warn') {
      const record = db.addCase({
        guildId: guild.id,
        type: 'warn',
        userId: author.id,
        userTag: author.tag,
        moderatorId: client.user.id,
        moderatorTag: `${client.user.username} (AutoMod)`,
        reason,
      });
      result.caseId = record.id;
    }

    if (punishment === 'timeout' && member?.moderatable) {
      const ms = Math.max(1, am.timeoutMinutes || 10) * 60000;
      await member.timeout(ms, reason).catch(() => {});
      const record = db.addCase({
        guildId: guild.id,
        type: 'timeout',
        userId: author.id,
        userTag: author.tag,
        moderatorId: client.user.id,
        moderatorTag: `${client.user.username} (AutoMod)`,
        reason,
        duration: ms,
      });
      result.caseId = record.id;
    }

    if (punishment === 'kick' && member?.kickable) {
      await member.kick(reason).catch(() => {});
      const record = db.addCase({
        guildId: guild.id,
        type: 'kick',
        userId: author.id,
        userTag: author.tag,
        moderatorId: client.user.id,
        moderatorTag: `${client.user.username} (AutoMod)`,
        reason,
      });
      result.caseId = record.id;
    }

    if (punishment === 'ban' && member?.bannable) {
      await member.ban({ reason, deleteMessageSeconds: 3600 }).catch(() => {});
      const record = db.addCase({
        guildId: guild.id,
        type: 'ban',
        userId: author.id,
        userTag: author.tag,
        moderatorId: client.user.id,
        moderatorTag: `${client.user.username} (AutoMod)`,
        reason,
      });
      result.caseId = record.id;
    }

    // تنبيه نصي قصير في القناة (يُحذف تلقائيًا بعد 8 ثوانٍ)
    const shouldNotify = ['delete', 'warn'].includes(punishment) && channel?.isTextBased?.();
    if (shouldNotify) {
      const notice = await channel
        .send({ content: violations.map((v) => v.label).join('\n') })
        .catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);
    }

    // لوق الحماية
    await logging.send(client, guild, 'automod', {
      title: 'تم رصد مخالفة',
      description: violations.map((v) => `• ${v.label}`).join('\n'),
      fields: [
        { name: 'العضو', value: `${author} \`${author.tag}\``, inline: true },
        { name: 'القناة', value: `${channel}`, inline: true },
        { name: 'العقوبة', value: punishment, inline: true },
        { name: 'المحتوى', value: message.content?.slice(0, 1000) || '(بدون نص)', inline: false },
        ...(result.caseId ? [{ name: `الحالة (${lang})`, value: `#${result.caseId}`, inline: true }] : []),
      ],
    });
  } catch (err) {
    console.error('⚠️ فشل تطبيق عقوبة الحماية التلقائية:', err.message);
  }

  return result;
}

/**
 * نقطة الدخول: تُنادى من حدث messageCreate.
 * @returns {Promise<boolean>} true إذا تم التعامل مع الرسالة (حُذفت/عوقب صاحبها)
 */
async function handleMessage(client, message) {
  try {
    if (!message.guild || message.author?.bot || message.system) return false;

    const settings = db.getGuildSettings(message.guild.id);
    const am = settings.automod;
    if (!am?.enabled) return false;

    // تجاهل الرسائل في الخاص وقنوات السلاسل غير المدعومة
    if (message.channel?.type === ChannelType.DM) return false;

    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (isExempt(member, message.channelId, settings)) return false;

    const violations = collectViolations(client, message, settings);
    if (!violations.length) return false;

    await applyPunishment(client, message, settings, violations);
    return true;
  } catch (err) {
    console.error('⚠️ خطأ في الحماية التلقائية:', err.message);
    return false;
  }
}

/**
 * الحماية من الهجمات (Anti-Raid): إذا انضم عدد كبير من الأعضاء
 * في وقت قصير يتم تنبيه الإدارة وحذف الحسابات الجديدة جدًا (إن مُفعّل).
 */
async function handleMemberJoin(client, member) {
  try {
    const settings = db.getGuildSettings(member.guild.id);
    if (!settings.automod?.enabled || !settings.automod.antiRaid) return;

    const windowMs = (settings.automod.raidWindowSeconds || 60) * 1000;
    const threshold = settings.automod.raidThreshold || 10;
    const now = Date.now();

    const list = (client.joinTracker.get(member.guild.id) || []).filter((ts) => now - ts < windowMs);
    list.push(now);
    client.joinTracker.set(member.guild.id, list);

    if (list.length < threshold) return;

    // هجوم محتمل
    const accountAgeMs = now - member.user.createdTimestamp;
    const minAgeMs = (settings.automod.raidMinAccountAgeDays || 7) * 86400000;

    if (settings.automod.raidAction === 'kick' && accountAgeMs < minAgeMs && member.kickable) {
      await member.kick('Anti-Raid: حساب جديد أثناء هجوم محتمل').catch(() => {});
    }

    const logChannel = logging.getLogChannel(client, member.guild.id);
    const alert = {
      title: '🚨 تحذير: هجوم محتمل',
      description: `انضم **${list.length}** عضو في أقل من ${formatDuration(windowMs, 'ar')}.\nالرتبة العليا: ${member.user.tag} (حساب عمره ${formatDuration(accountAgeMs, 'ar')})`,
    };
    if (logChannel) {
      const { base } = require('../lib/embeds');
      await logChannel.send({ embeds: [base({ color: 0xed4245, ...alert })] }).catch(() => {});
    }
    console.warn(`🚨 هجوم محتمل في ${member.guild.name} (${list.length} انضمام/دقيقة)`);
  } catch (err) {
    console.error('⚠️ خطأ في Anti-Raid:', err.message);
  }
}

module.exports = {
  handleMessage,
  handleMemberJoin,
  collectViolations,
  normalizeArabic,
  isWhitelistedLink,
  URL_REGEX,
  INVITE_REGEX,
};
