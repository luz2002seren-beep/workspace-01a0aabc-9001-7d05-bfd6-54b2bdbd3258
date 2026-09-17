-- ==========================================================
--  Never Land  |  مخطط قاعدة البيانات (SQLite)
-- ==========================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- إعدادات كل سيرفر (JSON مرن حتى نضيف أي ميزة جديدة بدون تعديل الجداول)
CREATE TABLE IF NOT EXISTS guilds (
  id          TEXT PRIMARY KEY,
  settings    TEXT NOT NULL DEFAULT '{}',
  locale      TEXT NOT NULL DEFAULT 'ar',
  premium     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- سجل العقوبات: تحذير / طرد / حظر / إسكات / فك حظر ... كلها حالات (cases)
CREATE TABLE IF NOT EXISTS cases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT NOT NULL,
  type           TEXT NOT NULL,              -- warn | ban | unban | kick | timeout | untimeout | automod
  user_id        TEXT NOT NULL,
  user_tag       TEXT,
  moderator_id   TEXT NOT NULL,
  moderator_tag  TEXT,
  reason         TEXT,
  duration       INTEGER,                    -- مللي ثانية (للإسكات المؤقت)
  active         INTEGER NOT NULL DEFAULT 1, -- 0 = منتهي/ملغى
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_guild   ON cases (guild_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_cases_user    ON cases (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cases_type    ON cases (guild_id, type);

-- التذاكر
CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open', -- open | closed
  claimed_by    TEXT,
  transcript    TEXT,                        -- رابط أو نص المحادثة
  created_at    INTEGER NOT NULL,
  closed_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets (guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_user  ON tickets (guild_id, user_id);

-- نظام الخبرة (Leveling)
CREATE TABLE IF NOT EXISTS levels (
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  xp            INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 0,
  messages      INTEGER NOT NULL DEFAULT 0,
  voice_minutes INTEGER NOT NULL DEFAULT 0,
  last_xp_at    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_levels_xp ON levels (guild_id, xp DESC);

-- إحصائيات يومية للوحة التحكم (رسم بياني للرسائل/الأعضاء)
CREATE TABLE IF NOT EXISTS stats_daily (
  guild_id   TEXT NOT NULL,
  day        TEXT NOT NULL,   -- YYYY-MM-DD
  messages   INTEGER NOT NULL DEFAULT 0,
  joins      INTEGER NOT NULL DEFAULT 0,
  leaves     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, day)
);

-- مخزن عام (لقطات المزامنة الحقيقية من ديسكورد + حالة المزامنة)
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- التذكيرات (Reminders)
CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  content    TEXT NOT NULL,
  remind_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders (remind_at);
