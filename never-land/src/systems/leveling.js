'use strict';

/**
 * systems/leveling.js
 * -------------------------------------------------------------
 * نظام الخبرة والمستويات (كامل):
 *
 *  المصادر (كل مصدر له إعداد مستقل):
 *    • كتابي   text     — خبرة على الرسائل في الشات
 *    • صوتي    voice    — خبرة على البقاء في الرومات الصوتية
 *    • تفاعل   interact — خبرة على التفاعلات التي تستلمها على رسائلك
 *
 *  الفترات:
 *    • توب داي  — لوحة متصدّرين تُصفَّر كل يوم
 *    • توب ويك  — لوحة متصدّرين تُصفَّر كل أسبوع (الإثنين)
 *    • كل الأوقات — الترتيب العام بالمستويات
 *
 *  الحمايات:
 *    • تفاعل واحد فقط لكل شخص على نفس الرسالة
 *    • كولداون بين نفس الشخصين (يمنع التفاعل المتبادل السريع)
 *    • سقف تفاعلات لكل رسالة + سقف تفاعل يومي لكل عضو
 *    • استثناء قنوات ورتب، ومنع رسائل البوتات
 * -------------------------------------------------------------
 */

const db = require('../database');
const { levelFromXp } = require('../lib/levels');
const { base } = require('../lib/embeds');
const { progressBar, humanize } = require('../lib/utils');
const { t } = require('../lib/i18n');
const periods = require('../lib/periods');

/** توليد خبرة عشوائية داخل المجال المحدّد */
const randomXp = (min, max) => {
  const lo = Math.max(1, Number(min) || 15);
  const hi = Math.max(lo, Number(max) || 25);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
};

/* --------------------------- حمايات التفاعل (ذاكرة) --------------------------- */

/** من تفاعل مع كل رسالة (نمنع تكرار نفس الشخص + نحدّد سقفًا لكل رسالة) */
const reactionSeen = new Map();
/** كولداون بين (المتفاعل → صاحب الرسالة) */
const pairCooldown = new Map();

const PAIR_COOLDOWN_MS = 60 * 1000;

function pruneReactionCaches() {
  if (reactionSeen.size > 5000) reactionSeen.clear();
  if (pairCooldown.size > 5000) {
    const cutoff = Date.now() - PAIR_COOLDOWN_MS;
    for (const [key, ts] of pairCooldown) if (ts < cutoff) pairCooldown.delete(key);
  }
}

/** هل المصدر مفعّل في إعدادات السيرفر؟ */
function sourceEnabled(cfg, source) {
  if (!cfg) return false;
  if (source === 'voice') return cfg.voiceXp !== false;
  if (source === 'interact') return cfg.interactXp !== false;
  return cfg.textXp !== false; // text
}

/** توزيع الخبرة على المصادر في الفترات */
function bumpPeriods(guildId, userId, amount, source, counters, cfg, at = Date.now()) {
  for (const period of ['day', 'week']) {
    const key = periods.periodKey(period, new Date(at), cfg);
    if (!key) continue;
    db.addPeriodXp(guildId, userId, period, key, { xp: amount, source, ...counters, at });
  }
}

/**
 * إضافة خبرة لعضو مع فحص الكولداون والترقية.
 * @param {object} client عميل ديسكورد
 * @param {object} member العضو
 * @param {number} amount كمية الخبرة
 * @param {{source?:'text'|'voice'|'interact', bypassCooldown?:boolean, messages?:number, voiceMinutes?:number, interactions?:number}} options
 * @returns {Promise<{leveledUp:boolean, level:number, xp:number, source:string}|null>}
 */
