'use strict';

/**
 * events/assets.js
 * -------------------------------------------------------------
 * لوقات: الإيموجيات، الملصقات، الدعوات، المواضيع (Threads).
 * أنماط مخصّصة مع الإضافات اللازمة.
 * -------------------------------------------------------------
 */

const { Events, AuditLogEvent } = require('discord.js');
const logging = require('../systems/logging');
const { findExecutor } = require('../lib/audit');

module.exports = [
  /* ------------------------------ الإيموجيات ------------------------------ */
  {
    name: Events.GuildEmojiCreate,
    async execute(client, emoji) {
      await logging.send(client, emoji.guild, 'emojiCreate', {
        title: 'إضافة إيموجي جديد',
        description: `${emoji} \`:${emoji.name}:\``,
        thumbnail: emoji.imageURL(),
        fields: [
          { name: 'الاسم', value: `\`${emoji.name}\``, inline: true },
          { name: 'متحرّك؟', value: emoji.animated ? 'نعم 🎞️' : 'لا', inline: true },
        ],
      });
    },
  },
  {
    name: Events.GuildEmojiDelete,
    async execute(client, emoji) {
      const { executor } = await findExecutor(emoji.guild, AuditLogEvent.EmojiDelete, { maxAgeMs: 6000 }).catch(() => ({}));
      await logging.send(client, emoji.guild, 'emojiDelete', {
        title: 'حذف إيموجي',
        thumbnail: emoji.imageURL(),
        fields: [
          { name: 'الاسم', value: `\`:${emoji.name}:\``, inline: true },
          ...(executor ? [{ name: 'بواسطة', value: `${executor}`, inline: true }] : []),
        ],
      });
    },
  },
  {
    name: Events.GuildEmojiUpdate,
    async execute(client, oldEmoji, newEmoji) {
      if (oldEmoji.name === newEmoji.name) return;
      await logging.send(client, newEmoji.guild, 'emojiCreate', {
        title: 'تعديل إيموجي',
        description: `${newEmoji}`,
        fields: [
          { name: 'قبل', value: `\`:${oldEmoji.name}:\``, inline: true },
          { name: 'بعد', value: `\`:${newEmoji.name}:\``, inline: true },
        ],
      });
    },
  },

  /* ------------------------------ الملصقات ------------------------------ */
  {
    name: Events.GuildStickerCreate,
    async execute(client, sticker) {
      await logging.send(client, sticker.guild, 'stickerCreate', {
        title: 'إضافة ملصق جديد',
        description: `**${sticker.name}**${sticker.description ? ` — ${sticker.description}` : ''}`,
        thumbnail: sticker.url ?? null,
      });
    },
  },
  {
    name: Events.GuildStickerDelete,
    async execute(client, sticker) {
      await logging.send(client, sticker.guild, 'stickerDelete', {
        title: 'حذف ملصق',
        description: `**${sticker.name}**`,
        thumbnail: sticker.url ?? null,
      });
    },
  },

  /* ------------------------------ الدعوات ------------------------------ */
  {
    name: Events.InviteCreate,
    async execute(client, invite) {
      const cached = client.invites.get(invite.guild?.id) ?? new Map();
      cached.set(invite.code, invite.uses ?? 0);
      client.invites.set(invite.guild?.id, cached);

      await logging.send(client, invite.guild, 'inviteCreate', {
        title: 'إنشاء دعوة',
        fields: [
          { name: 'الكود', value: `\`${invite.code}\``, inline: true },
          { name: 'بواسطة', value: `${invite.inviter ?? 'غير معروف'}`, inline: true },
          { name: 'القناة', value: invite.channel ? `<#${invite.channel.id}>` : '—', inline: true },
          { name: 'الاستخدامات', value: `${invite.uses ?? 0} / ${invite.maxUses || '∞'}`, inline: true },
          { name: 'تنتهي', value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'أبدًا', inline: true },
        ],
      });
    },
  },
  {
    name: Events.InviteDelete,
    async execute(client, invite) {
      const cached = client.invites.get(invite.guild?.id) ?? new Map();
      cached.delete(invite.code);
      client.invites.set(invite.guild?.id, cached);

      await logging.send(client, invite.guild, 'inviteDelete', {
        title: 'حذف/انتهاء دعوة',
        fields: [
          { name: 'الكود', value: `\`${invite.code}\``, inline: true },
          { name: 'القناة', value: invite.channel ? `<#${invite.channel.id}>` : '—', inline: true },
        ],
      });
    },
  },

  /* ------------------------------ المواضيع ------------------------------ */
  {
    name: Events.ThreadCreate,
    async execute(client, thread, newlyCreated) {
      if (!newlyCreated) return;
      await logging.send(client, thread.guild, 'threadCreate', {
        title: 'إنشاء موضوع (Thread)',
        fields: [
          { name: 'الاسم', value: `${thread} \`${thread.name}\``, inline: true },
          { name: 'القناة الأم', value: thread.parent ? `<#${thread.parent.id}>` : '—', inline: true },
          { name: 'أنشأه', value: thread.ownerId ? `<@${thread.ownerId}>` : '—', inline: true },
        ],
      });
    },
  },
  {
    name: Events.ThreadDelete,
    async execute(client, thread) {
      await logging.send(client, thread.guild, 'threadDelete', {
        title: 'حذف موضوع (Thread)',
        fields: [
          { name: 'الاسم', value: `\`${thread.name}\``, inline: true },
          { name: 'القناة الأم', value: thread.parent ? `<#${thread.parent.id}>` : '—', inline: true },
        ],
      });
    },
  },

  /* --------------------------- تحديث السيرفر --------------------------- */
  {
    name: Events.GuildUpdate,
    async execute(client, oldGuild, newGuild) {
      const changes = [];
      if (oldGuild.name !== newGuild.name) changes.push({ name: 'الاسم', value: `${oldGuild.name} ➜ ${newGuild.name}`, inline: false });
      if (oldGuild.icon !== newGuild.icon) changes.push({ name: 'الأيقونة', value: 'تم تغيير أيقونة السيرفر', inline: true });
      if (oldGuild.banner !== newGuild.banner) changes.push({ name: 'البانر', value: 'تم تغيير بانر السيرفر', inline: true });
      if (oldGuild.ownerId !== newGuild.ownerId) changes.push({ name: 'المالك', value: `<@${oldGuild.ownerId}> ➜ <@${newGuild.ownerId}>`, inline: false });
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.push({ name: 'مستوى التحقق', value: `${oldGuild.verificationLevel} ➜ ${newGuild.verificationLevel}`, inline: true });
      }
      if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        changes.push({ name: 'الرابط المخصّص', value: `discord.gg/${oldGuild.vanityURLCode ?? '—'} ➜ discord.gg/${newGuild.vanityURLCode ?? '—'}`, inline: false });
      }
      if (!changes.length) return;

      await logging.send(client, newGuild, 'serverUpdate', {
        title: 'تحديث إعدادات السيرفر',
        fields: changes,
      });
    },
  },
];
