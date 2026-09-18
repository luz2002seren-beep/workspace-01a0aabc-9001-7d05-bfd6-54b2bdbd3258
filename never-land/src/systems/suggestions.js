'use strict';

/**
 * systems/suggestions.js
 * -------------------------------------------------------------
 * «هل تقصد؟» — لو كتب عضو كلمة تشبه أمرًا (عربي أو إنجليزي مكتوب غلط)
 * يردّ عليه البوت برسالة فيها الأوامر المشابهة وطريقة كتابتها.
 *
 *   طير      → kick · ban · timeout
 *   اسكت     → timeout
 *   مسح      → purge
 *   rank     → leveling · top
 *   bann     → ban
 *
 * قواعد مهمة:
 *   • الرد على العضو العادي يعرض أوامر الأعضاء فقط — أوامر الإدارة ما تنكشف له.
 *   • ما يردّ إلا مرة كل فترة قصيرة لكل عضو (حتى ما يزعّج الشات).
 *   • ما يردّ إلا على كلمة واحدة أو كلمتين قصيرتين — الكلام العادي ما يتعطّل.
 *   • يُطفأ من الموقع (قسم اختصارات الأوامر) أو يشتغل لأوامر محدّدة.
 * -------------------------------------------------------------
 */

const catalog = require('../data/commandCatalog');

/**
 * كلمات عربية (وأشكال كتابة شائعة) ← أسماء أوامر.
 * الترتيب مهم: الأقرب أولًا.
 */
const HINTS = {
  /* إدارة الأعضاء */
  'طير': ['kick', 'ban', 'timeout'],
  'طيّر': ['kick', 'ban', 'timeout'],
  'اطرد': ['kick'],
  'أطرد': ['kick'],
  'طرد': ['kick'],
  'كيك': ['kick'],
  'باند': ['ban'],
  'بان': ['ban'],
  'حظر': ['ban'],
  'احظر': ['ban'],
  'أحظر': ['ban'],
  'فك الحظر': ['unban'],
  'رفع الحظر': ['unban'],
  'انبان': ['unban'],
  'اسكت': ['timeout'],
  'أسكت': ['timeout'],
  'كتم': ['timeout'],
  'اكتم': ['timeout'],
  'ميوت': ['timeout'],
  'خرس': ['timeout'],
  'تحذير': ['warn'],
  'انذار': ['warn'],
  'إنذار': ['warn'],
  'وارن': ['warn'],
  'مسح': ['purge'],
  'نظف': ['purge'],
  'نظّف': ['purge'],
  'حذف رسائل': ['purge'],
  'كلير': ['purge'],
  'قفل': ['lock'],
  'اقفل': ['lock'],
  'سكر': ['lock'],
  'بطئ': ['slowmode'],
  'بطيء': ['slowmode'],
  'سلو': ['slowmode'],
  'اسم': ['member'],
  'لقب': ['member'],
  'رتبة': ['member', 'autorole'],
  'رول': ['autorole', 'member'],
  'رتب تلقائية': ['autorole'],

  /* إعدادات */
  'ترحيب': ['welcome'],
  'وداع': ['welcome'],
  'ترحيب ووداع': ['welcome'],
  'ردود': ['autoreply'],
  'رد تلقائي': ['autoreply'],
  'ردود تلقائية': ['autoreply'],
  'خط': ['autoline'],
  'فاصل': ['autoline'],
  'تفاعلات': ['autoreact'],
  'حماية': ['automod'],
  'سبام': ['automod'],
  'لوق': ['logs'],
  'لوقات': ['logs'],
  'سجلات': ['logs'],
  'تذاكر': ['tickets'],
  'تكت': ['tickets'],
  'اعدادات': ['settings'],
  'إعدادات': ['settings'],
  'ضبط': ['setup'],
  'تهيئة': ['setup'],

  /* عام */
  'مساعدة': ['help'],
  'مساعده': ['help'],
  'اوامر': ['help'],
  'أوامر': ['help'],
  'سرعة': ['ping'],
  'بينغ': ['ping'],
  'بنق': ['ping'],
  'معلومات': ['userinfo', 'serverinfo', 'botinfo'],
  'بروفايل': ['userinfo'],
  'حساب': ['userinfo'],
  'معلوماتي': ['userinfo'],
  'سيرفر': ['serverinfo'],
  'السيرفر': ['serverinfo'],
  'بوت': ['botinfo'],
  'صورة': ['avatar'],
  'افتار': ['avatar'],
  'أفتار': ['avatar'],
  'توب': ['top'],
  'متصدرين': ['top'],
  'المتصدّرون': ['top'],
  'متقدمين': ['leveling', 'top'],
  'ليفل': ['leveling'],
  'لفل': ['leveling'],
  'رانك': ['leveling'],
  'rank': ['leveling', 'top'],
  'مستوى': ['leveling'],
  'مستويات': ['leveling'],
  'خبرة': ['leveling'],
  'نقاط': ['leveling'],
  'تصويت': ['poll'],
  'تسويت': ['poll'],
  'بول': ['poll'],
  'vote': ['poll'],
  'تذكير': ['remind'],
  'ذكرني': ['remind'],
  'ريمايندر': ['remind'],
  'reminder': ['remind'],
};

