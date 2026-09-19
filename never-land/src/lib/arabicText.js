'use strict';

/**
 * lib/arabicText.js
 * -------------------------------------------------------------
 * أدوات موحّدة للنصوص العربية (يسخدّمها نظام الخبرة والردود التلقائية):
 *
 *   • normalizeArabic — تنظيف للمقارنة: بلا تشكيل · بلا رموز · توحيد
 *     الألف (أ إ آ ٱ → ا) والياء (ى ئ → ي) والتاء المربوطة (ة → ه).
 *   • similarity — معامل تشابه (Dice على الثنائيات): ١ = متطابق تمامًا.
 *   • containsWord — بحث مطبَّع يتجاهل التشكيل والهمزات.
 *
 * الفائدة: العضو يكتب «مَرْحَبا» أو «مرحبه» والبوت يعتبرها نفس الكلمة.
 * -------------------------------------------------------------
 */

/** تنظيف نص للمقارنة (حروف وأرقام فقط، موحّدة) */
function normalizeArabic(raw) {
  return String(raw || '')
    .replace(/<a?:\w+:\d+>/g, '') // إيموجي مخصص
    .replace(/https?:\/\/\S+/g, '') // روابط
    .replace(/[\u064B-\u065F\u0670]/g, '') // تشكيل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

/** معامل تشابه بين نصين مطبَّعين (0 → 1) */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return a === b ? 1 : 0;
  const bigrams = (s) => {
    const map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return map;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [g, count] of A) if (B.has(g)) inter += Math.min(count, B.get(g));
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/**
 * هل الرسالة تحتوي الكلمة؟ (يتجاهل التشكيل والهمزات وعلامات الترقيم)
 * @param {string} content نص الرسالة
 * @param {string} word الكلمة المفتاحية
 * @param {{ wholeWord?: boolean }} options wholeWord = مطابقة كلمة كاملة
 */
function containsWord(content, word, { wholeWord = false } = {}) {
  const haystack = normalizeArabic(content);
  const needle = normalizeArabic(word);
  if (!haystack || !needle) return false;
  if (!wholeWord) return haystack.includes(needle);
  /* كلمة كاملة: نقسّم لنصوص مطبَّعة ثم نقارن كلمة بكلمة (بلا التقاط كلمة داخل كلمة أطول) */
  const tokens = (value) => String(value || '')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .map((token) => normalizeArabic(token))
    .filter(Boolean);
  const hay = tokens(content);
  const need = tokens(word);
  if (!need.length || hay.length < need.length) return false;
  for (let i = 0; i + need.length <= hay.length; i += 1) {
    if (need.every((w, k) => hay[i + k] === w)) return true;
  }
  return false;
}

module.exports = { normalizeArabic, similarity, containsWord };
