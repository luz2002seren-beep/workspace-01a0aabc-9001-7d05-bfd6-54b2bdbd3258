'use strict';

/**
 * systems/leveling.js
 * -------------------------------------------------------------
 * نظام المستويات والخبرة:
 *  • XP على الرسائل مع كولداون قابل للضبط
 *  • XP على البقاء في القنوات الصوتية
 *  • رسالة ترقية + مكافآت الرتب التلقائية
 *  • ترتيب ولوحة المتصدرين
 * -------------------------------------------------------------
 */

const db = require('../database');
const { levelFromXp } = require('../lib/levels');
const { base } = require('../lib/embeds');
const { progressBar } = require('../lib/utils');
const { t } = require('../lib/i18n');

/** توليد خبرة عشوائية داخل المجال المحدّد */
const randomXp = (min, max) => {
  const lo = Math.max(1, Number(min) || 15);
  const hi = Math.max(lo, Number(max) || 25);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
};

/**
 * إضافة خبرة لعضو مع فحص الكولداون والترقية.
 * @returns {Promise<{leveledUp:boolean, level:number, xp:number}|null>}
 */
async function addXp(client, member, amount, { bypassCooldown = false } = {}) {
  try {
    if (!member?.guild || member.user?.bot) return null;
    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id);
    const cfg = settings.leveling;
    if (!cfg?.enabled) return null;

    const row = db.getLevelRow(guild.id, member.id);
    const now = Date.now();
    const cooldownMs = Math.max(0, cfg.cooldownSeconds || 60) * 1000;

    if (!bypassCooldown && row && now - row.last_xp_at < cooldownMs) return null;

    const xp = (row?.xp ?? 0) + amount;
    const before = levelFromXp(row?.xp ?? 0).level;
    const after = levelFromXp(xp);

    db.upsertLevel(guild.id, member.id, {
      xp,
      level: after.level,
      messages: (row?.messages ?? 0) + (bypassCooldown ? 0 : 1),
      voiceMinutes: row?.voice_minutes ?? 0,
      lastXpAt: now,
    });

    if (after.level > before) {
      await handleLevelUp(client, member, after.level, cfg);
      return { leveledUp: true, level: after.level, xp };
    }
    return { leveledUp: false, level: after.level, xp };
  } catch (err) {
    console.error('⚠️ خطأ نظام المستويات:', err.message);
    return null;
  }
}

/** الترقية: رسالة + مكافآت الرتب */
async function handleLevelUp(client, member, level, cfg) {
  const guild = member.guild;

  // مكافأة الرتب
  const reward = (cfg.rewards || []).find((r) => Number(r.level) === Number(level));
  if (reward?.roleId) {
    const role = guild.roles.cache.get(reward.roleId);
    if (role && guild.members.me && role.position < guild.members.me.roles.highest.position) {
      await member.roles.add(role, `مكافأة المستوى ${level}`).catch(() => {});
    }
  }

  const text = String(cfg.levelUpMessage || '🎉 مبروك {user}! وصلت إلى المستوى **{level}**')
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{level\}/g, String(level))
    .replace(/\{server\}/g, guild.name);

  const channel = cfg.announceChannelId
    ? guild.channels.cache.get(cfg.announceChannelId)
    : null;

  const payload = { content: text };
  if (channel?.isTextBased?.()) {
    await channel.send(payload).catch(() => {});
  }
  // إن لم تُحدّد قناة إعلان، أرسل رسالة خاصة لطيفة
  else if (!cfg.silent) {
    await member.send({ content: text }).catch(() => {});
  }
}

/** XP القنوات الصوتية — تُنادى كل دقيقة من المؤقت العام */
async function tickVoiceXp(client) {
  try {
    for (const guild of client.guilds.cache.values()) {
      const settings = db.getGuildSettings(guild.id);
      const cfg = settings.leveling;
      if (!cfg?.enabled || !cfg.voiceXp) continue;

      const afkChannelId = guild.afkChannelId;
      for (const state of guild.voiceStates.cache.values()) {
        const member = state.member;
        if (!member || member.user.bot) continue;
        if (!state.channelId || state.channelId === afkChannelId) continue;
        if (state.selfDeaf || state.deaf) continue;
        // لا خبرة إذا كان وحده في القناة
        const channel = state.channel;
        const humans = channel?.members?.filter((m) => !m.user.bot).size ?? 0;
        if (humans < 2) continue;

        const row = db.getLevelRow(guild.id, member.id);
        const xp = (row?.xp ?? 0) + randomXp(cfg.voiceMinXp ?? 5, cfg.voiceMaxXp ?? 10);
        const before = levelFromXp(row?.xp ?? 0).level;
        const after = levelFromXp(xp);

        db.upsertLevel(guild.id, member.id, {
          xp,
          level: after.level,
          messages: row?.messages ?? 0,
          voiceMinutes: (row?.voice_minutes ?? 0) + 1,
          lastXpAt: row?.last_xp_at ?? Date.now(),
        });

        if (after.level > before) await handleLevelUp(client, member, after.level, cfg);
      }
    }
  } catch (err) {
    console.error('⚠️ خطأ XP الصوتي:', err.message);
  }
}

