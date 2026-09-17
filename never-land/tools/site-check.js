'use strict';

/**
 * site-check.js
 * -------------------------------------------------------------
 * فحص سريع: هل الموقع شغّال فعلًا على الرابط المذكور؟
 * الاستخدام:  npm run check:site
 * يطبع سبب المشكلة بالعربي إن كان الموقع متوقفًا.
 * -------------------------------------------------------------
 */

const http = require('node:http');
const https = require('node:https');
const config = require('../src/config');

/** طلب GET مع مهلة قصيرة */
function request(url, timeout = 6000) {
  return new Promise((resolve) => {
    let lib;
    try {
      lib = new URL(url).protocol === 'https:' ? https : http;
    } catch {
      return resolve({ ok: false, status: 0, note: 'رابط غير صالح' });
    }
    const req = lib.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', (c) => { if (body.length < 4000) body += c; });
      res.on('end', () => resolve({ ok: res.statusCode < 500, status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, note: 'انتهت المهلة' }); });
    req.on('error', (err) => resolve({ ok: false, status: 0, note: err.code || err.message }));
  });
}

(async () => {
  const { port, url } = config.web;
  const local = `http://localhost:${port}`;
  console.log('');
  console.log('[فحص] مكان تشغيل الموقع');
  console.log(`  المنفذ        : ${port}`);
  console.log(`  الرابط العام  : ${url}`);
  console.log(`  من نفس الجهاز : ${local}`);
  console.log('');

  const targets = [...new Set([local, `${url}`])];
  let anyOk = false;

  for (const base of targets) {
    const home = await request(`${base}/`);
    const status = await request(`${base}/api/status`);
    const ok = home.status >= 200 && home.status < 400;
    anyOk = anyOk || ok;
    console.log(`${ok ? '[تم] ' : '[خطأ]'} ${base}`);
    console.log(`       الصفحة الرئيسية: ${home.status || home.note || 'بلا استجابة'}`);
    console.log(`       حالة الخدمة    : ${status.status || status.note || 'بلا استجابة'}`);
    if (home.status === 403 && /\.e2b\.app$/i.test(base)) {
      console.log('       ملاحظة: المنصة تطلب رمز مرور للطلبات الخارجية — افتحه من المتصفح/المعاينة.');
    }
  }

  console.log('');
  if (anyOk) {
    console.log('[تم] الموقع شغّال. زر «افتح الموقع» في /help سيوصلك لنفس النتيجة.');
  } else {
    console.log('[خطأ] ما في استجابة على أي رابط — الموقع مو شغّال الآن.');
    console.log('       الحل: شغّل المشروع أولًا ثم أعد الفحص.');
    console.log('         npm start                 (البوت + الموقع)');
    console.log('         npm run web               (الموقع فقط)');
    console.log('       ملاحظة مهمة: http://localhost يعمل فقط على الجهاز الذي يشغّل المشروع.');
    console.log('       لو بدّك الموقع يفتح من أي جهاز (الجوال مثلًا) — لازم تنشره على الإنترنت');
    console.log('       (Railway أو أي سيرفر)، وبعدها ضع رابطه في DASHBOARD_URL داخل .env.');
  }
  console.log('');

  process.exit(anyOk ? 0 : 1);
})();
