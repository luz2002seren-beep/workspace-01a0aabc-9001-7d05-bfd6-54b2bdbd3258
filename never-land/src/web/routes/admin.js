'use strict';

/**
 * web/routes/admin.js
 * -------------------------------------------------------------
 * لوحة «أعضاء الموقع» — للمالك فقط (OWNER_USER_ID).
 *
 *   GET    /api/admin/me                هل أنا المالك؟
 *   GET    /api/admin/members           قائمة كل من سجّل دخول
 *   POST   /api/admin/members/:id/status  تغيير الحالة: active | viewonly | banned
 *   POST   /api/admin/members/:id/kick    قطع جلساته (طرد فوري من الموقع)
 *   DELETE /api/admin/members/:id         حذف الحساب من السجل
 *
 * كل نقطة محميّة: أي حساب غير المالك (أو المشرفين المضافين) يحصل على 403.
 * -------------------------------------------------------------
 */

const express = require('express');
const config = require('../../config');
const siteUsers = require('../siteUsers');
const { destroyUserSessions, countUserSessions } = require('../server');

const router = express.Router();

/** هل هذا الحساب مسموح له بإدارة الموقع؟ */
function isSiteAdmin(req) {
  const id = String(req.session?.user?.id || '');
  if (!id) return false;
  if (siteUsers.isOwner(id)) return true;
  return (config.web.siteAdmins || []).includes(id);
}

/** حماية: المالك فقط (بما فيهم المشرفون المضافون بإعدادات) */
function ownerOnly(req, res, next) {
  if (config.web.demoData) {
    // في وضع العرض: نسمح بالقراءة فقط حتى تُجرَّب الواجهة
    if (req.method === 'GET') return next();
    return res.status(403).json({ error: 'demo_readonly', message: 'وضع العرض: الإدارة تحتاج توكن حقيقي.' });
  }
  if (!req.session?.user) return res.status(401).json({ error: 'unauthorized', message: 'سجّل الدخول أولًا.' });
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'owner_only', message: 'هذه الصفحة لمالك الموقع فقط.' });
  }
  return next();
}

/** هل أنا المالك؟ (متاحة لأي مسجّل دخول — الواجهة تسأل لتعرف هل تُظهر القسم) */
router.get('/me', (req, res) => {
  const id = String(req.session?.user?.id || '');
  const isAdmin = Boolean(id) && (siteUsers.isOwner(id) || (config.web.siteAdmins || []).includes(id));
  return res.json({
    loggedIn: Boolean(id),
    isOwner: isAdmin,
    me: id || null,
    ownerId: siteUsers.ownerId(),
    demo: Boolean(config.web.demoData),
    statuses: Object.values(siteUsers.STATUS).map(({ key, label, desc }) => ({ key, label, desc })),
  });
});

/* كل ما يلي: المالك فقط */
router.use(ownerOnly);

/** قائمة الأعضاء + الإحصاءات */
router.get('/members', (req, res) => {
  const me = String(req.session?.user?.id || '');
  const members = siteUsers.list().map((u) => ({
    id: u.id,
    username: u.username,
    globalName: u.globalName,
    avatar: u.avatar || null,
    status: u.status,
    isOwner: u.isOwner,
    isMe: u.id === me,
    firstSeen: u.firstSeen || null,
    lastSeen: u.lastSeen || null,
    lastLoginAt: u.lastLoginAt || null,
    visits: u.visits || 0,
    guilds: u.guilds || 0,
    bannedAt: u.bannedAt || null,
    note: u.note || '',
    lastIp: u.lastIp || null,
  }));
  return res.json({
    members,
    stats: siteUsers.stats(),
    statuses: Object.values(siteUsers.STATUS),
    ownerId: siteUsers.ownerId(),
    canManage: !config.web.demoData,
  });
});

/** تغيير حالة عضو: نشِط · مشاهدة فقط · محظور */
router.post('/members/:id/status', async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || '');
  const reason = String(req.body?.reason || '');

  const result = siteUsers.setStatus(id, status, { reason, by: req.session?.user?.id });
  if (!result.ok) {
    const messages = {
      status_unknown: 'حالة غير معروفة.',
      missing_id: 'معرّف العضو ناقص.',
      owner_protected: 'ما يمكن تغيير حالة حساب المالك.',
      user_not_found: 'هذا الحساب غير موجود في السجل.',
    };
    return res.status(400).json({ error: result.error, message: messages[result.error] || 'تعذّر التغيير.' });
  }

  /*
   * ملاحظة مهمّة: عند الحظر لا نقطع الجلسة — نتركها وميضًا حتى يتعرّف الخادم
   * على هوية المحظور في كل طلب ويعرض له صفحة الحظر. لو قطعنا الجلسة لرجع
   * زائرًا مجهولًا وشاهد الصفحات العامة.
   * أما «قطع الجلسة» فهو زر منفصل يطرده من الموقع (يحتاج يسجّل دخول جديد).
   */
  return res.json({
    ok: true,
    user: siteUsers.get(id),
    sessions: await countUserSessions(id),
    message:
      status === 'banned'
        ? 'تم حظر الحساب من الموقع بالكامل — أي صفحة أو أمر يُرفض، وأي محاولة دخول جديدة تُرفض.'
        : status === 'viewonly'
          ? 'صار يشوف الموقع بلا تعديل ولا حفظ.'
          : 'رجع الحساب طبيعيًا.',
  });
});

/** قطع جلسات عضو (طرد فوري بلا حظر) */
router.post('/members/:id/kick', async (req, res) => {
  const { id } = req.params;
  const status = siteUsers.statusOf(id);
  const kicked = await destroyUserSessions(id);
  return res.json({
    ok: true,
    kicked,
    message: kicked ? `تم قطع ${kicked} جلسة — سيحتاج يسجّل دخول من جديد.` : 'ما في جلسة نشطة لهذا الحساب.',
    status,
  });
});

/** حذف الحساب من السجل */
router.delete('/members/:id', (req, res) => {
  const result = siteUsers.forget(req.params.id);
  if (!result.ok) return res.status(400).json({ error: result.error, message: 'تعذّر حذف الحساب.' });
  return res.json({ ok: true, message: 'تم حذف الحساب من سجل الموقع.' });
});

module.exports = router;