/**
 * مسافة التعديل بين كلمتين (Damerau–Levenshtein مبسّطة):
 * تبديل حرفين متجاورين (help ↔ hlep) يُحسب خطوة واحدة، مثل الغلطات الشائعة بالكتابة.
 */
function distance(a, b) {
  const s1 = String(a);
  const s2 = String(b);
  if (s1 === s2) return 0;
  const m = s1.length;
  const n = s2.length;
  if (!m) return n;
  if (!n) return m;

  const grid = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) grid[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(grid[i - 1][j] + 1, grid[i][j - 1] + 1, grid[i - 1][j - 1] + cost);
      /* حرفان متجاوران مقلوبان = خطوة واحدة */
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1);
      }
    }
  }
  return grid[m][n];
}

/** تنظيف الكلمة: حروف صغيرة + إزالة الحركات والتشكيل */
function normalize(word) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/** قائمة الأوامر المتاحة لهذا المشاهد (العضو العادي يشوف أوامر الأعضاء فقط) */
function audienceNames(staff = false) {
  return staff ? Object.keys(catalog.COMMANDS) : catalog.namesOf('member');
}

/**
 * الأوامر المشابهة لنص كتبه العضو.
 * @param {string} text رسالة العضو
 * @param {{staff?: boolean, limit?: number}} options
 * @returns {{word: string, matches: object[], reason: string}|null}
 */
function similar(text, { staff = false, limit = 5 } = {}) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  /* الكلمة الأولى فقط، وبحد أقصى كلمتين (مثل «فك الحظر») */
  const words = raw.split(/\s+/).slice(0, 2);
  const available = new Set(audienceNames(staff));
  const scored = new Map(); // name → { score, why }

  const consider = (name, score, why) => {
    if (!catalog.COMMANDS[name]) return;
    if (!available.has(name)) return; // أمر إدارة ما ينكشف لعضو عادي
    const prev = scored.get(name);
    if (!prev || score > prev.score) scored.set(name, { score, why });
  };

  /* ١) مطابقة عربية صريحة (كلمة أو كلمتين) */
  const twoWords = words.slice(0, 2).join(' ');
  for (const [key, names] of Object.entries(HINTS)) {
    const keyNorm = normalize(key);
    const exact = normalize(words[0]) === keyNorm || normalize(twoWords) === keyNorm;
    if (exact) names.forEach((n, i) => consider(n, 100 - i, 'عربي'));
  }

  /* ٢) مشابهة عربية (حرف زيادة أو ناقص) */
  if (!scored.size) {
    for (const [key, names] of Object.entries(HINTS)) {
      const keyNorm = normalize(key);
      const word = normalize(words[0]);
      if (word.length < 3 || keyNorm.length < 3) continue;
      if (word.includes(keyNorm) || keyNorm.includes(word)) {
        names.forEach((n, i) => consider(n, 60 - i, 'قريب'));
      }
    }
  }

  /* ٣) اسم أمر إنجليزي مباشر أو قريب منه (غلطة كتابة) */
  const first = words[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (first.length >= 3) {
    for (const name of available) {
      const lower = name.toLowerCase();
      if (lower === first) continue; // هذا أمر صحيح — ما يحتاج اقتراح
      if (lower.startsWith(first) || first.startsWith(lower)) {
        consider(name, 70, 'اسم قريب');
        continue;
      }
      const maxDistance = lower.length >= 5 ? 2 : 1;
      if (Math.abs(lower.length - first.length) <= maxDistance && distance(lower, first) <= maxDistance) {
        consider(name, 55, 'غلطة كتابة');
      }
    }

    /* الاختصارات المتاحة كمان (alias → اسم الأمر) */
    try {
      const text = require('./textCommands');
      const { config } = text.aliasIndex ? text.aliasIndex('') : { config: null };
      if (config) {
        for (const [name, aliases] of Object.entries(config.aliases)) {
          for (const alias of aliases) {
            if (!available.has(name)) continue;
            if (alias === first) continue;
            const maxDistance = alias.length >= 5 ? 1 : 0;
            if (maxDistance && Math.abs(alias.length - first.length) <= maxDistance && distance(alias, first) <= maxDistance) {
              consider(name, 40, 'اختصار قريب');
            }
          }
        }
      }
    } catch { /* الاختصارات اختيارية */ }
  }

  if (!scored.size) return null;

  const matches = [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([name]) => {
      const meta = catalog.COMMANDS[name];
      return {
        name,
        label: meta.label,
        what: meta.what,
        usage: meta.usage?.[0] || name,
        example: meta.examples?.[0] || meta.usage?.[0] || name,
        audience: catalog.audienceOf(name),
        audienceBadge: catalog.AUDIENCES[catalog.audienceOf(name)]?.badge || '',
        subs: meta.subs ? Object.keys(meta.subs) : [],
      };
    });

  return { word: words.join(' '), matches };
}