/** معالجة رسالة ومنح خبرة */
async function handleMessage(client, message) {
  if (!message.guild || !message.member || message.author.bot) return;
  const settings = db.getGuildSettings(message.guild.id);
  const cfg = settings.leveling;
  if (!cfg?.enabled) return;

  // استثناء قنوات محددة
  if ((cfg.ignoredChannels || []).includes(message.channelId)) return;
  if ((cfg.ignoredRoles || []).some((r) => message.member.roles.cache.has(r))) return;

  db.bumpDaily(message.guild.id, 'messages');
  await addXp(client, message.member, randomXp(cfg.minXp, cfg.maxXp));
}

/** بيانات الترتيب لعضو */
function getRankData(guildId, userId) {
  const row = db.getLevelRow(guildId, userId) || { xp: 0, level: 0, messages: 0, voice_minutes: 0 };
  const info = levelFromXp(row.xp);
  const leaderboard = db.getLeaderboard(guildId, 1000, 0);
  const position = leaderboard.findIndex((r) => r.user_id === userId) + 1;
  return {
    ...info,
    xp: row.xp,
    messages: row.messages,
    voiceMinutes: row.voice_minutes,
    rank: position || leaderboard.length + 1,
    total: leaderboard.length,
  };
}

/** بناء embed الترتيب */
function rankEmbed(member, lang = 'ar') {
  const data = getRankData(member.guild.id, member.id);
  const bar = progressBar(data.xpIntoLevel, data.xpForNext, 12);
  return base({
    color: 0x5865f2,
    title: t(lang, 'leveling.rankTitle', { user: member.user.username }),
    thumbnail: member.user.displayAvatarURL({ size: 256 }),
    fields: [
      { name: t(lang, 'leveling.level'), value: `**${data.level}**`, inline: true },
      { name: t(lang, 'leveling.rank'), value: `#${data.rank} / ${data.total}`, inline: true },
      { name: t(lang, 'leveling.xp'), value: `**${data.xp}** XP`, inline: true },
      {
        name: `${data.xpIntoLevel} / ${data.xpForNext} XP`,
        value: `${bar}`,
        inline: false,
      },
      { name: lang === 'ar' ? 'رسائل' : 'Messages', value: `**${data.messages}**`, inline: true },
      { name: lang === 'ar' ? 'دقائق صوتية' : 'Voice minutes', value: `**${data.voiceMinutes}**`, inline: true },
    ],
  });
}

/** بناء لوحة المتصدرين */
function leaderboardEmbed(guildId, members, lang = 'ar', page = 1, perPage = 10) {
  if (!members.length) {
    return base({ color: 0x5865f2, title: t(lang, 'leveling.leaderboard'), description: t(lang, 'leveling.noData') });
  }
  const start = (page - 1) * perPage;
  const medals = ['🥇', '🥈', '🥉'];
  const lines = members.slice(start, start + perPage).map((row, i) => {
    const position = start + i + 1;
    const icon = medals[position - 1] || `\`#${position}\``;
    return `${icon} <@${row.user_id}> — ${lang === 'ar' ? 'المستوى' : 'Level'} **${row.level ?? levelFromXp(row.xp).level}** • **${row.xp}** XP`;
  });
  return base({
    color: 0x5865f2,
    title: `🏆 ${t(lang, 'leveling.leaderboard')}`,
    description: lines.join('\n'),
    footer: `Never Land • ${lang === 'ar' ? 'صفحة' : 'Page'} ${page}`,
  });
}

module.exports = { addXp, handleMessage, handleLevelUp, tickVoiceXp, getRankData, rankEmbed, leaderboardEmbed, levelFromXp };
