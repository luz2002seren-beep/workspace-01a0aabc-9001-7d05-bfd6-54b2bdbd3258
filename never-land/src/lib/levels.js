'use strict';

/**
 * lib/levels.js
 * -------------------------------------------------------------
 * رياضيات نظام الخبرة (منحنى تصاعدي عادل).
 * مثال: المستوى 1 يحتاج 155 XP، والمستوى 10 يحتاج 1100 XP إضافية.
 * -------------------------------------------------------------
 */

/** الخبرة المطلوبة للانتقال من `level` إلى المستوى التالي */
function xpForLevel(level) {
  const lvl = Math.max(0, Number(level) || 0);
  return 5 * lvl * lvl + 50 * lvl + 100;
}

/** مجموع الخبرة المطلوب للوصول إلى مستوى معيّن */
function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i += 1) total += xpForLevel(i);
  return total;
}

/**
 * حساب المستوى الحالي من مجموع الخبرة.
 * @returns {{level:number, xpIntoLevel:number, xpForNext:number, progress:number}}
 */
function levelFromXp(xp) {
  let remaining = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 0;
  // حد أعلى آمن لمنع أي حلقة لا نهائية
  while (level < 500 && remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  const xpForNext = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext,
    progress: xpForNext ? remaining / xpForNext : 0,
  };
}

module.exports = { xpForLevel, totalXpForLevel, levelFromXp };
