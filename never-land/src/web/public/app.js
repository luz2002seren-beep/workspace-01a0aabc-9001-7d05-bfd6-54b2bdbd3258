/* ==========================================================
   Never Land  |  لوحة التحكم — واجهة عربية
   ----------------------------------------------------------
   • شريط جانبي مرتّب (عام • الأعضاء • الحماية • التذاكر • السجلات • البيانات)
   • كل قسم صفحة واضحة فيها بطاقات وحقول، وكل مفتاح بجانب وظيفته
   • شريط حفظ واحد أسفل الشاشة يظهر فقط عند وجود تغييرات
   • بدون أي مكتبات خارجية — JavaScript خالص
   ========================================================== */

/* ===== أيقونات SVG =====
   المصدر الواحد: public/icons.js (يُحمَّل قبل هذا الملف) — بلا نسخة مكرّرة هنا
   حتى أي حزمة أيقونات جديدة تظهر فورًا في اللوحة والموقع معًا. */
const ICONS = (typeof window !== 'undefined' && window.ICONS) || { circle: '<circle cx="12" cy="12" r="9"/>' };
const LOG_ICONS =
  (typeof window !== 'undefined' && window.LOG_ICONS) || { system: 'cpu', message: 'message', delete: 'trash' };
const icon = (typeof window !== 'undefined' && window.icon) || ((name, opts = {}) => {
  const { size = 20, cls = 'ico', stroke = 1.7 } = opts;
  const body = ICONS[name] || ICONS.circle;
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
});
const logoMark = (typeof window !== 'undefined' && window.logoMark) || ((size = 34) => ICONS.circle ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7">${ICONS.circle}</svg>` : '');
const iconForEvent =
  (typeof window !== 'undefined' && window.iconForEvent) || ((key = '') => {
    const k = String(key);
    const rules = [
      [/join|memberadd/i, 'userPlus'],
      [/leave|memberremove/i, 'userMinus'],
      [/ban/i, 'ban'],
      [/kick/i, 'hammer'],
      [/message|chat/i, 'message'],
      [/voice/i, 'speaker'],
      [/role/i, 'userCog'],
      [/channel/i, 'hash'],
      [/ticket/i, 'ticket'],
      [/automod|modaction|moderation/i, 'shield'],
    ];
    for (const [re, name] of rules) if (re.test(k)) return ICONS[name] ? name : 'message';
    return 'message';
  });


/* ============================ الحالة ============================ */
const state = {
  /** هل الزائر يقدر يعدّل؟ (الوصول العام = مشاهدة فقط) */
  canEdit: true,
  guildId: null,
  settings: null,
  meta: { channels: [], roles: [], logGroups: {}, logEvents: {}, emojis: [], cardAvailable: false, autolineStyles: [] },
  guild: null,
  stats: null,
  daily: [],
  section: 'overview',
  dirty: false,
};

/* ============================ أدوات عامة ============================ */
const el = (tag, attrs = {}, html = '') => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  if (html) node.innerHTML = html;
  return node;
};

/** أيقونة SVG جاهزة للاستخدام داخل html */
const ic = (name, size = 17) => icon(name, { size });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `خطأ ${res.status}`);
  return res.json();
}

function toast(message, isError = false) {
  let box = document.querySelector('.toast');
  if (!box) {
    box = el('div', { class: 'toast' });
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(box._timer);
  box._timer = setTimeout(() => { box.className = 'toast'; }, 3200);
}

/* مسارات الإعدادات: getPath('welcome.message') */
function getPath(path) {
  return path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), state.settings);
}

function setPath(path, value) {
  const keys = path.split('.');
  let target = state.settings;
  for (const key of keys.slice(0, -1)) {
    if (target[key] === null || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  target[keys[keys.length - 1]] = value;
  markDirty();
}

function markDirty() {
  state.dirty = true;
  const bar = document.querySelector('.d-savebar');
  if (!state.canEdit) return;
  if (bar) {
    bar.classList.add('show');
    const msg = bar.querySelector('.msg');
    msg.className = 'msg';
    msg.textContent = 'تغييرات غير محفوظة';
  }
}

/* ============================ عناصر الواجهة ============================ */
function dField(label, hint, controls, { wide = false } = {}) {
  const box = el('div', { class: `d-field${wide ? ' wide' : ''}` });
  const left = el('div', { class: 'd-field-label' });
  left.appendChild(el('b', { text: label }));
  if (hint) left.appendChild(el('span', { html: hint }));
  box.appendChild(left);
  const right = el('div', { class: 'd-field-control' });
  (Array.isArray(controls) ? controls : [controls]).filter(Boolean).forEach((c) => right.appendChild(c));
  box.appendChild(right);
  return box;
}

function dSwitch(path, onChangeExtra = null) {
  const wrap = el('label', { class: 'd-switch' });
  const input = el('input', { type: 'checkbox' });
  input.checked = Boolean(getPath(path));
  input.addEventListener('change', () => {
    setPath(path, input.checked);
    if (onChangeExtra) onChangeExtra(input.checked);
  });
  wrap.appendChild(input);
  wrap.appendChild(el('span'));
  return wrap;
}

function dInput(path, { placeholder = '', narrow = false, type = 'text', full = false, onChange = null } = {}) {
  const input = el('input', {
    class: `d-input${narrow ? ' narrow' : ''}${full ? ' full' : ''}`,
    type,
    placeholder,
  });
  const value = getPath(path);
  input.value = value === null || value === undefined ? '' : value;
  input.addEventListener('input', () => {
    const next = type === 'number' ? Number(input.value) : input.value;
    setPath(path, next === '' ? null : next);
    if (onChange) onChange(next);
  });
  return input;
}

function dNumber(path, { min = 0, max = 100000 } = {}) {
  const input = el('input', { class: 'd-input narrow', type: 'number', min, max });
  input.value = getPath(path) ?? 0;
  input.addEventListener('input', () => setPath(path, Math.max(min, Math.min(max, Number(input.value) || 0))));
  return input;
}

function dArea(path, { placeholder = '' } = {}) {
  const area = el('textarea', { class: 'd-textarea', placeholder });
  area.value = getPath(path) ?? '';
  area.addEventListener('input', () => setPath(path, area.value));
  return area;
}

function dSelect(path, options, { noneLabel = '— بدون —', onAfter = null } = {}) {
  const select = el('select', { class: 'd-select' });
  const current = getPath(path);
  if (noneLabel !== null) select.appendChild(el('option', { value: '', text: noneLabel }));
  options.forEach((opt) => {
    select.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === current ? 'selected' : '' }));
  });
  select.addEventListener('change', () => {
    setPath(path, select.value || null);
    if (onAfter) onAfter(select.value);
  });
  return select;
}

const channelOptions = (extra = []) =>
  [...state.meta.channels]
    .filter((c) => [0, 2, 4, 15].includes(c.type))
    .sort((a, b) => a.type - b.type || String(a.name).localeCompare(String(b.name), 'ar'))
    .map((c) => ({ value: c.id, label: `${c.type === 0 || c.type === 15 ? '#' : c.type === 4 ? '[قسم] ' : '[صوتي] '}${c.name}`, type: c.type }))
    .concat(extra);

const roleOptions = (filterOut = []) =>
  state.meta.roles.filter((r) => !filterOut.includes(r.id)).map((r) => ({ value: r.id, label: r.name }));

const categoryOptions = () => state.meta.channels.filter((c) => c.type === 4).map((c) => ({ value: c.id, label: c.name }));

const nameOfChannel = (id) => state.meta.channels.find((c) => c.id === id)?.name || id;
const nameOfRole = (id) => state.meta.roles.find((r) => r.id === id)?.name || id;

function dCard(title, desc, iconName, children, { tail = null, noPad = false, id = '' } = {}) {
  const card = el('div', { class: 'd-card', id });
  const head = el('div', { class: 'd-card-head' });
  head.appendChild(el('div', { class: 'ico', html: ic(iconName, 18) }));
  const txt = el('div');
  txt.appendChild(el('h3', { html: title }));
  if (desc) txt.appendChild(el('p', { html: desc }));
  head.appendChild(txt);
  if (tail) {
    const t = el('div', { class: 'tail' });
    (Array.isArray(tail) ? tail : [tail]).forEach((n) => t.appendChild(n));
    head.appendChild(t);
  }
  card.appendChild(head);
  const body = el('div', { class: `d-card-body${noPad ? ' no-pad' : ''}` });
  (Array.isArray(children) ? children : [children]).filter(Boolean).forEach((c) => body.appendChild(c));
  card.appendChild(body);
  return card;
}

/* محرّر قوائم (قنوات/رتب): شرائح + إضافة من قائمة منسدلة */
function dListEditor(path, { type = 'channel', placeholder = 'اختر...' } = {}) {
  const wrap = el('div');
  const current = getPath(path) || [];
  const chips = el('div', { class: 'd-chips', style: 'margin-bottom:8px' });

  if (!current.length) chips.appendChild(el('span', { class: 'd-field-label', html: '<span>لا يوجد شيء مضاف بعد.</span>' }));

  current.forEach((id, index) => {
    const found = state.meta.channels.find((c) => c.id === id);
    const label = type === 'channel' ? (found ? (found.type === 4 ? `[قسم] ${found.name}` : `#${found.name}`) : id) : type === 'role' ? nameOfRole(id) : id;
    const chip = el('span', { class: 'd-chip', text: label });
    const remove = el('button', { html: ic('close', 13), title: 'إزالة' });
    remove.addEventListener('click', () => {
      const list = [...(getPath(path) || [])];
      list.splice(index, 1);
      setPath(path, list);
      renderSection(state.section);
    });
    chip.appendChild(remove);
    chips.appendChild(chip);
  });

  const select = el('select', { class: 'd-select' });
  select.appendChild(el('option', { value: '', text: placeholder }));
  const options = type === 'channel' ? channelOptions() : roleOptions();
  options.forEach((o) => select.appendChild(el('option', { value: o.value, text: o.label })));

  const add = el('button', { class: 'd-btn sm', html: `${ic('plus', 15)} إضافة` });
  add.addEventListener('click', () => {
    if (!select.value) return toast('اختر عنصرًا أولًا.', true);
    const list = getPath(path) || [];
    if (list.includes(select.value)) return toast('موجود مسبقًا.', true);
    setPath(path, [...list, select.value]);
    renderSection(state.section);
  });

  wrap.appendChild(chips);
  const controls = el('div', { class: 'd-field-control' });
  controls.appendChild(select);
  controls.appendChild(add);
  wrap.appendChild(controls);
  return wrap;
}

