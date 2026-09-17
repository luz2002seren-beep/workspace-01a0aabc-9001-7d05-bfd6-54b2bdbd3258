'use strict';

/**
 * web/routes/api.js
 * -------------------------------------------------------------
 * الواجهة البرمجية للوحة التحكم (JSON):
 *   GET    /api/me
 *   GET    /api/guilds
 *   GET    /api/guilds/:id            (الإعدادات + الميتاداتا + الإحصائيات)
 *   POST   /api/guilds/:id/settings   (حفظ الإعدادات — تدعم الدمج الجزئي)
 *   GET    /api/guilds/:id/cases
 *   GET    /api/guilds/:id/tickets
 *   GET    /api/guilds/:id/levels
 *   POST   /api/guilds/:id/tickets/:ticketId/close
 * -------------------------------------------------------------
 */

const express = require('express');
const demoData = require('../demo');
const access = require('../access');
const config = require('../../config');
const db = require('../../database');
const leveling = require('../../systems/leveling');
const periods = require('../../lib/periods');
const { mergeSettings } = require('../../database/defaults');
const sync = require('../../sync');
const webGuilds = require('../guilds');
const { guildIconUrl, initials } = require('../../lib/discordIcon');

const router = express.Router();

/** العضو المسجّل حاليًا (أو مستخدم المعاينة) */
function currentUser(req) {
  if (config.web.demoData) {
    return { id: '0', username: 'المسؤول', globalName: 'مسؤول السيرفر' };
  }
  return req.session.user || null;
}

/** سيرفرات المستخدم المتاحة في اللوحة (مصدر موثوق موحّد) */
async function availableGuilds(req) {
  return webGuilds.listUserGuilds(req);
}

function safeClient() {
  try {
    const client = require('../../client');
    return client;
  } catch {
    return null;
  }
}

/** هل المستخدم يملك صلاحية الوصول لهذا السيرفر؟ (مالك/إدارة/الرول المطلوب) */
async function canAccess(req, guildId) {
  return webGuilds.canAccessGuild(req, guildId);
}

/** هل يملك المشاهد صلاحية التعديل؟ */
function canEdit(req) {
  if (config.web.demoData) return true;
  return Boolean(req.roleOk);
}

/**
 * حماية مسارات /api:
 *  - القراءة (GET) متاحة للجميع عند تفعيل الوصول العام
 *  - الكتابة (POST/PATCH/DELETE) تحتاج تسجيل دخول Discord
 */
router.use(async (req, res, next) => {
  if (config.web.demoData) {
    req.roleOk = true;
    return next();
  }

  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  if (req.session.user) {
    const result = await access.checkAccess(req.session, req.session.user.id);
    req.roleResult = result;
    if (!result.ok) {
      return res.status(403).json({
        error: 'role_required',
        message: access.explain(result),
        requiredRoleId: config.web.requiredRoleId,
        reason: result.reason,
      });
    }
    req.roleOk = true;
    return next();
  }

  if (!isWrite && config.web.publicAccess && !config.web.loginRequired) return next();

  return res.status(401).json({
    error: 'unauthorized',
    message: isWrite ? 'التعديل يحتاج تأكيد الدخول بحساب Discord.' : 'يجب تأكيد الدخول أولًا.',
  });
});

/* ------------------------------------ بيانات المستخدم ------------------------------------ */
router.get('/me', async (req, res) => {
  res.json({
    user: currentUser(req),
    guilds: await availableGuilds(req),
    loginRequired: config.web.loginRequired,
    requiredRoleId: config.web.requiredRoleId || null,
    roleOk: config.web.demoData ? true : Boolean(req.roleOk),
    sync: sync.getStatus(),
  });
});

router.get('/guilds', async (req, res) => {
  res.json({ guilds: await availableGuilds(req) });
});

