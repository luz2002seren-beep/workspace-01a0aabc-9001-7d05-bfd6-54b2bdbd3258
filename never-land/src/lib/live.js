'use strict';

/**
 * lib/live.js
 * -------------------------------------------------------------
 * الرابط الحيّ بين البوت والموقع (اتجاهان):
 *
 *   الموقع ← البوت: أي حفظ من اللوحة يُكتب في نفس قاعدة البيانات، والبوت
 *   يقرأ الإعدادات لحظة كل استخدام — يعني التغيير ينطبق فورًا بلا إعادة تشغيل.
 *
 *   البوت ← الموقع: أي تغيير يصير من داخل ديسكورد (أوامر السلاش مثل /welcome)
 *   تُبثّ للصفحات المفتوحة لحظيًا عبر البث الحيّ (SSE) فتتحدّث اللوحة لحالها.
 *
 * كل نداء كتابة يمرّ من هنا: نعرف مين كتب (جلسة موقع أو البوت)، فنعطي كل
 * تغيير مصدره الحقيقي، والصفحة اللي كتبت هي نفسها ما تتحدّث (حتى ما يضيع شغلها).
 * -------------------------------------------------------------
 */

const { EventEmitter } = require('node:events');

const bus = new EventEmitter();
/* عدد المستمعين الصغير لا يبرّر تحذيرًا عند كل صفحة تُفتح */
bus.setMaxListeners(0);

/**
 * طلبات الحفظ الجايّة من الموقع، لكل سيرفر: { [guildId]: { count, clientId } }.
 * نعرف الطلب «شغّال» من أول المسار لآخره (حتى ترجع الاستجابة)، فكل كتابة
 * قاعدة بيانات تصير داخل هذه الفترة تُحسب «من الموقع» — والباقي من ديسكورد.
 */
const siteWrites = new Map();

/** بدء طلب حفظ من الموقع (يُنادى من وسيط مسارات الحفظ) */
function noteSiteWrite(guildId, clientId = null) {
  if (!guildId) return;
  const key = String(guildId);
  const prev = siteWrites.get(key);
  siteWrites.set(key, { count: (prev?.count || 0) + 1, clientId: clientId || prev?.clientId || null });
}

/** انتهاء طلب الحفظ (يُنادى عند إغلاق الاستجابة) */
function endSiteWrite(guildId) {
  if (!guildId) return;
  const key = String(guildId);
  const prev = siteWrites.get(key);
  if (!prev) return;
  const count = prev.count - 1;
  if (count <= 0) siteWrites.delete(key);
  else siteWrites.set(key, { ...prev, count });
}

/**
 * بثّ تغيير إعدادات لسيرفر.
 * يتنادى تلقائيًا بعد أي كتابة في قاعدة البيانات (من الموقع أو من البوت).
 */
function settingsChanged(guildId, extra = {}) {
  if (!guildId) return;
  const recent = siteWrites.get(String(guildId));
  const fromSite = Boolean(recent && recent.count > 0);

  const payload = {
    guildId: String(guildId),
    at: Date.now(),
    source: fromSite ? 'site' : 'bot',
    clientId: fromSite ? recent.clientId : null,
    ...extra,
  };

  bus.emit('settings', payload);
}

/** الاشتراك في تغييرات الإعدادات (تشترك فيه صفحة البث الحيّ) */
function onSettings(fn) {
  bus.on('settings', fn);
  return () => bus.off('settings', fn);
}

module.exports = { noteSiteWrite, endSiteWrite, settingsChanged, onSettings };
