/* ==========================================================
   Never Land  |  icons.js
   ----------------------------------------------------------
   مجموعة أيقونات SVG مرسومة داخل الصفحة (inline) — بدون أي
   مكتبة خارجية أو اتصال بالإنترنت:
     • خطوط نقية 24×24 تعمل مع currentColor (تأخذ لون النص)
     • تستخدم في الموقع ولوحة التحكم معًا

   الاستخدام:
     المتصفح:  icon('shield', { size: 20, cls: 'ico' })
     السيرفر:  const { icon } = require('../public/icons');
   ========================================================== */

/* ملاحظة مهمة:
   كل التعريفات هنا داخل دالة مغلقة (IIFE) حتى لا تتسرّب أي أسماء عامة
   (ICONS · icon · logoMark …) إلى نطاق الصفحة. السبب: app.js يُحمَّل بعد
   هذا الملف في نفس النطاق، وأي تعريف مكرّر كان يوقف اللوحة بخطأ
   «Identifier 'ICONS' has already been declared». */
(function (factory) {
  'use strict';
  const api = factory();

  /* المتصفح: نُصدّر الأيقونات كخصائص على window فقط */
  if (typeof window !== 'undefined') {
    window.ICONS = api.ICONS;
    window.LOG_ICONS = api.LOG_ICONS;
    window.icon = api.icon;
    window.logoMark = api.logoMark;
    window.iconForEvent = api.iconForEvent;
  }

  /* السيرفر: نفس الواجهة عبر require */
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(function () {
  /* eslint-disable quotes */
  const ICONS = {
    dashboard:
      '<rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2.3"/>' +
      '<rect x="13.2" y="3.2" width="7.6" height="7.6" rx="2.3"/>' +
      '<rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2.3"/>' +
      '<rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2.3"/>',
    settings:
      '<circle cx="12" cy="12" r="3.2"/>' +
      '<path d="M18.9 14.6a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H2.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V2.2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
    shield:
      '<path d="M12 3.3 19.2 6v5.5c0 4.4-3 7.5-7.2 9.2-4.2-1.7-7.2-4.8-7.2-9.2V6z"/>' +
      '<path d="m9.1 12.2 2.1 2.1 3.7-4.1"/>',
    hammer:
      '<path d="M15.6 3.4 20.4 8.2a1 1 0 0 1 0 1.4l-2.3 2.3a1 1 0 0 1-1.4 0l-1.9-1.9-6.6 6.6"/>' +
      '<path d="M8.4 16.4 3.8 21"/>' +
      '<path d="M10.4 5.6 8.1 7.9a1 1 0 0 0 0 1.4l3.2 3.2a1 1 0 0 0 1.4 0l2.3-2.3"/>',
    chart:
      '<rect x="3.4" y="11.6" width="4.2" height="8.6" rx="1.7"/>' +
      '<rect x="9.9" y="6.4" width="4.2" height="13.8" rx="1.7"/>' +
      '<rect x="16.4" y="14.4" width="4.2" height="5.8" rx="1.7"/>',
    ticket:
      '<path d="M4 9.4A2.4 2.4 0 0 1 6.4 7h11.2A2.4 2.4 0 0 1 20 9.4v.5a2.3 2.3 0 0 0 0 4.2v.5A2.4 2.4 0 0 1 17.6 17H6.4A2.4 2.4 0 0 1 4 14.6v-.5a2.3 2.3 0 0 0 0-4.2z"/>' +
      '<path d="M12 9.6v4.8"/>',
    clipboard:
      '<rect x="4.8" y="4.6" width="14.4" height="16" rx="2.6"/>' +
      '<path d="M9 4.6V3.7A1.7 1.7 0 0 1 10.7 2h2.6A1.7 1.7 0 0 1 15 3.7v.9"/>' +
      '<path d="m9.4 13.2 1.9 1.9 3.5-3.7"/>',
    userPlus:
      '<circle cx="9.4" cy="8.2" r="3.4"/>' +
      '<path d="M3.2 19.6a6.2 6.2 0 0 1 9.9-4.9"/>' +
      '<path d="M17.4 13.2v6"/>' +
      '<path d="M14.4 16.2h6"/>',
    userMinus:
      '<circle cx="9.5" cy="8" r="3.4"/>' +
      '<path d="M3.5 20a6 6 0 0 1 6-6 6 6 0 0 1 4.2 1.7"/>' +
      '<path d="M14.5 16h6"/>',
    users:
      '<circle cx="9.4" cy="8.2" r="3.4"/>' +
      '<path d="M3.2 19.6a6.2 6.2 0 0 1 12.4 0"/>' +
      '<path d="M15.9 5.3a3.2 3.2 0 0 1 0 6.1"/>' +
      '<path d="M17.9 19.6a6.4 6.4 0 0 0-1.6-4.3"/>',
    userCog:
      '<circle cx="9.5" cy="8" r="3.4"/>' +
      '<path d="M3.5 20a6 6 0 0 1 9.2-5.2"/>' +
      '<circle cx="17.5" cy="16.5" r="2.4"/>' +
      '<path d="M17.5 12.6v1M17.5 19.4v1M20.9 16.5h-1M15.1 16.5h-1"/>',
    userCheck:
      '<circle cx="9.5" cy="8" r="3.4"/>' +
      '<path d="M3.5 20a6 6 0 0 1 6-6 6 6 0 0 1 3 .8"/>' +
      '<path d="m15 17.6 1.7 1.7 3.3-3.4"/>',
    badgeCheck:
      '<path d="M12 2.8l2.3 1.7 2.8-.3 1 2.7 2.4 1.5-.9 2.7.9 2.7-2.4 1.5-1 2.7-2.8-.3L12 21.2l-2.3-1.7-2.8.3-1-2.7L3.5 15.6l.9-2.7-.9-2.7L5.9 8.7l1-2.7 2.8.3z"/>' +
      '<path d="m9.4 12.2 1.8 1.8 3.5-3.6"/>',
    gift:
      '<rect x="3.4" y="8.6" width="17.2" height="11.6" rx="2.2"/>' +
      '<path d="M3.4 12.8h17.2"/>' +
      '<path d="M12 8.6V20.2"/>' +
      '<path d="M12 8.6S10.7 4.2 8.4 4.2a2.2 2.2 0 0 0 0 4.4z"/>' +
      '<path d="M12 8.6s1.3-4.4 3.6-4.4a2.2 2.2 0 0 1 0 4.4z"/>',
    lifeBuoy:
      '<circle cx="12" cy="12" r="9"/>' +
      '<circle cx="12" cy="12" r="3.6"/>' +
      '<path d="m5.6 5.6 3.8 3.8M14.6 14.6l3.8 3.8M18.4 5.6l-3.8 3.8M9.4 14.6l-3.8 3.8"/>',
    scroll:
      '<path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v11a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2z"/>' +
      '<path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
    message: '<path d="M20.4 12.2c0 3.9-3.8 7-8.4 7a9.4 9.4 0 0 1-2.6-.4l-4.4 1.6 1.2-3.2a6.7 6.7 0 0 1-2.1-4.8c0-3.9 3.8-7 8.4-7s7.9 3.1 7.9 6.8z"/>',
    messageEdit:
      '<path d="M20.5 11.6c0 3.8-3.8 6.9-8.5 6.9a10 10 0 0 1-2.6-.3L4.5 20l1.1-3.2a6.6 6.6 0 0 1-2.1-4.7c0-3.8 3.8-6.9 8.5-6.9a10 10 0 0 1 3 .4"/>' +
      '<path d="m16.6 5.4 2.6 2.6-4.9 4.9-2.9.3.3-2.9z"/>',
    trash:
      '<path d="M4.5 7h15"/>' +
      '<path d="M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3V7"/>' +
      '<path d="M6.5 7l.8 12.1A1.6 1.6 0 0 0 8.9 20.6h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7"/>' +
      '<path d="M10.5 11v5M13.5 11v5"/>',
    edit:
      '<path d="M12 20h8"/>' +
      '<path d="M16.5 3.9a2 2 0 0 1 2.8 2.8L7.5 18.5l-3.6.9.9-3.6z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5.5 12h13"/>',
    check: '<path d="m4.8 12.6 4.6 4.6 9.8-10.4"/>',
    close: '<path d="M5.6 5.6 18.4 18.4M18.4 5.6 5.6 18.4"/>',
    warning:
      '<path d="M12 4.4 21 19.6H3z"/>' +
      '<path d="M12 9.6v4"/>' +
      '<path d="M12 16.6v.1"/>',
    info:
      '<circle cx="12" cy="12" r="8.6"/>' +
      '<path d="M12 11v5.4"/>' +
      '<path d="M12 7.8v.1"/>',
    lock:
      '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/>' +
      '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    unlock:
      '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/>' +
      '<path d="M8 10.5V8a4 4 0 0 1 7.5-1.9"/>',
    bell:
      '<path d="M17.6 16.4V11a5.6 5.6 0 0 0-11.2 0v5.4L4.8 19h14.4z"/>' +
      '<path d="M9.8 19a2.3 2.3 0 0 0 4.4 0"/>',
    clock:
      '<circle cx="12" cy="12" r="8.6"/>' +
      '<path d="M12 7.4V12l3 2"/>',
    filter: '<path d="M3.5 5.5h17l-6.6 7.6V19l-3.8 2v-7.9z"/>',
    search:
      '<circle cx="10.8" cy="10.8" r="6.4"/>' +
      '<path d="m15.6 15.6 4.4 4.4"/>',
    refresh:
      '<path d="M20 12a8 8 0 1 1-2.6-5.9"/>' +
      '<path d="M20.2 4.2v4.6h-4.6"/>',
    undo:
      '<path d="M4 11.5a8 8 0 1 1 2.4 5.7"/>' +
      '<path d="M4 4.5v7h7"/>',
    save:
      '<path d="M5.5 3.8h9.2L20.2 9.3v9.4a1.6 1.6 0 0 1-1.6 1.6H5.5a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6z"/>' +
      '<path d="M8 3.8v5h6v-5"/>' +
      '<rect x="7.5" y="13" width="9" height="7.3" rx="1.4"/>',
    upload:
      '<path d="M12 16.5V4.8"/>' +
      '<path d="m7.5 9.3 4.5-4.5 4.5 4.5"/>' +
      '<path d="M4.5 16.5v1.7A1.8 1.8 0 0 0 6.3 20h11.4a1.8 1.8 0 0 0 1.8-1.8v-1.7"/>',
    image:
      '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/>' +
      '<circle cx="9" cy="10" r="1.6"/>' +
      '<path d="m4.5 17 4.4-4.3 3.3 3.2 2.6-2.5 4.7 4.6"/>',
    palette:
      '<path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6h1.5c2.4 0 4.3-1.9 4.3-4.2C20.4 6.2 16.6 3.6 12 3.6z"/>' +
      '<circle cx="8.2" cy="10" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="11.6" cy="7.6" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="15.4" cy="9.2" r="1.1" fill="currentColor" stroke="none"/>',
    sliders:
      '<path d="M4.5 7h10M18 7h1.5M4.5 12h3M11 12h8.5M4.5 17h8M16 17h3.5"/>' +
      '<circle cx="16" cy="7" r="1.8"/>' +
      '<circle cx="9" cy="12" r="1.8"/>' +
      '<circle cx="14" cy="17" r="1.8"/>',
    terminal:
      '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/>' +
      '<path d="m8 10 2.4 2.4L8 14.8"/>' +
      '<path d="M13 15h3.4"/>',
    cpu:
      '<rect x="7.5" y="7.5" width="9" height="9" rx="1.8"/>' +
      '<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3"/>' +
      '<path d="M10.5 2.2v1.6M13.5 2.2v1.6M10.5 20.2v1.6M13.5 20.2v1.6M2.2 10.5h1.6M2.2 13.5h1.6M20.2 10.5h1.6M20.2 13.5h1.6"/>',
    home:
      '<path d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z"/>' +
      '<path d="M9.8 20.6v-6h4.4v6"/>',
    server:
      '<rect x="3.4" y="4.2" width="17.2" height="6.4" rx="2.2"/>' +
      '<rect x="3.4" y="13.4" width="17.2" height="6.4" rx="2.2"/>' +
      '<path d="M7 7.4v.1"/>' +
      '<path d="M7 16.6v.1"/>',
    bolt: '<path d="M13.4 2.8 5.6 13.4h5l-.9 7.8 7.9-10.6h-5z"/>',
    globe:
      '<circle cx="12" cy="12" r="8.7"/>' +
      '<path d="M3.4 12h17.2"/>' +
      '<path d="M12 3.3c2.4 2.4 3.6 5.4 3.6 8.7S14.4 18.3 12 20.7c-2.4-2.4-3.6-5.4-3.6-8.7S9.6 5.7 12 3.3z"/>',
    book:
      '<path d="M4.5 5.2A2.2 2.2 0 0 1 6.7 3h12.3v15.5H6.7a2.2 2.2 0 0 0-2.2 2.2z"/>' +
      '<path d="M4.5 5.2v15.5"/>' +
      '<path d="M8 7.5h7"/>',
    activity: '<path d="M3.4 12.4h3.8l2.2-4.6 3 8.4 2.6-6 1.8 2.2h3.8"/>',
    layers:
      '<path d="m12 3.4 8.5 4.3L12 12 3.5 7.7z"/>' +
      '<path d="m3.5 12.4 8.5 4.3 8.5-4.3"/>' +
      '<path d="m3.5 16.6 8.5 4.3 8.5-4.3"/>',
    link:
      '<path d="M10.2 13.8a3.4 3.4 0 0 0 4.8 0l3-3a3.4 3.4 0 0 0-4.8-4.8l-1.3 1.3"/>' +
      '<path d="M13.8 10.2a3.4 3.4 0 0 0-4.8 0l-3 3a3.4 3.4 0 0 0 4.8 4.8l1.3-1.3"/>',
    external:
      '<path d="M14.5 4.5h5v5"/>' +
      '<path d="M19.5 4.5 11 13"/>' +
      '<path d="M18.5 14v4.3a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 18.3V7.2A1.7 1.7 0 0 1 5.7 5.5H10"/>',
    chevronLeft: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    chevronRight: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    arrowLeft:
      '<path d="M19 12H5"/>' +
      '<path d="m11 5.5-6.5 6.5 6.5 6.5"/>',
    arrowRight:
      '<path d="M5 12h14"/>' +
      '<path d="m13 5.5 6.5 6.5-6.5 6.5"/>',
    sun:
      '<circle cx="12" cy="12" r="4.2"/>' +
      '<path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5"/>',
    moon: '<path d="M20 14.6A8.6 8.6 0 1 1 9.4 4a6.9 6.9 0 0 0 10.6 10.6z"/>',
    logout:
      '<path d="M15 4.6h2.6A1.9 1.9 0 0 1 19.5 6.5v11a1.9 1.9 0 0 1-1.9 1.9H15"/>' +
      '<path d="M9.6 8.4 6 12l3.6 3.6"/>' +
      '<path d="M6 12h8"/>',
    login:
      '<path d="M9 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v11.6a1.7 1.7 0 0 0 1.7 1.7H9"/>' +
      '<path d="M14 12H5"/>' +
      '<path d="m11 9-3 3 3 3"/>' +
      '<path d="M17 8.5v7"/>',
    eye:
      '<path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12z"/>' +
      '<circle cx="12" cy="12" r="3"/>',
    folder: '<path d="M3.6 7.6a2.2 2.2 0 0 1 2.2-2.2h3.4l2 2.4h7.2a2.2 2.2 0 0 1 2.2 2.2v7.4a2.2 2.2 0 0 1-2.2 2.2H5.8a2.2 2.2 0 0 1-2.2-2.2z"/>',
    mic:
      '<rect x="9.2" y="3" width="5.6" height="10.4" rx="2.8"/>' +
      '<path d="M5.6 11.6a6.4 6.4 0 0 0 12.8 0"/>' +
      '<path d="M12 18v3"/>',
    speaker:
      '<path d="M4.4 9.4h3l3.6-3.2v11.6l-3.6-3.2h-3z"/>' +
      '<path d="M15.2 9.2a4 4 0 0 1 0 5.6"/>' +
      '<path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8"/>',
    userRound:
      '<circle cx="12" cy="8.4" r="3.8"/>' +
      '<path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
    crown: '<path d="M3.6 7.6 7 12l5-6.6L17 12l3.4-4.4-1.3 10.2a1.7 1.7 0 0 1-1.7 1.5H6.6a1.7 1.7 0 0 1-1.7-1.5z"/>',
    star: '<path d="m12 3.4 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.5l5.8-.8z"/>',
    circle: '<circle cx="12" cy="12" r="8.5"/>',
    dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    hash: '<path d="M9.2 4 7.5 20M16.5 4l-1.7 16M4.5 9h15M4 15h15"/>',
    volume:
      '<path d="M4.5 9.5h3l4-3.2v11.4l-4-3.2h-3z"/>' +
      '<path d="M15 9a4 4 0 0 1 0 6"/>',
    tag:
      '<path d="M11.3 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.7L11.6 21.4a1.6 1.6 0 0 1-2.3 0L3.6 15.7a1.6 1.6 0 0 1 0-2.3z"/>' +
      '<circle cx="16" cy="8" r="1.3"/>',
    thread:
      '<path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h6.6A2 2 0 0 1 15 6.5v6.6a2 2 0 0 1-2 2H9l-4.5 3.4z"/>' +
      '<path d="M17.5 8.5h.5a2 2 0 0 1 2 2v8.9l-3.4-2.4"/>',
    emoticon:
      '<circle cx="12" cy="12" r="8.7"/>' +
      '<path d="M8.6 14.2a4.4 4.4 0 0 0 6.8 0"/>' +
      '<path d="M9.3 9.4h.01M14.7 9.4h.01"/>',
    lines:
      '<path d="M4 9h16"/>' +
      '<path d="M6.5 14.5h11"/>',
    imageBadge:
      '<rect x="3.5" y="4.5" width="17" height="12" rx="2.2"/>' +
      '<circle cx="9" cy="9.8" r="1.5"/>' +
      '<path d="m4.5 15.6 4-4 3.1 3 2.5-2.4 4.4 4.3"/>' +
      '<path d="M6 20.5h12"/>',
    cogUser:
      '<circle cx="9.5" cy="8" r="3.4"/>' +
      '<path d="M3.5 20a6 6 0 0 1 9.2-5.2"/>' +
      '<circle cx="17.6" cy="16.6" r="2"/>' +
      '<path d="M17.6 13.1v1.5M17.6 18.6v1.5M21.1 16.6h-1.5M15.6 16.6h-1.5"/>',
    megaphone:
      '<path d="M4.5 10.5v3.6a1.6 1.6 0 0 0 1.6 1.6h1.6l7.8 4V4.9l-7.8 4H6.1a1.6 1.6 0 0 0-1.6 1.6z"/>' +
      '<path d="M8 15.7v3.6a1.4 1.4 0 0 0 1.4 1.4h1.2v-4.4"/>',
    sleep: '<path d="M20.5 13.8A8.6 8.6 0 0 1 10.2 3.5a8.7 8.7 0 1 0 10.3 10.3z"/>',
    ban:
      '<circle cx="12" cy="12" r="8.7"/>' +
      '<path d="m6.2 6.2 11.6 11.6"/>',
    key:
      '<circle cx="8.2" cy="14.8" r="4.2"/>' +
      '<path d="m11.4 12 8.1-8.1"/>' +
      '<path d="m17 6.4 2.4 2.4M14.6 9.4l2.4 2.4"/>',
    wallet:
      '<rect x="3.5" y="6.5" width="17" height="12" rx="2.2"/>' +
      '<path d="M3.5 10.5h17"/>' +
      '<path d="M15.5 14.5h2"/>',
    flag:
      '<path d="M6 21V4.5"/>' +
      '<path d="M6 5.2h10.6l-1.5 3.6 1.5 3.6H6z"/>',
    puzzle: '<path d="M10.5 4.5a1.9 1.9 0 1 1 3.8 0V6h2.7a1.4 1.4 0 0 1 1.4 1.4v2.7h1.4a1.9 1.9 0 1 1 0 3.8h-1.4v3.7a1.4 1.4 0 0 1-1.4 1.4H6.6a1.4 1.4 0 0 1-1.4-1.4v-3.7H3.8a1.9 1.9 0 1 1 0-3.8h1.4V7.4A1.4 1.4 0 0 1 6.6 6h3.9z"/>',
    trophy:
      '<path d="M8 4.2h8v5a4 4 0 0 1-8 0z"/>' +
      '<path d="M8 5.6H5.8a1.8 1.8 0 0 0-1.8 1.8v.3a3.3 3.3 0 0 0 3.3 3.3H8"/>' +
      '<path d="M16 5.6h2.2a1.8 1.8 0 0 1 1.8 1.8v.3a3.3 3.3 0 0 1-3.3 3.3H16"/>' +
      '<path d="M12 13.2v3.2"/>' +
      '<path d="M9.4 20.4h5.2l-.7-4.4h-3.8z"/>',
    podium:
      '<path d="M3.6 20.4h4.6v-5.8H3.6z"/>' +
      '<path d="M9.7 20.4h4.6V7.6H9.7z"/>' +
      '<path d="M15.8 20.4h4.6v-9.2h-4.6z"/>' +
      '<path d="m12 3.4.8 1.7 1.9.3-1.4 1.3.3 1.9L12 7.7l-1.6.9.3-1.9-1.4-1.3 1.9-.3z"/>',
    medal:
      '<path d="m8.4 9.6-2.2-6h11.6l-2.2 6"/>' +
      '<circle cx="12" cy="14.8" r="5.6"/>' +
      '<path d="m12 12.2 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2L8.8 14.5l2.2-.3z"/>',
    spark:
      '<path d="M11.2 3.4c.5 3.1 1.5 4.1 4.6 4.6-3.1.5-4.1 1.5-4.6 4.6-.5-3.1-1.5-4.1-4.6-4.6 3.1-.5 4.1-1.5 4.6-4.6z"/>' +
      '<path d="M17.6 14.2c.3 1.8.8 2.3 2.6 2.6-1.8.3-2.3.8-2.6 2.6-.3-1.8-.8-2.3-2.6-2.6 1.8-.3 2.3-.8 2.6-2.6z"/>',
    waveform:
      '<path d="M3.8 10.4v3.2"/>' +
      '<path d="M7.9 7.2v9.6"/>' +
      '<path d="M12 4.2v15.6"/>' +
      '<path d="M16.1 8.4v7.2"/>' +
      '<path d="M20.2 10.8v2.4"/>',
    bubbles:
      '<path d="M12 4.6h6.6a2.6 2.6 0 0 1 2.6 2.6v3.4a2.6 2.6 0 0 1-2.6 2.6h-.8v3.2l-3.4-3.2H12a2.6 2.6 0 0 1-2.6-2.6V7.2A2.6 2.6 0 0 1 12 4.6z"/>' +
      '<path d="M6.9 16.1A2.6 2.6 0 0 1 4.4 13.5V9.9c0-1.1.7-2.1 1.7-2.4"/>',
    heart: '<path d="M12 20.2C10.4 18.9 4.2 14.6 4.2 10.4A4.4 4.4 0 0 1 12 7.9a4.4 4.4 0 0 1 7.8 2.5c0 4.2-6.2 8.5-7.8 9.8z"/>',
    trendUp:
      '<path d="M3.6 17 9.4 11.2l3.4 3.4 7.6-7.6"/>' +
      '<path d="M15.6 7h4.8v4.8"/>',
    gauge:
      '<path d="M4.4 17.4a9 9 0 1 1 15.2 0"/>' +
      '<path d="m12 13.6 3.6-3.6"/>' +
      '<circle cx="12" cy="14.2" r="1.3"/>',
    calendarDay:
      '<rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.6"/>' +
      '<path d="M3.4 9.8h17.2"/>' +
      '<path d="M8 3.2v3.6"/>' +
      '<path d="M16 3.2v3.6"/>' +
      '<circle cx="12" cy="15" r="1.7"/>',
    calendarWeek:
      '<rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.6"/>' +
      '<path d="M3.4 9.8h17.2"/>' +
      '<path d="M8 3.2v3.6"/>' +
      '<path d="M16 3.2v3.6"/>' +
      '<path d="M7.6 14.8h8.8"/>' +
      '<path d="M7.6 17.8h5.4"/>',
    target:
      '<circle cx="12" cy="12" r="8.6"/>' +
      '<circle cx="12" cy="12" r="4.6"/>' +
      '<circle cx="12" cy="12" r="1.1"/>',
    rocket:
      '<path d="M12 2.6c2.7 2.1 4 4.8 4 7.9v3.3H8v-3.3c0-3.1 1.3-5.8 4-7.9z"/>' +
      '<circle cx="12" cy="9.4" r="1.7"/>' +
      '<path d="M8 10.4 5.6 13.3v3.4L8 15.9"/>' +
      '<path d="M16 10.4l2.4 2.9v3.4L16 15.9"/>' +
      '<path d="M12 15.6v3.2"/>' +
      '<path d="M10.1 19h3.8"/>',
  };

  /**
   * يرجع وسم SVG جاهز.
   * @param {string} name اسم الأيقونة
   * @param {{size?:number, cls?:string, stroke?:number}} [opts]
   */
  function icon(name, opts = {}) {
    const { size = 20, cls = 'ico', stroke = 1.7 } = opts;
    const body = ICONS[name] || ICONS.circle;
    return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  /** شعار Never Land (درع + برق داخل مربّع متدرّج) */
  function logoMark(size = 34) {
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="pbGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#5b6cff"/><stop offset="1" stop-color="#3f49b8"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#pbGrad)"/>
    <path d="M20 8.5 29 12v6.6c0 5.1-3.5 8.8-9 10.9-5.5-2.1-9-5.8-9-10.9V12z" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M20.9 13.6 15.4 20.4h3.6l-1 6 5.7-7.1h-3.6z" fill="#fff"/>
  </svg>`;
  }

  /** خريطة أيقونات أحداث السجلات (تُستخدم في اللوحة) */
  const LOG_ICONS = {
    message: 'message',
    delete: 'trash',
    edit: 'edit',
    bulk: 'layers',
    member: 'userRound',
    join: 'userPlus',
    leave: 'userMinus',
    ban: 'ban',
    kick: 'userMinus',
    timeout: 'sleep',
    boost: 'star',
    nickname: 'edit',
    avatar: 'imageBadge',
    username: 'edit',
    role: 'tag',
    channel: 'hash',
    permission: 'key',
    server: 'server',
    emoji: 'emoticon',
    sticker: 'image',
    invite: 'link',
    thread: 'thread',
    voice: 'speaker',
    action: 'hammer',
    automod: 'shield',
    ticket: 'ticket',
    system: 'cpu',
  };

  /** اختيار أيقونة مناسبة لمفتاح حدث سجلات */
  function iconForEvent(key = '') {
    const k = String(key);
    const rules = [
      [/invite/i, 'link'],
      [/thread/i, 'thread'],
      [/deafen/i, 'volume'],
      [/voicemute|^mute/i, 'mic'],
      [/voice/i, 'speaker'],
      [/emoji|sticker/i, 'emoticon'],
      [/permission|overwrite/i, 'key'],
      [/channel/i, 'hash'],
      [/role/i, 'tag'],
      [/ban/i, 'ban'],
      [/kick/i, 'userMinus'],
      [/timeout|sleep/i, 'sleep'],
      [/boost|premium/i, 'star'],
      [/avatar|nickname|username/i, 'edit'],
      [/join|memberjoin/i, 'userPlus'],
      [/leave|memberleave|memberremove/i, 'userMinus'],
      [/member|user/i, 'userRound'],
      [/guild|server/i, 'server'],
      [/bulk/i, 'layers'],
      [/delete|remove/i, 'trash'],
      [/update|edit/i, 'edit'],
      [/message/i, 'message'],
      [/ticket/i, 'ticket'],
      [/automod|modaction|moderation/i, 'shield'],
      [/presence|status/i, 'activity'],
    ];
    for (const [re, name] of rules) if (re.test(k)) return name;
    return LOG_ICONS.system;
  }

  return { ICONS, LOG_ICONS, icon, logoMark, iconForEvent };
});
