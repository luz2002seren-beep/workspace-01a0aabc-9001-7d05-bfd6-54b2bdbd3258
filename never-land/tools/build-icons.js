'use strict';

/**
 * tools/build-icons.js
 * -------------------------------------------------------------
 * يدمج «حزمة الأيقونات» (tools/icons-pack.js) داخل ملف الأيقونات
 * الرسمي src/web/public/icons.js:
 *   • الأسماء الموجودة تُحدَّث بشكل أحلى (نفس الاسم — بلا كسر أي كود)
 *   • الأسماء الجديدة تُضاف
 *
 * التشغيل:  npm run icons
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ICONS_FILE = path.join(ROOT, 'src', 'web', 'public', 'icons.js');
const { NEW_ICONS } = require('./icons-pack');

const source = fs.readFileSync(ICONS_FILE, 'utf8');

const start = source.indexOf('const ICONS = {');
const endMarker = '\n};';
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.error('[خطأ] ما لقيت كتلة الأيقونات داخل icons.js');
  process.exit(1);
}

/* نحمّل الأيقونات الحالية كما هي في المتصفح (نقيّم كتلة الأيقونات نفسها) */
const block = source.slice(start + 'const ICONS = {'.length, end);
let existing = {};
try {
  // الكتلة هي جسم كائن JS صالح (اسم: 'مسارات', ...) — نقيّمها مباشرة
  // حتى نقرأ التعريفات المكتوبة على أكثر من سطر أيضًا.
  existing = new Function(`return {${block}};`)();
} catch (err) {
  console.error('[خطأ] تعذّر قراءة كتلة الأيقونات الحالية:', err.message);
  process.exit(1);
}

const before = Object.keys(existing).length;
const upgraded = Object.keys(NEW_ICONS).filter((name) => name in existing).length;
const added = Object.keys(NEW_ICONS).filter((name) => !(name in existing));

/* الدمج: القديم كما هو + الحزمة الجديدة (تتجاوز عند التكرار) */
const merged = { ...existing, ...NEW_ICONS };

/** تقسيم الأيقونة إلى سطور مرتبة (سطر لكل عنصر) */
function renderEntry(name, body) {
  const parts = body.split(/(?=<)/).filter(Boolean);
  if (parts.length === 1) return `  ${name}: '${body}',`;
  const [first, ...rest] = parts;
  return [
    `  ${name}:`,
    `    '${first}' +`,
    ...rest.map((p, i) => `    '${p}'${i === rest.length - 1 ? ',' : ' +'}`),
  ].join('\n');
}

const body = Object.entries(merged).map(([name, value]) => renderEntry(name, value)).join('\n');
const updated = `${source.slice(0, start)}const ICONS = {\n${body}${source.slice(end)}`;

fs.writeFileSync(ICONS_FILE, updated);

console.log(`[تم] حزمة الأيقونات: ${Object.keys(merged).length} أيقونة`);
console.log(`     محسّنة: ${upgraded} · جديدة: ${added.length} ${added.length ? `(${added.join(' · ')})` : ''}`);
console.log(`     كانت: ${before}`);
