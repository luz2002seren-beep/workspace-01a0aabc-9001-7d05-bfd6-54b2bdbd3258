'use strict';

/**
 * lib/audit.js
 * -------------------------------------------------------------
 * قراءة سجل التدقيق (Audit Log) لمعرفة مَن نفّذ العقوبة فعلاً.
 * هذا ما يجعل البوت دقيقًا في اللوقات.
 * -------------------------------------------------------------
 */

const { AuditLogEvent } = require('discord.js');

/** انتظار بسيط لأن ديسكورد يسجّل الأحداث بتأخير بضعة أجزاء من الثانية */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * البحث عن منفّذ الحدث من سجل التدقيق.
 * @param {import('discord.js').Guild} guild
 * @param {number} type AuditLogEvent
 * @param {object} opts { targetId, maxAgeMs }
 * @returns {Promise<{executor: ?import('discord.js').User, reason: ?string, entry: ?object}>}
 */
async function findExecutor(guild, type, { targetId = null, maxAgeMs = 8000 } = {}) {
  if (!guild) return { executor: null, reason: null, entry: null };
  if (!guild.members.me?.permissions.has('ViewAuditLog')) return { executor: null, reason: null, entry: null };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 6, type });
      const entry = logs.entries.find((e) => {
        const recent = Date.now() - e.createdTimestamp < maxAgeMs;
        if (!recent) return false;
        if (targetId) return String(e.targetId) === String(targetId);
        return true;
      });
      if (entry) {
        return { executor: entry.executor ?? null, reason: entry.reason ?? null, entry };
      }
    } catch {
      return { executor: null, reason: null, entry: null };
    }
    await sleep(500);
  }
  return { executor: null, reason: null, entry: null };
}

const EVENTS = {
  ban: AuditLogEvent.MemberBanAdd,
  unban: AuditLogEvent.MemberBanRemove,
  kick: AuditLogEvent.MemberKick,
  timeout: AuditLogEvent.MemberUpdate,
  channelCreate: AuditLogEvent.ChannelCreate,
  channelDelete: AuditLogEvent.ChannelDelete,
  channelUpdate: AuditLogEvent.ChannelUpdate,
  roleCreate: AuditLogEvent.RoleCreate,
  roleDelete: AuditLogEvent.RoleDelete,
  memberRoleUpdate: AuditLogEvent.MemberRoleUpdate,
  memberNickname: AuditLogEvent.MemberUpdate,
  messageDelete: AuditLogEvent.MessageDelete,
  messageBulkDelete: AuditLogEvent.MessageBulkDelete,
};

module.exports = { findExecutor, EVENTS };
