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

/** مفاتيح نموذج الخبرة القديم (قبل نظام الأحرف) — وجودها يعني إعدادات قديمة محفوظة */
const LEGACY_KEYS = ['minXp', 'maxXp', 'voiceMinXp', 'voiceMaxXp'];

/** الكولداون الافتراضي في النموذج القديم (يُعتبر قيمة افتراضية لا اختيارًا) */
const LEGACY_DEFAULT_COOLDOWN = 60;

/**
 * ترقية إعدادات سيرفر واحد (تعديل في المكان).
 * الفحص يعتمد على وجود مفاتيح النموذج القديم نفسها — لا على رقم إصدار محفوظ،
 * لأن الإصدار قد يُكتب في الإعدادات قبل أن تُنفَّذ الترقية (القراءة تدمج الافتراضيات ثم الكتابة تحفظها).
 * @param {object} settings الإعدادات بعد الدمج مع الافتراضيات
 * @returns {object} نفس الكائن بعد الترقية
 */
function migrateSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;

  const leveling = settings.leveling;
  if (!leveling || typeof leveling !== 'object') return settings;

  const hasLegacyModel = LEGACY_KEYS.some((key) => key in leveling);

  if (hasLegacyModel) {
    /* النموذج الجديد: بلا كولداون — الحماية الذكية من السبام هي التي تنظّم */
    if (Number(leveling.cooldownSeconds) === LEGACY_DEFAULT_COOLDOWN) leveling.cooldownSeconds = 0;
    /* نشيل حقول النموذج القديم حتى ما تبقى مخزّنة */
    for (const key of LEGACY_KEYS) delete leveling[key];
    leveling.settingsVersion = LEVELING_SETTINGS_VERSION;
  }

  return settings;
}

module.exports = { migrateSettings, LEVELING_SETTINGS_VERSION };