/* محرّر كلمات/إيموجيات (نص حر) */
function dWordEditor(path, { placeholder = 'أضف عنصرًا...', labeler = null } = {}) {
  const wrap = el('div');
  const current = getPath(path) || [];
  const chips = el('div', { class: 'd-chips', style: 'margin-bottom:8px' });
  if (!current.length) chips.appendChild(el('span', { class: 'd-field-label', html: '<span>لا يوجد شيء مضاف بعد.</span>' }));
  current.forEach((value, index) => {
    // القيمة قد تكون إيموجيًا يحدّده المستخدم — تُعرض كبيانات داخل شريحة محاذية
    const chip = el('span', { class: 'd-chip d-chip-value', text: labeler ? labeler(value) : value });
    const remove = el('button', { html: ic('close', 13), title: 'إزالة' });
    remove.addEventListener('click', () => {
      const list = [...(getPath(path) || [])];
      list.splice(index, 1);
      setPath(path, list);
      renderSection(state.section);
    });
    chip.appendChild(remove);
    chips.appendChild(chip);
  });

  const input = el('input', { class: 'd-input', placeholder });
  const add = el('button', { class: 'd-btn sm', html: `${ic('plus', 15)} إضافة` });
  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    const list = getPath(path) || [];
    if (list.includes(value)) return toast('موجود مسبقًا', true);
    setPath(path, [...list, value]);
    renderSection(state.section);
  };
  add.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  wrap.appendChild(chips);
  const controls = el('div', { class: 'd-field-control' });
  controls.appendChild(input);
  controls.appendChild(add);
  wrap.appendChild(controls);
  return wrap;
}

/* ============================ الأقسام ============================ */
const SECTION_ICONS = {
  overview: 'dashboard',
  general: 'settings',
  welcome: 'userPlus',
  autorole: 'userCog',
  leveling: 'chart',
  automod: 'shield',
  moderation: 'hammer',
  autoline: 'lines',
  autoreact: 'emoticon',
  tickets: 'ticket',
  staffapp: 'clipboard',
  logs: 'scroll',
  data: 'folder',
  top: 'trophy',
};

/** أنماط خط الفاصل (احتياطي — يأتي الكامل من الـAPI) */
const DEFAULT_LINE_STYLES = [
  { key: 'glow', file: 'glow.gif', label: 'توهّج', desc: 'توهّج يمرّ على الخط من اليمين لليسار' },
  { key: 'flow', file: 'flow.gif', label: 'تدفّق', desc: 'تدرّج لوني متدفّق بلا توقّف' },
  { key: 'pulse', file: 'pulse.gif', label: 'نبض', desc: 'إضاءة تنبض بهدوء في المنتصف' },
  { key: 'dash', file: 'dash.gif', label: 'شرطات', desc: 'شرطات تتحرّك على طول الخط' },
];

