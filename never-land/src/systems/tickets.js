'use strict';

/**
 * systems/tickets.js
 * -------------------------------------------------------------
 * نظام التذاكر:
 *   • 4 أنواع افتراضية: الدعم الفني • التوثيق • الهدايا • تقديم إدارة
 *   • لوحة بنل بوضعين: أزرار (Buttons) أو قائمة منسدلة (Select)
 *   • دعم الإيموجيات الخارجية في اللوحة والأزرار والرسائل
 *   • رسالة تعليمات منفصلة مع البنل
 *   • رسالة ترحيب داخل التذكرة + أزرار تحكّم (استلام/إغلاق/أرشيف)
 * -------------------------------------------------------------
 */

const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const db = require('../database');
const { base } = require('../lib/embeds');
const { t } = require('../lib/i18n');
const { parseEmoji, customEmojiUrl } = require('../lib/emojis');

const BUTTON_STYLES = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

/** إيموجي النوع جاهزًا للأزرار/القوائم (يدعم الخارجي) */
const typeEmoji = (type) => parseEmoji(type?.emoji) ?? undefined;

/** أزرار فتح التذاكر حسب الأنواع */
function buildTypeButtons(types) {
  const rows = [];
  let row = new ActionRowBuilder();
  types.slice(0, 25).forEach((type, index) => {
    if (index > 0 && index % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    const button = new ButtonBuilder()
      .setCustomId(`ticket:open:${type.id}`)
      .setLabel(String(type.label).slice(0, 80))
      .setStyle(BUTTON_STYLES[type.buttonStyle] ?? ButtonStyle.Primary);
    const emoji = typeEmoji(type);
    if (emoji) button.setEmoji(emoji);
    row.addComponents(button);
  });
  if (row.components.length) rows.push(row);
  return rows;
}

/** قائمة منسدلة لفتح التذاكر */
function buildTypeSelect(types) {
  const options = types.slice(0, 25).map((type) => ({
    label: String(type.label).slice(0, 100),
    value: String(type.id).slice(0, 100),
    description: type.description ? String(type.description).slice(0, 100) : undefined,
    emoji: typeEmoji(type),
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket:open')
      .setPlaceholder('اختر نوع التذكرة لفتحها...')
      .addOptions(options.length ? options : [{ label: 'الدعم الفني', value: 'support' }]),
  );
}

/**
 * بناء رسائل لوحة التذاكر (رسالة تعليمات + رسالة البنل).
 * @returns {Array<object>} مصفوفة payloads جاهزة للإرسال
 */
function buildPanelPayloads(settings, guild, client = null) {
  const cfg = settings.tickets;
  const types = cfg.types || [];

  const embed = base({
    color: 0x5865f2,
    title: cfg.panelTitle || '🎫 مركز الدعم',
    description: cfg.panelDescription || 'اختر نوع التذكرة بالأسفل وسيُفتح لك روم خاص مع فريق الدعم.',
    thumbnail: customEmojiUrl(types[0]?.emoji) ?? (guild?.iconURL?.({ size: 256 }) ?? null),
    fields: types.slice(0, 4).map((type) => ({
      name: `${type.emoji || '🎫'} ${type.label}`,
      value: type.description || '—',
      inline: true,
    })),
    footer: cfg.panelFooter || 'Never Land • نظام التذاكر',
  });

  const components = cfg.panelMode === 'select' ? [buildTypeSelect(types)] : buildTypeButtons(types);

  const payloads = [];
  if (cfg.panelSeparateInfo) {
    payloads.push({
      content: cfg.panelInfoMessage || '**كيف أحصل على الدعم؟**\nاضغط الزر المناسب لنوع طلبك 👇',
      allowedMentions: { parse: [] },
    });
  }
  payloads.push({ embeds: [embed], components });
  return payloads;
}

/** لوحة بسيطة (توافق مع الاستخدام القديم) */
function buildPanel(settings, guild) {
  const payloads = buildPanelPayloads(settings, guild);
  return payloads[payloads.length - 1];
}

/** أزرار التحكم داخل غرفة التذكرة */
function ticketControls(ticketId, claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel(claimed ? 'مستلَمة' : 'استلام').setEmoji('🙋').setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(claimed),
    new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket:transcript:${ticketId}`).setLabel('أرشيف').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:addmember:${ticketId}`).setLabel('إضافة عضو').setEmoji('➕').setStyle(ButtonStyle.Secondary),
  );
}

/**
 * إنشاء تذكرة جديدة.
 * @returns {Promise<{ok:boolean, reason?:string, ticket?:object, channel?:object}>}
 */
async function createTicket(client, guild, user, typeId) {
  const settings = db.getGuildSettings(guild.id);
  const cfg = settings.tickets;
  const lang = settings.language || 'ar';

  if (!cfg?.enabled) return { ok: false, reason: 'disabled' };
  if (!cfg.categoryId) return { ok: false, reason: 'noCategory' };

  const type = (cfg.types || []).find((ty) => ty.id === typeId) || { id: typeId, label: typeId, emoji: '🎫' };

  const { items: open } = db.listTickets({ guildId: guild.id, userId: user.id, status: 'open', limit: 10 });
  const maxOpen = Math.max(1, cfg.maxOpenPerUser || 3);
  if (open.length >= maxOpen) {
    return { ok: false, reason: 'maxOpen', max: maxOpen, channelId: open[0]?.channel_id };
  }
  const sameType = open.find((tk) => tk.type === typeId);

  const category = guild.channels.cache.get(cfg.categoryId);
  const supportRoles = [...new Set([...(cfg.supportRoleIds || []), ...(type.supportRoleIds || [])])];

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.MentionEveryone,
      ],
    },
    ...supportRoles.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  const channel = await guild.channels
    .create({
      name: `${type.emoji?.match(/^\p{Emoji}/u) ? '' : ''}${type.id}-${user.username}`.slice(0, 100).toLowerCase(),
      type: ChannelType.GuildText,
      parent: category || undefined,
      topic: `تذكرة ${type.label} — ${user.tag} (${user.id})`,
      permissionOverwrites: overwrites,
      reason: `تذكرة ${type.label} بواسطة ${user.tag}`,
    })
    .catch((err) => {
   console.error('[تنبيه] فشل إنشاء قناة التذكرة:', err.message);
      return null;
    });

  if (!channel) return { ok: false, reason: 'createFailed' };

  const ticket = db.createTicket({ guildId: guild.id, channelId: channel.id, userId: user.id, type: typeId });

  const mentions = [...supportRoles.map((r) => `<@&${r}>`), `<@${user.id}>`].join(' ');
  await channel
    .send({
      content: mentions,
      embeds: [
        base({
          color: 0x5865f2,
          title: `${type.emoji || '🎫'} تذكرة رقم #${ticket.id} — ${type.label}`,
          description: `${t(lang, 'tickets.intro', { user: `<@${user.id}>`, type: type.label })}\n\n${type.intro || ''}`.trim(),
          fields: [
            { name: 'صاحب التذكرة', value: `<@${user.id}>`, inline: true },
            { name: 'النوع', value: type.label, inline: true },
            { name: 'الحالة', value: '🟢 مفتوحة', inline: true },
          ],
          footer: `Never Land • تذكرة #${ticket.id}`,
        }),
      ],
      components: [ticketControls(ticket.id)],
    })
    .catch(() => {});

  // 📝 تذاكر تقديم الإدارة: يُرسل البوت رسالة فيها زر يفتح النموذج (5 خانات)
  const applications = require('./applications');
  let applicationSent = false;
  if (applications.isApplicationType(settings, type)) {
    applicationSent = Boolean(await applications.sendFormMessage(client, channel, ticket));
  }

  db.updateGuildSettings(guild.id, {});

  return { ok: true, ticket, channel, duplicateType: Boolean(sameType), applicationSent, type };
}

