'use strict';

/**
 * dashboard-dom-test.js
 * -------------------------------------------------------------
 * اختبار حقيقي للوحة التحكم: نفتح الصفحة في متصفح وهمي (jsdom) ونتأكد أن:
 *   ١) الصفحة تُقلع فعلًا (ما تعلق على «جارٍ تحميل الإعدادات...»)
 *   ٢) ما في أي خطأ JavaScript (خصوصًا تضارب الأسماء بين ملفات السكربت)
 *   ٣) القائمة الجانبية تُبنى بكل الأقسام وأيقوناتها من الحزمة الرسمية
 *   ٤) قسم «تفاعل» موجود وأيقونته الكأس (لا دائرة فاضية)
 *
 * يعمل بلا إنترنت: يفتح الخادم الداخلي على منفذ حر ويعرض الصفحة الحقيقية.
 * إذا لم تكن jsdom مثبّتة، يُتخطّى الاختبار مع رسالة واضحة.
 * -------------------------------------------------------------
 */

const assert = require('node:assert');
const http = require('node:http');

async function run() {
  let JSDOM;
  let VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = require('jsdom'));
  } catch {
    console.log('[تخطّي] jsdom غير مثبّتة — تُثبَّت بـ npm i -D jsdom');
    return { skipped: true };
  }

  process.env.DEMO_MODE = process.env.DEMO_MODE || 'true';
  process.env.PUBLIC_ACCESS = process.env.PUBLIC_ACCESS || 'true';
  process.env.LOGIN_REQUIRED = process.env.LOGIN_REQUIRED || 'false';

  // قاعدة بيانات مؤقتة حتى لا نلمس بيانات المشروع
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-dom-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'dom.db');

  const web = require('./src/web/server');
  const app = web.createApp();

  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const guildId = '100000000000000001';
  const url = `${base}/dashboard/${guildId}`;

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (err) => {
    const msg = String(err?.message || err);
    if (/scrollTo|Not implemented/i.test(msg)) return; // قيود jsdom لا تخصّنا
    errors.push(msg);
  });
  vc.on('error', (...args) => errors.push(args.map(String).join(' ')));

  const html = await (await fetch(url)).text();
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (input, opts) => fetch(new URL(input, base).toString(), opts);
      win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    },
  });

  await new Promise((r) => setTimeout(r, 3500));

  const doc = dom.window.document;
  const appNode = doc.getElementById('app');
  assert.ok(appNode, 'عنصر اللوحة #app غير موجود');
  const text = appNode.textContent.replace(/\s+/g, ' ').trim();

  /* ١) الصفحة تُقلع */
  assert.ok(!text.includes('جارٍ تحميل الإعدادات'), `اللوحة عالقة على شاشة التحميل (النص: ${text.slice(0, 80)})`);

  /* ٢) بلا أخطاء JavaScript */
  assert.deepStrictEqual(errors, [], `أخطاء JavaScript في الصفحة: ${errors.join(' | ')}`);

  /* ٣) القائمة الجانبية كاملة بأيقونات مرسومة */
  const navItems = [...doc.querySelectorAll('.d-nav-item')];
  assert.ok(navItems.length >= 12, `عناصر القائمة الجانبية قليلة (${navItems.length})`);
  const labels = navItems.map((n) => n.querySelector('.d-nav-label')?.textContent?.trim()).filter(Boolean);
  for (const wanted of ['مركز التحكم', 'المستويات', 'تفاعل', 'الخط الفاصل (AutoLine)', 'نظام التذاكر', 'السجلات']) {
    assert.ok(labels.includes(wanted), `القسم «${wanted}» غير ظاهر في القائمة الجانبية`);
  }
  const iconCount = navItems.filter((n) => n.querySelector('svg')).length;
  assert.strictEqual(iconCount, navItems.length, `بعض عناصر القائمة بلا أيقونة (${iconCount}/${navItems.length})`);

  /* ٤) قسم «تفاعل» بأيقونة الكأس — لا دائرة فاضية */
  const top = navItems.find((n) => n.querySelector('.d-nav-label')?.textContent?.trim() === 'تفاعل');
  assert.ok(top, 'عنصر «تفاعل» غير موجود');
  const topIcon = top.querySelector('svg')?.innerHTML || '';
  assert.ok(topIcon.includes('8 4.2h8v5a4'), 'أيقونة «تفاعل» ليست الكأس (تظهر دائرة أو أيقونة بديلة)');
  assert.ok(!/^<circle cx="12" cy="12" r="9"/.test(topIcon.trim()), 'أيقونة «تفاعل» رجعت دائرة فاضية');

  /* ٥) ما في عنصر قائمة نصّه مكسور لسطرين (تنسيق سليم) */
  assert.ok(doc.querySelectorAll('.d-nav-label').length === navItems.length, 'عناصر القائمة بلا فئة d-nav-label');

  dom.window.close();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return { skipped: false, navCount: navItems.length, labels };
}

module.exports = { run };

if (require.main === module) {
  run()
    .then((res) => {
      if (res.skipped) return;
      console.log(`[تم] اللوحة تُقلع فعلًا · ${res.navCount} قسمًا في القائمة · «تفاعل» بأيقونة الكأس`);
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