async function addXp(client, member, amount, options = {}) {
  try {
    if (!member?.guild || member.user?.bot) return null;
    const { source = 'text', bypassCooldown = false, messages = 0, voiceMinutes = 0, interactions = 0 } = options;

    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id);
    const cfg = settings.leveling;
    if (!cfg?.enabled) return null;
    if (!sourceEnabled(cfg, source)) return null;

    const row = db.getLevelRow(guild.id, member.id);
    const now = Date.now();
    const cooldownMs = Math.max(0, cfg.cooldownSeconds || 60) * 1000;

    // الكولداون يخصّ الخبرة الكتابية فقط (الصوتية والتفاعل لها حماياتها)
    if (source === 'text' && !bypassCooldown && row && now - row.last_xp_at < cooldownMs) return null;

    const xp = (row?.xp ?? 0) + amount;
    const before = levelFromXp(row?.xp ?? 0).level;
    const after = levelFromXp(xp);

    db.upsertLevel(guild.id, member.id, {
      xp,
      level: after.level,
      messages: (row?.messages ?? 0) + (source === 'text' ? 1 : 0) * (messages || (bypassCooldown ? 0 : 1)),
      voiceMinutes: (row?.voice_minutes ?? 0) + voiceMinutes,
      interactions: (row?.interactions ?? 0) + interactions,
      textXp: (row?.text_xp ?? 0) + (source === 'text' ? amount : 0),
      voiceXp: (row?.voice_xp ?? 0) + (source === 'voice' ? amount : 0),
      interactXp: (row?.interact_xp ?? 0) + (source === 'interact' ? amount : 0),
      lastXpAt: source === 'text' ? now : row?.last_xp_at ?? now,
    });

    // تحديث فترات توب داي / توب ويك
    bumpPeriods(
      guild.id,
      member.id,
      amount,
      source,
      {
        messages: source === 'text' ? messages || (bypassCooldown ? 0 : 1) : 0,
        voiceMinutes,
        interactions,
      },
      cfg,
      now,
    );

    if (after.level > before) {
      await handleLevelUp(client, member, after.level, cfg);
      return { leveledUp: true, level: after.level, xp, source };
    }
    return { leveledUp: false, level: after.level, xp, source };
  } catch (err) {
    console.error('[تنبيه] خطأ نظام المستويات:', err.message);
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

  const text = String(cfg.levelUpMessage || 'وصل {user} إلى المستوى **{level}**.')
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{level\}/g, String(level))
    .replace(/\{server\}/g, guild.name);

  const channel = cfg.announceChannelId ? guild.channels.cache.get(cfg.announceChannelId) : null;
  const payload = { content: text };

  if (channel?.isTextBased?.()) await channel.send(payload).catch(() => {});
  else if (!cfg.silent) await member.send({ content: text }).catch(() => {});
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
        const humans = state.channel?.members?.filter((m) => !m.user.bot).size ?? 0;
        if (humans < 2) continue;
        if ((cfg.ignoredRoles || []).some((r) => member.roles.cache.has(r))) continue;

        await addXp(client, member, randomXp(cfg.voiceMinXp ?? 5, cfg.voiceMaxXp ?? 10), {
          source: 'voice',
          bypassCooldown: true,
          voiceMinutes: 1,
        });
      }
    }
  } catch (err) {
    console.error('[تنبيه] خطأ XP الصوتي:', err.message);
  }
}

/** معالجة رسالة ومنح خبرة كتابية */
async function handleMessage(client, message) {
  if (!message.guild || !message.member || message.author.bot) return null;
  const settings = db.getGuildSettings(message.guild.id);
  const cfg = settings.leveling;
  if (!cfg?.enabled || cfg.textXp === false) return null;

  // استثناء قنوات محددة
  if ((cfg.ignoredChannels || []).includes(message.channelId)) return null;
  if ((cfg.ignoredRoles || []).some((r) => message.member.roles.cache.has(r))) return null;

  db.bumpDaily(message.guild.id, 'messages');
  return addXp(client, message.member, randomXp(cfg.minXp, cfg.maxXp), { source: 'text', messages: 1 });
}

/**
 * خبرة التفاعل: شخص تفاعل مع رسالة عضو → خبرة لصاحب الرسالة.
 * حمايات: بلا بوتات، بلا تفاعل على نفسك، تفاعل واحد لكل شخص لكل رسالة،
 *         سقف لكل رسالة، كولداون بين نفس الشخصين، وسقف يومي.
 */
