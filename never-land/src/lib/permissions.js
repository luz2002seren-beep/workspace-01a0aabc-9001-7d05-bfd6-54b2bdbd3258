'use strict';

/**
 * lib/permissions.js
 * -------------------------------------------------------------
 * فحوصات الصلاحيات والهرمية (Role Hierarchy) قبل تنفيذ أي عقوبة.
 * -------------------------------------------------------------
 */

const { PermissionsBitField } = require('discord.js');

/** هل العضو من الإدارة؟ (مسؤول أو يملك صلاحية إدارة السيرفر) */
function isStaff(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  const perms = member.permissions;
  return (
    perms.has(PermissionsBitField.Flags.Administrator) ||
    perms.has(PermissionsBitField.Flags.ManageGuild) ||
    perms.has(PermissionsBitField.Flags.ModerateMembers)
  );
}

/** هل العضو من المطوّرين المحدّدين في .env؟ */
function isDeveloper(userId, developerIds = []) {
  return developerIds.includes(userId);
}

/**
 * فحص إمكانية تطبيق عقوبة.
 * @returns {{ok: boolean, reason?: string}}
 */
function canModerate({ guild, executor, target, client, action = 'moderate' }) {
  if (!target) return { ok: false, reason: 'userNotFound' };
  if (executor.id === target.id) return { ok: false, reason: 'selfAction' };

  // صاحب السيرفر محصّن دائمًا
  if (target.id === guild.ownerId) return { ok: false, reason: 'hierarchy' };

  // المطوّرون محصّنون من العقوبات
  const config = require('../config');
  if (config.bot.developerIds.includes(target.id)) return { ok: false, reason: 'targetIsStaff' };

  const executorMember = guild.members.cache.get(executor.id);
  const botMember = guild.members.me ?? guild.members.cache.get(client.user.id);

  // لا يعاقب أحدًا أعلى منه رتبة (إلا صاحب السيرفر أو المطوّر)
  const isOwner = executor.id === guild.ownerId;
  const isDev = config.bot.developerIds.includes(executor.id);
  if (!isOwner && !isDev && executorMember) {
    if (executorMember.roles.highest.position <= target.roles.highest.position) {
      return { ok: false, reason: 'hierarchy' };
    }
  }

  // رتبة البوت يجب أن تكون أعلى من الهدف
  if (botMember) {
    if (botMember.roles.highest.position <= target.roles.highest.position) {
      return { ok: false, reason: 'botHierarchy' };
    }
    if (target.id === botMember.id) return { ok: false, reason: 'selfAction' };
  }

  return { ok: true };
}

/** هل يملك البوت الصلاحيات المطلوبة؟ */
function botHasPermissions(guild, permissions = []) {
  const me = guild.members.me;
  if (!me) return false;
  return permissions.every((perm) => me.permissions.has(perm));
}

/** بناء قائمة الصلاحيات المطلوبة لأوامر المودريشن */
function modPermissions() {
  return {
    ban: [PermissionsBitField.Flags.BanMembers],
    kick: [PermissionsBitField.Flags.KickMembers],
    timeout: [PermissionsBitField.Flags.ModerateMembers],
    manageMessages: [PermissionsBitField.Flags.ManageMessages],
    manageChannels: [PermissionsBitField.Flags.ManageChannels],
    manageRoles: [PermissionsBitField.Flags.ManageRoles],
    manageNicknames: [PermissionsBitField.Flags.ManageNicknames],
  };
}

/**
 * إخفاء أوامر الإدارة عن الأعضاء العاديين في ديسكورد نفسه.
 * ديسكورد ما يعرض الأمر لأي عضو ما يملك الصلاحية المطلوبة — يعني الأعضاء
 * ما يشوفوها أصلًا في القائمة (ولا تطلع لهم في الاقتراحات).
 * تنطبّق مرة واحدة على كل أمر أثناء التحميل، فتشمل السلاش والـdeploy معًا.
 * @param {{permissions?: bigint[], data?: object}} command أمر محمّل من مجلد commands/
 * @returns {boolean} هل طُبّق الإخفاء؟
 */
function hideFromMembers(command) {
  const perms = command?.permissions;
  if (!Array.isArray(perms) || !perms.length) return false;
  if (typeof command.data?.setDefaultMemberPermissions !== 'function') return false;

  try {
    const bits = perms.reduce((acc, perm) => acc | BigInt(perm), 0n);
    command.data.setDefaultMemberPermissions(bits);
    command.hiddenFromMembers = true;
    return true;
  } catch {
    return false;
  }
}

/** الصلاحيات المطلوبة لأمر بصيغة الأسماء (للشرح في الموقع) */
function permissionNames(permissions = []) {
  return permissions
    .map((perm) => {
      const entry = Object.entries(PermissionsBitField.Flags).find(([, value]) => value === perm);
      return entry ? entry[0] : String(perm);
    })
    .join(' · ');
}

module.exports = { isStaff, isDeveloper, canModerate, botHasPermissions, modPermissions, hideFromMembers, permissionNames };
