'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const actions = require('../../lib/modActions');
const embeds = require('../../lib/embeds');
const { t } = require('../../lib/i18n');

module.exports = {
  cooldown: 3,
  permissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد عضو من السيرفر')
    .addUserOption((o) => o.setName('العضو').setDescription('العضو المطلوب طرده').setRequired(true))
    .addStringOption((o) => o.setName('السبب').setDescription('سبب الطرد').setRequired(false).setMaxLength(400)),

  async run(client, interaction, lang) {
    await interaction.deferReply();
    const user = interaction.options.getUser('العضو');
    const reason = interaction.options.getString('السبب') || t(lang, 'common.reasonNone');

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.editReply({ embeds: [embeds.error(t(lang, 'common.error'), t(lang, 'common.userNotFound'))] });
    }

    const result = await actions.kick(client, {
      guild: interaction.guild,
      executor: interaction.user,
      target: member,
      reason,
      lang,
    });

    if (!result.ok) {
      return interaction.editReply({ embeds: [embeds.error(t(lang, 'common.error'), actions.failure(lang, result.reason))] });
    }

    await interaction.editReply({
      embeds: [
        embeds.mod('👢 طرد', t(lang, 'mod.kicked', { user: `${user}`, reason, caseId: result.caseId }), {
          thumbnail: user.displayAvatarURL({ size: 256 }),
          fields: [
            { name: t(lang, 'common.case'), value: `#${result.caseId}`, inline: true },
            { name: 'الإداري', value: `${interaction.user}`, inline: true },
          ],
        }),
      ],
    });
  },
};
