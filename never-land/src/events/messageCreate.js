'use strict';

/**
 * events/messageCreate.js
 * -------------------------------------------------------------
 * نقطة مرور كل رسالة، بالترتيب:
 *   1) الحماية التلقائية (Automod) — إن تعاملت مع الرسالة نتوقف
 *   2) الخط الفاصل التلقائي (AutoLine)
 *   3) التفاعلات التلقائية (AutoReaction)
 *   4) نظام الخبرة (Leveling)
 * -------------------------------------------------------------
 */

const { Events } = require('discord.js');
const automod = require('../systems/automod');
const autoline = require('../systems/autoline');
const autoreact = require('../systems/autoreact');
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

    // 4) الخبرة
    await leveling.handleMessage(client, message);
  },
};
