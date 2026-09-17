'use strict';

/**
 * events/reactions.js
 * -------------------------------------------------------------
 * خبرة التفاعل (XP بحسب التفاعل):
 * كل ما يتفاعل عضو مع رسالة عضو ثاني، صاحب الرسالة ياخذ خبرة تفاعل —
 * مع حمايات كاملة (بلا بوتات، بلا تفاعل على نفسك، سقوف يومية).
 * -------------------------------------------------------------
 */

const { Events } = require('discord.js');
const leveling = require('../systems/leveling');

module.exports = [
  {
    name: Events.MessageReactionAdd,
    async execute(client, reaction, user) {
      // نترك البوتات والرسائل الخاصة
      if (user?.bot) return;
      if (!reaction?.message) return;
      await leveling.handleReaction(client, reaction, user).catch(() => {});
    },
  },
];
