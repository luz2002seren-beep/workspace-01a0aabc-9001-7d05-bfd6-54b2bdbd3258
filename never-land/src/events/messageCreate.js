'use strict';

/**
 * events/messageCreate.js
 * -------------------------------------------------------------
 * نقطة مرور كل رسالة، بالترتيب:
 *   1) الحماية التلقائية (Automod) — إن تعاملت مع الرسالة نتوقف
 *   2) الخط الفاصل التلقائي (AutoLine)
 *   3) التفاعلات التلقائية (AutoReaction)
 *   4) الأوامر النصية بلا بريفيكست (TextCommands) — إن تعاملت مع الرسالة نتوقف
 *   5) الردود التلقائية (AutoReply) — رد على كلمة مفتاحية في أي روم
 *   6) اقتراح الأوامر المشابهة («هل تقصد؟» — طير · اسكت · bann …)
 *   7) نظام الخبرة (Leveling)
 * -------------------------------------------------------------
 */

const { Events } = require('discord.js');
const { isStaff } = require('../lib/permissions');
const automod = require('../systems/automod');
const autoline = require('../systems/autoline');
const autoreact = require('../systems/autoreact');
const autoreply = require('../systems/autoreply');
const textCommands = require('../systems/textCommands');
const suggestions = require('../systems/suggestions');
const leveling = require('../systems/leveling');

module.exports = {
  name: Events.MessageCreate,

  async execute(client, message) {
    if (!message.guild || message.author?.bot) return;

    // 1) الحماية التلقائية
    const handled = await automod.handleMessage(client, message);
    if (handled) return;

    // 2) الخط الفاصل التلقائي
    await autoline.handleMessage(client, message);

    // 3) التفاعلات التلقائية
    await autoreact.handleMessage(client, message);

    // 4) الأوامر النصية بلا بريفيكست (ban · help · top …)
    const usedCommand = await textCommands.handleMessage(client, message);
    if (usedCommand) return;

    // 5) الردود التلقائية
    await autoreply.handleMessage(client, message);

    // 6) اقتراح الأوامر المشابهة: «هل تقصد؟» — للأعضاء بأوامرهم، وللإدارة بكل الأوامر
    const settings = require('../database').getGuildSettings(message.guild.id);
    const staff = isStaff(message.member);
    const suggested = await suggestions.handleMessage(client, message, {
      staff,
      enabled: textCommands.configFor(message.guild.id).suggest && settings.general?.suggestCommands !== false,
    });
    if (suggested) return;

    // 7) الخبرة
    await leveling.handleMessage(client, message);
  },
};
