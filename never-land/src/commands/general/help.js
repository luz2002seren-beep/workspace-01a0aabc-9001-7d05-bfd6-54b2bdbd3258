'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const embeds = require('../../lib/embeds');
const { t } = require('../../lib/i18n');
const config = require('../../config');

const CATEGORY_META = {
  general: { label: 'عام', emoji: '🤖', desc: 'أوامر عامة ومعلومات' },
  moderation: { label: 'الإشراف', emoji: '🔨', desc: 'حظر، طرد، تحذير، تنظيف' },
  config: { label: 'الإعدادات', emoji: '⚙️', desc: 'إعداد البوت لكل الأنظمة (تذاكر، لوقات، حماية...)' },
  utility: { label: 'أدوات', emoji: '🛠️', desc: 'تذكيرات، تصويت، وغيرها' },
};

/** الأقسام التي تحتوي أوامر فعلية فقط (يُبنى تلقائيًا من مجلدات الأوامر) */
function commandsOf(client, categoryId) {
  const out = [];
  for (const command of client.commands.values()) {
    if (command.category === categoryId) out.push(command);
  }
  return out;
}

function getCategories(client) {
  const counts = new Map();
  for (const command of client.commands.values()) {
    if (!CATEGORY_META[command.category]) continue;
    counts.set(command.category, (counts.get(command.category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, ...CATEGORY_META[id], count }))
    .sort((a, b) => b.count - a.count);
}

const CATEGORIES = Object.entries(CATEGORY_META).map(([id, meta]) => ({ id, ...meta }));

/** بناء embed قسم معيّن */
function buildCategoryEmbed(client, categoryId, lang) {
  const list = getCategories(client);
  const category = list.find((c) => c.id === categoryId) || list[0];
  const commands = commandsOf(client, categoryId);
  const lines = commands.map((cmd) => {
    const opts = cmd.data.options?.length ? ` \`${cmd.data.options.map((o) => o.name).join(' ')}\`` : '';
    return `**/${cmd.data.name}**${opts}\n> ${cmd.data.description}`;
  });

  return embeds.base({
    color: 0x5865f2,
    title: `${category.emoji} ${category.label} — ${commands.length} أمر`,
    description: lines.join('\n\n').slice(0, 4000) || 'لا توجد أوامر في هذا القسم.',
    footer: `Never Land • ${config.web.url}`,
  });
}

/** أزرار التنقل */
function buildComponents(client, activeId) {
  const list = getCategories(client);
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help:menu')
      .setPlaceholder('اختر قسمًا لعرض أوامره...')
      .addOptions(list.map((c) => ({ label: c.label, value: c.id, emoji: c.emoji, description: c.desc, default: c.id === activeId }))),
  );
  const buttons = new ActionRowBuilder().addComponents(
    list.map((c) =>
      new ButtonBuilder()
        .setCustomId(`help:${c.id}`)
        .setLabel(c.label)
        .setEmoji(c.emoji)
        .setStyle(c.id === activeId ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
  const links = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('لوحة التحكم').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(config.web.url),
  );
  return [buttons, menu, links];
}

module.exports = {
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض قائمة أوامر البوت والمساعدة')
    .addStringOption((o) =>
      o.setName('الأمر').setDescription('اسم أمر معيّن لعرض تفاصيله').setRequired(false).setAutocomplete(true)),

  /** يُستخدم في الأزرار والقائمة */
  renderCategory(client, categoryId, lang = 'ar') {
    return {
      embeds: [buildCategoryEmbed(client, categoryId, lang)],
      components: buildComponents(client, categoryId),
    };
  },

  async autocomplete(client, interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = client.commands
      .filter((cmd) => cmd.data.name.includes(focused))
      .map((cmd) => ({ name: `/${cmd.data.name} — ${cmd.data.description.slice(0, 60)}`, value: cmd.data.name }))
      .slice(0, 25);
    await interaction.respond(matches);
  },

  async run(client, interaction, lang) {
    const specific = interaction.options.getString('الأمر');

    if (specific) {
      const command = client.commands.get(specific);
      if (!command) {
        return interaction.reply({ content: '❌ ما لقيت هذا الأمر.', flags: MessageFlags.Ephemeral });
      }
      const usage = command.data.options?.map((o) => `\`${o.name}\` ${o.required ? '(إلزامي)' : '(اختياري)'} — ${o.description}`).join('\n') || 'لا توجد خيارات.';
      return interaction.reply({
        embeds: [
          embeds.info(`/${command.data.name}`, command.data.description, {
            fields: [
              { name: 'الخيارات', value: usage, inline: false },
              { name: 'القسم', value: CATEGORY_META[command.category]?.label || command.category, inline: true },
              { name: 'الكولداون', value: `${command.cooldown ?? 3} ثانية`, inline: true },
            ],
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // اللوحة الرئيسية
    const total = client.commands.size;
    const categories = getCategories(client);
    const embed = embeds.base({
      color: 0x5865f2,
      title: t(lang, 'help.title'),
      description: [
        `أهلاً بك! عندي **${total}** أمر موزّعة على **${categories.length}** أقسام.`,
        '',
        ...categories.map((c) => `${c.emoji} **${c.label}** — ${c.desc} (\`${c.count}\`)`),
        '',
        '**الميزات الرئيسية:**',
        '🛡️ حماية تلقائية (سبام، روابط، دعوات، كلمات ممنوعة)',
        '📜 لوقات تفصيلية لكل حدث في السيرفر',
        '👋 ترحيب ووداع قابل للتخصيص بالكامل',
        '🎫 نظام تذاكر احترافي مع أرشيف',
        '📈 نظام مستويات ومكافآت رتب',
        '🌐 لوحة تحكم ويب كاملة',
        '',
        `🌐 لوحة التحكم: ${config.web.url}`,
      ].join('\n'),
      footer: t(lang, 'help.footer'),
    });

    await interaction.reply({ embeds: [embed], components: buildComponents(client, categories[0].id) });
  },
};

module.exports.CATEGORIES = CATEGORIES;
module.exports.getCategories = getCategories;