async function handleReaction(client, reaction, user) {
  try {
    if (!user || user.bot) return false;

    // نجلب الرسالة كاملة لو كانت جزئية (رسائل قديمة)
    let message = reaction.message;
    if (message?.partial) message = await message.fetch().catch(() => null);
    if (!message?.guild) return false;
    if (message.author?.bot) return false;
    if (message.author?.id === user.id) return false; // ما تاخذ خبرة على تفاعلك على رسالتك

    const guild = message.guild;
    const cfg = db.getGuildSettings(guild.id).leveling;
    if (!cfg?.enabled || cfg.interactXp === false) return false;
    if ((cfg.ignoredChannels || []).includes(message.channelId)) return false;

    const member = message.member || (await guild.members.fetch(message.author.id).catch(() => null));
    if (!member || member.user.bot) return false;
    if ((cfg.ignoredRoles || []).some((r) => member.roles.cache.has(r))) return false;

    pruneReactionCaches();

    // سقف التفاعلات لكل رسالة + منع تكرار نفس الشخص
    const seenKey = `${guild.id}:${message.id}`;
    const seen = reactionSeen.get(seenKey) || new Set();
    const maxPerMessage = Math.max(1, Number(cfg.interactMaxPerMessage ?? 5));
    if (seen.has(user.id)) return false;
    if (seen.size >= maxPerMessage) return false;
    seen.add(user.id);
    reactionSeen.set(seenKey, seen);

    // كولداون بين نفس المتفاعل ونفس صاحب الرسالة (يمنع التبادل السريع)
    const pairKey = `${user.id}:${member.id}`;
    const lastAt = pairCooldown.get(pairKey) || 0;
    if (Date.now() - lastAt < PAIR_COOLDOWN_MS) return false;
    pairCooldown.set(pairKey, Date.now());

    // السقف اليومي للتفاعل
    const cap = Math.max(0, Number(cfg.interactDailyCap ?? 60));
    const dayRow = db.getPeriodRow(guild.id, member.id, 'day', periods.dayKey(new Date(), cfg));
    const usedToday = dayRow?.interact_xp ?? 0;
    if (cap && usedToday >= cap) return false;

    let amount = randomXp(cfg.interactMinXp ?? 2, cfg.interactMaxXp ?? 5);
    if (cap) amount = Math.min(amount, cap - usedToday);

    const granted = await addXp(client, member, amount, { source: 'interact', interactions: 1, bypassCooldown: true });

    // مكافأة اختيارية لمن تفاعل (تشجيع التفاعل المجتمعي)
    if (cfg.interactGivenXp) {
      const reactor = guild.members.cache.get(user.id) || (await guild.members.fetch(user.id).catch(() => null));
      if (reactor && !reactor.user.bot) {
        await addXp(client, reactor, 1, { source: 'interact', bypassCooldown: true });
      }
    }

    return Boolean(granted);
  } catch (err) {
    console.error('[تنبيه] خطأ خبرة التفاعل:', err.message);
    return false;
  }
}

/* ---------------------------------- الاستعلامات ---------------------------------- */

const GLOBAL_RANK_LIMIT = 1000;

