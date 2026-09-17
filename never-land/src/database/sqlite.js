'use strict';

/**
 * database/sqlite.js
 * -------------------------------------------------------------
 * مشغّل قاعدة البيانات الأساسي (SQLite عبر better-sqlite3).
 * أسرع من JSON بمراحل ومناسب للبوتات الكبيرة.
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { mergeSettings } = require('./defaults');

let db = null;

const now = () => Date.now();

const today = () => new Date().toISOString().slice(0, 10);

/** تحويل صف السيرفر إلى كائن جاهز مع الإعدادات مدموجة */
function hydrateGuild(row, defaults) {
  if (!row) return null;
  let settings = {};
  try {
    settings = JSON.parse(row.settings || '{}');
  } catch {
    settings = {};
  }
  return {
    id: row.id,
    locale: row.locale,
    premium: Boolean(row.premium),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settings: mergeSettings(defaults, settings),
  };
}

module.exports = {
  name: 'sqlite',

  init(config) {
    const file = config.database.path;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new Database(file);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    return this;
  },

  /* ----------------------- المخزن العام (لقطات المزامنة) ----------------------- */

  getKV(key) {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  setKV(key, value) {
    db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, String(value), now());
    return true;
  },

  delKV(key) {
    db.prepare('DELETE FROM kv WHERE key = ?').run(key);
    return true;
  },

  listKV(prefix = '') {
    return db.prepare('SELECT key, value, updated_at FROM kv WHERE key LIKE ? ORDER BY key').all(`${prefix}%`);
  },

  /* ----------------------- السيرفرات والإعدادات ----------------------- */

  ensureGuild(guildId) {
    const exists = db.prepare('SELECT id FROM guilds WHERE id = ?').get(guildId);
    if (!exists) {
      db.prepare('INSERT INTO guilds (id, settings, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(guildId, '{}', 'ar', now(), now());
    }
  },

  getGuild(guildId, defaults) {
    this.ensureGuild(guildId);
    return hydrateGuild(db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId), defaults);
  },

  getAllGuilds(defaults) {
    return db.prepare('SELECT * FROM guilds ORDER BY updated_at DESC').all().map((r) => hydrateGuild(r, defaults));
  },

  updateGuildSettings(guildId, patch, defaults) {
    this.ensureGuild(guildId);
    const current = hydrateGuild(db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId), defaults);
    const merged = mergeSettings(current.settings, patch);
    db.prepare('UPDATE guilds SET settings = ?, locale = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(merged), merged.language || current.locale, now(), guildId);
    return { ...current, settings: merged, updatedAt: now() };
  },

  setGuildPath(guildId, dotPath, value, defaults) {
    const patch = {};
    const keys = dotPath.split('.');
    let cursor = patch;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) cursor[key] = value;
      else cursor = cursor[key] = {};
    });
    return this.updateGuildSettings(guildId, patch, defaults);
  },

  deleteGuild(guildId) {
    db.prepare('DELETE FROM guilds WHERE id = ?').run(guildId);
  },

  /* ------------------------------- الحالات ------------------------------- */

  addCase({ guildId, type, userId, userTag = null, moderatorId, moderatorTag = null, reason = null, duration = null, active = 1 }) {
    const info = db.prepare(`
      INSERT INTO cases (guild_id, type, user_id, user_tag, moderator_id, moderator_tag, reason, duration, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, type, userId, userTag, moderatorId, moderatorTag, reason, duration, active, now());
    return this.getCase(guildId, info.lastInsertRowid);
  },

  getCase(guildId, id) {
    return db.prepare('SELECT * FROM cases WHERE guild_id = ? AND id = ?').get(guildId, id) || null;
  },

  listCases({ guildId, userId = null, type = null, active = null, limit = 50, offset = 0 }) {
    const where = ['guild_id = ?'];
    const params = [guildId];
    if (userId) {
      where.push('user_id = ?');
      params.push(userId);
    }
    if (type) {
      where.push('type = ?');
      params.push(type);
    }
    if (active !== null) {
      where.push('active = ?');
      params.push(active ? 1 : 0);
    }
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS c FROM cases WHERE ${clause}`).get(...params).c;
    const items = db.prepare(`SELECT * FROM cases WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    return { items, total };
  },

  countCases(guildId, { type = null, userId = null, active = null } = {}) {
    const where = ['guild_id = ?'];
    const params = [guildId];
    if (type) {
      where.push('type = ?');
      params.push(type);
    }
    if (userId) {
      where.push('user_id = ?');
      params.push(userId);
    }
    if (active !== null) {
      where.push('active = ?');
      params.push(active ? 1 : 0);
    }
    return db.prepare(`SELECT COUNT(*) AS c FROM cases WHERE ${where.join(' AND ')}`).get(...params).c;
  },

  updateCase(guildId, id, patch) {
    const allowed = ['reason', 'active', 'duration'];
    const keys = Object.keys(patch).filter((k) => allowed.includes(k));
    if (!keys.length) return this.getCase(guildId, id);
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE cases SET ${sets} WHERE guild_id = ? AND id = ?`)
      .run(...keys.map((k) => patch[k]), guildId, id);
    return this.getCase(guildId, id);
  },

  deleteCase(guildId, id) {
    return db.prepare('DELETE FROM cases WHERE guild_id = ? AND id = ?').run(guildId, id).changes > 0;
  },

  /** حذف كل تحذيرات عضو */
  clearWarnings(guildId, userId) {
    return db.prepare('DELETE FROM cases WHERE guild_id = ? AND user_id = ? AND type = ?')
      .run(guildId, userId, 'warn').changes;
  },

  /* ------------------------------- التذاكر ------------------------------- */

  createTicket({ guildId, channelId, userId, type }) {
    const info = db.prepare(`
      INSERT INTO tickets (guild_id, channel_id, user_id, type, status, created_at)
      VALUES (?, ?, ?, ?, 'open', ?)
    `).run(guildId, channelId, userId, type, now());
    return this.getTicketById(info.lastInsertRowid);
  },

  getTicketById(id) {
    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) || null;
  },

  getTicketByChannel(channelId) {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId) || null;
  },

  listTickets({ guildId, userId = null, status = null, limit = 50, offset = 0 }) {
    const where = ['guild_id = ?'];
    const params = [guildId];
    if (userId) {
      where.push('user_id = ?');
      params.push(userId);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE ${clause}`).get(...params).c;
    const items = db.prepare(`SELECT * FROM tickets WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    return { items, total };
  },

  countTickets(guildId, status = null) {
    if (status) {
      return db.prepare('SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status = ?').get(guildId, status).c;
    }
    return db.prepare('SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ?').get(guildId).c;
  },

  updateTicket(id, patch) {
    const allowed = ['status', 'claimed_by', 'transcript', 'closed_at', 'type'];
    const keys = Object.keys(patch).filter((k) => allowed.includes(k));
    if (keys.length) {
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE tickets SET ${sets} WHERE id = ?`).run(...keys.map((k) => patch[k]), id);
    }
    return this.getTicketById(id);
  },

  /* ------------------------------- الخبرة ------------------------------- */

  getLevelRow(guildId, userId) {
    return db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || null;
  },

  upsertLevel(guildId, userId, { xp, level, messages, voiceMinutes, lastXpAt }) {
    db.prepare(`
      INSERT INTO levels (guild_id, user_id, xp, level, messages, voice_minutes, last_xp_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET
        xp = excluded.xp,
        level = excluded.level,
        messages = excluded.messages,
        voice_minutes = excluded.voice_minutes,
        last_xp_at = excluded.last_xp_at
    `).run(guildId, userId, xp, level, messages, voiceMinutes, lastXpAt);
    return this.getLevelRow(guildId, userId);
  },

  getLeaderboard(guildId, limit = 10, offset = 0) {
    return db.prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?')
      .all(guildId, limit, offset);
  },

  countTrackedMembers(guildId) {
    return db.prepare('SELECT COUNT(*) AS c FROM levels WHERE guild_id = ?').get(guildId).c;
  },

  /* --------------------------- إحصائيات يومية --------------------------- */

  bumpDaily(guildId, field, amount = 1) {
    const day = today();
    if (!['messages', 'joins', 'leaves'].includes(field)) return;
    db.prepare(`
      INSERT INTO stats_daily (guild_id, day, messages, joins, leaves) VALUES (?, ?, 0, 0, 0)
      ON CONFLICT (guild_id, day) DO NOTHING
    `).run(guildId, day);
    db.prepare(`UPDATE stats_daily SET ${field} = ${field} + ? WHERE guild_id = ? AND day = ?`)
      .run(amount, guildId, day);
  },

  /** كتابة إحصائية يوم محدّد (تُستخدم في البيانات التجريبية والتقارير) */
  setDaily(guildId, day, { messages = 0, joins = 0, leaves = 0 } = {}) {
    db.prepare(`
      INSERT INTO stats_daily (guild_id, day, messages, joins, leaves) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, day) DO UPDATE SET
        messages = excluded.messages, joins = excluded.joins, leaves = excluded.leaves
    `).run(guildId, day, messages, joins, leaves);
  },

  getDailyStats(guildId, days = 14) {
    return db.prepare('SELECT * FROM stats_daily WHERE guild_id = ? ORDER BY day DESC LIMIT ?').all(guildId, days).reverse();
  },

  /* ------------------------------ التذكيرات ------------------------------ */

  addReminder({ guildId, channelId, userId, content, remindAt }) {
    const info = db.prepare(`
      INSERT INTO reminders (guild_id, channel_id, user_id, content, remind_at) VALUES (?, ?, ?, ?, ?)
    `).run(guildId, channelId, userId, content, remindAt);
    return db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid);
  },

  dueReminders(ts = now()) {
    return db.prepare('SELECT * FROM reminders WHERE remind_at <= ?').all(ts);
  },

  deleteReminder(id) {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  },

  /* ------------------------------ لوحة التحكم ------------------------------ */

  getStats(guildId) {
    return {
      cases: this.countCases(guildId),
      warnings: this.countCases(guildId, { type: 'warn' }),
      bans: this.countCases(guildId, { type: 'ban' }),
      kicks: this.countCases(guildId, { type: 'kick' }),
      timeouts: this.countCases(guildId, { type: 'timeout' }),
      tickets: this.countTickets(guildId),
      openTickets: this.countTickets(guildId, 'open'),
      trackedMembers: this.countTrackedMembers(guildId),
      xpSum: db.prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM levels WHERE guild_id = ?').get(guildId).s,
      messages: db.prepare('SELECT COALESCE(SUM(messages), 0) AS s FROM levels WHERE guild_id = ?').get(guildId).s,
    };
  },

  close() {
    if (db) db.close();
    db = null;
  },
};
