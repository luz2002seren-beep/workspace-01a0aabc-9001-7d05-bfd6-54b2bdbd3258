'use strict';

/**
 * web/sessionStore.js
 * -------------------------------------------------------------
 * مخزن جلسات على القرص (ملف JSON بجانب قاعدة البيانات).
 *
 * لماذا؟ المخزن الافتراضي في Express (MemoryStore) يضيع كل الجلسات
 * عند أي إعادة تشغيل — يعني المستخدم يُطرد من الموقع بعد كل تحديث نشر.
 * هذا المخزن يحفظ الجلسات في ملف داخل نفس مجلد قاعدة البيانات
 * (وعلى Railway: داخل الـVolume الدائم /data) فتبقى الجلسة محفوظة.
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');
const session = require('express-session');

class FileSessionStore extends session.Store {
  /**
   * @param {string} file مسار ملف الجلسات
   * @param {number} ttlMs مدة صلاحية الجلسة
   */
  constructor(file, ttlMs = 7 * 24 * 60 * 60 * 1000) {
    super();
    this.file = file;
    this.ttlMs = ttlMs;
    this.data = new Map();
    this.saveTimer = null;
    this.load();
  }

  /** قراءة الملف عند الإقلاع (يتجاهل التالف) */
  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const now = Date.now();
      for (const [sid, entry] of Object.entries(raw || {})) {
        if (entry && entry.expires > now) this.data.set(sid, entry);
      }
    } catch {
      this.data = new Map();
    }
  }

  /** كتابة مؤجّلة لتقليل عمليات القرص */
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 200);
  }

  saveNow() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const object = {};
      for (const [sid, entry] of this.data) object[sid] = entry;
      fs.writeFileSync(this.file, JSON.stringify(object));
    } catch {
      /* لو فشل الحفظ لا نُسقط الطلب */
    }
  }

  get(sid, cb) {
    const entry = this.data.get(sid);
    if (!entry || entry.expires <= Date.now()) {
      if (entry) this.data.delete(sid);
      return cb(null, null);
    }
    try {
      return cb(null, JSON.parse(entry.session));
    } catch {
      return cb(null, null);
    }
  }

  set(sid, sess, cb) {
    const expires = Date.now() + this.ttlMs;
    try {
      this.data.set(sid, { session: JSON.stringify(sess), expires });
      this.scheduleSave();
    } catch {
      /* تجاهل */
    }
    if (cb) cb(null);
  }

  touch(sid, sess, cb) {
    const entry = this.data.get(sid);
    if (entry) {
      entry.expires = Date.now() + this.ttlMs;
      this.scheduleSave();
    }
    if (cb) cb(null);
  }

  destroy(sid, cb) {
    this.data.delete(sid);
    this.scheduleSave();
    if (cb) cb(null);
  }

  /** تنظيف الجلسات المنتهية (يُنادى كل ساعة) */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [sid, entry] of this.data) {
      if (!entry || entry.expires <= now) {
        this.data.delete(sid);
        removed += 1;
      }
    }
    if (removed) this.scheduleSave();
    return removed;
  }

  length(cb) {
    cb(null, this.data.size);
  }

  all(cb) {
    cb(null, [...this.data.keys()]);
  }
}

module.exports = { FileSessionStore };