/** بيانات ترتيب عضو: عام + اليوم + الأسبوع + توزيع المصادر */
function getRankData(guildId, userId) {
  const cfg = db.getGuildSettings(guildId).leveling || {};
  const now = new Date();

  const row = db.getLevelRow(guildId, userId) || { xp: 0, level: 0, messages: 0, voice_minutes: 0 };
  const info = levelFromXp(row.xp);
  const board = db.getLeaderboard(guildId, GLOBAL_RANK_LIMIT, 0);
  const position = board.findIndex((r) => r.user_id === userId) + 1;

  const dayKey = periods.dayKey(now, cfg);
  const weekKey = periods.weekKey(now, cfg);
  const dayRow = db.getPeriodRow(guildId, userId, 'day', dayKey);
  const weekRow = db.getPeriodRow(guildId, userId, 'week', weekKey);

  return {
    ...info,
    xp: row.xp,
    messages: row.messages,
    voiceMinutes: row.voice_minutes,
    interactions: row.interactions ?? 0,
    textXp: row.text_xp ?? 0,
    voiceXp: row.voice_xp ?? 0,
    interactXp: row.interact_xp ?? 0,
    rank: position || board.length + 1,
    total: board.length,
    day: { xp: dayRow?.xp ?? 0, rank: db.getPeriodRank(guildId, userId, 'day', dayKey), key: dayKey, reset: periods.resetLabel('day', now, cfg) },
    week: { xp: weekRow?.xp ?? 0, rank: db.getPeriodRank(guildId, userId, 'week', weekKey), key: weekKey, reset: periods.resetLabel('week', now, cfg) },
  };
}

/**
 * صفوف لوحة المتصدّرين لأي فترة/مصدر (يُستخدم في البوت والموقع).
 * @returns {{ rows:Array, total:number, period:string, source:string, key:string|null, reset:string, totals:object }}
 */
function getBoard(guildId, { period = 'day', source = 'all', page = 1, perPage = 10 } = {}) {
  const cfg = db.getGuildSettings(guildId).leveling || {};
  const now = new Date();
  const safePeriod = periods.isPeriod(period) ? period : 'day';
  const safeSource = periods.isSource(source) ? source : 'all';
  const key = periods.periodKey(safePeriod, now, cfg);

  const offset = Math.max(0, (Math.max(1, page) - 1) * perPage);

  if (safePeriod === 'all' || !key) {
    let rows = db.getLeaderboard(guildId, GLOBAL_RANK_LIMIT, 0);
    if (safeSource !== 'all') rows = rows.filter((r) => (r[periods.SOURCES[safeSource].column] || 0) > 0);
    const column = periods.SOURCES[safeSource].column;
    if (safeSource !== 'all') rows = [...rows].sort((a, b) => (b[column] || 0) - (a[column] || 0));
    return {
      rows: rows.slice(offset, offset + perPage).map((r) => ({ ...r, board_xp: r[column] || 0, level: r.level ?? levelFromXp(r.xp).level })),
      total: rows.length,
      period: 'all',
      source: safeSource,
      key: null,
      reset: 'بلا تجديد',
      totals: db.getXpTotals(guildId),
    };
  }

  // فترات (يوم/أسبوع)
  const pool = db.getPeriodLeaderboard(guildId, safePeriod, key, GLOBAL_RANK_LIMIT, 0);
  const column = periods.SOURCES[safeSource].column;
  let rows = pool;
  if (safeSource !== 'all') rows = [...pool].filter((r) => (r[column] || 0) > 0).sort((a, b) => (b[column] || 0) - (a[column] || 0));

  return {
    rows: rows.slice(offset, offset + perPage).map((r) => ({ ...r, board_xp: r[column] || 0, level: (db.getLevelRow(guildId, r.user_id) || {}).level ?? 0 })),
    total: rows.length,
    period: safePeriod,
    source: safeSource,
    key,
    reset: periods.resetLabel(safePeriod, now, cfg),
    totals: db.getXpTotals(guildId, safePeriod, key),
  };
}

/* ---------------------------------- الإمبيدات ---------------------------------- */

