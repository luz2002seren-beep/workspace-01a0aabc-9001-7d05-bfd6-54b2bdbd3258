'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const actions = require('../../lib/modActions');
const embeds = require('../../lib/embeds');
const db = require('../../database');
const { t } = require('../../lib/i18n');

module.exports = {
  cooldown: 3,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('فك الحظر عن عضو باستخدام الآيدي أو اسم المستخدم')
    .addStringOption((o) => o.setName('العضو').setDescription('آيدي العضو أو اسمه الكامل (مثال: name#0000)').setRequired(true))
    .addStringOption((o) => o.setName('السبب').setDescription('سبب فك الحظر').setRequired(false)),

  async run(client, interaction, lang) {
    await interaction.deferReply();
    const input = interaction.options.getString('العضو').trim();
    const reason = interaction.options.getString('السبب') || 'بدون سبب';

    // إيجاد العضو من قائمة المحظورين
    const bans = await interaction.guild.bans.fetch().catch(() => null);
    if (!bans) {
      return interaction.editReply({ embeds: [embeds.error(t(lang, 'common.error'), '❌ ما قدرت أجيب قائمة المحظورين، تأكد من صلاحيات البوت.')] });
    }

    const entry = bans.find((b) => b.user.id === input || b.user.tag === input || b.user.username === input);
    if (!entry) {
      return interaction.editReply({ embeds: [embeds.error(t(lang, 'common.error'), '❌ هذا العضو غير موجود في قائمة المحظورين.')] });
    }

    const result = await actions.unban(client, {
      guild: interaction.guild,
      executor: interaction.user,
      userId: entry.user.id,
      reason,
    });

    if (!result.ok) {
      return interaction.editReply({ embeds: [embeds.error(t(lang, 'common.error'), actions.failure(lang, result.reason))] });
    }

    await interaction.editReply({
      embeds: [
        embeds.success(t(lang, 'mod.unbanned', { user: entry.user.tag }), `**السبب:** ${reason}`, {
          fields: [
            { name: t(lang, 'common.case'), value: `#${result.caseId}`, inline: true },
            { name: 'الإداري', value: `${interaction.user}`, inline: true },
          ],
        }),
      ],
    });
    db.updateGuildSettings(interaction.guildId, {});
  },
};
