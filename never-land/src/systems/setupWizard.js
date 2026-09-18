'use strict';

/**
 * systems/setupWizard.js
 * -------------------------------------------------------------
 * أمر /setup التفاعلي: يفتح لوحة تفاعلية (Select + Buttons + Modal)
 * لإعداد البوت كاملًا بدون الحاجة إلى لوحة التحكم الويب.
 * -------------------------------------------------------------
 */

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const db = require('../database');
const { base, settingsEmbed } = require('../lib/embeds');
const { t } = require('../lib/i18n');

const MODULES = [
  { id: 'welcome', label: 'الترحيب والوداع', emoji: '👋' },
  { id: 'logs', label: 'قنوات اللوقات', emoji: '📜' },
  { id: 'automod', label: 'الحماية التلقائية', emoji: '🛡️' },
  { id: 'tickets', label: 'نظام التذاكر', emoji: '🎫' },
  { id: 'leveling', label: 'المستويات والخبرة', emoji: '📈' },
  { id: 'autorole', label: 'الرتب التلقائية', emoji: '🎭' },
];

/** اللوحة الرئيسية للمعالج */
function mainPanel(settings) {
  const status = (key) => (settings[key]?.enabled ? '🟢' : '🔴');

  const embed = base({
    color: 0x5865f2,
    title: '⚙️ معالج إعداد Never Land',
    description: [
      'هذه لوحة تحكم سريعة داخل ديسكورد. اختر القسم من القائمة لضبط الإعدادات.',
      '',
      `${status('welcome')} الترحيب والوداع`,
      `${status('logs')} اللوقات`,
      `${status('automod')} الحماية التلقائية`,
      `${status('tickets')} التذاكر`,
      `${status('leveling')} المستويات`,
      `${status('autorole')} الرتب التلقائية`,
      '',
      'لإعدادات أعمق (رسائل مخصّصة، كلمات ممنوعة، مكافآت...) استخدم لوحة التحكم الويب `/dashboard`.',
    ].join('\n'),
    footer: 'Never Land • اختر قسمًا للبدء',
  });

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:module')
      .setPlaceholder('اختر القسم الذي تريد إعداده...')
      .addOptions(MODULES.map((m) => ({ label: m.label, value: m.id, emoji: m.emoji }))),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup:quick').setLabel('الإعداد السريع الموصى به').setEmoji('⚡').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('setup:view').setLabel('عرض كل الإعدادات').setEmoji('📋').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

/** لوحة قسم محدّد */
function modulePanel(moduleId, settings, guild) {
  const cfg = settings;
  const rows = [];

  if (moduleId === 'welcome') {
    rows.push(
      ['الحالة', cfg.welcome.enabled ? '🟢 مُفعّل' : '🔴 مُعطّل'],
      ['قناة الترحيب', cfg.welcome.channelId ? `<#${cfg.welcome.channelId}>` : 'غير محدّدة'],
      ['رسالة الترحيب', cfg.welcome.message?.slice(0, 80) || '—', false],
      ['ترحيب في الخاص', cfg.welcome.dm ? '🟢' : '🔴'],
      ['قناة الوداع', cfg.leave.channelId ? `<#${cfg.leave.channelId}>` : 'غير محدّدة'],
    );
  } else if (moduleId === 'logs') {
    const events = cfg.logs.events || {};
    const active = Object.entries(events).filter(([, v]) => v).map(([k]) => k);
    rows.push(
      ['الحالة', cfg.logs.enabled ? '🟢 مُفعّل' : '🔴 مُعطّل'],
      ['قناة اللوقات', cfg.logs.channelId ? `<#${cfg.logs.channelId}>` : 'غير محدّدة'],
      ['الأحداث المُفعّلة', String(active.length), false],
    );
  } else if (moduleId === 'automod') {
    rows.push(
      ['الحالة', cfg.automod.enabled ? '🟢 مُفعّل' : '🔴 مُعطّل'],
      ['مضاد السبام', cfg.automod.antiSpam ? `🟢 (${cfg.automod.spamMessages} رسائل/${cfg.automod.spamIntervalSeconds}ث)` : '🔴'],
      ['مضاد الروابط', cfg.automod.antiLink ? '🟢' : '🔴'],
      ['مضاد الدعوات', cfg.automod.antiInvite ? '🟢' : '🔴'],
      ['مضاد منشن الجميع', cfg.automod.antiEveryone ? '🟢' : '🔴'],
      ['الكلمات الممنوعة', `${(cfg.automod.bannedWords || []).length} كلمة`],
      ['العقوبة الافتراضية', cfg.automod.punishment],
    );
  } else if (moduleId === 'tickets') {
    rows.push(
      ['الحالة', cfg.tickets.enabled ? '🟢 مُفعّل' : '🔴 مُعطّل'],
      ['القسم', cfg.tickets.categoryId ? `<#${cfg.tickets.categoryId}>` : 'غير محدّد'],
      ['رتب الدعم', (cfg.tickets.supportRoleIds || []).map((r) => `<@&${r}>`).join(' ') || 'لا يوجد'],
      ['أنواع التذاكر', `${(cfg.tickets.types || []).length} نوع`],
      ['قناة السجلات', cfg.tickets.logChannelId ? `<#${cfg.tickets.logChannelId}>` : 'غير محدّدة'],
    );
  } else if (moduleId === 'leveling') {
    rows.push(
      ['الحالة', cfg.leveling.enabled ? '🟢 مُفعّل' : '🔴 مُعطّل'],
      ['الخبرة الكتابية', `كل ${cfg.leveling.textXpPerChars ?? 5} أحرف = ${cfg.leveling.textXpPerCharsAmount ?? 1} خبرة`],
      ['الخبرة الصوتية', `كل ${cfg.leveling.voiceIntervalSeconds ?? 60} ثانية = ${cfg.leveling.voiceXpPerInterval ?? 1} خبرة`],
      ['XP صوتي', cfg.leveling.voiceXp ? '🟢' : '🔴'],
      ['قناة الإعلان', cfg.leveling.announceChannelId ? `<#${cfg.leveling.announceChannelId}>` : 'غير محدّدة'],
      ['مكافآت الرتب', `${(cfg.leveling.rewards || []).length} مكافأة`],
    );
  } else if (moduleId === 'autorole') {
    rows.push(
      ['الحالة', cfg.autorole.enabled ? '🟢 مُفعّل' : '🔴 مُعطّل'],
      ['رتب الأعضاء', (cfg.autorole.roleIds || []).map((r) => `<@&${r}>`).join(' ') || 'لا يوجد'],
      ['رتب البوتات', (cfg.autorole.botRoleIds || []).map((r) => `<@&${r}>`).join(' ') || 'لا يوجد'],
    );
  }

  const embed = settingsEmbed(MODULES.find((m) => m.id === moduleId)?.label || moduleId, rows);
  const components = [moduleControls(moduleId, cfg)];
  return { embeds: [embed], components };
}

/** أزرار التحكم لكل قسم */
function moduleControls(moduleId, cfg) {
  const row = new ActionRowBuilder();
  const enabled = Boolean(cfg[moduleId]?.enabled);
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`setup:toggle:${moduleId}`)
      .setLabel(enabled ? 'تعطيل' : 'تفعيل')
      .setEmoji(enabled ? '🔴' : '🟢')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`setup:channel:${moduleId}`)
      .setLabel('تحديد القناة')
      .setEmoji('📍')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('setup:back').setLabel('رجوع').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  return row;
}