const SECTIONS = {
  /* ------------------------------ نظرة عامة ------------------------------ */
  overview: {
    group: 'عام',
    label: 'مركز التحكم',
    title: 'مركز التحكم',
    desc: 'نظرة عامة على حالة السيرفر، وتشغيل الأنظمة أو إيقافها.',
    render() {
      const frag = document.createDocumentFragment();
      const st = state.stats || {};

      const stats = el('div', { class: 'd-stats' });
      [
        ['hammer', st.cases ?? 0, 'إجمالي العقوبات'],
        ['warning', st.warnings ?? 0, 'تحذيرات'],
        ['ticket', st.openTickets ?? 0, 'تذاكر مفتوحة'],
        ['chart', (st.messages ?? 0).toLocaleString('ar-EG'), 'رسائل محسوبة'],
        ['users', (state.guild.memberCount || st.trackedMembers || 0).toLocaleString('ar-EG'), 'عضو'],
      ].forEach(([iconName, value, label]) => {
        const card = el('div', { class: 'd-stat' });
        card.appendChild(el('b', { text: String(value) }));
        card.appendChild(el('span', { html: `${ic(iconName, 15)} ${label}` }));
        stats.appendChild(card);
      });
      frag.appendChild(stats);

      /* تشغيل/إطفاء الأنظمة بسرعة */
      const toggles = [
        ['welcome.enabled', 'userPlus', 'الترحيب', 'رسالة ترحيب بالبطاقة لكل عضو جديد'],
        ['leave.enabled', 'userMinus', 'الوداع', 'رسالة عند مغادرة عضو'],
        ['boost.enabled', 'star', 'شكر الدعم', 'رسالة عند دعم السيرفر'],
        ['logs.enabled', 'scroll', 'السجلات', 'تسجيل أحداث السيرفر'],
        ['automod.enabled', 'shield', 'الحماية التلقائية', 'منع السبام والروابط'],
        ['autoline.enabled', 'lines', 'الخط الفاصل', 'خط تلقائي في القنوات'],
        ['autoreact.enabled', 'emoticon', 'التفاعلات', 'تفاعل تلقائي على الرسائل'],
        ['tickets.enabled', 'ticket', 'التذاكر', 'نظام التذاكر بأربعة أنواع'],
        ['staffApplication.enabled', 'clipboard', 'تقديم الإدارة', 'نموذج من خمس خانات مع القبول والرفض'],
        ['leveling.enabled', 'chart', 'المستويات', 'نقاط الخبرة ومكافآت الرتب'],
        ['autorole.enabled', 'userCog', 'الرتب التلقائية', 'رتب تُمنح عند الانضمام'],
      ];
      const quick = el('div', { class: 'd-quick' });
      toggles.forEach(([path, iconName, label, desc]) => {
        const card = el('div', { class: 'd-quick-card' });
        card.appendChild(el('div', { class: 'ico', html: ic(iconName, 20) }));
        const txt = el('div', { class: 'txt' });
        txt.appendChild(el('b', { text: label }));
        txt.appendChild(el('span', { text: desc }));
        card.appendChild(txt);
        card.appendChild(
          dSwitch(path, () => {
            const items = window.__dashItems || [];
            updateDots(items);
          }),
        );
        quick.appendChild(card);
      });
      frag.appendChild(dCard('تشغيل الأنظمة وإيقافها', 'يُحفظ أي تغيير من شريط الحفظ السفلي', 'bolt', [quick], { noPad: true }));

      /* رسم النشاط */
      if (state.daily?.length) {
        frag.appendChild(dCard('نشاط آخر 14 يومًا', 'الرسائل • الأعضاء الجدد • التذاكر', 'chart', [buildChart()], { noPad: true }));
      }

      /* حالة البوت */
      const statusRows = [
        dField('حالة البوت', '', [el('span', { class: 'd-chip', html: state.guild.botOnline ? `<span class="state-on">متصل</span>` : `<span class="state-off">غير متصل</span>` })]),
        dField('عدد الأعضاء', '', [el('b', { class: 'accent', text: (state.guild.memberCount || 0).toLocaleString('ar-EG') })]),
        dField('معرّف السيرفر', '', [el('code', { class: 'd-kbd', text: state.guild.id })]),
        dField('أولوية الدعم', 'مدة الرد المتوقّعة في التذاكر', [dInput('tickets.responseTime', { narrow: true })]),
      ];
      frag.appendChild(dCard('معلومات السيرفر', '', 'info', statusRows));

      return frag;
    },
  },

  /* ------------------------------ الإعدادات العامة ------------------------------ */
  general: {
    group: 'عام',
    label: 'الإعدادات العامة',
    title: 'الإعدادات العامة',
    desc: 'اللغة والبادئة وقناة الاستفسارات.',
    render() {
      return dCard('الأساسيات', 'تنطبق على كل الأنظمة', 'settings', [
        dField('لغة البوت', 'اللغة الافتراضية للرسائل والأوامر', [
          dSelect('language', [{ value: 'ar', label: '🇸🇦 العربية' }, { value: 'en', label: '🇬🇧 English' }], { noneLabel: null }),
        ]),
        dField('البادئة النصية', 'للأوامر التقليدية بالرسائل (اختياري)', [dInput('prefix', { narrow: true, placeholder: '!' })]),
        dField('قناة الاستفسارات', 'قناة عامة للأسئلة (اختياري)', [dSelect('reports.channelId', channelOptions())]),
        dField('نظام الدعوات (Referral)', 'تتبّع من دعا من', [dSwitch('referral.enabled')]),
        dField('قناة الدعوات', '', [dSelect('referral.channelId', channelOptions())]),
      ]);
    },
  },

  /* ------------------------------ الترحيب ------------------------------ */
  welcome: {
    group: 'الأعضاء',
    label: 'الترحيب والوداع',
    title: 'الترحيب والوداع',
    desc: 'رسالة ترحيب مع بطاقة بالأفتار، ورسائل الوداع والدعم.',
    render() {
      const frag = document.createDocumentFragment();

      frag.appendChild(
        dCard(
          'رسالة الترحيب',
          'المتغيّرات: {user} {username} {server} {memberCount} {createdAt}',
          'userPlus',
          [
            dField('تفعيل الترحيب', '', [dSwitch('welcome.enabled')]),
            dField('قناة الترحيب', '', [dSelect('welcome.channelId', channelOptions())]),
            dField('نص الرسالة', 'يدعم الإيموجيات الخارجية <:name:id>', [dArea('welcome.message')], { wide: true }),
            dField('إرسال كـ Embed', 'شكل بطاقة أنيقة', [dSwitch('welcome.embed')]),
            dField('حذف تلقائي بعد (ثانية)', '0 = لا يُحذف', [dNumber('welcome.autoDeleteAfter')]),
            dField('رسالة خاصة للعضو', 'يوصل الترحيب بالخاص', [dSwitch('welcome.dm')]),
            dField('نص الخاص', '', [dArea('welcome.dmMessage')], { wide: true }),
          ],
          { tail: testButton('إرسال رسالة تجريبية') },
        ),
      );

      frag.appendChild(
        dCard('صورة الترحيب', 'بطاقة ترحيب مولّدة بالأفتار تُرسل لكل عضو جديد', 'image', [
          dField(
            'نوع الصورة',
            `مولّد البطاقات: ${state.meta.cardAvailable ? '<span class="state-on">متاح</span>' : '<span class="state-off">غير متاح — سيُستخدم الأفتار</span>'}`,
            [
              dSelect(
                'welcome.imageMode',
                [
                  { value: 'card', label: 'بطاقة مولَّدة (أفتار + اسم + رقم)' },
                  { value: 'avatar', label: 'صورة الأفتار فقط' },
                  { value: 'custom', label: 'رابط صورة مخصّص' },
                  { value: 'none', label: 'بدون صورة' },
                ],
                { noneLabel: null },
              ),
            ],
          ),
          dField('رابط الصورة المخصّصة', 'يدعم {avatar}', [dInput('welcome.imageUrl', { full: true, placeholder: 'https://...' })], { wide: true }),
          dField('خلفية البطاقة', 'رابط صورة (اختياري)', [dInput('welcome.cardBackground', { full: true, placeholder: 'https://...' })], { wide: true }),
          dField('تدرّج لون البطاقة', 'من لون إلى لون', [dInput('welcome.cardTheme.from', { narrow: true }), dInput('welcome.cardTheme.to', { narrow: true })]),
          dField('إرفاق الصورة كملف', 'جودة أفضل من الرابط', [dSwitch('welcome.attachImage')]),
          dField('إظهار الأفتار كصورة مصغّرة', '', [dSwitch('welcome.avatarThumbnail')]),
          dField('اختبار البطاقة', 'يرسل بطاقة نموذجية في القناة', [testButton('إرسال بطاقة تجريبية')]),
        ]),
      );

      frag.appendChild(
        dCard('رسالة الوداع', '', 'userMinus', [
          dField('تفعيل الوداع', '', [dSwitch('leave.enabled')]),
          dField('القناة', '', [dSelect('leave.channelId', channelOptions())]),
          dField('نص الرسالة', 'المتغيّرات: {user} {server} {memberCount}', [dArea('leave.message')], { wide: true }),
        ]),
      );

      frag.appendChild(
        dCard('رسالة شكر الدعم', '', 'star', [
          dField('تفعيل', '', [dSwitch('boost.enabled')]),
          dField('القناة', '', [dSelect('boost.channelId', channelOptions())]),
          dField('نص الرسالة', 'المتغيّرات: {user} {server} {level}', [dArea('boost.message')], { wide: true }),
        ]),
      );

      return frag;
    },
  },

  /* ------------------------------ الرتب التلقائية ------------------------------ */
  autorole: {
    group: 'الأعضاء',
    label: 'الرتب التلقائية',
    title: 'الرتب التلقائية',
    desc: 'رتب تُمنح تلقائيًا للأعضاء الجدد، ورتبة منفصلة للبوتات.',
    render() {
      return dCard('الرتب التلقائية', 'أضف الرتب التي تُعطى فور دخول العضو', 'userCog', [
        dField('تفعيل النظام', '', [dSwitch('autorole.enabled')]),
        dField('رتب الأعضاء', 'تُعطى لكل عضو جديد', [dListEditor('autorole.roleIds', { type: 'role', placeholder: 'اختر رتبة...' })], { wide: true }),
        dField('رتب البوتات', 'تُعطى للبوتات التي تُضاف', [dListEditor('autorole.botRoleIds', { type: 'role', placeholder: 'اختر رتبة...' })], { wide: true }),
      ]);
    },
  },

  /* ------------------------------ المستويات ------------------------------ */
  leveling: {
    group: 'الأعضاء',
    label: 'المستويات',
    title: 'المستويات والخبرة',
    desc: 'نقاط خبرة على الرسائل والصوت، مع مكافآت رتب ورسائل ترقية.',
    render() {
      const rewards = state.settings.leveling.rewards || [];
      const rows = el('div');
      rewards.forEach((reward, index) => {
        rows.appendChild(
          dField(
            `المستوى ${reward.level}`,
            `الرتبة: ${nameOfRole(reward.roleId)}`,
            [
              (() => {
                const select = el('select', { class: 'd-select' });
                select.appendChild(el('option', { value: '', text: 'اختر رتبة...' }));
                roleOptions().forEach((o) => select.appendChild(el('option', { value: o.value, text: o.label, selected: o.value === reward.roleId ? 'selected' : '' })));
                select.addEventListener('change', () => {
                  const list = [...rewards];
                  list[index] = { ...reward, roleId: select.value };
                  setPath('leveling.rewards', list);
                });
                return select;
              })(),
              (() => {
                const btn = el('button', { class: 'd-btn sm danger', html: `${ic('close', 14)} حذف` });
                btn.addEventListener('click', () => {
                  const list = [...rewards];
                  list.splice(index, 1);
                  setPath('leveling.rewards', list);
                  renderSection('leveling');
                });
                return btn;
              })(),
            ],
          ),
        );
      });

      const levelInput = el('input', { class: 'd-input narrow', type: 'number', min: 1, placeholder: 'المستوى' });
      const roleSelect = el('select', { class: 'd-select' });
      roleSelect.appendChild(el('option', { value: '', text: 'اختر رتبة...' }));
      roleOptions().forEach((o) => roleSelect.appendChild(el('option', { value: o.value, text: o.label })));
      const addReward = el('button', { class: 'd-btn sm primary', html: `${ic('plus', 15)} إضافة مكافأة` });
      addReward.addEventListener('click', () => {
        const level = Number(levelInput.value);
        if (!level || !roleSelect.value) return toast('حدّد المستوى والرتبة أولًا.', true);
        const list = (state.settings.leveling.rewards || []).filter((r) => Number(r.level) !== level);
        list.push({ level, roleId: roleSelect.value });
        list.sort((a, b) => a.level - b.level);
        setPath('leveling.rewards', list);
        renderSection('leveling');
      });
      const adder = el('div', { class: 'd-field-control' });
      [levelInput, roleSelect, addReward].forEach((n) => adder.appendChild(n));

      return [
        dCard('الخبرة الكتابية (الشات)', 'خبرة على الرسائل في القنوات', 'message', [
          dField('تفعيل النظام', 'المفتاح الرئيسي لكل مصادر الخبرة', [dSwitch('leveling.enabled')]),
          dField('خبرة كتابية', 'منح خبرة على كل رسالة', [dSwitch('leveling.textXp')]),
          dField('نقاط لكل رسالة', 'أقل وأكثر خبرة تُعطى عشوائيًا', [dNumber('leveling.minXp'), dNumber('leveling.maxXp')]),
          dField('الفاصل الزمني (ثانية)', 'منع تكرار الخبرة بسرعة', [dNumber('leveling.cooldownSeconds')]),
        ]),
        dCard('الخبرة الصوتية', 'خبرة مقابل البقاء في الرومات الصوتية (كل دقيقة)', 'speaker', [
          dField('خبرة صوتية', 'لازم يكون معك حد ثاني في الروم', [dSwitch('leveling.voiceXp')]),
          dField('نقاط الدقيقة', 'أقل وأكثر خبرة لكل دقيقة', [dNumber('leveling.voiceMinXp'), dNumber('leveling.voiceMaxXp')]),
        ]),
        dCard('خبرة التفاعل', 'خبرة لما يتفاعل الأعضاء مع رسائل بعضهم', 'activity', [
          dField('خبرة تفاعل', 'صاحب الرسالة ياخذ خبرة على التفاعلات', [dSwitch('leveling.interactXp')]),
          dField('نقاط لكل تفاعل', 'أقل وأكثر خبرة', [dNumber('leveling.interactMinXp'), dNumber('leveling.interactMaxXp')]),
          dField('سقف يومي للعضو', 'أقصى خبرة تفاعل في اليوم (0 = بلا سقف)', [dNumber('leveling.interactDailyCap', { max: 5000 })]),
          dField('سقف التفاعلات لكل رسالة', 'منع التجميع على رسالة واحدة', [dNumber('leveling.interactMaxPerMessage')]),
          dField('مكافأة من تفاعل', 'خبرة صغيرة لمن يضغط التفاعل', [dSwitch('leveling.interactGivenXp')]),
        ]),
        dCard('الترقية والفترات', 'رسالة الترقية وتوقيت تجديد توب داي وتوب ويك', 'crown', [
          dField('قناة إعلان الترقية', 'بدون = رسالة خاصة', [dSelect('leveling.announceChannelId', channelOptions())]),
          dField('نص رسالة الترقية', 'المتغيّرات: {user} {level}', [dArea('leveling.levelUpMessage')], { wide: true }),
          dField('بدون رسائل ترقية', 'صمت تام', [dSwitch('leveling.silent')]),
          dField('إزاحة التوقيت (ساعات)', 'عن UTC — تُحدّد وقت تجديد اليوم/الأسبوع', [dNumber('leveling.resetOffsetHours', { min: -12, max: 14 })]),
        ]),
        dCard('مكافآت الرتب', 'رتبة تُعطى تلقائيًا عند مستوى معيّن', 'gift', [rows, dField('إضافة مكافأة', '', [adder], { wide: true })]),
        dCard('استثناءات', 'قنوات أو رتب لا تأخذ خبرة', 'close', [
          dField('قنوات مستثناة', '', [dListEditor('leveling.ignoredChannels', { type: 'channel' })], { wide: true }),
          dField('رتب مستثناة', '', [dListEditor('leveling.ignoredRoles', { type: 'role' })], { wide: true }),
        ]),
      ];
    },
  },

  /* ------------------------------ المتصدّرون ------------------------------ */
  top: {
    group: 'الأعضاء',
    label: 'تفاعل',
    title: 'تفاعل',
    desc: 'تفاعل الأعضاء وخبرتهم: توب داي · توب ويك · كل الأوقات — كتابي وصوتي وتفاعل.',
    render() {
      const wrap = el('div');
      if (!state.topPeriod) state.topPeriod = 'day';
      if (!state.topSource) state.topSource = 'all';

      const seg = el('div', { class: 'seg d-top-seg' });
      [
        ['day', 'اليوم (توب داي)', 'clock'],
        ['week', 'هذا الأسبوع (توب ويك)', 'activity'],
        ['all', 'كل الأوقات', 'crown'],
      ].forEach(([key, label, iconName]) => {
        const btn = el('button', { class: state.topPeriod === key ? 'active' : '', html: `${ic(iconName, 15)} ${label}` });
        btn.addEventListener('click', () => {
          state.topPeriod = key;
          renderSection('top');
        });
        seg.appendChild(btn);
      });

      const chips = el('div', { class: 'd-top-chips' });
      [
        ['all', 'الكل'],
        ['text', 'كتابي'],
        ['voice', 'صوتي'],
        ['interact', 'تفاعل'],
      ].forEach(([key, label]) => {
        const btn = el('button', { class: `chip${state.topSource === key ? ' active' : ''}`, text: label });
        btn.addEventListener('click', () => {
          state.topSource = key;
          renderSection('top');
        });
        chips.appendChild(btn);
      });

      const note = el('div', { class: 'd-top-note', html: '<span class="d-empty">جارٍ التحميل…</span>' });
      const box = el('div');

      wrap.appendChild(seg);
      wrap.appendChild(chips);
      wrap.appendChild(note);
      wrap.appendChild(box);
      loadTopBoard(note, box);
      return wrap;
    },
  },

  /* ------------------------------ الحماية التلقائية ------------------------------ */
  automod: {
    group: 'الحماية',
    label: 'الحماية التلقائية',
    title: 'الحماية التلقائية',
    desc: 'ضبط أنماط المخالفات والعقوبة المطبّقة عليها.',
    render() {
      const punishmentLabels = [
        ['delete', 'حذف الرسالة فقط'],
        ['warn', 'تحذير'],
        ['timeout', 'إسكات مؤقت'],
        ['kick', 'طرد'],
        ['ban', 'حظر'],
      ];
      return [
        dCard('التشغيل العام', '', 'shield', [
          dField('تفعيل الحماية', '', [dSwitch('automod.enabled')]),
          dField(
            'العقوبة عند المخالفة',
            '',
            [dSelect('automod.punishment', punishmentLabels.map(([value, label]) => ({ value, label })), { noneLabel: null })],
          ),
          dField('مدة الإسكات (دقيقة)', 'تُستخدم عند اختيار إسكات مؤقت', [dNumber('automod.timeoutMinutes')]),
        ]),
        dCard('الأنماط الممنوعة', 'كل نمط بمفتاح تشغيل/إطفاء', 'ban', [
          dField('منع السبام', 'رسائل كثيرة في وقت قصير', [dSwitch('automod.antiSpam')]),
          dField('حدّ الرسائل', 'كم رسالة مسموحة', [dNumber('automod.spamMessages'), el('span', { class: 'muted', text: 'خلال' }), dNumber('automod.spamIntervalSeconds'), el('span', { class: 'muted', text: 'ثانية' })]),
          dField('منع الروابط', '', [dSwitch('automod.antiLink')]),
          dField('منع دعوات السيرفرات', '', [dSwitch('automod.antiInvite')]),
          dField('منع المنشن الجماعي', '', [dSwitch('automod.antiEveryone')]),
          dField('حدّ المنشن في الرسالة', '', [dNumber('automod.mentionLimit')]),
          dField('منع الكتابة الكبيرة (CAPS)', '', [dSwitch('automod.antiCaps')]),
          dField('نسبة الأحرف الكبيرة %', '', [dNumber('automod.capsPercent')]),
          dField('روابط مسموحة', 'استثناءات (مثل tenor.com)', [dWordEditor('automod.whitelistDomains', { placeholder: 'giphy.com' })], { wide: true }),
        ]),
        dCard('الكلمات الممنوعة', 'أي رسالة تحتوي كلمة منها تُحذف', 'edit', [
          dField('قائمة الكلمات', '', [dWordEditor('automod.bannedWords', { placeholder: 'اكتب الكلمة ثم Enter' })], { wide: true }),
        ]),
        dCard('الحماية من الهجمات', 'تنبيه أو عقوبة عند دخول أعداد كبيرة', 'shield', [
          dField('تفعيل', '', [dSwitch('automod.antiRaid')]),
          dField('عدد الأعضاء', 'خلال', [dNumber('automod.raidThreshold'), dNumber('automod.raidWindowSeconds'), el('span', { class: 'muted', text: 'ثانية' })]),
          dField(
            'الإجراء',
            '',
            [
              dSelect(
                'automod.raidAction',
                [
                  { value: 'alert', label: 'تنبيه فقط' },
                  { value: 'lockdown', label: 'قفل السيرفر' },
                  { value: 'kick', label: 'طرد الداخلين' },
                ],
                { noneLabel: null },
              ),
            ],
          ),
          dField('أقل عمر للحساب (يوم)', '0 = بدون شرط', [dNumber('automod.raidMinAccountAgeDays')]),
        ]),
        dCard('استثناءات', 'قنوات أو رتب لا تطبق عليها الحماية', 'check', [
          dField('قنوات مستثناة', '', [dListEditor('automod.whitelistChannels', { type: 'channel' })], { wide: true }),
          dField('رتب مستثناة', '', [dListEditor('automod.whitelistRoles', { type: 'role' })], { wide: true }),
        ]),
      ];
    },
  },

  /* ------------------------------ عقوبات التحذيرات ------------------------------ */
  moderation: {
    group: 'الحماية',
    label: 'عقوبات التحذيرات',
    title: 'عقوبات التحذيرات',
    desc: 'العقوبة التلقائية عند بلوغ عدد معيّن من التحذيرات.',
    render() {
      return dCard('العقوبة التلقائية', 'مثال: ثلاثة تحذيرات تؤدي إلى إسكات عشر دقائق', 'hammer', [
        dField('عدد التحذيرات', '0 = معطّل', [dNumber('moderation.warnThreshold')]),
        dField(
          'العقوبة',
          '',
          [
            dSelect(
              'moderation.warnAction',
              [
                { value: 'none', label: 'بدون' },
                { value: 'timeout', label: 'إسكات عشر دقائق' },
                { value: 'kick', label: 'طرد' },
                { value: 'ban', label: 'حظر' },
              ],
              { noneLabel: null },
            ),
          ],
        ),
      ]);
    },
  },

  /* ------------------------------ الخط الفاصل ------------------------------ */
  autoline: {
    group: 'الأعضاء',
    label: 'الخط الفاصل (AutoLine)',
    title: 'الخط الفاصل',
    desc: 'خط تلقائي في القنوات المحدّدة، مع حذف الخط السابق عند وصول رسالة جديدة.',
    render() {
      const type = getPath('autoline.lineType') || 'gif';
      const style = getPath('autoline.gifStyle') || 'glow';
      const styles = state.meta.autolineStyles || DEFAULT_LINE_STYLES;

      /* -------- اختيار النوع: صورة متحركة / رابط خاص / نصّي -------- */
      const typeSeg = el('div', { class: 'seg autoline-type' });
      [
        { key: 'gif', label: 'صورة GIF متحركة', icon: 'sparkles' },
        { key: 'custom', label: 'رابط صورة خاص', icon: 'link' },
        { key: 'text', label: 'خط نصّي', icon: 'type' },
      ].forEach((option) => {
        const btn = el('button', {
          class: type === option.key ? 'active' : '',
          html: `${ic(option.icon, 15)} ${option.label}`,
        });
        btn.addEventListener('click', () => {
          setPath('autoline.lineType', option.key);
          renderSection('autoline');
        });
        typeSeg.appendChild(btn);
      });

      /* -------- معاينة حيّة للخط الحالي (صورة أو نص) -------- */
      const preview = el('div', { class: 'autoline-preview' });
      const current = styles.find((x) => x.key === style) || styles[0];
      if (type === 'custom') {
        const url = getPath('autoline.customUrl') || '';
        if (/^https?:\/\//i.test(url)) preview.appendChild(el('img', { src: url, alt: 'معاينة الخط', class: 'autoline-img' }));
        else preview.appendChild(el('div', { class: 'd-hint', text: 'ألصق رابط صورة مباشر (ينتهي بـ .gif أو .png أو .webp) ويظهر هنا.' }));
      } else if (type === 'text') {
        preview.appendChild(el('div', { class: 'autoline-text', text: getPath('autoline.line') || '────────────────────────' }));
      } else {
        preview.appendChild(el('img', { src: `/autoline/${current.file}`, alt: `خط ${current.label}`, class: 'autoline-img' }));
      }

      /* -------- بطاقات الأنماط (صورة متحركة لكل نمط) -------- */
      const styleGrid = el('div', { class: 'autoline-styles' });
      styles.forEach((item) => {
        const card = el('button', {
          class: `autoline-style${item.key === style && type === 'gif' ? ' active' : ''}`,
        });
        card.appendChild(el('img', { src: `/autoline/${item.file}`, alt: item.label, loading: 'lazy' }));
        const meta = el('div', { class: 'autoline-style-meta' });
        meta.appendChild(el('b', { text: item.label }));
        meta.appendChild(el('span', { text: item.desc }));
        card.appendChild(meta);
        card.addEventListener('click', () => {
          setPath('autoline.gifStyle', item.key);
          setPath('autoline.lineType', 'gif');
          renderSection('autoline');
        });
        styleGrid.appendChild(card);
      });

      return [
        dCard('نوع الخط', 'اختر: صورة GIF متحركة · رابط صورتك · أو خط نصّي', 'lines', [
          dField('النوع', 'الافتراضي: صورة GIF متحركة', [typeSeg], { wide: true }),
          dField('تفعيل', '', [dSwitch('autoline.enabled')]),
          dField('القنوات', 'القنوات التي يعمل فيها الخط', [dListEditor('autoline.channels', { type: 'channel' })], { wide: true }),
        ]),
        dCard(
          type === 'gif' ? 'شكل الخط المتحرك' : type === 'custom' ? 'رابط الخط' : 'نص الخط',
          type === 'gif'
            ? 'اضغط على أي نمط لاختياره — والمعاينة فوق تتحدّث فورًا.'
            : type === 'custom'
              ? 'صورة أو GIF من رابطك المباشر.'
              : 'خط نصّي (يدعم الإيموجيات الخارجية).',
          'sparkles',
          [
            dField('المعاينة', 'شكل الخط اللي بيطلع في القناة', [preview], { wide: true }),
            ...(type === 'gif'
              ? [dField('الأنماط الجاهزة', '4 خطوط متحركة جاهزة', [styleGrid], { wide: true })]
              : type === 'custom'
                ? [dField('رابط الصورة', 'يجب أن ينتهي بـ .gif أو .png أو .webp', [dInput('autoline.customUrl', { placeholder: 'https://example.com/line.gif' })], { wide: true })]
                : [dField('نص الخط', 'يدعم الإيموجيات الخارجية', [dArea('autoline.line')], { wide: true })]),
            dField('حذف الخط السابق', 'عند وصول رسالة جديدة', [dSwitch('autoline.deletePrevious')]),
            dField('حذف الخط مع الرسالة', 'لو انحذفت الرسالة اللي بعده', [dSwitch('autoline.deleteLineWithMessage')]),
            dField('حذف تلقائي بعد (ثانية)', '0 = بدون', [dNumber('autoline.deleteAfter')]),
            dField('اختبار', 'يرسل الخط في القناة المحدّدة', [testButton('إرسال خط تجريبي')]),
          ],
        ),
      ];
    },
  },

  /* ------------------------------ التفاعلات التلقائية ------------------------------ */
  autoreact: {
    group: 'الأعضاء',
    label: 'التفاعلات التلقائية',
    title: 'التفاعلات التلقائية',
    desc: 'تفاعلات تلقائية على رسائل القنوات المحدّدة أو عند احتواء الرسالة على كلمة.',
    render() {
      const words = state.settings.autoreact.words || [];
      const rows = el('div');
      words.forEach((rule, index) => {
        rows.appendChild(
          dField(`كلمة: ${rule.word}`, `التفاعل: ${rule.emoji}`, [
            (() => {
              const btn = el('button', { class: 'd-btn sm danger', html: `${ic('trash', 14)} حذف` });
              btn.addEventListener('click', () => {
                const list = [...words];
                list.splice(index, 1);
                setPath('autoreact.words', list);
                renderSection('autoreact');
              });
              return btn;
            })(),
          ]),
        );
      });

      const wordInput = el('input', { class: 'd-input', placeholder: 'الكلمة المفتاحية' });
      const emojiInput = el('input', { class: 'd-input narrow', placeholder: 'إيموجي أو <:name:id>' });
      const addRule = el('button', { class: 'd-btn sm primary', html: `${ic('plus', 15)} إضافة قاعدة` });
      addRule.addEventListener('click', () => {
        const word = wordInput.value.trim().toLowerCase();
        const emoji = emojiInput.value.trim();
        if (!word || !emoji) return toast('يجب كتابة الكلمة والإيموجي.', true);
        const list = [...words.filter((r) => r.word !== word), { word, emoji }];
        setPath('autoreact.words', list);
        renderSection('autoreact');
      });
      const adder = el('div', { class: 'd-field-control' });
      [wordInput, emojiInput, addRule].forEach((n) => adder.appendChild(n));

      const emojiOptions = (state.meta.emojis || []).map((e) => ({ value: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`, label: `${e.name}${e.animated ? ' (متحرّك)' : ''}` }));

      return [
        dCard('إعداد التفاعل', '', 'emoticon', [
          dField('تفعيل', '', [dSwitch('autoreact.enabled')]),
          dField('تجاهل رسائل البوتات', '', [dSwitch('autoreact.ignoreBots')]),
          dField('القنوات', 'تفاعل على كل رسالة في هذه القنوات', [dListEditor('autoreact.channels', { type: 'channel' })], { wide: true }),
          dField('الإيموجيات', 'إيموجي عادي أو خارجي — أو اختر من إيموجيات سيرفرك', [dWordEditor('autoreact.emojis', { placeholder: 'إيموجي أو <:name:id>' })], { wide: true }),
          ...(emojiOptions.length
            ? [
                dField('إيموجيات السيرفر', 'إضافة سريعة من إيموجيات سيرفرك', [
                  (() => {
                    const select = el('select', { class: 'd-select' });
                    select.appendChild(el('option', { value: '', text: '— اختر إيموجي —' }));
                    emojiOptions.forEach((o) => select.appendChild(el('option', { value: o.value, text: o.label })));
                    const btn = el('button', { class: 'd-btn sm', html: `${ic('plus', 15)} إضافة` });
                    btn.addEventListener('click', () => {
                      if (!select.value) return toast('اختر إيموجيًا أولًا.', true);
                      const list = state.settings.autoreact.emojis || [];
                      if (list.includes(select.value)) return toast('موجود مسبقًا', true);
                      setPath('autoreact.emojis', [...list, select.value]);
                      renderSection('autoreact');
                    });
                    const wrap = el('div', { class: 'd-field-control' });
                    wrap.appendChild(select);
                    wrap.appendChild(btn);
                    return wrap;
                  })(),
                ]),
              ]
            : []),
        ]),
        dCard('تفاعل حسب كلمة', 'مثال: كلمة «مبروك» تعني إضافة تفاعل تلقائي.', 'message', [rows, dField('إضافة قاعدة', '', [adder], { wide: true })]),
      ];
    },
  },

  /* ------------------------------ التذاكر ------------------------------ */
  tickets: {
    group: 'التذاكر',
    label: 'نظام التذاكر',
    title: 'نظام التذاكر',
    desc: 'لوحة تفاعلية بأربعة أنواع، مع استلام وإغلاق وأرشيف محادثة.',
    render() {
      const types = state.settings.tickets.types || [];
      const typeCards = types.map((type, index) =>
        dCard(
          type.label,
          `المعرّف: <code>${esc(type.id)}</code> • النمط: ${type.buttonStyle || 'Primary'}`,
          'ticket',
          [
            dField('الاسم في اللوحة', '', [dInput(`tickets.types.${index}.label`)]),
            dField('الإيموجي', 'إيموجي عادي أو خارجي <:name:id>', [dInput(`tickets.types.${index}.emoji`, { narrow: true })]),
            dField('الوصف', 'يظهر في اللوحة تحت الزر', [dInput(`tickets.types.${index}.description`, { full: true })], { wide: true }),
            dField('رسالة داخل التذكرة', 'تعليمات لصاحب التذكرة', [dArea(`tickets.types.${index}.intro`)], { wide: true }),
            dField(
              'لون الزر',
              '',
              [
                dSelect(
                  `tickets.types.${index}.buttonStyle`,
                  [
                    { value: 'Primary', label: 'أزرق' },
                    { value: 'Success', label: 'أخضر' },
                    { value: 'Secondary', label: 'رمادي' },
                    { value: 'Danger', label: 'أحمر' },
                  ],
                  { noneLabel: null },
                ),
              ],
            ),
            dField('حذف النوع', 'يُحفظ بعد الضغط على حفظ', [
              (() => {
                const btn = el('button', { class: 'd-btn sm danger', html: `${ic('trash', 15)} حذف هذا النوع` });
                btn.addEventListener('click', () => {
                  const list = [...types];
                  list.splice(index, 1);
                  setPath('tickets.types', list);
                  renderSection('tickets');
                });
                return btn;
              })(),
            ]),
          ],
        ),
      );

      const newId = el('input', { class: 'd-input narrow', placeholder: 'المعرّف' });
      const newLabel = el('input', { class: 'd-input', placeholder: 'الاسم الظاهر' });
      // ملاحظة: إيموجي النوع بيانات تُرسل إلى ديسكورد (زر التذكرة)، وليست عنصرًا في واجهة الموقع
      const newEmoji = el('input', { class: 'd-input narrow', placeholder: 'إيموجي الزر' });
      const addType = el('button', { class: 'd-btn sm primary', html: `${ic('plus', 15)} إضافة نوع` });
      addType.addEventListener('click', () => {
        const id = newId.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        const label = newLabel.value.trim();
        if (!id || !label) return toast('يجب كتابة المعرّف والاسم.', true);
        if (types.some((t) => t.id === id)) return toast('هذا المعرّف مستخدم مسبقًا.', true);
        if (types.length >= 25) return toast('الحد الأقصى خمسة وعشرون نوعًا.', true);
        setPath('tickets.types', [...types, { id, label, emoji: newEmoji.value.trim() || '🎫', description: '', intro: '', buttonStyle: 'Primary' }]);
        renderSection('tickets');
      });
      const restore = el('button', { class: 'd-btn sm ghost', html: `${ic('refresh', 15)} استرجاع الأنواع الأربعة` });
      restore.addEventListener('click', () => {
        setPath('tickets.types', [
          { id: 'support', label: 'الدعم الفني', emoji: '🛠️', description: 'مشكلة تقنية أو استفسار', intro: 'اكتب مشكلتك بالتفصيل وسيساعدك فريق الدعم الفني.', buttonStyle: 'Primary' },
          { id: 'verify', label: 'التوثيق', emoji: '✅', description: 'طلب توثيق حساب أو رتبة', intro: 'أرسل: من أنت • سبب طلب التوثيق • روابط حساباتك.', buttonStyle: 'Success' },
          { id: 'gift', label: 'الهدايا', emoji: '🎁', description: 'استلام جائزة أو مشكلة في هدية', intro: 'اذكر اسم الهدية/السحب ورقم الرسالة.', buttonStyle: 'Secondary' },
          { id: 'staff', label: 'تقديم إدارة', emoji: '📋', description: 'تقديم للانضمام لفريق الإدارة', intro: 'عبّي نموذج التقديم الذي سيظهر لك بالأزرار.', buttonStyle: 'Danger' },
        ]);
        renderSection('tickets');
        toast('تم استرجاع الأنواع الأربعة، اضغط حفظ التغييرات.');
      });
      const addRow = el('div', { class: 'd-field-control' });
      [newId, newLabel, newEmoji, addType, restore].forEach((n) => addRow.appendChild(n));

      const typeCount = types.length;
      return [
        dCard('الأساسيات', '', 'ticket', [
          dField('تفعيل التذاكر', '', [dSwitch('tickets.enabled')]),
          dField('القسم (Category)', 'تُنشأ فيه قنوات التذاكر', [dSelect('tickets.categoryId', categoryOptions())]),
          dField('رتب الدعم', 'تشوف التذاكر وتستلمها', [dListEditor('tickets.supportRoleIds', { type: 'role' })], { wide: true }),
          dField('قناة أرشيف التذاكر', 'توصلها نسخة المحادثة عند الإغلاق', [dSelect('tickets.logChannelId', channelOptions())]),
          dField('أقصى تذاكر لكل عضو', '', [dNumber('tickets.maxOpenPerUser')]),
        ]),
        dCard('شكل اللوحة', 'اللوحة اللي تنزل في قناة الدعم', 'image', [
          dField(
            'وضع اللوحة',
            typeCount > 5 ? 'تنبيه: الأزرار تسمح بخمسة أنواع كحد أقصى، وعندك ' + typeCount : `عدد الأنواع الحالي: ${typeCount}`,
            [
              dSelect(
                'tickets.panelMode',
                [
                  { value: 'buttons', label: 'أزرار (حتى 5 أنواع)' },
                  { value: 'select', label: 'قائمة منسدلة (حتى 25 نوعًا)' },
                ],
                { noneLabel: null },
              ),
            ],
          ),
          dField('عنوان البنل', '', [dInput('tickets.panelTitle', { full: true })], { wide: true }),
          dField('وصف البنل', '', [dArea('tickets.panelDescription')], { wide: true }),
          dField('فوتر البنل', '', [dInput('tickets.panelFooter', { full: true })], { wide: true }),
          dField('رسالة تعليمات منفصلة', 'رسالة فوق البنل', [dSwitch('tickets.panelSeparateInfo')]),
          dField('نص التعليمات', 'يدعم الإيموجيات الخارجية', [dArea('tickets.panelInfoMessage')], { wide: true }),
          dField('قناة إرسال اللوحة', 'اختر القناة ثم اضغط إرسال (لا يُحفظ)', [
            (() => {
              const select = el('select', { class: 'd-select' });
              select.appendChild(el('option', { value: '', text: '— اختر قناة —' }));
              channelOptions().forEach((o) => select.appendChild(el('option', { value: o.value, text: o.label })));
              select.value = state.panelChannelId || '';
              select.addEventListener('change', () => { state.panelChannelId = select.value; });
              return select;
            })(),
            testButton('نشر لوحة التذاكر', 'panel'),
          ]),
        ]),
        ...typeCards,
        dCard('إضافة نوع جديد', 'أضف أي نوع تذكرة تريده', 'plus', [dField('نوع جديد', '', [addRow], { wide: true })]),
      ];
    },
  },

  /* ------------------------------ تقديم الإدارة ------------------------------ */
  staffapp: {
    group: 'التذاكر',
    label: 'تقديم الإدارة',
    title: 'تقديم الإدارة',
    desc: 'نموذج من خمس خانات مع أزرار القبول والرفض ورسائل تلقائية.',
    render() {
      const a = state.settings.staffApplication || {};
      const fields = a.fields || [];

      const fieldCards = fields.map((field, index) =>
        dCard(
          `الخانة ${index + 1} — ${field.label}`,
          `المعرّف: <code>${esc(field.id)}</code> • ${field.style === 'paragraph' ? 'نص طويل' : 'سطر واحد'}`,
          'clipboard',
          [
            dField('عنوان الخانة', 'يظهر للعضو', [dInput(`staffApplication.fields.${index}.label`)]),
            dField('المثال داخل الخانة', '', [dInput(`staffApplication.fields.${index}.placeholder`, { full: true })], { wide: true }),
            dField(
              'الشكل',
              '',
              [
                dSelect(
                  `staffApplication.fields.${index}.style`,
                  [
                    { value: 'short', label: 'سطر واحد' },
                    { value: 'paragraph', label: 'نص طويل' },
                  ],
                  { noneLabel: null },
                ),
              ],
            ),
            dField('إلزامية', '', [dSwitch(`staffApplication.fields.${index}.required`)]),
          ],
        ),
      );

      return [
        dCard('التشغيل', 'يظهر النموذج في تذاكر «تقديم إدارة» فقط', 'clipboard', [
          dField('تفعيل النموذج', '', [dSwitch('staffApplication.enabled')]),
          dField('قناة مراجعة الطلبات', 'توصلها الطلبات مع أزرار القبول/الرفض', [dSelect('staffApplication.reviewChannelId', channelOptions())]),
          dField('رتب تُنبَّه عند وصول طلب', '', [dListEditor('staffApplication.pingRoleIds', { type: 'role' })], { wide: true }),
          dField('حقل الاسم', 'يُستخرج منه اسم المتقدّم لتسمية التكت', [
            (() => {
              const select = el('select', { class: 'd-select' });
              fields.forEach((f, i) => select.appendChild(el('option', { value: f.id, text: f.label, selected: a.nameFieldId === f.id || (!a.nameFieldId && i === 0) ? 'selected' : '' })));
              select.addEventListener('change', () => setPath('staffApplication.nameFieldId', select.value));
              return select;
            })(),
          ]),
        ]),
        dCard('نصوص النموذج', '', 'edit', [
          dField('عنوان النموذج', '', [dInput('staffApplication.formTitle', { full: true })], { wide: true }),
          dField('مقدمة الرسالة', 'تظهر قبل الخانات', [dArea('staffApplication.formIntro')], { wide: true }),
          dField('نص زر التعبئة', '', [dInput('staffApplication.formButtonLabel', { full: true })], { wide: true }),
        ]),
        ...fieldCards,
        dCard('عند القبول', 'يصير كل هذا تلقائيًا', 'check', [
          dField('رسالة خاصة للمتقدّم', 'توصله على الخاص', [dArea('staffApplication.acceptMessage')], { wide: true }),
          dField('إرسال الخاص', '', [dSwitch('staffApplication.onAccept.dmApplicant')]),
          dField('رسالة داخل التذكرة', 'المتغيّرات: {user} {number}', [dArea('staffApplication.onAccept.postInTicket')], { wide: true }),
          dField('تنبيه المتقدّم داخل التذكرة', '', [dSwitch('staffApplication.onAccept.pingApplicant')]),
          dField('إعادة تسمية التذكرة', 'تتغيّر باسمه + الترقيم', [dSwitch('staffApplication.onAccept.renameChannel')]),
          dField('شكل اسم التذكرة', '{name} = الاسم • {number} = الرقم', [dInput('staffApplication.onAccept.channelNameFormat', { full: true, placeholder: 'إدارة-{number}-{name}' })], { wide: true }),
          dField('نقل التذكرة إلى قسم', 'قسم «تكتات الإدارة»', [dSelect('staffApplication.onAccept.moveToCategoryId', categoryOptions())]),
          dField('رتبة تُعطى عند القبول', '', [dListEditor('staffApplication.onAccept.addRoleIds', { type: 'role' })], { wide: true }),
        ]),
        dCard('عند الرفض', '', 'close', [
          dField('رسالة خاصة للمتقدّم', '', [dArea('staffApplication.rejectMessage')], { wide: true }),
          dField('إرسال الخاص', '', [dSwitch('staffApplication.onReject.dmApplicant')]),
          dField('طلب سبب الرفض', 'نموذج صغير للمشرف', [dSwitch('staffApplication.askRejectReason')]),
          dField('رسالة داخل التذكرة', '', [dArea('staffApplication.onReject.postInTicket')], { wide: true }),
          dField('إغلاق التذكرة بعد الرفض', '', [dSwitch('staffApplication.onReject.closeTicket')]),
        ]),
      ];
    },
  },

  /* ------------------------------ السجلات ------------------------------ */
  logs: {
    group: 'السجلات',
    label: 'السجلات',
    title: 'السجلات',
    desc: `${Object.keys(state.meta.logEvents || {}).length} حدثًا في ${Object.keys(state.meta.logGroups || {}).length} مجموعات، مع إمكانية تفعيل أي حدث وإيقافه.`,
    render() {
      const eventsMeta = state.meta.logEvents || {};
      const groups = state.meta.logGroups || {};
      const activeTotal = Object.keys(eventsMeta).filter((k) => getPath(`logs.events.${k}`)).length;

      const cards = [
        dCard('الإعدادات العامة', `المُفعّل حاليًا: ${activeTotal} / ${Object.keys(eventsMeta).length}`, 'scroll', [
          dField('تفعيل السجلات', '', [dSwitch('logs.enabled')]),
          dField('قناة السجلات', 'تُرسل فيها كل الأحداث', [dSelect('logs.channelId', channelOptions())]),
          dField('اختصار', 'فعّل أو أطفئ كل الأحداث مرة واحدة', [
            (() => {
              const on = el('button', { class: 'd-btn sm success', html: `${ic('check', 15)} تفعيل الكل` });
              on.addEventListener('click', () => setAllLogs(true));
              const off = el('button', { class: 'd-btn sm danger', html: `${ic('close', 15)} تعطيل الكل` });
              off.addEventListener('click', () => setAllLogs(false));
              const wrap = el('div', { class: 'd-field-control' });
              wrap.appendChild(on);
              wrap.appendChild(off);
              return wrap;
            })(),
          ]),
        ]),
      ];

      Object.entries(groups).forEach(([groupId, group]) => {
        const keys = Object.keys(eventsMeta).filter((k) => eventsMeta[k].group === groupId);
        const active = keys.filter((k) => getPath(`logs.events.${k}`)).length;

        const grid = el('div', { class: 'd-log-grid' });
        keys.forEach((key) => {
          grid.appendChild(
            dField(`${eventsMeta[key].label}`, '', [
              el('span', { class: 'log-ico', html: ic(iconForEvent(key), 16) }),
              dSwitch(`logs.events.${key}`),
            ]),
          );
        });

        const onAll = el('button', { class: 'd-btn sm', html: `${ic('check', 14)} الكل` });
        onAll.addEventListener('click', () => setGroupLogs(keys, true));
        const offAll = el('button', { class: 'd-btn sm ghost', html: `${ic('close', 14)} الكل` });
        offAll.addEventListener('click', () => setGroupLogs(keys, false));
        const tailWrap = el('div', { class: 'd-field-control' });
        tailWrap.appendChild(el('span', { class: 'd-chip', text: `${active}/${keys.length}` }));
        tailWrap.appendChild(onAll);
        tailWrap.appendChild(offAll);

        const card = dCard(group.label, '', iconForEvent(keys[0] || groupId), [grid], { tail: tailWrap });
        cards.push(card);
      });

      cards.push(
        dCard('استثناءات', 'قنوات أو رتب لا تُسجَّل أحداثها', 'close', [
          dField('قنوات مستثناة', '', [dListEditor('logs.ignoredChannels', { type: 'channel' })], { wide: true }),
          dField('رتب مستثناة', '', [dListEditor('logs.ignoredRoles', { type: 'role' })], { wide: true }),
          dField('اختبار', 'يرسل رسالة سجل تجريبية', [testButton('إرسال سجل تجريبي')]),
        ]),
      );

      return cards;
    },
  },

  /* ------------------------------ البيانات ------------------------------ */
  data: {
    group: 'البيانات',
    label: 'البيانات',
    title: 'البيانات',
    desc: 'سجل العقوبات، والتذاكر، والمتصدّرون في المستويات.',
    render() {
      const wrap = el('div');
      const seg = el('div', { class: 'd-seg' });
      const box = el('div', { html: '<div class="d-empty">جارٍ التحميل…</div>' });
      const views = [
        ['cases', 'الحالات'],
        ['tickets', 'التذاكر'],
        ['levels', 'المتصدّرون'],
      ];
      if (!state.dataView) state.dataView = 'cases';

      views.forEach(([id, label]) => {
        const btn = el('button', { html: label, class: state.dataView === id ? 'active' : '' });
        btn.addEventListener('click', () => {
          state.dataView = id;
          seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          loadDataView(box, id);
        });
        seg.appendChild(btn);
      });

      wrap.appendChild(seg);
      wrap.appendChild(box);
      loadDataView(box, state.dataView);
      return wrap;
    },
  },
};

/* الوضع الحالي (ليلي/نهاري) */
function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/* ============================ أدوات داخل الأقسام ============================ */
function testButton(label, action = 'test') {
  const btn = el('button', { class: 'd-btn sm ghost', html: label });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const body = { type: state.section, channelId: state.panelChannelId || null };
      const result = await api(`/guilds/${state.guildId}/actions/${action}`, { method: 'POST', body });
      toast(result.message || 'تم الإرسال — راجعه في ديسكورد.');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function setAllLogs(value) {
  const keys = Object.keys(state.meta.logEvents || {});
  keys.forEach((k) => setPath(`logs.events.${k}`, value));
  renderSection('logs');
}

function setGroupLogs(keys, value) {
  keys.forEach((k) => setPath(`logs.events.${k}`, value));
  renderSection('logs');
}

function buildChart() {
  const wrap = el('div', { style: 'padding:6px 2px' });
  const daily = state.daily || [];
  if (!daily.length) return el('div', { class: 'd-empty', html: `<span class="big">${ic('activity', 28)}</span>لا توجد بيانات نشاط بعد.` });
  const max = Math.max(1, ...daily.map((d) => Math.max(d.messages || 0, d.joins || 0)));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${daily.length * 34} 120`);
  svg.setAttribute('style', 'width:100%;height:150px');
  daily.forEach((d, i) => {
    const h = Math.round(((d.messages || 0) / max) * 100);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(i * 34 + 6));
    rect.setAttribute('y', String(110 - h));
    rect.setAttribute('width', '18');
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', '#5865f2');
    rect.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'title')).textContent = `${d.day}: ${d.messages || 0} رسالة • ${d.joins || 0} انضمام`;
    svg.appendChild(rect);
  });
  wrap.appendChild(svg);
  wrap.appendChild(el('div', { class: 'muted', style: 'font-size:.8rem;margin-top:4px', text: 'الأعمدة = عدد الرسائل اليومية' }));
  return wrap;
}

/* تحويل آيديات إلى أسماء أعضاء */
async function resolveMembers(ids) {
  const unique = [...new Set((ids || []).filter((id) => id && /^\d{15,25}$/.test(String(id))))].slice(0, 80);
  if (!unique.length) return new Map();
  try {
    const data = await api(`/guilds/${state.guildId}/members?ids=${unique.join(',')}`);
    return new Map(data.members.map((m) => [m.id, m]));
  } catch {
    return new Map();
  }
}

function memberCell(map, id) {
  const member = map.get(String(id));
  const cell = el('div', { class: 'd-member' });
  if (member?.avatar) cell.appendChild(el('img', { src: member.avatar, alt: '' }));
  const txt = el('div');
  txt.appendChild(el('div', { class: 'nm', text: member?.displayName || member?.username || String(id) }));
  txt.appendChild(el('div', { class: 'tg', text: member?.username ? `@${member.username}` : String(id) }));
  cell.appendChild(txt);
  return cell;
}

async function loadDataView(box, view) {
  box.innerHTML = '<div class="d-empty">جارٍ التحميل…</div>';
  try {
    if (view === 'cases') {
      const data = await api(`/guilds/${state.guildId}/cases?perPage=25`);
      if (!data.items.length) return (box.innerHTML = '<div class="d-empty"><span class="big">لا توجد حالات مسجّلة بعد.</span></div>');
      const members = await resolveMembers(data.items.flatMap((c) => [c.user_id, c.moderator_id]));
      const TYPES = { warn: 'تحذير', ban: 'حظر', unban: 'فك حظر', kick: 'طرد', timeout: 'إسكات', untimeout: 'فك إسكات', ticket: 'تذكرة', automod: 'حماية تلقائية' };
      const table = el('table', { class: 'd-table' });
      table.appendChild(
        el('thead', {}, '<tr><th>#</th><th>النوع</th><th>العضو</th><th>السبب</th><th>بواسطة</th><th>التاريخ</th></tr>'),
      );
      const body = el('tbody');
      data.items.forEach((c) => {
        const tr = el('tr');
        tr.appendChild(el('td', { html: `<code>#${c.id}</code>` }));
        tr.appendChild(el('td', { text: TYPES[c.type] || c.type }));
        const u = el('td'); u.appendChild(memberCell(members, c.user_id)); tr.appendChild(u);
        tr.appendChild(el('td', { text: c.reason || '—' }));
        const m = el('td'); m.appendChild(memberCell(members, c.moderator_id)); tr.appendChild(m);
        tr.appendChild(el('td', { text: new Date(c.created_at).toLocaleString('ar-EG') }));
        body.appendChild(tr);
      });
      table.appendChild(body);
      box.innerHTML = '';
      const card1 = el('div', { class: 'd-card' });
      const wrap1 = el('div', { class: 'd-table-wrap' });
      wrap1.appendChild(table);
      card1.appendChild(wrap1);
      box.appendChild(card1);
      box.appendChild(el('div', { class: 'muted', style: 'margin-top:8px;font-size:.82rem', text: `الإجمالي: ${data.total} حالة — تُعرض ${data.items.length}` }));
      return;
    }

    if (view === 'tickets') {
      const data = await api(`/guilds/${state.guildId}/tickets?limit=50`);
      if (!data.items.length) return (box.innerHTML = '<div class="d-empty">لا توجد تذاكر بعد.</div>');
      const typeLabels = new Map((state.settings.tickets.types || []).map((t) => [t.id, t.label]));
      const members = await resolveMembers(data.items.map((t) => t.user_id));
      const table = el('table', { class: 'd-table' });
      table.appendChild(el('thead', {}, '<tr><th>#</th><th>النوع</th><th>صاحب التذكرة</th><th>الحالة</th><th>التاريخ</th><th></th></tr>'));
      const body = el('tbody');
      data.items.forEach((t) => {
        const tr = el('tr');
        tr.appendChild(el('td', { html: `<code>#${t.id}</code>` }));
        tr.appendChild(el('td', { text: typeLabels.get(t.type) || t.type }));
        const u = el('td'); u.appendChild(memberCell(members, t.user_id)); tr.appendChild(u);
        tr.appendChild(el('td', { html: t.status === 'open' ? '<span class="state-on">مفتوحة</span>' : '<span class="state-off">مغلقة</span>' }));
        tr.appendChild(el('td', { text: new Date(t.created_at).toLocaleString('ar-EG') }));
        const acts = el('td');
        if (t.status === 'open') {
          const btn = el('button', { class: 'd-btn sm danger', html: 'إغلاق' });
          btn.addEventListener('click', async () => {
            try {
              await api(`/guilds/${state.guildId}/tickets/${t.id}/close`, { method: 'POST', body: {} });
              toast(`أُغلقت التذكرة #${t.id}.`);
              loadDataView(box, 'tickets');
            } catch (err) {
              toast(err.message, true);
            }
          });
          acts.appendChild(btn);
        }
        tr.appendChild(acts);
        body.appendChild(tr);
      });
      table.appendChild(body);
      box.innerHTML = '';
      const card = el('div', { class: 'd-card' });
      const wrap = el('div', { class: 'd-table-wrap' });
      wrap.appendChild(table);
      card.appendChild(wrap);
      box.appendChild(card);
      return;
    }

    const data = await api(`/guilds/${state.guildId}/levels?perPage=25`);
    if (!data.items.length) return (box.innerHTML = '<div class="d-empty">لا يوجد أعضاء بمستويات بعد.</div>');
    const members = await resolveMembers(data.items.map((l) => l.user_id));
    const table = el('table', { class: 'd-table' });
    table.appendChild(el('thead', {}, '<tr><th>الترتيب</th><th>العضو</th><th>المستوى</th><th>الخبرة</th><th>الرسائل</th></tr>'));
    const body = el('tbody');
    data.items.forEach((l, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', { html: i < 3 ? `<b class="rank rank-${i + 1}">${i + 1}</b>` : `<code>${i + 1}</code>` }));
      const u = el('td'); u.appendChild(memberCell(members, l.user_id)); tr.appendChild(u);
      tr.appendChild(el('td', { html: `<b>${l.level}</b>` }));
      tr.appendChild(el('td', { text: Number(l.xp).toLocaleString('ar-EG') }));
      tr.appendChild(el('td', { text: Number(l.messages || 0).toLocaleString('ar-EG') }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    box.innerHTML = '';
    const card = el('div', { class: 'd-card' });
    const wrap = el('div', { class: 'd-table-wrap' });
    wrap.appendChild(table);
    card.appendChild(wrap);
    box.appendChild(card);
  } catch (err) {
    box.innerHTML = `<div class="d-empty">تعذّر التحميل: ${esc(err.message)}</div>`;
  }
}

/* ============================ لوحة المتصدّرين ============================ */
async function loadTopBoard(note, box) {
  try {
    const period = state.topPeriod || 'day';
    const source = state.topSource || 'all';
    const data = await api(`/guilds/${state.guildId}/levels?period=${period}&source=${source}&perPage=25`);

    const labels = { day: 'اليوم', week: 'هذا الأسبوع', all: 'كل الأوقات' };
    const sourceLabels = { all: 'كل المصادر', text: 'كتابي فقط', voice: 'صوتي فقط', interact: 'تفاعل فقط' };
    const totals = data.totals || {};
    const stats = el('div', { class: 'd-stats' });
    [
      ['chart', (totals.xp || 0).toLocaleString('ar-EG'), `خبرة ${labels[period] || ''}`],
      ['message', (totals.text_xp || 0).toLocaleString('ar-EG'), 'كتابي'],
      ['speaker', (totals.voice_xp || 0).toLocaleString('ar-EG'), 'صوتي'],
      ['activity', (totals.interact_xp || 0).toLocaleString('ar-EG'), 'تفاعل'],
      ['users', (data.total || 0).toLocaleString('ar-EG'), `مشارك — ${sourceLabels[source]}`],
    ].forEach(([iconName, value, label]) => {
      const card = el('div', { class: 'd-stat' });
      card.appendChild(el('b', { text: value }));
      card.appendChild(el('span', { html: `${ic(iconName, 15)} ${label}` }));
      stats.appendChild(card);
    });

    note.innerHTML = '';
    note.appendChild(stats);
    note.appendChild(
      el('div', {
        class: 'd-top-meta',
        html: `${ic('clock', 14)} <span>${esc(data.reset || '')}</span> <span class="dot">·</span> <span>مفتاح الفترة: <code>${esc(data.periodKey || 'عام')}</code></span>`,
      }),
    );

    if (!data.items.length) {
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'd-empty', text: 'ما في بيانات لهذه الفترة بعد.' }));
      return;
    }

    const members = await resolveMembers(data.items.map((l) => l.user_id));
    const table = el('table', { class: 'd-table' });
    table.appendChild(
      el('thead', {}, '<tr><th>الترتيب</th><th>العضو</th><th>خبرة الفترة</th><th>كتابي</th><th>صوتي</th><th>تفاعل</th><th>المستوى</th></tr>'),
    );
    const body = el('tbody');
    data.items.forEach((l, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', { html: i < 3 ? `<b class="rank rank-${i + 1}">${i + 1}</b>` : `<code>${i + 1}</code>` }));
      const u = el('td');
      u.appendChild(memberCell(members, l.user_id));
      tr.appendChild(u);
      tr.appendChild(el('td', { html: `<b>${Number(l.xp).toLocaleString('ar-EG')}</b>` }));
      tr.appendChild(el('td', { text: Number(l.text_xp || 0).toLocaleString('ar-EG') }));
      tr.appendChild(el('td', { text: Number(l.voice_xp || 0).toLocaleString('ar-EG') }));
      tr.appendChild(el('td', { text: Number(l.interact_xp || 0).toLocaleString('ar-EG') }));
      tr.appendChild(el('td', { html: `<code>${l.level}</code>` }));
      body.appendChild(tr);
    });
    table.appendChild(body);

    box.innerHTML = '';
    const card = el('div', { class: 'd-card' });
    const wrapEl = el('div', { class: 'd-table-wrap' });
    wrapEl.appendChild(table);
    card.appendChild(wrapEl);
    box.appendChild(card);
  } catch (err) {
    box.innerHTML = `<div class="d-empty">تعذّر التحميل: ${esc(err.message)}</div>`;
  }
}

/* ============================ الهيكل العام ============================ */
const GROUP_ORDER = ['عام', 'الأعضاء', 'الحماية', 'التذاكر', 'السجلات', 'البيانات'];

function buildSidebar() {
  const side = el('aside', { class: 'd-side' });

  const brand = el('div', { class: 'd-side-brand' });
  brand.appendChild(el('span', { class: 'logo', html: logoMark(30) }));
  brand.appendChild(el('span', { html: 'Never<span class="accent">Land</span>' }));
  brand.appendChild(el('a', { class: 'back', href: '/dashboard', html: `${ic('chevronRight', 13)} السيرفرات` }));
  side.appendChild(brand);

  const search = el('div', { class: 'd-search' });
  search.appendChild(el('span', { class: 'ico', html: ic('search', 16) }));
  const searchInput = el('input', { type: 'text', placeholder: 'ابحث عن إعداد...' });
  search.appendChild(searchInput);
  side.appendChild(search);

  const nav = el('nav');
  const items = [];

  GROUP_ORDER.forEach((group) => {
    const entries = Object.entries(SECTIONS).filter(([, s]) => s.group === group);
    if (!entries.length) return;
    const groupWrap = el('div', { class: 'd-group' });
    groupWrap.appendChild(el('div', { class: 'd-group-title', text: group }));
    entries.forEach(([id, section]) => {
      const item = el('div', { class: 'd-nav-item', 'data-id': id, title: section.label });
      item.appendChild(el('span', { class: 'ico', html: ic(SECTION_ICONS[id] || 'circle', 18) }));
      item.appendChild(el('span', { class: 'd-nav-label', text: section.label }));
      const dot = el('span', { class: 'dot' });
      item.appendChild(dot);
      item.addEventListener('click', () => {
        state.section = id;
        renderSection(id);
        if (window.innerWidth <= 900) item.scrollIntoView({ behavior: 'smooth', inline: 'center' });
      });
      groupWrap.appendChild(item);
      items.push({ item, id, label: section.label, group, dot });
    });
    nav.appendChild(groupWrap);
  });

  side.appendChild(nav);

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    items.forEach(({ item, label, group }) => {
      const match = !q || label.toLowerCase().includes(q) || group.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
    nav.querySelectorAll('.d-group').forEach((g) => {
      const visible = [...g.querySelectorAll('.d-nav-item')].some((i) => i.style.display !== 'none');
      g.style.display = visible ? '' : 'none';
    });
  });

  side.appendChild(
    el('div', {
      class: 'd-side-foot',
      html: `كل الإعدادات متاحة هنا، ولكل إعداد أمر سلاش مكافئ في ديسكورد.`,
    }),
  );

  return { side, items };
}

function buildHeader() {
  const head = el('div', { class: 'd-head' });
  const headIcon = guildIconUrl(state.guild.id, state.guild.icon);
  if (headIcon) {
    const img = el('img', { class: 'guild-icon', src: headIcon, alt: '' });
    img.addEventListener('error', () => img.replaceWith(iconFallback(state.guild.name)));
    head.appendChild(img);
  } else {
    head.appendChild(iconFallback(state.guild.name));
  }
  const info = el('div');
  info.appendChild(el('h1', { text: state.guild.name }));
  info.appendChild(
    el('div', {
      class: 'sub',
      html: `${(state.guild.memberCount || 0).toLocaleString('ar-EG')} عضو · <span class="${state.guild.botOnline ? 'state-on' : 'state-off'}">${state.guild.botOnline ? 'البوت متصل' : 'البوت غير متصل'}</span> · آخر تحديث ${new Date().toLocaleTimeString('ar-EG')}`,
    }),
  );
  head.appendChild(info);

  const actions = el('div', { class: 'd-head-actions' });
  const themeBtn = el('button', { class: 'd-btn ghost sm' });
  const themeMode = () => {
    try {
      const saved = localStorage.getItem('neverland-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch { return 'auto'; }
  };
  const paintTheme = () => {
    const mode = themeMode();
    const shown = mode === 'auto' ? currentTheme() : mode;
    const label = mode === 'auto' ? 'حسب الجهاز' : shown === 'light' ? 'الوضع النهاري' : 'الوضع الليلي';
    themeBtn.innerHTML = `${ic(mode === 'auto' ? 'refresh' : shown === 'light' ? 'sun' : 'moon', 16)} ${label}`;
    themeBtn.title = 'السمة: ' + label + ' — اضغط للتبديل';
  };
  paintTheme();
  themeBtn.addEventListener('click', () => {
    const order = { auto: 'light', light: 'dark', dark: 'auto' };
    const next = order[themeMode()];
    try {
      if (next === 'auto') localStorage.removeItem('neverland-theme');
      else localStorage.setItem('neverland-theme', next);
    } catch { /* تجاهل */ }
    document.documentElement.dataset.theme = next === 'auto' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : next;
    paintTheme();
  });
  actions.appendChild(themeBtn);

  const refresh = el('button', { class: 'd-btn ghost sm', html: `${ic('refresh', 16)} تحديث` });
  refresh.addEventListener('click', () => boot());
  actions.appendChild(refresh);
  head.appendChild(actions);
  return head;
}

function renderSection(id) {
  const section = SECTIONS[id];
  if (!section) return;

  document.querySelectorAll('.d-nav-item').forEach((i) => i.classList.toggle('active', i.dataset.id === id));
  const content = document.getElementById('d-content');
  content.innerHTML = '';
  content.appendChild(el('h2', { class: 'd-page-title', html: `${section.icon} ${section.title}` }));
  content.appendChild(el('p', { class: 'd-page-desc', html: section.desc }));

  // كل قسم يقدر يرجّع عنصرًا واحدًا أو مصفوفة عناصر أو Fragment
  const output = section.render();
  (Array.isArray(output) ? output : [output]).filter(Boolean).forEach((node) => content.appendChild(node));
  if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateDots(items) {
  const map = {
    overview: null,
    general: null,
    welcome: 'welcome.enabled',
    autorole: 'autorole.enabled',
    leveling: 'leveling.enabled',
    automod: 'automod.enabled',
    moderation: null,
    autoline: 'autoline.enabled',
    autoreact: 'autoreact.enabled',
    tickets: 'tickets.enabled',
    staffapp: 'staffApplication.enabled',
    logs: 'logs.enabled',
    data: null,
  };
  items.forEach(({ item, id }) => {
    const dot = item.querySelector('.dot');
    const key = map[id];
    dot.classList.toggle('off', key ? !getPath(key) : true);
    if (!key) dot.style.display = 'none';
    else dot.style.display = '';
  });
}

/* ============================ أيقونات ديسكورد ============================ */

/**
 * رابط أيقونة سيرفر آمن: يقبل هاشًا أو رابطًا كاملًا (ويتعامل مع المتحرك a_).
 * يمنع تكرار البادئة الذي كان يُنتج صورة مكسورة.
 */
function guildIconUrl(guildId, icon, size = 128) {
  if (!icon || !guildId) return null;
  const v = String(icon).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const ext = v.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${v}.${ext}?size=${size}`;
}

/** بديل مصوّر عند فشل تحميل الصورة (أحرف أولى) */
function iconFallback(name) {
  return el('div', { class: 'guild-icon placeholder', text: initialsOf(name) });
}

/** الأحرف الأولى من الاسم */
function initialsOf(name) {
  const clean = String(name || '?').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]);
  return clean.slice(0, 2);
}

/* ============================ المزامنة الحيّة ============================ */

/** صياغة «قبل كم» بالعربية */
function sinceText(ts) {
  if (!ts) return 'لم تتم المزامنة بعد';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'قبل لحظات';
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return `قبل ${Math.round(h / 24)} يوم`;
}

/** شريط يعرض آخر مزامنة مع ديسكورد + زر مزامنة فورية */
function buildSyncBar() {
  const bar = el('div', { class: 'd-syncbar' });
  const info = el('span', { class: 'd-sync-info' });

  const paint = (st) => {
    const s = st || state.sync || {};
    const parts = [`${ic('refresh', 15)} <b>آخر مزامنة مع ديسكورد:</b> <span class="sync-when">${esc(sinceText(s.at))}</span>`];
    if (s.botOnline) parts.push('<span class="sync-ok">البوت متّصل — البيانات لحظية</span>');
    else if (s.hasToken) parts.push('<span class="sync-warn">البوت متوقّف — نعرض آخر مزامنة محفوظة</span>');
    else parts.push('<span class="sync-warn">لم يُربط توكن البوت بعد</span>');
    if (s.guildsKnown) parts.push(`<span class="sync-count">${esc(String(s.guildsKnown))} سيرفر</span>`);
    info.innerHTML = parts.join(' · ');
  };
  paint();
  bar.appendChild(info);

  if (state.canEdit) {
    const btn = el('button', { class: 'd-btn ghost sm', html: `${ic('refresh', 15)} مزامنة الآن` });
    btn.addEventListener('click', async () => {
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'جارٍ المزامنة...';
      try {
        const r = await api(`/guilds/${state.guildId}/sync`, { method: 'POST' });
        paint(r.status);
        toast('تمت المزامنة — القنوات والرتب محدّثة.');
        await boot();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
    bar.appendChild(btn);
  }

  window.__syncPaint = paint;
  return bar;
}

/** البث الحيّ: أي مزامنة تحدّث الصفحة المفتوحة فورًا بدون تحديث يدوي */
let liveConnected = false;
function connectLive() {
  if (liveConnected || typeof EventSource === 'undefined') return;
  liveConnected = true;
  try {
    const es = new EventSource('/api/events');
    es.addEventListener('sync', (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        state.sync = payload;
        if (window.__syncPaint) window.__syncPaint(payload);
      } catch { /* تجاهل */ }
    });
    es.addEventListener('sync-error', (ev) => {
      try {
        toast(JSON.parse(ev.data).message || 'تعذّرت المزامنة', true);
      } catch { /* تجاهل */ }
    });
    es.addEventListener('error', () => { liveConnected = false; });
  } catch { /* المتصفح لا يدعم البث الحيّ */ }
}

/* ============================ الإقلاع ============================ */
async function boot() {
  const root = document.getElementById('app');
  state.guildId = root.dataset.guild;
  root.innerHTML = '<div class="d-loading"><div class="d-spinner"></div><div>جارٍ تحميل إعدادات السيرفر…</div></div>';

  try {
    const data = await api(`/guilds/${state.guildId}`);
    state.viewer = data.viewer || null;
    state.canEdit = data.viewer ? Boolean(data.viewer.canEdit) : root.dataset.edit !== '0';
    if (data.viewer?.roleReason && data.viewer.roleReason !== 'ok') {
      state.viewer.reason = data.viewer.message || '';
    }
    state.settings = data.settings;
    state.guild = data.guild;
    state.stats = data.stats;
    state.daily = data.daily || [];
    state.meta = data.meta;
    state.sync = data.sync || null;
    state.dirty = false;

    root.innerHTML = '';
    const shell = el('div', { class: `d-shell${state.canEdit ? '' : ' readonly'}` });
    if (!state.canEdit) {
      shell.appendChild(
        el('div', {
          class: 'd-readonly-note',
          html:
            state.viewer && state.viewer.loginRequired
              ? `${ic('shield', 17)} <b>الوصول مقيّد</b> — ${esc(state.viewer.reason || 'تحتاج تسجيل دخول بحساب Discord والرول المطلوب.')}
                 <a class="d-btn primary sm" href="/auth/login">${ic('login', 15)} تسجيل الدخول</a>`
              : `${ic('shield', 17)} <b>عرض عام</b> — تقدر تتصفّح الإعدادات بحرية، أما التعديل فيحتاج تسجيل دخول بحساب Discord.
                 <a class="d-btn primary sm" href="/auth/login">${ic('login', 15)} تسجيل الدخول</a>`,
        }),
      );
    }
    const { side, items } = buildSidebar();
    window.__dashItems = items;
    shell.appendChild(side);

    const main = el('div', { class: 'd-main' });
    main.appendChild(buildHeader());
    main.appendChild(buildSyncBar());
    const content = el('div', { class: 'd-content', id: 'd-content' });
    main.appendChild(content);
    shell.appendChild(main);
    root.appendChild(shell);

    /* شريط الحفظ (للمسجّلين فقط) */
    if (state.canEdit) {
    const bar = el('div', { class: 'd-savebar' });
    const msg = el('span', { class: 'msg', text: 'تغييرات غير محفوظة' });
    const grow = el('span', { class: 'grow' });
    const reset = el('button', { class: 'd-btn ghost', html: `${ic('undo', 16)} تراجع` });
    reset.addEventListener('click', () => boot());
    const save = el('button', { class: 'd-btn primary', html: `${ic('save', 16)} حفظ التغييرات` });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api(`/guilds/${state.guildId}/settings`, { method: 'POST', body: state.settings });
        state.dirty = false;
        bar.classList.remove('show');
        toast('تم حفظ الإعدادات.');
      } catch (err) {
        msg.className = 'msg';
        msg.textContent = err.message;
        toast(err.message, true);
      } finally {
        save.disabled = false;
      }
    });
    [msg, grow, reset, save].forEach((n) => bar.appendChild(n));
    main.appendChild(bar);
    }

    items.forEach(({ item }) => item.classList.toggle('active', item.dataset.id === state.section));
    renderSection(state.section);
    updateDots(items);
    connectLive();
  } catch (err) {
    root.innerHTML = `<div class="d-loading"><div class="d-empty-ico">${ic('warning', 34)}</div><div>تعذّر تحميل الإعدادات: ${esc(err.message)}</div><a class="d-btn primary" href="/dashboard">الرجوع إلى السيرفرات</a></div>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
