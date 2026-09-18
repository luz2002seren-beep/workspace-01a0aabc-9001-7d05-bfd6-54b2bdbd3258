'use strict';

/**
 * systems/textCommands.js
 * -------------------------------------------------------------
 * أوامر شات بلا بريفيكست (بانجليزي) + اختصارات قابلة للتعديل من الموقع.
 *
 * كيف تشتغل:
 *   ١) صاحب السيرفر يحدّد من اللوحة: تشغيل/إيقاف + اختصار لكل أمر
 *   ٢) أول الكلمة في الرسالة يُطابق الاختصار → يُنفَّذ الأمر نفسه
 *      بنفس الصلاحيات والتحقق تمامًا مثل السلاش (نفس command.run)
 *   ٣) الوسائط: ترتيبها نفسه مثل السلاش لكن ما فيه أسماء للوسائط
 *      مثال:  ban @العضو سبب 7d   ← نفس  /ban العضو السبب المدة
 *
 * الخصوصية: ما يرد أبدًا على البوتات ولا على رسائل الخاص.
 * الأمان: نفس فحص الصلاحيات + حد الاستخدام + سجل النشاط.
 * -------------------------------------------------------------
 */

const { MessageFlags } = require('discord.js');
const db = require('../database');
const catalog = require('../data/commandCatalog');
const { t } = require('../lib/i18n');

/** الأمر: شغّال بلا بريفيكست؟ وما هي اختصاراته؟ */
const PREFIX_KEY = 'textCommands';

/** الإعدادات الافتراضية: تشغيل + الاختصارات المقترحة من الكتالوج */
function defaultsFor() {
  const aliases = {};
  for (const [name, meta] of Object.entries(catalog.COMMANDS)) {
    aliases[name] = Array.isArray(meta.aliases) ? [...meta.aliases] : [];
  }
  return { enabled: true, aliases, cooldownSeconds: 3, disabled: [] };
}

/**
 * اقتراح اختصار قصير لاسم أمر طويل (بلا تعارض مع أي أمر أو اختصار آخر):
 *   serverinfo → sinfo · userinfo → uinfo · timeout → tmout · autoReply → areply
 * @param {string} name اسم الأمر
 * @param {Set<string>} used الاختصارات المستعملة حاليًا
 */
function suggestAlias(name, used) {
  const lower = name.toLowerCase();
  const taken = new Set((used ? [...used] : []).map((x) => String(x).toLowerCase()));

  const patterns = [
    lower,
    lower.replace(/^(server|user|time|warn|lock|kick|ban|poll|help|ping|auto|member|slow)/, (m) => m[0]),
    lower.replace(/(info|reply|line|react|mod|role|levels|level|time|mode)/g, ''),
    lower.replace(/[aeiou]/g, ''),
  ];

  for (const candidate of patterns) {
    if (candidate && candidate.length >= 2 && !taken.has(candidate)) return candidate;
  }

  /* أخيرًا: أول ٣ حروف ثم رقم تسلسلي */
  const base = (lower.replace(/[^a-z]/g, '') || 'cmd').slice(0, 3);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

/** إعدادات هذا السيرفر بعد الدمج مع الافتراضي (بلا كتابة) */
function configFor(guildId) {
  const base = defaultsFor();
  const raw = db.getGuild(guildId).settings;
  const saved = raw?.[PREFIX_KEY] || {};

  const aliases = { ...base.aliases };
  for (const [name, list] of Object.entries(saved.aliases || {})) {
    if (!catalog.COMMANDS[name]) continue;
    aliases[name] = Array.isArray(list)
      ? list.map((a) => normalizeAlias(a)).filter(Boolean)
      : aliases[name];
  }

  return {
    enabled: saved.enabled === undefined ? base.enabled : Boolean(saved.enabled),
    cooldownSeconds: Number.isFinite(Number(saved.cooldownSeconds)) ? Number(saved.cooldownSeconds) : base.cooldownSeconds,
    aliases,
    /* أوامر مطفية: ما تشتغل بلا بريفيكست (مفيدة للأوامر اللي اسمها كلمة إنجليزية شائعة) */
    disabled: Array.isArray(saved.disabled) ? saved.disabled.filter((n) => catalog.COMMANDS[n]) : base.disabled,
  };
}

/** تنظيف الاختصار: إنجليزي فقط، بلا مسافات، بحروف صغيرة، بحد أقصى ٢٠ حرفًا */
function normalizeAlias(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 20);
  return /^[a-z][a-z0-9_-]*$/.test(clean) ? clean : '';
}