/** لوحة اختيار القناة */
function channelPanel(moduleId) {
  const embed = base({
    title: '📍 اختر القناة',
    description: `اختر القناة التي سيعمل فيها **${MODULES.find((m) => m.id === moduleId)?.label || moduleId}**.`,
    color: 0x5865f2,
  });
  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`setup:pick:${moduleId}`)
      .setPlaceholder('اختر القناة...')
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setup:open:${moduleId}`).setLabel('رجوع').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row, back] };
}

/* ============================ المعالجات ============================ */

async function handleSelect(client, interaction, lang) {
  const [scope, action] = interaction.customId.split(':');
  if (scope !== 'setup') return;

  const settings = db.getGuildSettings(interaction.guildId);

  if (action === 'module') {
    const moduleId = interaction.values[0];
    return interaction.update(modulePanel(moduleId, settings, interaction.guild));
  }

  if (action === 'pick') {
    const [, , moduleId] = interaction.customId.split(':');
    const channelId = interaction.values[0];
    const path = channelPath(moduleId);
    if (path) db.setGuildPath(interaction.guildId, path, channelId);
    const updated = db.getGuildSettings(interaction.guildId);
    return interaction.update(modulePanel(moduleId, updated, interaction.guild));
  }
}

/** مسار الإعداد المرتبط بكل قسم */
function channelPath(moduleId) {
  switch (moduleId) {
    case 'welcome': return 'welcome.channelId';
    case 'logs': return 'logs.channelId';
    case 'tickets': return 'tickets.logChannelId';
    case 'leveling': return 'leveling.announceChannelId';
    case 'automod': return null;
    case 'autorole': return null;
    default: return null;
  }
}

async function handleButton(client, interaction, action, lang) {
  const settings = db.getGuildSettings(interaction.guildId);
  const parts = interaction.customId.split(':');
  const arg = parts[2];

  switch (action) {
    case 'refresh':
    case 'back':
      return interaction.update(mainPanel(settings));

    case 'view': {
      return interaction.reply({ embeds: [fullSettingsEmbed(settings)], flags: MessageFlags.Ephemeral });
    }

    case 'dashboard':
      return interaction.reply({ content: 'رابط الموقع يطلع بكلمة **نيفر** في الشات — لأعضاء الموقع المسجّلين.', flags: MessageFlags.Ephemeral });

    case 'open':
      return interaction.update(modulePanel(arg, settings, interaction.guild));

    case 'channel':
      return interaction.update(channelPanel(arg));

    case 'toggle': {
      if (!arg) return;
      const isDev = require('../config').bot.developerIds.includes(interaction.user.id);
      const member = interaction.member ?? await interaction.guild.members.fetch(interaction.user.id);
      if (!isDev && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: t(lang, 'common.noPermission'), flags: MessageFlags.Ephemeral });
      }
      const moduleId = arg;
      const next = !settings[moduleId]?.enabled;
      db.setGuildPath(interaction.guildId, `${moduleId}.enabled`, next);
      const updated = db.getGuildSettings(interaction.guildId);
      return interaction.update(modulePanel(moduleId, updated, interaction.guild));
    }

    case 'quick': {
      // إعداد سريع: تفعيل الحماية التلقائية + اللوقات في القناة الحالية
      const member = interaction.member ?? await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: t(lang, 'common.noPermission'), flags: MessageFlags.Ephemeral });
      }

      const logsChannel = interaction.guild.channels.cache.find(
        (c) => c.isTextBased() && c.name.includes('log') || c.name.includes('سجل'),
      );

      db.updateGuildSettings(interaction.guildId, {
        automod: { enabled: true, antiSpam: true, antiInvite: true, antiEveryone: true, antiLink: false, punishment: 'delete' },
        logs: { enabled: true, channelId: logsChannel?.id ?? settings.logs.channelId ?? null },
        welcome: { enabled: true, channelId: settings.welcome.channelId ?? interaction.channelId },
      });

      return interaction.reply({
        content: '⚡ تم تطبيق الإعداد السريع: الحماية التلقائية + اللوقات + الترحيب.\nاستخدم القائمة لتخصيص كل قسم.',
        flags: MessageFlags.Ephemeral,
      });
    }

    default:
      return;
  }
}

/** عرض كل الإعدادات بشكل مختصر */
function fullSettingsEmbed(settings) {
  const onOff = (v) => (v ? '🟢' : '🔴');
  return base({
    color: 0x5865f2,
    title: '📋 إعدادات السيرفر الكاملة',
    fields: [
      { name: 'اللغة', value: settings.language === 'ar' ? 'العربية' : 'English', inline: true },
      { name: 'الترحيب', value: onOff(settings.welcome.enabled), inline: true },
      { name: 'الوداع', value: onOff(settings.leave.enabled), inline: true },
      { name: 'اللوقات', value: onOff(settings.logs.enabled), inline: true },
      { name: 'الحماية التلقائية', value: onOff(settings.automod.enabled), inline: true },
      { name: 'التذاكر', value: onOff(settings.tickets.enabled), inline: true },
      { name: 'المستويات', value: onOff(settings.leveling.enabled), inline: true },
      { name: 'الرتب التلقائية', value: onOff(settings.autorole.enabled), inline: true },
      { name: 'الدعم', value: onOff(settings.boost.enabled), inline: true },
      { name: 'قناة اللوقات', value: settings.logs.channelId ? `<#${settings.logs.channelId}>` : '—', inline: true },
      { name: 'قناة الترحيب', value: settings.welcome.channelId ? `<#${settings.welcome.channelId}>` : '—', inline: true },
      { name: 'الرتب التلقائية', value: (settings.autorole.roleIds || []).map((r) => `<@&${r}>`).join(' ') || '—', inline: false },
    ],
    footer: 'Never Land',
  });
}

module.exports = { mainPanel, modulePanel, channelPanel, handleSelect, handleButton, fullSettingsEmbed, MODULES };
