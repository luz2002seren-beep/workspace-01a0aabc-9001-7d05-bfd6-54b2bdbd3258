'use strict';

/**
 * systems/autoreply.js
 * -------------------------------------------------------------
 * الردود التلقائية (AutoReply):
 *
 *   العضو يكتب كلمة مفتاحية → البوت يرد عليه بالرسالة المحدّدة.
 *
 *   • تعمل في كل قنوات السيرفر افتراضيًا (ويمكن حصرها بقنوات معيّنة)
 *   • أكثر من كلمة لكل قاعدة (عربي مع تشكيل/همزات؟ يتجاهلها)
 *   • ثلاثة أنواع مطابقة: تحتوي · مطابقة تمامًا · تبدأ بـ
 *   • أكثر من صيغة للرد: تُفصل بـ | ويختار البوت واحدة عشوائيًا
 *   • متغيّرات داخل الرد: {user} {name} {server} {channel}
 *   • كولداون لكل عضو حتى ما يصير سبام ردود
 *   • حذف رد البوت تلقائيًا بعد مدة (اختياري)
 *   • قاعدة واحدة ترد على الرسالة (الأولى المطابقة) — بلا تكرار ردود
 * -------------------------------------------------------------
 */

const db = require('../database');
const { normalizeArabic } = require('../lib/arabicText');

/** كولداون الردود: `${guildId}:${userId}:${ruleId}` → وقت آخر رد */
const replyCooldown = new Map();

/** أنواع المطابقة المدعومة */
const MATCH_MODES = {
  contains: 'تحتوي على الكلمة',
  exact: 'الرسالة نفسها بالضبط',
  starts: 'تبدأ بالكلمة',
};

/** قائمة كلمات القاعدة (تدعم كلمة واحدة أو مصفوفة أو نص مفصول بفواصل) */
function ruleTriggers(rule) {
  if (!rule) return [];
  const raw = rule.triggers ?? rule.trigger ?? rule.words ?? rule.word ?? [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,،|]/);
  return list.map((t) => String(t).trim()).filter(Boolean);
}

/** هل الرسالة تطابق القاعدة؟ (المقارنة بعد التطبيع العربي) */
function matchRule(rule, content) {
  const triggers = ruleTriggers(rule);
  if (!triggers.length) return false;

  const mode = MATCH_MODES[rule.match] ? rule.match : 'contains';
  const text = normalizeArabic(content);
  if (!text) return false;

  return triggers.some((trigger) => {
    const needle = normalizeArabic(trigger);
    if (!needle) return false;
    if (mode === 'exact') return text === needle;
    if (mode === 'starts') return text.startsWith(needle);
    return text.includes(needle);
  });
}

/** اختيار صيغة الرد: عدة صيغ تُفصل بـ | → واحدة عشوائية */
function pickReply(reply, random = Math.random) {
  const variants = String(reply || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!variants.length) return '';
  if (variants.length === 1) return variants[0];
  return variants[Math.floor(random() * variants.length) % variants.length];
}

/** تعويض المتغيّرات داخل الرد */
function applyVariables(text, { message, member } = {}) {
  const guild = message?.guild;
  const author = member || message?.member || message?.author;
  const values = {
    '{user}': author ? `<@${author.id}>` : '',
    '{name}': String(author?.displayName || author?.username || ''),
    '{server}': String(guild?.name || ''),
    '{channel}': message?.channel ? `<#${message.channel.id}>` : '',
  };
  let out = String(text || '');
  for (const [key, value] of Object.entries(values)) out = out.split(key).join(value);
  return out;
}

/** هل القناة مسموحة لهذه القاعدة؟ (فاضي = كل قنوات السيرفر) */
function channelAllowed(rule, channelId) {
  const list = Array.isArray(rule?.channels) ? rule.channels.filter(Boolean) : [];
  if (!list.length) return true;
  return list.includes(String(channelId));
}

/** أول قاعدة مطابقة للرسالة (مع احترام نطاق القنوات) */
function findRule(cfg, content, channelId) {
  const rules = Array.isArray(cfg?.rules) ? cfg.rules : [];
  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    if (!channelAllowed(rule, channelId)) continue;
    if (matchRule(rule, content)) return rule;
  }
  return null;
}

/** هل العضو في كولداون هذه القاعدة؟ */
function onCooldown(guildId, userId, rule, cfg, at = Date.now()) {
  const seconds = Math.max(0, Number(rule?.cooldownSeconds ?? cfg?.cooldownSeconds ?? 15));
  if (!seconds) return false;
  const key = `${guildId}:${userId}:${rule.id || normalizeArabic(ruleTriggers(rule)[0] || 'rule')}`;
  const last = replyCooldown.get(key) || 0;
  if (replyCooldown.size > 4000) replyCooldown.clear();
  if (at - last < seconds * 1000) return true;
  replyCooldown.set(key, at);
  return false;
}

