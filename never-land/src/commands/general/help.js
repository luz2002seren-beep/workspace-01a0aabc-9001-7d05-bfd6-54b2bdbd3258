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
const catalog = require('../../data/commandCatalog');
const { isStaff } = require('../../lib/permissions');

const CATEGORY_META = {
  general: { label: 'عام', emoji: '🤖', desc: 'أوامر عامة ومعلومات' },
  moderation: { label: 'الإشراف', emoji: '🔨', desc: 'حظر، طرد، تحذير، تنظيف' },
  config: { label: 'الإعدادات', emoji: '⚙️', desc: 'إعداد البوت لكل الأنظمة (تذاكر، لوقات، حماية...)' },
  utility: { label: 'أدوات', emoji: '🛠️', desc: 'تذكيرات، تصويت، وغيرها' },
};

/**
 * هل هذا العضو يشوف أوامر الإدارة؟
 * صاحب السيرفر · مسؤول · مَن يملك إدارة السيرفر أو إسكات الأعضاء.
 */
function viewerIsStaff(member) {
  if (!member) return false;
  try {
    return isStaff(member);
  } catch {
    return false;
  }
}

/**
 * الأوامر الظاهرة لهذا العضو:
 *   الإدارة ← كل الأوامر (٢٩) · العضو العادي ← أوامر الأعضاء فقط (١٠).
 * أوامر الإدارة مخفية عن الأعضاء حتى ما يشوفوها ولا يستعملوها.
 */
function visibleCommands(client, member) {
  const staff = viewerIsStaff(member);
  const out = [];
  for (const command of client.commands.values()) {
    if (staff) { out.push(command); continue; }
    if (catalog.audienceOf(command.data.name) === 'member') out.push(command);
  }
  return out;
}

/** الأقسام التي تحتوي أوامر فعلية فقط (يُبنى تلقائيًا من مجلدات الأوامر) */
function commandsOf(client, categoryId, member = null) {
  return visibleCommands(client, member).filter((command) => command.category === categoryId);
}

function getCategories(client, member = null) {
  const counts = new Map();
  for (const command of visibleCommands(client, member)) {
    if (!CATEGORY_META[command.category]) continue;
    counts.set(command.category, (counts.get(command.category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, ...CATEGORY_META[id], count }))
    .sort((a, b) => b.count - a.count);
}

const CATEGORIES = Object.entries(CATEGORY_META).map(([id, meta]) => ({ id, ...meta }));

/** بناء embed قسم معيّن */
function buildCategoryEmbed(client, categoryId, lang, member = null) {
  const list = getCategories(client, member);
  const category = list.find((c) => c.id === categoryId) || list[0];
  const commands = commandsOf(client, categoryId, member);
  const lines = commands.map((cmd) => {
    const opts = cmd.data.options?.length ? ` \`${cmd.data.options.map((o) => o.name).join(' ')}\`` : '';
    return `**/${cmd.data.name}**${opts}\n> ${cmd.data.description}`;
  });

  return embeds.base({
    color: 0x5865f2,
    title: `${category.emoji} ${category.label} — ${commands.length} أمر`,
    description: lines.join('\n\n').slice(0, 4000) || 'لا توجد أوامر في هذا القسم.',
    footer: webUrlOk(config.web.url) ? `${config.web.siteName} • ${config.web.url}` : config.web.siteName,
  });
}


/** هل رابط الموقع صالح للنقر؟ */
function webUrlOk(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && url !== '#';
}

/** زر «افتح الموقع» و«لوحة التحكم» — تظهر فقط إذا كان الرابط صالحًا */
function webButtons() {
  const base = (config.web.url || '').replace(/\/$/, '');
  if (!webUrlOk(base)) return null;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('افتح الموقع').setStyle(ButtonStyle.Link).setURL(base),
    new ButtonBuilder().setLabel('لوحة التحكم').setStyle(ButtonStyle.Link).setURL(`${base}/dashboard`),
  );
  return row;
}

/** أسطر تعريفية بالموقع تُضاف للنص */
function webLines() {
  const base = (config.web.url || '').replace(/\/$/, '');
  if (!webUrlOk(base)) return ['> موقع اللوحة لم يُضبط بعد — أضف `DASHBOARD_URL` في الإعدادات.'];
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  return [
    `**الموقع:** ${base}`,
    isLocal
      ? '> هذا الرابط محلي: يفتح فقط على الجهاز الذي يشغّل البوت (ويكون الموقع شغّالًا عليه).'
      : 'اضغط زر «افتح الموقع» بالأسفل — يفتح مباشرة في المتصفح.',
    '> الدخول يحتاج تأكيد بحساب Discord، وبعدها يجب أن يملك حسابك الرول المطلوب.',
  ];
}

/** زر «شرح الأوامر في الموقع» — يفتح قسم مكتبة الأوامر مباشرة */
function guideButton(guildId) {
  const base = (config.web.url || '').replace(/\/$/, '');
  if (!webUrlOk(base)) return null;
  const url = guildId ? `${base}/dashboard/${guildId}#commandGuide` : `${base}/dashboard`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('شرح كل الأوامر في الموقع').setStyle(ButtonStyle.Link).setURL(url),
  );
}

/** أزرار التنقل */
function buildComponents(client, activeId, guildId = null, member = null) {
  const list = getCategories(client, member);
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
  const rows = [buttons, menu];
  const linkRow = webButtons();
  const guideRow = guideButton(guildId);
  if (linkRow) rows.push(linkRow);
  if (guideRow) rows.push(guideRow);
  return rows;
}

