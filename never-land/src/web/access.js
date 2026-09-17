'use strict';

/**
 * web/access.js
 * -------------------------------------------------------------
 * بوابة الدخول للوحة: هل المستخدم يملك الرول المطلوب؟
 *
 *  - الشرط: وجود الرول (REQUIRED_ROLE_ID) عند العضو في أحد سيرفرات البوت.
 *  - تُفحص الرتبة عبر كاش ديسكورد ثم طلب العضو من الـAPI إذا لزم.
 *  - النتيجة تُخزَّن في الجلسة لمدة ROLE_CACHE_SECONDS لتقليل الطلبات.
 * -------------------------------------------------------------
 */

const config = require('../config');

/** هل التحقق من الرول مفعّل؟ */
function roleRequired() {
  return Boolean(config.web.requiredRoleId && String(config.web.requiredRoleId).length > 5);
}

/** عميل البوت (لا نُحمّله إلا عند الحاجة) */
function botClient() {
  try {
    return require('../client');
  } catch {
    return null;
  }
}

/**
 * فحص وجود الرول عند المستخدم.
 * @returns {Promise<{ok:boolean, reason:string, guild?:string, checked:boolean}>}
 */
async function hasRequiredRole(userId) {
  if (!roleRequired()) return { ok: true, reason: 'no_role_required', checked: false };

  const client = botClient();
  if (!client || !client.isReady?.()) {
    // البوت غير متصل: تعذّر التحقق
    return { ok: false, reason: 'bot_offline', checked: false };
  }

  const roleId = String(config.web.requiredRoleId);
  const candidates = [...client.guilds.cache.values()].filter((g) => g.roles?.cache?.has?.(roleId));
  if (!candidates.length) {
    return { ok: false, reason: 'role_missing_in_guilds', checked: false };
  }

  for (const guild of candidates) {
    try {
      let member = guild.members.cache.get(userId);
      if (!member) member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      if (member.roles?.cache?.has(roleId)) {
        return { ok: true, reason: 'ok', guild: guild.name, checked: true };
      }

      // استثناء آمن: مالك السيرفر ومن يملك «إدارة السيرفر» يدخلون دائمًا
      // (حتى لا يُحبس صاحب السيرفر خارج لوحة تحكم سيرفره)
      const isOwner = String(guild.ownerId) === String(userId);
      const perms = member.permissions;
      const canManage = Boolean(
        perms && (perms.has?.('ManageGuild') || perms.has?.('Administrator') || perms.has?.(0x20n)),
      );
      if (isOwner || canManage) {
        return { ok: true, reason: isOwner ? 'owner' : 'manage_guild', guild: guild.name, checked: true };
      }

      return { ok: false, reason: 'no_role', guild: guild.name, checked: true };
    } catch {
      /* نجرّب السيرفر التالي */
    }
  }

  return { ok: false, reason: 'not_member', checked: true };
}

/**
 * نتيجة الفحص مع كاش قصير في الجلسة.
 * @param {object} session جلسة express
 * @param {string} userId
 */
async function checkAccess(session, userId) {
  const ttl = Math.max(30, Number(config.web.roleCacheSeconds) || 300) * 1000;
  const cached = session.roleCheck;
  if (cached && cached.userId === userId && Date.now() - cached.at < ttl) {
    return { ...cached.result, cached: true };
  }
  const result = await hasRequiredRole(userId);
  session.roleCheck = { userId, at: Date.now(), result };
  return { ...result, cached: false };
}

/** رسالة عربية واضحة لكل حالة */
function explain(result) {
  switch (result.reason) {
    case 'ok':
      return 'الوصول متاح.';
    case 'owner':
      return 'الوصول متاح: أنت مالك السيرفر.';
    case 'manage_guild':
      return 'الوصول متاح: حسابك يملك صلاحية «إدارة السيرفر».';
    case 'no_role':
      return `حسابك مسجّل، لكنه لا يملك الرول المطلوب في "${result.guild || 'السيرفر'}" (المعرّف ${config.web.requiredRoleId}).`;
    case 'not_member':
      return 'حسابك مسجّل، لكنك لست عضوًا في السيرفر الذي فيه الرول المطلوب.';
    case 'bot_offline':
      return 'تعذّر التحقق من الرول: البوت غير متصل حاليًا. شغّل البوت ثم أعد المحاولة.';
    case 'role_missing_in_guilds':
      return 'الرول المطلوب غير موجود في أي سيرفر فيه البوت. تأكد من معرّف الرول.';
    case 'no_role_required':
      return 'لا يوجد رول مطلوب.';
    default:
      return 'تعذّر التحقق من صلاحيتك.';
  }
}

module.exports = { roleRequired, hasRequiredRole, checkAccess, explain, ANON: 'anon' };