/**
 * يرسل رسالة «هل تقصد؟» بنفس أسلوب بوتات الأوامر المعروفة:
 * الأوامر المشابهة مع طريقة كتابتها ومثال جاهز.
 */
async function reply(message, result, { staff = false } = {}) {
  const embeds = require('../lib/embeds');
  const config = require('../config');
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const lines = result.matches.map((m) => {
    const badge = m.audience === 'member' ? 'للأعضاء' : 'للإدارة';
    return [
      `**\`${m.example}\`** — ${m.label} (${badge})`,
      `> ${m.what}`,
    ].join('\n');
  });

  const fields = result.matches.length > 3 ? null : undefined;
  const embed = embeds.base({
    color: 0x5865f2,
    title: `هل تقصد «${result.matches[0].label}»؟`,
    description: [
      `كتبت **${result.word}** — هاي الأوامر المشابهة:`,
      '',
      ...lines,
    ].join('\n').slice(0, 3800),
    footer: staff
      ? 'اكتب الأمر مباشرة بلا أي رمز قبله · أو استعمل السلاش /'
      : 'كلها أوامر أعضاء — اكتب الأمر مباشرة بلا أي رمز قبله',
    ...(fields ? { fields } : {}),
  });

  const base = String(config.web.url || '').replace(/\/$/, '');
  const components = [];
  if (/^https?:\/\//i.test(base)) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('شرح كل الأوامر في الموقع')
          .setStyle(ButtonStyle.Link)
          .setURL(message.guild ? `${base}/dashboard/${message.guild.id}#commandGuide` : `${base}/dashboard`),
        new ButtonBuilder().setLabel('لوحة التحكم').setStyle(ButtonStyle.Link).setURL(`${base}/dashboard`),
      ),
    );
  }

  await message.reply({
    embeds: [embed],
    components,
    allowedMentions: { repliedUser: false },
  }).catch(() => null);
}

/** فترة الهدوء: رد واحد لكل عضو كل ٤٥ ثانية (حتى ما يزعّج) */
const lastReplyAt = new Map();
const COOLDOWN_MS = 45_000;

function onCooldown(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const last = lastReplyAt.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return true;
  lastReplyAt.set(key, Date.now());
  if (lastReplyAt.size > 2000) {
    for (const [k, at] of lastReplyAt) if (Date.now() - at > COOLDOWN_MS) lastReplyAt.delete(k);
  }
  return false;
}

/**
 * نقطة الالتحام مع مسار الرسائل: تقرّر إذا نردّ باقتراح أم لا.
 * @returns {Promise<boolean>} هل ردّنا؟
 */
async function handleMessage(client, message, { staff = false, enabled = true } = {}) {
  if (!enabled || message.author?.bot || !message.guild) return false;

  const text = String(message.content || '').trim();
  if (!text) return false;

  /* ما نردّ إلا على كلمة أو كلمتين قصيرتين — الكلام العادي والجمل الطويلة ما تتأثر */
  const words = text.split(/\s+/);
  if (words.length > 2) return false;
  if (text.length > 24) return false;
  /* لو فيه منشن أو رابط، هذا مو أمر مكتوب */
  if (/<[@#]|https?:\/\//.test(text)) return false;

  const result = similar(text, { staff, limit: 5 });
  if (!result) return false;
  if (onCooldown(message.guild.id, message.author.id)) return false;

  await reply(message, result, { staff });

  try {
    require('../lib/audit').guild(null, message.guild.id, {
      action: 'command.suggest',
      target: result.matches.map((m) => m.name).join(' · '),
      detail: `${message.author.tag} كتب «${result.word}» فاقترحنا عليه أوامر مشابهة`,
      actor: { id: message.author.id, name: message.author.tag },
      severity: 'info',
    });
  } catch { /* السجل ما يوقف شي */ }

  return true;
}

module.exports = { similar, reply, handleMessage, HINTS, distance, normalize };
