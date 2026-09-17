'use strict';

/**
 * systems/welcome.js
 * -------------------------------------------------------------
 * الترحيب والوداع والدعم (Boost) + الرتب التلقائية.
 *  • رسالة ترحيب نصية أو embed مع متغيّرات ({user} {server} {memberCount} {avatar}...)
 *  • صورة ترحيب: بطاقة مولَّدة بالأفتار (Card) / أفتار / صورة مخصّصة / بدون
 *  • ترحيب في الخاص • وداع • شكر الدعم (Boost) • رتب تلقائية • Anti-Raid
 * -------------------------------------------------------------
 */

const { PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { base } = require('../lib/embeds');
const { applyPlaceholders } = require('../lib/utils');
const welcomeCard = require('../lib/welcomeCard');

/** إرسال رسالة إلى قناة معينة مع خيار الحذف التلقائي */
async function sendTo(client, guild, channelId, payload, autoDeleteAfter = 0) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId)
    ?? await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;

  const me = guild.members.me;
  if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) return null;

  const message = await channel.send(payload).catch((err) => {
    console.error('⚠️ فشل إرسال رسالة الترحيب:', err.message);
    return null;
  });
  if (message && autoDeleteAfter > 0) {
    setTimeout(() => message.delete().catch(() => {}), autoDeleteAfter);
  }
  return message;
}

/**
 * بناء صورة الترحيب حسب الإعداد (بطاقة / أفتار / مخصّصة).
 * @returns {{files: Array, imageRef: ?string}}
 */
async function buildWelcomeImage(client, member, settings) {
  const cfg = settings.welcome;
  const mode = cfg.imageMode || 'none';
  const result = { files: [], imageRef: null };

  if (mode === 'avatar') {
    result.imageRef = member.user.displayAvatarURL({ size: 512, extension: 'png' });
    return result;
  }

  if (mode === 'custom' && cfg.imageUrl) {
    result.imageRef = applyPlaceholders(cfg.imageUrl, { user: member.user, member, guild: member.guild });
    return result;
  }

  if (mode === 'card' && welcomeCard.available()) {
    const buffer = await welcomeCard.generateWelcomeCard({
      user: member.user,
      memberCount: member.guild.memberCount,
      guildName: member.guild.name,
      guildIcon: member.guild.iconURL({ size: 128 }),
      background: cfg.cardBackground || null,
      theme: cfg.cardTheme || null,
    });
    if (buffer) {
      if (cfg.attachImage !== false) {
        result.files.push(new AttachmentBuilder(buffer, { name: 'welcome.png' }));
        result.imageRef = 'attachment://welcome.png';
      } else {
        result.imageRef = member.user.displayAvatarURL({ size: 512, extension: 'png' });
      }
      return result;
    }
  }

  // احتياطي: صورة الأفتار
  if (mode !== 'none') result.imageRef = member.user.displayAvatarURL({ size: 512, extension: 'png' });
  return result;
}

/** ترحيب عضو جديد */
async function handleMemberAdd(client, member) {
  const { guild } = member;
  const settings = db.getGuildSettings(guild.id);
  const lang = settings.language || 'ar';

  /* --------- 1) الرتب التلقائية --------- */
  if (settings.autorole?.enabled) {
    const isBot = member.user.bot;
    const roles = isBot ? (settings.autorole.botRoleIds || []) : (settings.autorole.roleIds || []);
    for (const roleId of roles) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      if (guild.members.me && role.position >= guild.members.me.roles.highest.position) continue;
      await member.roles.add(role, 'رتبة تلقائية (Autorole)').catch(() => {});
    }
  }

  /* --------- 2) رسالة الترحيب في القناة --------- */
  if (settings.welcome?.enabled && settings.welcome.channelId) {
    const text = applyPlaceholders(settings.welcome.message, { user: member.user, member, guild });
    const { files, imageRef } = await buildWelcomeImage(client, member, settings);

    const embed = base({
      color: 0x57f287,
      title: `أهلاً بك في ${guild.name}`,
      description: text,
      thumbnail: settings.welcome.avatarThumbnail ? member.user.displayAvatarURL({ size: 256 }) : null,
      image: imageRef,
      fields: [
        { name: 'العضو', value: `${member} \`${member.user.tag}\``, inline: true },
        { name: 'الحساب أُنشئ', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'ترتيب الانضمام', value: `#${guild.memberCount}`, inline: true },
      ],
    });

    const payload = settings.welcome.embed
      ? { embeds: [embed], files }
      : { content: text, files };

    await sendTo(client, guild, settings.welcome.channelId, payload, settings.welcome.autoDeleteAfter || 0);
  }

  /* --------- 3) ترحيب خاص في الرسائل --------- */
  if (settings.welcome?.dm) {
    const dmText = applyPlaceholders(
      settings.welcome.dmMessage || (lang === 'ar' ? 'أهلاً بك في **{server}**! لا تنسَ قراءة القوانين 😊' : 'Welcome to **{server}**!'),
      { user: member.user, member, guild },
    );
    await member.send({ content: dmText }).catch(() => {});
  }

  /* --------- 4) إحصاء --------- */
  db.bumpDaily(guild.id, 'joins');

  /* --------- 5) الحماية من الهجمات --------- */
  const automod = require('./automod');
  await automod.handleMemberJoin(client, member).catch(() => {});
}

/** وداع عضو */
async function handleMemberRemove(client, member) {
  const { guild } = member;
  const settings = db.getGuildSettings(guild.id);
  db.bumpDaily(guild.id, 'leaves');

  if (!settings.leave?.enabled || !settings.leave.channelId) return;
  const text = applyPlaceholders(settings.leave.message, { user: member.user, member, guild });
  const payload = settings.leave.embed === false
    ? { content: text }
    : {
        embeds: [
          base({
            color: 0xfee75c,
            title: 'غادر السيرفر',
            description: text,
            thumbnail: member.user.displayAvatarURL({ size: 256 }),
            fields: [{ name: 'الأعضاء الآن', value: `${guild.memberCount}`, inline: true }],
          }),
        ],
      };
  await sendTo(client, guild, settings.leave.channelId, payload);
}

/** دعم السيرفر (Boost) */
async function handleBoost(client, member) {
  const { guild } = member;
  const settings = db.getGuildSettings(guild.id);
  if (!settings.boost?.enabled || !settings.boost.channelId) return;

  const text = applyPlaceholders(settings.boost.message, { user: member.user, member, guild, level: guild.premiumTier });
  const payload = {
    embeds: [
      base({
        color: 0xff73fa,
        title: '🚀 دعم جديد للسيرفر!',
        description: text,
        thumbnail: member.user.displayAvatarURL({ size: 256 }),
        fields: [
          { name: 'مانح الدعم', value: `${member}`, inline: true },
          { name: 'مستوى السيرفر', value: `المستوى ${guild.premiumTier}`, inline: true },
          { name: 'عدد الدعمات', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        ],
      }),
    ],
  };
  await sendTo(client, guild, settings.boost.channelId, payload);
}

/** معاينة صورة الترحيب (يُستخدمها أمر /welcome test) */
async function previewCard(client, member) {
  const settings = db.getGuildSettings(member.guild.id);
  return welcomeCard.generateWelcomeCard({
    user: member.user,
    memberCount: member.guild.memberCount,
    guildName: member.guild.name,
    guildIcon: member.guild.iconURL({ size: 128 }),
    background: settings.welcome.cardBackground || null,
    theme: settings.welcome.cardTheme || null,
  });
}

module.exports = { handleMemberAdd, handleMemberRemove, handleBoost, sendTo, buildWelcomeImage, previewCard };