module.exports = {
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض قائمة أوامر البوت والمساعدة')
    .addStringOption((o) =>
      o.setName('الأمر').setDescription('اسم أمر معيّن لعرض تفاصيله').setRequired(false).setAutocomplete(true)),

  /** يُستخدم في الأزرار والقائمة */
  renderCategory(client, categoryId, lang = 'ar', guildId = null, member = null) {
    return {
      embeds: [buildCategoryEmbed(client, categoryId, lang, member)],
      components: buildComponents(client, categoryId, guildId, member),
    };
  },

  async autocomplete(client, interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    /* العضو العادي ما يشوف أوامر الإدارة ولا في الاقتراحات */
    const matches = visibleCommands(client, interaction.member)
      .filter((cmd) => cmd.data.name.includes(focused))
      .map((cmd) => ({ name: `/${cmd.data.name} — ${cmd.data.description.slice(0, 60)}`, value: cmd.data.name }))
      .slice(0, 25);
    await interaction.respond(matches);
  },

  async run(client, interaction, lang) {
    const specific = interaction.options.getString('الأمر');

    if (specific) {
      const command = client.commands.get(specific);
      const visible = command ? visibleCommands(client, interaction.member).includes(command) : false;
      if (!command || !visible) {
        return interaction.reply({
          content: '❌ ما لقيت هذا الأمر. أوامر الإدارة ما تظهر للأعضاء — إذا محتاج شي منها راجع الإدارة.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const usage = command.data.options?.map((o) => `\`${o.name}\` ${o.required ? '(إلزامي)' : '(اختياري)'} — ${o.description}`).join('\n') || 'لا توجد خيارات.';
      const linkRow = webButtons();

      /* شرح الكتالوج: طريقة الكتابة بلا بريفيكست + مثال جاهز */
      const meta = catalog.COMMANDS[command.data.name];
      const fields = [
        { name: 'الخيارات', value: usage, inline: false },
        { name: 'القسم', value: CATEGORY_META[command.category]?.label || command.category, inline: true },
        { name: 'الكولداون', value: `${command.cooldown ?? 3} ثانية`, inline: true },
      ];
      if (meta) {
        fields.push({
          name: 'بلا بريفيكست (بالإنجليزي)',
          value: [
            `> اكتب \`${meta.examples?.[0] || command.data.name}\` مباشرة في الشات — بلا أي رمز قبلها.`,
            meta.examples?.length > 1 ? `> أمثلة: ${meta.examples.slice(1, 4).map((e) => `\`${e}\``).join(' · ')}` : '',
          ].filter(Boolean).join('\n'),
          inline: false,
        });
        if (meta.subs && Object.keys(meta.subs).length) {
          fields.push({
            name: `أوامره الفرعية (${Object.keys(meta.subs).length})`,
            value: Object.entries(meta.subs).map(([k, v]) => `**\`${k}\`** — ${v}`).join('\n').slice(0, 1000),
            inline: false,
          });
        }
      }

      return interaction.reply({
        embeds: [
          embeds.info(`/${command.data.name}`, command.data.description, {
            fields,
            footer: webUrlOk(config.web.url) ? `الموقع: ${config.web.url}` : undefined,
          }),
        ],
        components: linkRow ? [linkRow] : [],
        flags: MessageFlags.Ephemeral,
      });
    }

    // اللوحة الرئيسية
    const staff = viewerIsStaff(interaction.member);
    const visible = visibleCommands(client, interaction.member);
    const total = visible.length;
    const categories = getCategories(client, interaction.member);
    const embed = embeds.base({
      color: 0x5865f2,
      title: t(lang, 'help.title'),
      description: [
        `أهلاً بك! عندي **${total}** أمر موزّعة على **${categories.length}** أقسام.`,
        '',
        ...categories.map((c) => `${c.emoji} **${c.label}** — ${c.desc} (\`${c.count}\`)`),
        '',
        staff
          ? '🛡️ **أوامر الإدارة** (حظر، طرد، إعدادات...) ظاهرة لك لأنك من الإدارة — الأعضاء العاديين ما يشوفوها.'
          : '🙋 هذه **أوامر الأعضاء** فقط، وكلها تشتغل لك بلا أي صلاحية — اكتب اسمها الإنجليزي مباشرة في الشات.',
        '',
        '**الميزات الرئيسية:**',
        '🛡️ حماية تلقائية (سبام، روابط، دعوات، كلمات ممنوعة)',
        '📜 لوقات تفصيلية لكل حدث في السيرفر',
        '👋 ترحيب ووداع قابل للتخصيص بالكامل',
        '🎫 نظام تذاكر احترافي مع أرشيف',
        '📈 نظام مستويات ومكافآت رتب',
        '🌐 موقع ولوحة تحكم عربية كاملة',
        '',
        ...webLines(),
      ].join('\n'),
      footer: t(lang, 'help.footer'),
    });

    await interaction.reply({ embeds: [embed], components: buildComponents(client, categories[0].id, interaction.guildId, interaction.member) });
  },
};

module.exports.CATEGORIES = CATEGORIES;
module.exports.getCategories = getCategories;
module.exports.visibleCommands = visibleCommands;
module.exports.viewerIsStaff = viewerIsStaff;