/** إغلاق تذكرة مع حفظ أرشيف نصي */
async function closeTicket(client, channel, closedBy, { reason = null, deleteChannel = true } = {}) {
  const ticket = db.getTicketByChannel(channel.id);
  if (!ticket) return { ok: false, reason: 'notATicket' };

  const guild = channel.guild;
  const settings = db.getGuildSettings(guild.id);
  const lang = settings.language || 'ar';

  let transcriptFile = null;
  try {
    const messages = [];
    let lastId = null;
    for (let i = 0; i < 5; i += 1) {
      const batch = await channel.messages.fetch({ limit: 100, before: lastId });
      if (!batch.size) break;
      messages.push(...batch.values());
      lastId = batch.last().id;
      if (batch.size < 100) break;
    }
    messages.reverse();
    const logging = require('./logging');
    const text = logging.buildTranscript(messages, ticket);
    transcriptFile = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `ticket-${ticket.id}.txt` });
  } catch (err) {
  console.error('[تنبيه] فشل بناء الأرشيف:', err.message);
  }

  const embed = base({
    color: 0xed4245,
    title: `🔒 إغلاق التذكرة #${ticket.id}`,
    description: t(lang, 'tickets.closed', { user: `${closedBy}` }),
    fields: [
      { name: 'صاحب التذكرة', value: `<@${ticket.user_id}>`, inline: true },
      { name: 'أُغلقت بواسطة', value: `${closedBy}`, inline: true },
      ...(reason ? [{ name: 'السبب', value: reason, inline: false }] : []),
    ],
  });

  if (settings.tickets?.logChannelId) {
    const logChannel = guild.channels.cache.get(settings.tickets.logChannelId);
    if (logChannel?.isTextBased?.()) {
      await logChannel.send({ embeds: [embed], files: transcriptFile ? [transcriptFile] : [] }).catch(() => {});
    }
  }

  await channel.send({ embeds: [embed] }).catch(() => {});

  const owner = await guild.members.fetch(ticket.user_id).catch(() => null);
  if (owner) await owner.send({ embeds: [embed] }).catch(() => {});

  db.updateTicket(ticket.id, { status: 'closed', closed_at: Date.now() });

  if (deleteChannel) {
    setTimeout(() => channel.delete(`إغلاق التذكرة #${ticket.id}`).catch(() => {}), 5000);
  }
  return { ok: true, ticket };
}

/** بناء الأرشيف عند الطلب */
async function buildArchive(channel) {
  const ticket = db.getTicketByChannel(channel.id);
  if (!ticket) return null;
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return null;
  const logging = require('./logging');
  const text = logging.buildTranscript([...messages.values()].reverse(), ticket);
  return new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `ticket-${ticket.id}.txt` });
}

module.exports = {
  buildPanel,
  buildPanelPayloads,
  buildTypeButtons,
  buildTypeSelect,
  ticketControls,
  createTicket,
  closeTicket,
  buildArchive,
  typeEmoji,
};