/** بناء embed الترتيب الشخصي */
function rankEmbed(member, lang = 'ar') {
  const data = getRankData(member.guild.id, member.id);
  const bar = progressBar(data.xpIntoLevel, data.xpForNext, 12);
  const ar = lang === 'ar';
  const rankText = (info) => (info.rank ? `#${info.rank}` : '—');

  return base({
    color: 0x5865f2,
    title: t(lang, 'leveling.rankTitle', { user: member.user.username }),
    thumbnail: member.user.displayAvatarURL({ size: 256 }),
    fields: [
      { name: t(lang, 'leveling.level'), value: `**${data.level}**`, inline: true },
      { name: ar ? 'الترتيب العام' : 'Global rank', value: `**${rankText(data)}** / ${data.total}`, inline: true },
      { name: t(lang, 'leveling.xp'), value: `**${humanize(data.xp)}** XP`, inline: true },
      { name: `${data.xpIntoLevel} / ${data.xpForNext} XP`, value: `${bar}`, inline: false },
      {
        name: ar ? 'توب داي (اليوم)' : 'Daily',
        value: `${ar ? 'الخبرة' : 'XP'}: **${humanize(data.day.xp)}**\n${ar ? 'الترتيب' : 'Rank'}: **${rankText(data.day)}**\n_${data.day.reset}_`,
        inline: true,
      },
      {
        name: ar ? 'توب ويك (هذا الأسبوع)' : 'Weekly',
        value: `${ar ? 'الخبرة' : 'XP'}: **${humanize(data.week.xp)}**\n${ar ? 'الترتيب' : 'Rank'}: **${rankText(data.week)}**\n_${data.week.reset}_`,
        inline: true,
      },
      {
        name: ar ? 'مصادر الخبرة' : 'XP sources',
        value: [
          `${ar ? 'كتابي' : 'Text'}: **${humanize(data.textXp)}**`,
          `${ar ? 'صوتي' : 'Voice'}: **${humanize(data.voiceXp)}**`,
          `${ar ? 'تفاعل' : 'Interactions'}: **${humanize(data.interactXp)}**`,
        ].join(' • '),
        inline: false,
      },
      { name: ar ? 'رسائل' : 'Messages', value: `**${humanize(data.messages)}**`, inline: true },
      { name: ar ? 'دقائق صوتية' : 'Voice minutes', value: `**${humanize(data.voiceMinutes)}**`, inline: true },
      { name: ar ? 'تفاعلات' : 'Reactions', value: `**${humanize(data.interactions)}**`, inline: true },
    ],
  });
}

