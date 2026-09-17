'use strict';

/**
 * database/index.js
 * -------------------------------------------------------------
 * واجهة موحّدة لقاعدة البيانات. كل الكود يستورد هذا الملف فقط:
 *
 *   const db = require('./database');
 *   const settings = db.getGuildSettings(guildId);
 *
 * المشغّل يُختار تلقائيًا:
 *   - sqlite  (افتراضي، أسرع بكثير)
 *   - json    (بديل بدون أي مكتبات خارجية)
 * ويمكن فرضه من .env عبر DATABASE_DRIVER
 * -------------------------------------------------------------
 */

const config = require('../config');

let driver = null;

/** تهيئة قاعدة البيانات (تُنادى مرة واحدة عند الإقلاع) */
function init() {
  if (driver) return driver;
  const wanted = config.database.driver;

  if (wanted === 'json') {
    driver = require('./json');
  } else {
    try {
      driver = require('./sqlite');
    } catch (err) {
      console.warn('⚠️  تعذّر تحميل better-sqlite3، سيتم استخدام مشغّل JSON:', err.message);
      driver = require('./json');
    }
  }

  driver.init(config);
  console.log(`🗄️  قاعدة البيانات جاهزة (المشغّل: ${driver.name})`);
  return driver;
}

/** غلاف يضمن التهيئة التلقائية قبل أي عملية */
const api = new Proxy(
  {
    init,
    /** إعدادات سيرفر مدموجة مع القيم الافتراضية */
    getGuildSettings(guildId) {
      return init().getGuild(guildId, config.defaults).settings;
    },
    /** كائن السيرفر الكامل (للوحة التحكم) */
    getGuild(guildId) {
      return init().getGuild(guildId, config.defaults);
    },
    getAllGuilds() {
      return init().getAllGuilds(config.defaults);
    },
    updateGuildSettings(guildId, patch) {
      return init().updateGuildSettings(guildId, patch, config.defaults);
    },
    setGuildPath(guildId, dotPath, value) {
      return init().setGuildPath(guildId, dotPath, value, config.defaults);
    },
    /** اللغة المختارة لسيرفر معيّن */
    locale(guildId) {
      if (!guildId) return config.bot.defaultLanguage;
      return init().getGuild(guildId, config.defaults)?.locale || config.bot.defaultLanguage;
    },
    get driverName() {
      return init().name;
    },
  },
  {
    /** أي دالة أخرى تُمرَّر مباشرة للمشغّل بعد التهيئة */
    get(target, prop) {
      if (prop in target) return target[prop];
      const instance = init();
      const value = instance[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  },
);

module.exports = api;