/** كل الاختصارات مع أسماء الأوامر ومستخدِميها */
function aliasIndex(guildId) {
  const config = configFor(guildId);
  const map = new Map();
  for (const [name, list] of Object.entries(config.aliases)) {
    for (const alias of list) {
      if (!map.has(alias)) map.set(alias, name);
    }
  }
  return { config, map };
}

/** يحدّد اسم الأمر المطلوب من أول كلمة في الرسالة (أو null) */
function resolveCommand(guildId, word) {
  const word2 = normalizeAlias(word);
  if (!word2) return null;
  const { config, map } = aliasIndex(guildId);
  if (!config.enabled) return null;

  const found = map.get(word2) || Object.keys(catalog.COMMANDS).find((n) => n.toLowerCase() === word2) || null;
  if (!found) return null;
  if (config.disabled.includes(found)) return null;
  return found;
}

/* ------------------------------ سجل الحدود ------------------------------ */

const buckets = new Map(); // m:userId → آخر وقت

function onCooldown(message, seconds) {
  if (!seconds) return 0;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = buckets.get(key) || 0;
  const remaining = seconds * 1000 - (now - last);
  if (remaining > 0) return Math.ceil(remaining / 1000);
  buckets.set(key, now);
  if (buckets.size > 5000) buckets.clear();
  return 0;
}

/** بحث موحّد داخل كاش ديسكورد (Collection) أو Map عادية */
function findIn(collection, predicate) {
  if (!collection) return null;
  if (typeof collection.find === 'function') return collection.find(predicate) || null;
  for (const value of collection.values()) if (predicate(value)) return value;
  return null;
}

/** أعضاء السيرفر للبحث بالاسم */
function findMember(guild, query) {
  const q = String(query || '').replace(/[<@!>]/g, '').toLowerCase();
  if (!q) return null;
  const cache = guild?.members?.cache;
  if (/^\d{15,25}$/.test(q)) {
    return (typeof cache?.get === 'function' ? cache.get(q) : null) || null;
  }
  return (
    findIn(cache, (m) => (m.user?.username || '').toLowerCase() === q)
    || findIn(cache, (m) => (m.user?.username || '').toLowerCase().startsWith(q))
    || findIn(cache, (m) => (m.displayName || '').toLowerCase() === q)
    || findIn(cache, (m) => (m.displayName || '').toLowerCase().startsWith(q))
    || null
  );
}

/** رتبة بالاسم أو الآيدي */
function findRole(guild, query) {
  const q = String(query || '').replace(/[<@&>]/g, '').toLowerCase();
  if (!q) return null;
  const cache = guild?.roles?.cache;
  if (/^\d{15,25}$/.test(q)) {
    return (typeof cache?.get === 'function' ? cache.get(q) : null) || null;
  }
  return (
    findIn(cache, (r) => (r.name || '').toLowerCase() === q)
    || findIn(cache, (r) => (r.name || '').toLowerCase().startsWith(q))
    || null
  );
}