/** بناء embed لوحة المتصدّرين (تدعم اليوم/الأسبوع/الكل + المصدر) */
function leaderboardEmbed(guildId, rowsOrOptions = [], lang = 'ar', pageArg = 1, perPageArg = 10) {
  const ar = lang === 'ar';

  // استدعاء قديم: (guildId, rows, lang, page)
  const legacy = Array.isArray(rowsOrOptions);
  const options = legacy ? { period: 'all', source: 'all', page: pageArg, perPage: perPageArg, presetRows: rowsOrOptions } : rowsOrOptions;

  const board = legacy
    ? {
        rows: options.presetRows.slice((options.page - 1) * options.perPage, options.page * options.perPage)
          .map((r) => ({ ...r, board_xp: r.xp, level: r.level ?? levelFromXp(r.xp).level })),
        total: options.presetRows.length,
        period: 'all',
        source: 'all',
        key: null,
        reset: 'بلا تجديد',
      }
    : getBoard(guildId, options);

  const periodMeta = periods.PERIODS[board.period] || periods.PERIODS.all;
  const sourceMeta = periods.SOURCES[board.source] || periods.SOURCES.all;
  const page = Math.max(1, Number(options.page) || 1);
  const title = board.period === 'all'
    ? (ar ? 'لوحة المتصدّرين — كل الأوقات' : 'Leaderboard — All time')
    : (ar ? `لوحة المتصدّرين — ${periodMeta.short}` : `Leaderboard — ${periodMeta.key}`);

  if (!board.rows.length) {
    return base({
      color: 0x5865f2,
      title,
      description: ar ? 'ما في بيانات لهذه الفترة بعد — خلّوا الأعضاء يتفاعلون!' : 'No data for this period yet.',
      footer: `Never Land${board.source !== 'all' ? ` • ${ar ? 'المصدر' : 'Source'}: ${sourceMeta.label}` : ''}`,
    });
  }

  const medals = ['01', '02', '03']; // بلا إيموجي كيبورد
  const start = (page - 1) * (options.perPage || 10);
  const lines = board.rows.map((row, i) => {
    const position = start + i + 1;
    const badge = position <= 3 ? `**${medals[position - 1]}**` : `\`#${position}\``;
    const xp = humanize(row.board_xp ?? row.xp);
    const level = row.level ?? 0;
    const breakdown = board.source === 'all' && board.period !== 'all'
      ? ` • K:${humanize(row.text_xp || 0)} V:${humanize(row.voice_xp || 0)} I:${humanize(row.interact_xp || 0)}`
      : '';
    return `${badge} <@${row.user_id}> — **${xp}** XP (${ar ? 'مستوى' : 'lvl'} ${level})${breakdown}`;
  });

  const totalsLine = board.period === 'all'
    ? null
    : (ar
      ? `مجموع خبرة الفترة: **${humanize(board.totals?.xp || 0)}** XP • مشاركون: **${board.total}**`
      : `Period total: **${humanize(board.totals?.xp || 0)}** XP • Participants: **${board.total}**`);

  return base({
    color: board.period === 'week' ? 0x57f287 : board.period === 'day' ? 0xfee75c : 0x5865f2,
    title: `${ar ? 'توب' : 'Top'} — ${title.replace(ar ? 'لوحة المتصدّرين — ' : 'Leaderboard — ', '')}`,
    description: lines.join('\n'),
    fields: [
      ...(totalsLine ? [{ name: ar ? 'إحصاء الفترة' : 'Period stats', value: totalsLine, inline: false }] : []),
      {
        name: ar ? 'التفاصيل' : 'Details',
        value: ar
          ? `الفترة: **${periodMeta.label}** • المصدر: **${sourceMeta.label}**\n${board.reset}`
          : `Period: **${periodMeta.key}** • Source: **${sourceMeta.key}**\n${board.reset}`,
        inline: false,
      },
    ],
    footer: `Never Land • ${ar ? 'صفحة' : 'Page'} ${page} • ${ar ? 'K كتابي · V صوتي · I تفاعل' : 'K text · V voice · I interactions'}`,
  });
}

/** embed بسيط لملخص المصادر (نظرة سريعة) */
function sourcesEmbed(guildId, lang = 'ar') {
  const ar = lang === 'ar';
  const totals = {
    all: db.getXpTotals(guildId),
    day: (() => {
      const cfg = db.getGuildSettings(guildId).leveling || {};
      return db.getXpTotals(guildId, 'day', periods.dayKey(new Date(), cfg));
    })(),
    week: (() => {
      const cfg = db.getGuildSettings(guildId).leveling || {};
      return db.getXpTotals(guildId, 'week', periods.weekKey(new Date(), cfg));
    })(),
  };
  return base({
    color: 0x5865f2,
    title: ar ? 'مصادر الخبرة في السيرفر' : 'Server XP sources',
    fields: [
      ...periods.PERIOD_KEYS.map((key) => ({
        name: periods.PERIODS[key].short,
        value: ar
          ? `الإجمالي: **${humanize(totals[key].xp)}** XP\nكتابي: **${humanize(totals[key].text_xp)}** • صوتي: **${humanize(totals[key].voice_xp)}** • تفاعل: **${humanize(totals[key].interact_xp)}**`
          : `Total: **${humanize(totals[key].xp)}** XP\nText: **${humanize(totals[key].text_xp)}** • Voice: **${humanize(totals[key].voice_xp)}** • Interactions: **${humanize(totals[key].interact_xp)}**`,
        inline: false,
      })),
    ],
    footer: 'Never Land',
  });
}

module.exports = {
  addXp,
  handleMessage,
  handleReaction,
  handleLevelUp,
  tickVoiceXp,
  getRankData,
  getBoard,
  rankEmbed,
  leaderboardEmbed,
  sourcesEmbed,
  levelFromXp,
  PERIODS: periods.PERIODS,
  SOURCES: periods.SOURCES,
  randomXp,
};