/* ------------------------------------ بيانات سيرفر ------------------------------------ */
router.get('/guilds/:guildId', async (req, res) => {
  const { guildId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const guild = db.getGuild(guildId);
  const stats = db.getStats(guildId);
  const client = safeClient();
  const discordGuild = client?.guilds?.cache?.get(guildId);
  const snapshot = sync.getSnapshot(guildId);

  // الميتاداتا (قنوات/رتب): من البوت المتّصل، وإلا من آخر مزامنة محفوظة
  const channels = discordGuild
    ? [...discordGuild.channels.cache.values()]
        .filter((c) => c.type === 0 || c.type === 2 || c.type === 4 || c.type === 15)
        .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null }))
        .sort((a, b) => a.type - b.type || String(a.name).localeCompare(String(b.name), 'ar'))
    : (snapshot?.channels || []).filter((c) => [0, 2, 4, 15].includes(c.type));

  const roles = discordGuild
    ? [...discordGuild.roles.cache.values()]
        .filter((r) => r.id !== discordGuild.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
    : (snapshot?.roles || []).filter((r) => !r.managed);

  const loggingSystem = require('../../systems/logging');

  return res.json({
    guild: {
      id: guildId,
      name: discordGuild?.name ?? snapshot?.name ?? guildId,
      icon: guildIconUrl(guildId, discordGuild?.iconURL?.({ size: 128, extension: 'png' }) || discordGuild?.icon) || guildIconUrl(guildId, snapshot?.icon) || null,
      memberCount: discordGuild?.memberCount ?? snapshot?.memberCount ?? null,
      ownerId: discordGuild?.ownerId ?? snapshot?.ownerId ?? null,
      botPresent: Boolean(discordGuild) || Boolean(snapshot),
      botOnline: Boolean(client?.isReady?.()),
      createdAt: discordGuild?.createdTimestamp ?? snapshot?.createdAt ?? null,
      syncedAt: snapshot?.syncedAt ?? null,
      syncSource: snapshot?.source ?? null,
    },
    sync: sync.getStatus(),
    settings: guild.settings,
    stats: { ...stats, discordMembers: discordGuild?.memberCount ?? snapshot?.memberCount ?? null, botReady: Boolean(client?.isReady?.()) },
    daily: db.getDailyStats(guildId, 14),
    meta: {
      channels,
      roles,
      members: discordGuild ? discordGuild.members.cache.size : 0,
      emojis: discordGuild
        ? [...discordGuild.emojis.cache.values()].slice(0, 100).map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: e.imageURL?.() ?? null }))
        : (snapshot?.emojis || []),
      logGroups: loggingSystem.EVENT_GROUPS,
      logEvents: Object.fromEntries(Object.entries(loggingSystem.EVENT_META).map(([key, meta]) => [key, { label: meta.label, emoji: meta.emoji, group: meta.group }])),
      cardAvailable: require('../../lib/welcomeCard').available(),
      autolineStyles: Object.entries(require('../../systems/autoline').GIF_STYLES).map(([key, meta]) => ({ key, ...meta })),
    },
    viewer: {
      canEdit: canEdit(req),
      loggedIn: Boolean(req.session.user) || config.web.demoData,
      demo: config.web.demoData,
      publicAccess: config.web.publicAccess,
      loginRequired: config.web.loginRequired,
      requiredRoleId: config.web.requiredRoleId || null,
      roleReason: req.roleResult?.reason || null,
      roleMessage: req.roleResult && !req.roleResult.ok ? access.explain(req.roleResult) : null,
    },
  });
});

router.post('/guilds/:guildId/settings', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'readonly', message: 'هذا الإجراء يحتاج تسجيل دخول Discord.' });

  const { guildId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const patch = req.body;
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'bad_request', message: 'لا توجد بيانات للحفظ' });

  const guild = db.getGuild(guildId);
  const merged = mergeSettings(guild.settings, patch);
  db.updateGuildSettings(guildId, merged);

  return res.json({ ok: true, settings: db.getGuild(guildId).settings, savedAt: Date.now() });
});

