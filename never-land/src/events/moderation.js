'use strict';

/**
 * events/moderation.js
 * -------------------------------------------------------------
 * أحداث العقوبات: حظر / فك حظر (مع كشف المنفّذ من Audit Log)
 * وتسجيلها في سجل الحالات إن لم تكن مسجّلة.
 * -------------------------------------------------------------
 */

const { Events, AuditLogEvent } = require('discord.js');
const db = require('../database');
const logging = require('../systems/logging');
const { findExecutor } = require('../lib/audit');

module.exports = [
  {
    name: Events.GuildBanAdd,
    async execute(client, ban) {
      const guild = ban.guild;
      const { executor, reason } = await findExecutor(guild, AuditLogEvent.MemberBanAdd, { targetId: ban.user.id });

      // إذا لم يكن البوت هو المنفّذ (يعني الحظر تم من شخص آخر) سجّله كحالة
      if (executor?.id !== client.user.id) {
        db.addCase({
          guildId: guild.id,
          type: 'ban',
          userId: ban.user.id,
          userTag: ban.user.tag,
          moderatorId: executor?.id ?? client.user.id,
          moderatorTag: executor?.tag ?? 'غير معروف',
          reason: reason ?? 'بدون سبب',
        });
      }

      await logging.send(client, guild, 'memberBan', {
        title: 'حظر عضو',
        description: `${ban.user} \`${ban.user.tag}\``,
        thumbnail: ban.user.displayAvatarURL({ size: 256 }),
        fields: [
          ...(executor ? [{ name: 'بواسطة', value: `${executor}`, inline: true }] : []),
          { name: 'السبب', value: reason || 'بدون سبب', inline: true },
        ],
      });
    },
  },

  {
    name: Events.GuildBanRemove,
    async execute(client, ban) {
      const guild = ban.guild;
      const { executor } = await findExecutor(guild, AuditLogEvent.MemberBanRemove, { targetId: ban.user.id });

      await logging.send(client, guild, 'memberUnban', {
        title: 'فك حظر',
        description: `${ban.user} \`${ban.user.tag}\``,
        thumbnail: ban.user.displayAvatarURL({ size: 256 }),
        fields: [...(executor ? [{ name: 'بواسطة', value: `${executor}`, inline: true }] : [])],
      });
    },
  },
];