/** روم بالاسم أو الآيدي */
function findChannel(guild, query) {
  const q = String(query || '').replace(/[<#>]/g, '').toLowerCase();
  if (!q) return null;
  const cache = guild?.channels?.cache;
  if (/^\d{15,25}$/.test(q)) {
    return (typeof cache?.get === 'function' ? cache.get(q) : null) || null;
  }
  return (
    findIn(cache, (c) => (c.name || '').toLowerCase() === q)
    || findIn(cache, (c) => (c.name || '').toLowerCase().startsWith(q))
    || null
  );
}

/** أسماء الوسائط ودلالتها (الأوامر عندنا بالعربي — نعتمد على الأسماء) */
const USER_NAMES = ['العضو', 'عضو', 'المستخدم', 'الشخص'];
const CHANNEL_NAMES = ['القناة', 'قناة', 'الروم'];
const ROLE_NAMES = ['الرتبة', 'رتبة'];
const REASON_NAMES = ['السبب', 'سبب', 'النص', 'الرسالة', 'الصيغة'];
const DURATION_NAMES = ['المدة', 'مدة', 'الوقت'];
const NUMBER_NAMES = ['العدد', 'الرقم', 'حذف_الرسائل', 'الصفحة', 'المستوى', 'الكولداون', 'حد_التكرار', 'عدد_الرسائل', 'خلال_ثواني', 'مدة_الإسكات', 'الفاصل_الصوتي', 'خبرة_كتابية_لكل_أحرف', 'سقف_الرسالة', 'خبرة_كل_فاصل_صوتي', 'حذف_بعد', 'حذف_بعد_ثواني', 'سقف_التفاعل_اليومي', 'مدة_منع_السبام'];

const BOOL_TRUE = ['نعم', 'yes', 'true', 'on', '1', 'تشغيل', 'فعل'];
const BOOL_FALSE = ['لا', 'no', 'false', 'off', '0', 'إيقاف', 'اطفاء', 'إطفاء'];

const isDurationToken = (t) => /^\d+\s*(s|m|h|d|w|mo|يوم|دقيقة|دقائق|ساعة|ساعات|ثانية|ثواني)?$/i.test(t) && /\d/.test(t);

const kindOf = (def) => {
  const name = def.name;
  if (def.type === 6 || USER_NAMES.includes(name)) return 'user';
  if (def.type === 7 || CHANNEL_NAMES.includes(name)) return 'channel';
  if (def.type === 8 || ROLE_NAMES.includes(name)) return 'role';
  if (def.type === 5) return 'bool';
  if (def.type === 4 || def.type === 10 || NUMBER_NAMES.includes(name)) return 'int';
  if (DURATION_NAMES.includes(name)) return 'duration';
  if (def.type === 3 || REASON_NAMES.includes(name)) return 'text';
  return 'text';
};

/**
 * ربط كلمات الرسالة بوسائط الأمر — بنفس تعريفات السلاش (مصدر الحقيقة).
 * القاعدة: الوسائط المكتوبة (عضو · روم · رتبة · مدة · رقم · نعم/لا) تُلتقط أولًا،
 * والباقي يروح للنصوص (مثل السبب) — حتى الفراغات داخل السبب ما تتقطّع.
 * @param {object} interaction الواجهة الوهمية (store داخلها)
 * @param {object[]} defs تعريفات الوسائط بالترتيب
 * @param {string[]} tokens كلمات المستخدم بعد اسم الأمر
 */
function bindArguments(interaction, guild, message, tokens, defs) {
  const store = interaction.__textArgs;
  const claimed = new Array(tokens.length).fill(false);
  const mentionMember = () => message.mentions?.members?.first?.() || null;
  const mentionChannel = () => message.mentions?.channels?.first?.() || null;

  /* ١) الوسائط المكتوبة */
  for (const def of defs) {
    const kind = kindOf(def);

    if (kind === 'user') {
      let idx = tokens.findIndex((t, i) => !claimed[i] && /^<@!?\d+>$/.test(t));
      if (idx < 0) {
        const mentioned = mentionMember();
        if (mentioned) idx = tokens.findIndex((t, i) => !claimed[i] && t.includes(mentioned.id));
      }
      if (idx < 0) idx = tokens.findIndex((t, i) => !claimed[i] && !!findMember(guild, t));
      if (idx >= 0) {
        const member = /^<@!?\d+>$/.test(tokens[idx])
          ? (mentionMember() || findMember(guild, tokens[idx]))
          : findMember(guild, tokens[idx]);
        claimed[idx] = true;
        if (member) store.set(def.name, { user: member.user, member });
      }
      continue;
    }

    if (kind === 'channel') {
      let idx = tokens.findIndex((t, i) => !claimed[i] && /^<#\d+>$/.test(t));
      if (idx < 0) idx = tokens.findIndex((t, i) => !claimed[i] && !!findChannel(guild, t));
      if (idx >= 0) {
        const channel = /^<#\d+>$/.test(tokens[idx]) ? mentionChannel() || findChannel(guild, tokens[idx]) : findChannel(guild, tokens[idx]);
        claimed[idx] = true;
        if (channel) store.set(def.name, { channel });
      }
      continue;
    }

    if (kind === 'role') {
      let idx = tokens.findIndex((t, i) => !claimed[i] && /^<@&\d+>$/.test(t));
      if (idx < 0) idx = tokens.findIndex((t, i) => !claimed[i] && !!findRole(guild, t));
      if (idx >= 0) {
        const role = findRole(guild, tokens[idx]);
        claimed[idx] = true;
        if (role) store.set(def.name, { role });
      }
      continue;
    }

    if (kind === 'bool') {
      const idx = tokens.findIndex((t, i) => !claimed[i] && (BOOL_TRUE.includes(t.toLowerCase()) || BOOL_FALSE.includes(t.toLowerCase())));
      if (idx >= 0) {
        claimed[idx] = true;
        store.set(def.name, { bool: BOOL_TRUE.includes(tokens[idx].toLowerCase()) });
      }
      continue;
    }

    if (kind === 'duration') {
      const idx = tokens.findIndex((t, i) => !claimed[i] && isDurationToken(t));
      if (idx >= 0) {
        claimed[idx] = true;
        store.set(def.name, { raw: tokens[idx], string: tokens[idx], duration: true });
      }
      continue;
    }

    if (kind === 'int') {
      /* من الآخر: الأرقام عادة في نهاية الأمر */
      let idx = -1;
      for (let i = tokens.length - 1; i >= 0; i -= 1) {
        if (!claimed[i] && /^-?\d+$/.test(tokens[i])) { idx = i; break; }
      }
      if (idx >= 0) {
        claimed[idx] = true;
        store.set(def.name, { int: Number(tokens[idx]), raw: tokens[idx], string: tokens[idx] });
      }
      continue;
    }
    /* النصوص: نتركها للمرحلة الثانية */
  }

  /* ٢) النصوص: الباقي غير المطالب به */
  const textDefs = defs.filter((d) => kindOf(d) === 'text');
  if (textDefs.length) {
    const leftovers = tokens.filter((_, i) => !claimed[i]);

    /* تصويت أو قوائم مفصولة بـ | : كل مقطع يروح لخيار */
    if (textDefs.length > 1 && leftovers.includes('|')) {
      const segments = tokens.join(' ').split('|').map((x) => x.trim()).filter(Boolean);
      textDefs.forEach((def, i) => {
        if (segments[i] !== undefined) store.set(def.name, { raw: segments[i], string: segments[i] });
      });
    } else if (textDefs.length === 1) {
      const value = leftovers.join(' ').trim();
      if (value) store.set(textDefs[0].name, { raw: value, string: value });
    } else {
      leftoverAssign(textDefs, leftovers, store);
    }
  }

  /* المتغيّر الشائع «العملية» (add/remove/enable…) إن جاء كأول كلمة ولم يُلتقط */
  const opName = defs.find((d) => ['العملية', 'عملية', 'الحماية', 'النوع', 'النمط', 'الوضع', 'اللغة', 'الفترة', 'الحالة'].includes(d.name));
  if (opName && !store.has(opName.name) && tokens.length && !claimed[0]) {
    claimed[0] = true;
    store.set(opName.name, { raw: tokens[0], string: tokens[0] });
  }
}

/**
 * توزيع النصوص الباقية على وسائط النص بالترتيب:
 *   - إذا آخر وسيط «سبب/نص» ← يأخذ باقي الجملة كاملة (ما تتقطّع)
 *   - غير هيك ← كلمة لكل وسيط (مثل: الفترة ثم النوع)، وأي زيادة تلحق بالأخير
 */
function leftoverAssign(defs, leftovers, store) {
  if (!leftovers.length) return;
  if (defs.length === 1) {
    store.set(defs[0].name, { raw: leftovers.join(' '), string: leftovers.join(' ') });
    return;
  }

  const lastDef = defs[defs.length - 1];
  const lastIsReason = REASON_NAMES.includes(lastDef.name);

  if (lastIsReason) {
    defs.slice(0, -1).forEach((def, i) => {
      if (leftovers[i] !== undefined) store.set(def.name, { raw: leftovers[i], string: leftovers[i] });
    });
    const tail = leftovers.slice(defs.length - 1).join(' ') || leftovers[leftovers.length - 1];
    if (tail) store.set(lastDef.name, { raw: tail, string: tail });
    return;
  }

  defs.forEach((def, i) => {
    const value = i === defs.length - 1 ? leftovers.slice(i).join(' ') : leftovers[i];
    if (value) store.set(def.name, { raw: value, string: value });
  });
}

/** تعريفات وسائط السلاش الفعلية لهذا الأمر (أو للأمر الفرعي المختار) */
function optionDefs(command, sub) {
  const json = command.data.toJSON();
  const map = new Map(); // name → type
  const collect = (options) => {
    for (const option of options || []) {
      if (option.type === 1 || option.type === 2) continue;
      map.set(option.name, option.type);
    }
  };
  if (sub) {
    for (const option of json.options || []) {
      if ((option.type === 1 || option.type === 2) && option.name.toLowerCase() === sub) collect(option.options);
    }
  } else {
    /* بلا أمر فرعي: لو الأمر نفسه فيه أوامر فرعية نأخذ أول مجموعة وسائط عامة */
    collect(json.options);
  }
  return [...map.entries()].map(([name, type]) => ({ name, type }));
}

/**
 * ينفّذ أمرًا مكتوبًا في الشات بلا بريفيكست.
 * @returns {Promise<boolean>} هل تعاملنا مع الرسالة؟
 */
async function handleMessage(client, message) {
  /* حماية: ما ننفّذ أوامر من البوتات ولا من رسائل الخاص */
  if (message.author?.bot || !message.guild) return false;

  const guildId = message.guild.id;
  const { config, map } = aliasIndex(guildId);
  if (!config.enabled) return false;

  const content = (message.content || '').trim();
  if (!content) return false;

  const parts = content.split(/\s+/);
  const name = resolveCommand(guildId, parts[0]);
  if (!name) return false;

  const command = client.commands.get(name) || client.commands.get(Object.keys(client.commands).find((k) => k.toLowerCase() === name.toLowerCase()));
  if (!command) return false;

  /* الأمر الفرعي: الكلمة الثانية إن كان الأمر يقبل أوامر فرعية */
  const subNames = Object.keys(command.data.toJSON().options?.length ? subMap(command) : {});
  let sub = null;
  let args = parts.slice(1);
  if (subNames.length && args.length && subNames.includes(args[0].toLowerCase())) {
    sub = args[0].toLowerCase();
    args = args.slice(1);
  }
  args._subName = sub;

  /* الصلاحيات: نفس شرط السلاش */
  const isDev = require('../config').bot.developerIds.includes(message.author.id);
  if (command.permissions?.length) {
    if (!message.member?.permissions?.has?.(command.permissions) && !isDev) {
      /*
       * أوامر الإدارة مو للأعضاء: نرفض بهدوء بلا ما نكشف كيف تُستعمل،
       * ونسجّلها في سجل النشاط حتى تعرف الإدارة مين حاول يستعملها.
       */
      const isAdminCommand = catalog.audienceOf(command.data.name) === 'staff';
      await message.reply({
        content: isAdminCommand
          ? 'هذا الأمر للإدارة فقط.'
          : (t('ar', 'common.noPermission') || 'ما عندك صلاحية لهذا الأمر.'),
        allowedMentions: { repliedUser: false },
      }).catch(() => {});

      try {
        require('../lib/audit').guild(null, guildId, {
          action: 'command.denied',
          target: command.data.name,
          detail: `${message.author.tag} حاول يستعمل أمر إدارة «${command.data.name}» بدون صلاحية`,
          actor: { id: message.author.id, name: message.author.tag },
          severity: 'warn',
        });
      } catch { /* السجل ما يوقف شي */ }

      return true;
    }
  }
  if (command.botPermissions?.length) {
    const me = message.guild.members.me;
    if (me && !me.permissions.has(command.botPermissions)) {
      await message.reply({ content: 'عندي نقص صلاحيات لأعمل هذا الأمر.', allowedMentions: { repliedUser: false } }).catch(() => {});
      return true;
    }
  }

  /* حد الاستخدام: نأخذ الأكبر بين حد الأمر وحد السيرفر (لو في حد للأمر) */
  const perCommand = Number(command.cooldown) || 0;
  const cooldownSeconds = perCommand > 0 ? Math.max(perCommand, config.cooldownSeconds) : config.cooldownSeconds;
  const wait = onCooldown(message, cooldownSeconds);
  if (wait > 0) {
    await message.reply({ content: `⏳ استنى ${wait} ثانية قبل ما تستعمل الأمر مرة ثانية.`, allowedMentions: { repliedUser: false } }).catch(() => {});
    return true;
  }

  /* واجهة وهمية بنفس شكل interaction حتى نعيد استخدام نفس الكود */
  const fake = makeFakeInteraction(client, message, command, args, sub);
  try {
    await command.run(client, fake, 'ar');

    /* سجل النشاط: من استعمل أي أمر */
    try {
      require('../lib/audit').guild(null, guildId, {
        action: 'command.text',
        target: name + (sub ? ` ${sub}` : ''),
        detail: `${message.author.tag} استعمل ${name}${sub ? ` ${sub}` : ''} بدون بريفيكست`,
        actor: { id: message.author.id, name: message.author.tag },
      });
    } catch { /* السجل ما يوقف الأمر أبدًا */ }
  } catch (err) {
    console.error('[خطأ] تنفيذ أمر نصي:', err.message);
    await fake.reply({ content: 'صار خطأ أثناء تنفيذ الأمر.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return true;
}

/** خريطة الأوامر الفرعية لاسم الأمر */
function subMap(command) {
  const json = command.data.toJSON();
  const map = {};
  for (const option of json.options || []) {
    if (option.type === 1 || option.type === 2) map[option.name.toLowerCase()] = option;
  }
  return map;
}

/**
 * واجهة تفاعل وهمية: نفس الدوال التي تستعملها الأوامر (reply / editReply / deferReply / options)
 * لكن مبنية على رسالة الشات.
 */
function makeFakeInteraction(client, message, command, args, sub) {
  const json = command.data.toJSON();
  const optionTypes = {};
  const walk = (options, prefix = '') => {
    for (const option of options || []) {
      if (option.type === 1 || option.type === 2) walk(option.options, option.name);
      else optionTypes[option.name] = TYPE_NAME[option.type] || 'string';
    }
  };
  walk(json.options);

  const store = new Map();
  const defs = optionDefs(command, sub);
  const interaction = {
    __textArgs: store,
    __textOptionTypes: optionTypes,
    __fromText: true,
    commandName: json.name,
    guild: message.guild,
    guildId: message.guild.id,
    channel: message.channel,
    channelId: message.channel.id,
    user: message.author,
    member: message.member,
    client,
    locale: 'ar',
    createdAt: message.createdAt,
    createdTimestamp: message.createdTimestamp,
    replied: false,
    deferred: false,
    responded: false,
    isChatInputCommand: () => true,
    inGuild: () => true,

    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => null,
      getUser: (n) => store.get(n)?.user ?? null,
      getMember: (n) => store.get(n)?.member ?? null,
      getChannel: (n) => store.get(n)?.channel ?? null,
      getRole: (n) => store.get(n)?.role ?? null,
      getString: (n) => (store.get(n)?.string ?? store.get(n)?.raw ?? null),
      getInteger: (n) => (store.get(n)?.int ?? (Number.isFinite(Number(store.get(n)?.raw)) ? Number(store.get(n).raw) : null)),
      getNumber: (n) => (store.get(n)?.int ?? null),
      getBoolean: (n) => {
        if (store.get(n)?.bool !== undefined) return store.get(n).bool;
        const value = String(store.get(n)?.raw ?? store.get(n)?.string ?? '').toLowerCase();
        if (!value) return null;
        if (BOOL_TRUE.includes(value)) return true;
        if (BOOL_FALSE.includes(value)) return false;
        return null;
      },
      getFocused: () => '',
      getAttachment: () => null,
    },

    /* الردود: كلها تروح لنفس رسالة الشات */
    async reply(payload) { interaction.replied = true; return replyToMessage(message, payload); },
    async editReply(payload) { return replyToMessage(message, payload); },
    async followUp(payload) { return replyToMessage(message, payload); },
    async deferReply() { interaction.deferred = true; return undefined; },
    async update(payload) { return replyToMessage(message, payload); },
    async deleteReply() { return undefined; },
    async fetchReply() { return message; },
  };

  bindArguments(interaction, message.guild, message, args, defs);
  return interaction;
}

function replyToMessage(message, payload) {
  const safe = { ...(payload || {}) };
  delete safe.flags; // أوامر السلاش قد ترسل ردًا خاصًا — في الشات نرد عادي
  delete safe.ephemeral;
  return message.reply({ allowedMentions: { repliedUser: false }, ...safe }).then((sent) => {
    /* حذف تلقائي لردود الأوامر بعد دقيقتين حتى لا يمتلئ الشات */
    const timer = setTimeout(() => sent.delete().catch(() => {}), 120000);
    timer.unref?.();
    return sent;
  }).catch(() => null);
}

const TYPE_NAME = { 3: 'string', 4: 'int', 5: 'bool', 6: 'user', 7: 'channel', 8: 'role', 9: 'mention', 10: 'number', 11: 'attachment' };

/** أدوات اللوحة: عرض/تعديل الاختصارات + كشف التعارض */
function adminSnapshot(guildId, commandNames = [], { staffViewer = true } = {}) {
  const config = configFor(guildId);
  const used = new Map();
  for (const [name, list] of Object.entries(config.aliases)) {
    for (const alias of list) if (!used.has(alias)) used.set(alias, name);
  }

  /* كل الأسماء والاختصارات المستعملة — نبني عليها الاقتراحات خطوة بخطوة حتى لا تتعارض */
  const reserved = new Set(Object.keys(catalog.COMMANDS).map((n) => n.toLowerCase()));
  for (const alias of used.keys()) reserved.add(alias);

  /*
   * غير الإداري ما يشوف أوامر الإدارة إطلاقًا في اللوحة — لا في الاختصارات ولا في المكتبة،
   * حتى ما يخبّ شي في السيرفر. الإدارة تشوف كل الأوامر مع جمهور كل أمر.
   */
  const entries = Object.entries(catalog.COMMANDS)
    .filter(([name, meta]) => staffViewer || catalog.audienceOf(name, meta) === 'member');

  const items = entries.map(([name, meta]) => {
    const aliases = config.aliases[name] || [];
    const conflict = aliases.filter((a) => used.get(a) && used.get(a) !== name);
    const suggested = suggestAlias(name, reserved);
    reserved.add(suggested);
    const audience = catalog.audienceOf(name, meta);
    return {
      name,
      label: meta.label,
      what: meta.what,
      audience,
      audienceLabel: catalog.AUDIENCES[audience]?.label || audience,
      audienceBadge: catalog.AUDIENCES[audience]?.badge || audience,
      audienceDesc: catalog.AUDIENCES[audience]?.desc || '',
      category: meta.category || null,
      real: commandNames.includes(name),
      text: meta.text !== false,
      enabled: !config.disabled.includes(name),
      perm: meta.perm,
      usage: meta.usage,
      examples: meta.examples,
      subs: meta.subs || null,
      aliases,
      suggested,
      conflict,
    };
  });

  const allNames = Object.keys(catalog.COMMANDS);
  const memberNames = catalog.namesOf('member');
  const staffNames = catalog.namesOf('staff');

  return {
    enabled: config.enabled,
    cooldownSeconds: config.cooldownSeconds,
    disabled: config.disabled,
    items,
    audiences: catalog.AUDIENCES,
    counts: {
      total: items.length,
      member: items.filter((i) => i.audience === 'member').length,
      staff: items.filter((i) => i.audience === 'staff').length,
      /* الموجود في البوت كله — حتى لو ما ظهر لغير الإداري */
      allTotal: allNames.length,
      allMember: memberNames.length,
      allStaff: staffNames.length,
      hiddenFromViewer: staffViewer ? 0 : staffNames.length,
    },
  };
}

/** تعديل اختصار (أو قائمة اختصارات) لأمر — يعيد الرسالة المناسبة */
function setAliases(guildId, commandName, aliases) {
  if (!catalog.COMMANDS[commandName]) return { ok: false, error: 'unknown_command' };

  const clean = [...new Set([].concat(aliases || []).map(normalizeAlias).filter(Boolean))].slice(0, 5);
  const invalid = [].concat(aliases || []).map((a) => String(a || '').trim()).filter((a) => a && !normalizeAlias(a));
  if (invalid.length) return { ok: false, error: 'invalid_alias', invalid };

  const current = configFor(guildId);
  /* منع التعارض مع أوامر ثانية */
  const takenBy = {};
  for (const [name, list] of Object.entries(current.aliases)) {
    if (name === commandName) continue;
    for (const alias of list) if (clean.includes(alias)) takenBy[alias] = name;
  }
  if (Object.keys(takenBy).length) return { ok: false, error: 'alias_taken', takenBy };

  const next = { ...current.aliases, [commandName]: clean };
  db.updateGuildSettings(guildId, { [PREFIX_KEY]: { aliases: next } });
  return { ok: true, aliases: clean };
}

/** تشغيل/إيقاف النظام أو تغيير حد الاستخدام */
function setOptions(guildId, patch = {}) {
  const clean = {};
  if (patch.enabled !== undefined) clean.enabled = Boolean(patch.enabled);
  if (patch.cooldownSeconds !== undefined) clean.cooldownSeconds = Math.min(60, Math.max(0, Number(patch.cooldownSeconds) || 0));
  if (patch.disabled !== undefined) {
    clean.disabled = [...new Set([].concat(patch.disabled).filter((n) => catalog.COMMANDS[n]))];
  }
  if (!Object.keys(clean).length) return { ok: false, error: 'empty' };
  db.updateGuildSettings(guildId, { [PREFIX_KEY]: clean });
  return { ok: true, config: configFor(guildId) };
}

/** تشغيل/إطفاء أمر واحد بلا بريفيكست */
function setCommandEnabled(guildId, commandName, enabled) {
  if (!catalog.COMMANDS[commandName]) return { ok: false, error: 'unknown_command' };
  const config = configFor(guildId);
  const disabled = new Set(config.disabled);
  if (enabled) disabled.delete(commandName);
  else disabled.add(commandName);
  const result = setOptions(guildId, { disabled: [...disabled] });
  if (!result.ok) return result;
  return { ok: true, command: commandName, enabled: Boolean(enabled), disabled: [...disabled] };
}

module.exports = {
  PREFIX_KEY,
  setCommandEnabled,
  defaultsFor,
  configFor,
  normalizeAlias,
  suggestAlias,
  resolveCommand,
  aliasIndex,
  handleMessage,
  adminSnapshot,
  setAliases,
  setOptions,
  makeFakeInteraction,
  bindArguments,
  optionDefs,
  findMember,
  findRole,
  findChannel,
  findIn,
};