/* ------------------------------------ السجلات والتذاكر والمستويات ------------------------------------ */
router.get('/guilds/:guildId/cases', async (req, res) => {
  const { guildId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(5, Number(req.query.perPage) || 20));
  const { items, total } = db.listCases({
    guildId,
    userId: req.query.userId || null,
    type: req.query.type || null,
    active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : null,
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  return res.json({ items, total, page, perPage, pages: Math.ceil(total / perPage) });
});

router.get('/guilds/:guildId/tickets', async (req, res) => {
  const { guildId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const { items, total } = db.listTickets({
    guildId,
    status: req.query.status || null,
    limit: Math.min(200, Number(req.query.limit) || 50),
    offset: Number(req.query.offset) || 0,
  });
  return res.json({ items, total });
});

router.post('/guilds/:guildId/tickets/:ticketId/close', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'readonly', message: 'هذا الإجراء يحتاج تسجيل دخول Discord.' });

  const { guildId, ticketId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const ticket = db.getTicketById(Number(ticketId));
  if (!ticket || ticket.guild_id !== guildId) return res.status(404).json({ error: 'not_found' });

  db.updateTicket(ticket.id, { status: 'closed', closed_at: Date.now() });

  // إن كان البوت شغّالًا، أضف رسالة إغلاق في القناة
  const client = safeClient();
  const channel = client?.channels?.cache?.get(ticket.channel_id);
  if (channel?.isTextBased?.()) {
    await channel
      .send({
        embeds: [
          require('../../lib/embeds').info(
            'أُغلقت التذكرة من لوحة التحكم',
            `تم الإغلاق بواسطة **${req.session.user?.username ?? 'لوحة التحكم'}**.`,
          ),
        ],
      })
      .catch(() => {});
  }

  return res.json({ ok: true, ticket: db.getTicketById(ticket.id) });
});

/**
 * لوحة المتصدّرين — تدعم الفترات (توب داي / توب ويك / كل الأوقات)
 * والمصادر (كتابي · صوتي · تفاعل).
 *   /api/guilds/:id/levels?period=day|week|all&source=all|text|voice|interact
 */
router.get('/guilds/:guildId/levels', async (req, res) => {
  const { guildId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Number(req.query.perPage) || 20);
  const period = periods.isPeriod(req.query.period) ? String(req.query.period) : 'all';
  const source = periods.isSource(req.query.source) ? String(req.query.source) : 'all';

  const client = safeClient();
  const guild = client?.guilds?.cache?.get(guildId);

  const board = leveling.getBoard(guildId, { period, source, page, perPage });

  const items = board.rows.map((row) => {
    const member = guild?.members?.cache?.get(row.user_id);
    const levelRow = db.getLevelRow(guildId, row.user_id) || {};
    return {
      user_id: row.user_id,
      xp: row.board_xp ?? row.xp ?? 0,
      total_xp: levelRow.xp ?? row.xp ?? 0,
      level: row.level ?? levelRow.level ?? 0,
      text_xp: row.text_xp ?? 0,
      voice_xp: row.voice_xp ?? 0,
      interact_xp: row.interact_xp ?? 0,
      messages: row.messages ?? levelRow.messages ?? 0,
      voice_minutes: row.voice_minutes ?? levelRow.voice_minutes ?? 0,
      interactions: row.interactions ?? levelRow.interactions ?? 0,
      username: member?.user?.username ?? demoMemberInfo(row.user_id).username,
      displayName: member?.displayName ?? demoMemberInfo(row.user_id).displayName,
      avatar: member?.user?.displayAvatarURL?.({ size: 64 }) ?? null,
    };
  });

  return res.json({
    items,
    total: board.total,
    period: board.period,
    source: board.source,
    periodKey: board.key,
    reset: board.reset,
    totals: board.totals,
    periods: Object.values(periods.PERIODS),
    sources: Object.values(periods.SOURCES),
  });
});

/** بيانات عضو: من كاش ديسكورد، وإذا البوت مو شغّال نرجع لأسماء العرض */
function demoMemberInfo(id) {
  const demo = config.web.demoData ? demoData.demoMember?.(id) : null;
  if (demo) return { id: demo.id, username: demo.username, displayName: demo.displayName, avatar: null, bot: false };
  return { id, username: null, displayName: null, avatar: null };
}

/** تحويل قائمة آيديات إلى بيانات أعضاء (لجداول اللوحة) */
router.get('/guilds/:guildId/members', async (req, res) => {
  const { guildId } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const client = safeClient();
  const guild = client?.guilds?.cache?.get(guildId);
  const ids = String(req.query.ids || '').split(',').map((s2) => s2.trim()).filter(Boolean).slice(0, 100);
  const query = String(req.query.q || '').trim().toLowerCase();

  // البحث بالاسم داخل الكاش
  if (query && guild) {
    const results = [...guild.members.cache.values()]
      .filter((m) => m.user.username.toLowerCase().includes(query) || (m.displayName || '').toLowerCase().includes(query) || m.id.includes(query))
      .slice(0, 25)
      .map((m) => ({ id: m.id, username: m.user.username, displayName: m.displayName, avatar: m.user.displayAvatarURL({ size: 64 }), bot: m.user.bot }));
    return res.json({ members: results });
  }

  if (!guild || !ids.length) {
    return res.json({ members: ids.map((id) => demoMemberInfo(id)) });
  }

  const members = [];
  for (const id of ids) {
    const cached = guild.members.cache.get(id);
    if (cached) {
      members.push({ id, username: cached.user.username, displayName: cached.displayName, avatar: cached.user.displayAvatarURL({ size: 64 }), bot: cached.user.bot });
      continue;
    }
    const fetched = await guild.members.fetch(id).catch(() => null);
    members.push(
      fetched
        ? { id, username: fetched.user.username, displayName: fetched.displayName, avatar: fetched.user.displayAvatarURL({ size: 64 }), bot: fetched.user.bot }
        : demoMemberInfo(id),
    );
  }
  return res.json({ members });
});

/* ------------------------- إجراءات تجريبية من اللوحة ------------------------- */
/**
 * POST /api/guilds/:guildId/actions/:action
 * action: test   → يرسل رسالة اختبار للقناة المحدّدة (الترحيب • السجلات • الخط الفاصل)
 *         panel  → ينشر لوحة التذاكر في القناة المرسلة في body.channelId
 * يعمل فقط عندما يكون البوت متصلًا بديسكورد (وإلا يرجع رسالة واضحة).
 */
router.post('/guilds/:guildId/actions/:action', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'readonly', message: 'هذا الإجراء يحتاج تسجيل دخول Discord.' });

  const { guildId, action } = req.params;
  if (!(await canAccess(req, guildId))) return res.status(403).json({ error: 'forbidden' });

  const client = safeClient();
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) {
    return res.status(409).json({ ok: false, message: 'الإرسال التجريبي يحتاج تشغيل البوت بديسكورد (ضع DISCORD_TOKEN في .env ثم أعد التشغيل).' });
  }

  const settings = db.getGuildSettings(guildId);
  const type = String(req.body?.type || 'welcome');
  const channelId = req.body?.channelId || null;

  try {
    if (action === 'panel') {
      const tickets = require('../../systems/tickets');
      const target = channelId || settings.tickets.logChannelId;
      if (!target) return res.status(400).json({ ok: false, message: 'حدّد قناة إرسال اللوحة أولًا.' });
      const channel = await guild.channels.fetch(target).catch(() => null);
      if (!channel?.isTextBased?.()) return res.status(400).json({ ok: false, message: 'القناة غير صالحة لإرسال اللوحة.' });
      const payloads = tickets.buildPanelPayloads(settings, guild, client);
      for (const payload of payloads) await channel.send(payload);
      return res.json({ ok: true, message: `✅ تم نشر اللوحة في #${channel.name}` });
    }

    if (type === 'logs') {
      const logging = require('../../systems/logging');
      const sent = await logging.send(client, guild, 'messageDelete', {
        title: 'اختبار السجلات من لوحة التحكم',
        description: 'هذه رسالة تجريبية للتأكد من وصول السجلات لهذه القناة.',
        fields: [{ name: 'بواسطة', value: req.user?.username ? `@${req.user.username}` : 'لوحة التحكم' }],
      });
      if (!sent) return res.status(400).json({ ok: false, message: 'تأكد من تفعيل السجلات واختيار قناة السجلات.' });
      return res.json({ ok: true, message: '✅ أُرسلت رسالة سجل تجريبية.' });
    }

    if (type === 'autoline') {
      const autoline = require('../../systems/autoline');
      const target = (settings.autoline.channels || [])[0] || channelId;
      if (!target) return res.status(400).json({ ok: false, message: 'حدّد قناة للخط الفاصل أولًا.' });
      const channel = await guild.channels.fetch(target).catch(() => null);
      if (!channel?.isTextBased?.()) return res.status(400).json({ ok: false, message: 'القناة غير صالحة.' });
      await autoline.sendTestLine(channel);
      return res.json({ ok: true, message: `✅ أُرسل الخط في #${channel.name}` });
    }

    // الافتراضي: اختبار الترحيب (بالأفتار/البطاقة)
    const welcome = require('../../systems/welcome');
    const targetId = settings.welcome.channelId || channelId;
    if (!targetId) return res.status(400).json({ ok: false, message: 'حدّد قناة الترحيب أولًا.' });
    const channel = await guild.channels.fetch(targetId).catch(() => null);
    if (!channel?.isTextBased?.()) return res.status(400).json({ ok: false, message: 'القناة غير صالحة.' });

    const { AttachmentBuilder } = require('discord.js');
    const { applyPlaceholders } = require('../../lib/utils');
    const member = await guild.members.fetch(req.user?.id).catch(() => null);
    const subject = member || guild.members.me;
    if (!subject) return res.status(400).json({ ok: false, message: 'تعذّر جلب بيانات العضو.' });

    const text = applyPlaceholders(settings.welcome.message, {
      user: `${subject}`,
      username: subject.user.username,
      displayName: subject.displayName,
      id: subject.id,
      avatar: subject.user.displayAvatarURL({ size: 256 }),
      server: guild.name,
      memberCount: guild.memberCount,
    });

    const files = [];
    let image = null;
    if (settings.welcome.imageMode === 'card') {
      const buffer = await welcome.previewCard(client, subject).catch(() => null);
      if (buffer) {
        files.push(new AttachmentBuilder(buffer, { name: 'welcome.png' }));
        image = 'attachment://welcome.png';
      }
    } else if (settings.welcome.imageMode === 'avatar') {
      image = subject.user.displayAvatarURL({ size: 512 });
    } else if (settings.welcome.imageMode === 'custom' && settings.welcome.imageUrl) {
      image = applyPlaceholders(settings.welcome.imageUrl, { avatar: subject.user.displayAvatarURL({ size: 512 }) });
    }

    const embeds = settings.welcome.embed
      ? [
          require('../../lib/embeds').base({
            color: 0x5865f2,
            description: text,
            image: image || undefined,
            thumbnail: settings.welcome.avatarThumbnail ? subject.user.displayAvatarURL({ size: 256 }) : undefined,
            footer: 'Never Land • رسالة اختبار',
          }),
        ]
      : [];

    await channel.send({
      content: settings.welcome.embed ? undefined : text,
      embeds,
      files,
      ...(embeds.length ? { files } : {}),
    });
    return res.json({ ok: true, message: `✅ أُرسلت رسالة ترحيب تجريبية في #${channel.name}` });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

/* ------------------------------------ فحص البوت ------------------------------------ */
/* ---------------------------- المزامنة الحقيقية ---------------------------- */

/** حالة المزامنة: آخر مزامنة، عدد السيرفرات، مصدرها، حالة البوت */
router.get('/sync/status', (_req, res) => {
  res.json(sync.getStatus());
});

/** مزامنة فورية لكل السيرفرات (يحتاج صلاحية تعديل) */
router.post('/sync', async (req, res) => {
  if (!canEdit(req)) {
    return res.status(403).json({ error: 'readonly', message: 'المزامنة اليدوية تحتاج تسجيل دخول Discord.' });
  }
  const result = await sync.syncNow({});
  res.json({ ok: Boolean(result.ok), status: result });
});

/** مزامنة سيرفر واحد */
router.post('/guilds/:guildId/sync', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'readonly' });
  const { guildId } = req.params;
  const client = safeClient();
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild) {
    sync.saveSnapshot(sync.serializeGuild(guild, sync.getSnapshot(guildId)));
  } else {
    await sync.syncNow({});
  }
  const snapshot = sync.getSnapshot(guildId);
  res.json({ ok: true, syncedAt: snapshot?.syncedAt ?? null, status: sync.getStatus() });
});

/**
 * البث الحيّ (Server-Sent Events): يحدّث الصفحة المفتوحة فورًا عند أي مزامنة.
 * يُستخدم في اللوحة ليعرض «آخر مزامنة» والقوائم الحقيقية بدون تحديث الصفحة.
 */
router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify(sync.getStatus())}\n\n`);

  const off = sync.onEvent((event, payload) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch { /* انقطع الاتصال */ }
  });

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch { /* تجاهل */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    off();
  });
});

router.get('/status', (req, res) => {
  const client = safeClient();
  res.json({
    botReady: Boolean(client?.isReady?.()),
    botsTag: client?.user?.tag ?? null,
    guilds: client?.guilds?.cache?.size ?? 0,
    commands: client?.commands?.size ?? 0,
    database: db.driverName,
    demo: config.web.demoMode,
    uptime: client ? Date.now() - client.startedAt : 0,
    sync: sync.getStatus(),
  });
});

module.exports = router;
