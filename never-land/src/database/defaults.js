'use strict';

/**
 * database/defaults.js
 * -------------------------------------------------------------
 * دمج الإعدادات: القيم الافتراضية + قيم السيرفر + القيم الجزئية الجديدة.
 * الدمج عميق (deep) حتى لا نفقد مفاتيح متداخلة عند تعديل ميزة واحدة.
 * -------------------------------------------------------------
 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * دمج عميق: source يتفوّق على target.
 * المصفوفات تُستبدل (لا تُدمج) لأن هذا هو السلوك المتوقع من لوحة التحكم.
 */
/** مفاتيح خطيرة تلوّث النموذج (prototype pollution) — تُتجاهل دائمًا */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function mergeSettings(target = {}, source = {}) {
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    /* حماية: لا نكتب أبدًا في __proto__ أو prototype أو constructor */
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeSettings(out[key], value);
    } else {
      out[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return out;
}

module.exports = { mergeSettings, isPlainObject, FORBIDDEN_KEYS };
