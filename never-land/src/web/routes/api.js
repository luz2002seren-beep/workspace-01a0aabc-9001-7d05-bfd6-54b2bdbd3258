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
const access = require('../access');
const config = require('../../config');
const db = require('../../database');
const { mergeSettings } = require('../../database/defaults');

const router = express.Router();

/** العضو المسجّل حاليًا (أو مستخدم المعاينة) */
function currentUser(req) {
  if (config.web.demoMode) {
    return { id: '0', username: 'المسؤول', globalName: 'مسؤول السيرفر', demo: true };
  }
  return req.session.user || null;
}

/** سيرفرات المستخدم المتاحة في اللوحة */
function availableGuilds(req) {
  const client = safeClient();
  if (config.web.demoMode) return require('../demo').DEMO_META.guilds;
  if (!req.session.guilds) return [];

  const botGuildIds = client?.isReady?.() ? new Set(client.guilds.cache.keys()) : null;
  return req.session.guilds.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    owner: Boolean(g.owner),
    memberCount: client?.guilds?.cache?.get(g.id)?.memberCount ?? null,
    botPresent: botGuildIds ? botGuildIds.has(g.id) : null,
  }));
}

function safeClient() {
  try {
    const client = require('../../client');
    return client;
  } catch {
    return null;
  }
}

/** هل المستخدم يملك صلاحية الوصول لهذا السيرفر؟ */
function canAccess(req, guildId) {
  if (config.web.demoMode) return true;
  if (req.session.user) {
    if (config.bot.developerIds.includes(req.session.user.id)) return true;
    return (req.session.guilds || []).some((g) => g.id === guildId);
  }
  // زائر (عرض عام): قراءة فقط لسيرفر مُدرَج فيه البوت
  if (config.web.publicAccess && req.method === 'GET') {
    try {
      const client = require('../../client');
      return Boolean(client?.guilds?.cache?.has?.(guildId));
    } catch {
      return false;
    }
  }
  return false;
}

/** هل يملك المشاهد صلاحية التعديل؟ */
function canEdit(req) {
  if (config.web.demoMode) return true;
  return Boolean(req.roleOk);
}

/**
 * حماية مسارات /api:
 *  - القراءة (GET) متاحة للجميع عند تفعيل الوصول العام
 *  - الكتابة (POST/PATCH/DELETE) تحتاج تسجيل دخول Discord
 */
router.use(async (req, res, next) => {
  if (config.web.demoMode) {
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
router.get('/me', (req, res) => {
  res.json({
    user: currentUser(req),
    guilds: availableGuilds(req),
    demo: config.web.demoMode,
    loginRequired: config.web.loginRequired,
    requiredRoleId: config.web.requiredRoleId || null,
    roleOk: config.web.demoMode ? true : Boolean(req.roleOk),
  });
});

router.get('/guilds', (req, res) => {
  res.json({ guilds: availableGuilds(req) });
});

/* ------------------------------------ بيانات سيرفر ------------------------------------ */
router.get('/guilds/:guildId', (req, res) => {
  const { guildId } = req.params;
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

  const guild = db.getGuild(guildId);
  const stats = db.getStats(guildId);
  const client = safeClient();
  const discordGuild = client?.guilds?.cache?.get(guildId);

  // الميتاداتا (قنوات/رتب) للقوائم المنسدلة
  const channels = discordGuild
    ? [...discordGuild.channels.cache.values()]
        .filter((c) => c.type === 0 || c.type === 2 || c.type === 4 || c.type === 15)
        .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null }))
        .sort((a, b) => a.type - b.type || String(a.name).localeCompare(String(b.name), 'ar'))
    : [];

  const roles = discordGuild
    ? [...discordGuild.roles.cache.values()]
        .filter((r) => r.id !== discordGuild.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
    : [];

  const loggingSystem = require('../../systems/logging');

  return res.json({
    guild: {
      id: guildId,
      name: discordGuild?.name ?? (config.web.demoMode ? 'مجتمع Never Land' : guildId),
      icon: discordGuild?.icon ?? null,
      memberCount: discordGuild?.memberCount ?? (config.web.demoMode ? 4820 : null),
      ownerId: discordGuild?.ownerId ?? null,
      botPresent: Boolean(discordGuild) || config.web.demoMode,
      botOnline: Boolean(client?.isReady?.()),
      createdAt: discordGuild?.createdTimestamp ?? null,
    },
    settings: guild.settings,
    stats: { ...stats, discordMembers: discordGuild?.memberCount ?? null, botReady: Boolean(client?.isReady?.()) },
    daily: db.getDailyStats(guildId, 14),
    meta: {
      channels,
      roles,
      members: discordGuild ? discordGuild.members.cache.size : 0,
      emojis: discordGuild
        ? [...discordGuild.emojis.cache.values()].slice(0, 100).map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: e.imageURL?.() ?? null }))
        : [],
      logGroups: loggingSystem.EVENT_GROUPS,
      logEvents: Object.fromEntries(Object.entries(loggingSystem.EVENT_META).map(([key, meta]) => [key, { label: meta.label, emoji: meta.emoji, group: meta.group }])),
      cardAvailable: require('../../lib/welcomeCard').available(),
    },
    viewer: {
      canEdit: canEdit(req),
      loggedIn: Boolean(req.session.user) || config.web.demoMode,
      demo: config.web.demoMode,
      publicAccess: config.web.publicAccess,
      loginRequired: config.web.loginRequired,
      requiredRoleId: config.web.requiredRoleId || null,
      roleReason: req.roleResult?.reason || null,
      roleMessage: req.roleResult && !req.roleResult.ok ? access.explain(req.roleResult) : null,
    },
  });
});

router.post('/guilds/:guildId/settings', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'readonly', message: 'هذا الإجراء يحتاج تسجيل دخول Discord.' });

  const { guildId } = req.params;
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

  const patch = req.body;
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'bad_request', message: 'لا توجد بيانات للحفظ' });

  const guild = db.getGuild(guildId);
  const merged = mergeSettings(guild.settings, patch);
  db.updateGuildSettings(guildId, merged);

  return res.json({ ok: true, settings: db.getGuild(guildId).settings, savedAt: Date.now() });
});

/* ------------------------------------ السجلات والتذاكر والمستويات ------------------------------------ */
router.get('/guilds/:guildId/cases', (req, res) => {
  const { guildId } = req.params;
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

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

router.get('/guilds/:guildId/tickets', (req, res) => {
  const { guildId } = req.params;
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

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
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

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

router.get('/guilds/:guildId/levels', (req, res) => {
  const { guildId } = req.params;
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Number(req.query.perPage) || 20);
  const client = safeClient();
  const rows = db.getLeaderboard(guildId, perPage, (page - 1) * perPage);

  const items = rows.map((row) => {
    const member = client?.guilds?.cache?.get(guildId)?.members?.cache?.get(row.user_id);
    return {
      ...row,
      username: member?.user?.username ?? null,
      displayName: member?.displayName ?? null,
      avatar: member?.user?.displayAvatarURL?.({ size: 64 }) ?? null,
    };
  });

  return res.json({ items, total: db.countTrackedMembers(guildId) });
});

/** تحويل قائمة آيديات إلى بيانات أعضاء (لجداول اللوحة) */
router.get('/guilds/:guildId/members', async (req, res) => {
  const { guildId } = req.params;
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

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
    return res.json({ members: ids.map((id) => ({ id, username: null, displayName: null, avatar: null })) });
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
        : { id, username: null, displayName: null, avatar: null },
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
  if (!canAccess(req, guildId)) return res.status(403).json({ error: 'forbidden' });

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
  });
});

module.exports = router;
