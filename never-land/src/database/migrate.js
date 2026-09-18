'use strict';

/**
 * database/migrate.js
 * -------------------------------------------------------------
 * ترقية إعدادات السيرفرات المحفوظة عند تغيّر نموذج الإعدادات.
 *
 * المستخدم في كلا المشغّلين (SQLite و JSON) بعد دمج الإعدادات،
 * فالسيرفرات القديمة تنتقل للنموذج الجديد بلا أي تدخّل يدوي.
 *
 * الترقيات:
 *   • النسخة ٢ (نظام التفاعل بالأحرف):
 *       - الكولداون القديم (٦٠ ثانية = القيمة الافتراضية للسابق) → صفر،
 *         لأن النموذج الجديد يحسب الخبرة بالأحرف والحماية الذكية تكفي.
 *       - إضافة حقول النموذج الجديد من الإعدادات الافتراضية تلقائيًا.
 * -------------------------------------------------------------
 */

const LEVELING_SETTINGS_VERSION = 2;

/** الكولداون الافتراضي في النموذج القديم (يُعتبر قيمة افتراضية لا اختيارًا) */
const LEGACY_DEFAULT_COOLDOWN = 60;

/**
 * ترقية إعدادات سيرفر واحد (تعديل في المكان).
 * @param {object} settings الإعدادات بعد الدمج مع الافتراضيات
 * @returns {object} نفس الكائن بعد الترقية
 */
function migrateSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;

  const leveling = settings.leveling;
  if (leveling && typeof leveling === 'object') {
    const version = Number(leveling.settingsVersion || 1);

    if (version < LEVELING_SETTINGS_VERSION) {
      /* النموذج الجديد: بلا كولداون — الحماية الذكية من السبام هي التي تنظّم */
      if (Number(leveling.cooldownSeconds) === LEGACY_DEFAULT_COOLDOWN) leveling.cooldownSeconds = 0;
      leveling.settingsVersion = LEVELING_SETTINGS_VERSION;
    }
  }

  return settings;
}

module.exports = { migrateSettings, LEVELING_SETTINGS_VERSION };