/**
 * معالجة رسالة: هل فيها كلمة مفتاحية لها رد؟
 * @returns {Promise<{replied:boolean, rule?:object, text?:string, reason?:string}>}
 */
async function handleMessage(client, message) {
  try {
    if (!message?.guild) return { replied: false };
    if (!message.channel?.isTextBased?.()) return { replied: false };

    const settings = db.getGuildSettings(message.guild.id);
    const cfg = settings.autoReply;
    if (!cfg?.enabled) return { replied: false };
    if (cfg.ignoreBots !== false && message.author?.bot) return { replied: false };
    if (!Array.isArray(cfg.rules) || !cfg.rules.length) return { replied: false };

    /* كل قنوات السيرفر افتراضيًا — وإن أُطفئ الخيار نحترم قنوات كل قاعدة فقط */
    const scoped = cfg.anywhereInServer === false;

    const rule = findRule(scoped ? { ...cfg, rules: cfg.rules.map((r) => ({ ...r, channels: r.channels || [] })) } : cfg, message.content, message.channelId);
    if (!rule) return { replied: false, reason: 'no_match' };
    if (channelAllowed(rule, message.channelId) === false) return { replied: false, reason: 'channel_skip' };

    if (onCooldown(message.guild.id, message.author.id, rule, cfg)) {
      return { replied: false, rule, reason: 'cooldown' };
    }

    const text = applyVariables(pickReply(rule.reply, Math.random), { message });
    if (!text) return { replied: false, rule, reason: 'empty_reply' };

    const sent = await message
      .reply({
        content: text,
        allowedMentions: { repliedUser: rule.pingUser === true, parse: [] },
      })
      .catch(async () => message.channel.send({ content: text }).catch(() => null));

    if (!sent) return { replied: false, rule, reason: 'send_failed' };

    /* حذف الرد بعد مدة (اختياري) */
    const delay = Math.max(0, Number(rule.deleteAfterSeconds ?? cfg.deleteAfterSeconds ?? 0));
    if (delay && typeof sent.delete === 'function') {
      const timer = setTimeout(() => sent.delete().catch(() => {}), delay * 1000);
      timer.unref?.();
    }

    return { replied: true, rule, text };
  } catch (err) {
    console.error('[تنبيه] خطأ في الردود التلقائية:', err.message);
    return { replied: false, reason: 'error' };
  }
}

/** معاينة رد بدون إرسال (لأمر /autoreply test والاختبارات) */
function preview(guildId, content, channelId = null) {
  const cfg = db.getGuildSettings(guildId).autoReply || {};
  const rule = findRule(cfg, content, channelId);
  if (!rule) return { matched: false };
  return {
    matched: true,
    rule,
    triggers: ruleTriggers(rule),
    reply: applyVariables(pickReply(rule.reply, () => 0), {
      message: { guild: { id: guildId, name: '' }, channel: null, member: null, author: null },
    }),
  };
}

/**
 * زرع قاعدة البداية للسيرفرات اللي ما عندها ردود تلقائية (مرة واحدة فقط).
 * تُنادى عند الإقلاع. لو المستخدم حذفها من الموقع، العلامة starterSeeded تمنع رجوعها.
 * @returns {number} عدد السيرفرات اللي زُرعت فيها القاعدة
 */
function seedStarterRules() {
  let count = 0;
  try {
    const guilds = db.getAllGuilds();
    for (const guild of guilds) {
      const cfg = guild?.settings?.autoReply;
      if (!cfg) continue;
      if (cfg.starterSeeded === true) continue;
      const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
      const patch = { starterSeeded: true };
      if (!rules.length) patch.rules = [starterRule()];
      db.updateGuildSettings(guild.id, { autoReply: patch });
      if (!rules.length) count += 1;
    }
  } catch (err) {
    console.error('[تنبيه] تعذّر زرع الردود التلقائية الافتراضية:', err.message);
  }
  return count;
}

/** تفريغ الكولداون (للاختبار/الإدارة) */
function clearCooldowns() {
  replyCooldown.clear();
}

/**
 * قاعدة بداية (تُزرع مرة واحدة للسيرفرات اللي ما عندها ردود):
 * ترحيب جاهز حتى يشتغل النظام من أول لحظة — تُعدّل أو تُحذف من الموقع.
 */
function starterRule() {
  return {
    id: 'starter-greeting',
    triggers: ['مرحبا', 'هلا', 'السلام عليكم', 'هاي'],
    match: 'contains',
    reply: 'أهلًا وسهلًا {user} — نورت سيرفر {server}. إذا بدك مساعدة اكتب «مساعدة».',
    channels: [],
    cooldownSeconds: 15,
    deleteAfterSeconds: 0,
    pingUser: false,
    enabled: true,
  };
}

module.exports = {
  handleMessage,
  starterRule,
  preview,
  seedStarterRules,
  matchRule,
  findRule,
  pickReply,
  applyVariables,
  ruleTriggers,
  channelAllowed,
  clearCooldowns,
  MATCH_MODES,
};
