'use strict';

/**
 * events/misc.js
 * -------------------------------------------------------------
 * أحداث متنوّعة: الصوت، الدعوات، دخول/خروج البوت من السيرفرات، الأخطاء.
 * -------------------------------------------------------------
 */

const { Events } = require('discord.js');
const logging = require('../systems/logging');
const db = require('../database');
const { base } = require('../lib/embeds');

module.exports = [
  /* ------------------------------- الصوت ------------------------------- */
  {
    name: Events.VoiceStateUpdate,
    async execute(client, oldState, newState) {
      const guild = newState.guild ?? oldState.guild;
      if (!guild) return;

      if (!oldState.channelId && newState.channelId) {
        await logging.send(client, guild, 'voiceJoin', {
          title: 'دخول قناة صوتية',
          fields: [
            { name: 'العضو', value: `${newState.member}`, inline: true },
            { name: 'القناة', value: `<#${newState.channelId}>`, inline: true },
          ],
        });
      } else if (oldState.channelId && !newState.channelId) {
        await logging.send(client, guild, 'voiceLeave', {
          title: 'خروج من قناة صوتية',
          fields: [
            { name: 'العضو', value: `${oldState.member}`, inline: true },
            { name: 'القناة', value: `<#${oldState.channelId}>`, inline: true },
          ],
        });
      } else if (oldState.channelId === newState.channelId && oldState.channelId) {
        // كتم / إصمام
        if (!oldState.serverMute && newState.serverMute) {
          await logging.send(client, guild, 'voiceMute', { title: 'كتم صوتي (Mute)', fields: [{ name: 'العضو', value: `${newState.member}`, inline: true }, { name: 'القناة', value: `<#${newState.channelId}>`, inline: true }] });
        } else if (oldState.serverMute && !newState.serverMute) {
          await logging.send(client, guild, 'voiceMute', { title: 'إلغاء الكتم', fields: [{ name: 'العضو', value: `${newState.member}`, inline: true }] });
        }
        if (!oldState.serverDeaf && newState.serverDeaf) {
          await logging.send(client, guild, 'voiceDeafen', { title: 'إصمام صوتي (Deafen)', fields: [{ name: 'العضو', value: `${newState.member}`, inline: true }, { name: 'القناة', value: `<#${newState.channelId}>`, inline: true }] });
        } else if (oldState.serverDeaf && !newState.serverDeaf) {
          await logging.send(client, guild, 'voiceDeafen', { title: 'إلغاء الإصمام', fields: [{ name: 'العضو', value: `${newState.member}`, inline: true }] });
        }
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        await logging.send(client, guild, 'voiceMove', {
          title: 'تنقّل بين قنوات صوتية',
          fields: [
            { name: 'العضو', value: `${newState.member}`, inline: true },
            { name: 'من', value: `<#${oldState.channelId}>`, inline: true },
            { name: 'إلى', value: `<#${newState.channelId}>`, inline: true },
          ],
        });
      }
    },
  },

  /* ---------------------- دخول/خروج البوت من سيرفر ---------------------- */
  {
    name: Events.GuildCreate,
    async execute(client, guild) {
      db.init();
      db.getGuild(guild.id);
   console.log(`[إضافة] انضم البوت إلى سيرفر جديد: ${guild.name} (${guild.memberCount} عضو)`);

      // رسالة ترحيب لصاحب السيرفر مع خطوات الإعداد
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner
          .send({
            embeds: [
              base({
                color: 0x57f287,
                title: 'شكراً لإضافة Never Land 🎉',
                description: [
                  'لبدء الاستخدام في 3 خطوات:',
                  '1️⃣ تأكد أن رتبة البوت هي الأعلى في قائمة الرتب.',
                  '2️⃣ شغّل أمر `/setup` لعمل إعداد سريع.',
                  '3️⃣ افتح لوحة التحكم للتحكم الكامل بالبوت والإعدادات.',
                  '',
                  'أوامر مهمة: `/help` • `/automod` • `/tickets` • `/logs` • `/dashboard`',
                ].join('\n'),
                thumbnail: client.user.displayAvatarURL({ size: 256 }),
              }),
            ],
          })
          .catch(() => {});
      }
    },
  },
  {
    name: Events.GuildDelete,
    async execute(client, guild) {
   console.log(`[إزالة] خرج البوت من سيرفر: ${guild.name}`);
      // لا نحذف الإعدادات تلقائيًا حتى لا يفقد السيرفر إعداده عند إعادة الإضافة
      db.getGuild(guild.id);
    },
  },

  /* ------------------------------- الأخطاء ------------------------------- */
  {
    name: Events.Error,
    async execute(client, error) {
      client.errorCount += 1;
   console.error('[خطأ] خطأ في عميل ديسكورد:', error?.message || error);
    },
  },
  {
    name: Events.Warn,
    async execute(client, info) {
   console.warn('[تنبيه] تحذير من ديسكورد:', info);
    },
  },
];
