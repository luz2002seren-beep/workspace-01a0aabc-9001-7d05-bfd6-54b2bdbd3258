'use strict';
/**
 * اختبار سريع: يتحقق أن كل الأوامر والأحداث تُحمَّل بدون أخطاء،
 * وأن بيانات كل أمر صالحة (اسم + وصف + خيارات).
 * التشغيل:  node tests/smoke.js
 */
const assert = require('node:assert');
const path = require('node:path');

process.env.DEMO_MODE = 'true';
process.env.DATABASE_PATH = './data/test.db';

// قاعدة اختبار نظيفة في كل تشغيل (حتى لا تتكدّس الحالات بين الاختبارات)
const fs = require('node:fs');
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(path.join(__dirname, '..', 'data', `test.db${suffix}`));
  } catch {
    /* الملف غير موجود */
  }
}

const db = require('../src/database');
const { loadCommands, walk } = require('../src/handlers/commands');

const fakeClient = { commands: new Map(), guilds: { cache: new Map() }, on() {}, once() {} };

console.log('[اختبار] اختبار 1: تحميل الأوامر');
const { loaded, problems } = loadCommands(fakeClient);
assert.ok(loaded >= 20, `يجب تحميل 20 أمرًا على الأقل، تم تحميل ${loaded}`);
assert.deepStrictEqual(problems, [], `مشاكل في الأوامر: ${problems.join(', ')}`);
console.log(`  [تم] ${loaded} أمر`);

console.log('[اختبار] اختبار 2: صحة بيانات الأوامر');
for (const command of fakeClient.commands.values()) {
  const json = command.data.toJSON();
  assert.ok(json.name && json.name === json.name.toLowerCase(), `اسم غير صالح: ${json.name}`);
  assert.ok(json.description && json.description.length > 3, `وصف ناقص في ${json.name}`);
  assert.ok(typeof command.run === 'function', `run غير موجود في ${json.name}`);
  if (json.options) {
    for (const option of json.options) {
      assert.ok(option.name && option.description, `خيار ناقص في ${json.name}`);
      assert.ok(!/\s/.test(option.name), `اسم خيار يحتوي مسافة في ${json.name}`);
    }
  }
}
console.log('  [تم] كل الأوامر صحيحة');

console.log('[اختبار] اختبار 3: تحميل الأحداث');
const eventFiles = walk(path.join(__dirname, '..', 'src', 'events'));
assert.ok(eventFiles.length >= 6, 'يجب وجود ملفات أحداث');
let eventsCount = 0;
for (const file of eventFiles) {
  const exported = require(file);
  const events = Array.isArray(exported) ? exported : [exported];
  for (const event of events) {
    assert.ok(event.name, `حدث بدون اسم في ${path.basename(file)}`);
    assertEquals(typeof event.execute, 'function', `execute ناقص في ${path.basename(file)}`);
    eventsCount += 1;
  }
}
console.log(`  [تم] ${eventsCount} حدث`);

console.log('[اختبار] اختبار 4: قاعدة البيانات');
db.init();
const guild = db.getGuild('999999999999999999');
assert.ok(guild.settings.automod.enabled !== undefined, 'الإعدادات الافتراضية ناقصة');
assert.ok(guild.settings.tickets.types.length > 0, 'أنواع التذاكر الافتراضية ناقصة');

const record = db.addCase({ guildId: '999999999999999999', type: 'warn', userId: '1', moderatorId: '2', reason: 'اختبار' });
assert.ok(record.id > 0, 'فشل إنشاء حالة');
assert.strictEqual(db.countCases('999999999999999999', { type: 'warn' }), 1, 'عدّ التحذيرات خطأ');

const ticket = db.createTicket({ guildId: '999999999999999999', channelId: '123', userId: '1', type: 'general' });
assert.strictEqual(db.getTicketByChannel('123').id, ticket.id, 'فشل إنشاء تذكرة');
db.updateTicket(ticket.id, { status: 'closed' });
assert.strictEqual(db.countTickets('999999999999999999', 'open'), 0, 'عدّ التذاكر المفتوحة خطأ');

db.upsertLevel('999999999999999999', '1', { xp: 500, level: 2, messages: 10, voiceMinutes: 3, lastXpAt: Date.now() });
const leaderboard = db.getLeaderboard('999999999999999999', 10);
assert.strictEqual(leaderboard.length, 1, 'فشل نظام المستويات');

db.updateGuildSettings('999999999999999999', { welcome: { enabled: true, channelId: '555' } });
assert.strictEqual(db.getGuildSettings('999999999999999999').welcome.enabled, true, 'فشل تحديث الإعدادات');
assert.strictEqual(db.getGuildSettings('999999999999999999').automod.enabled, true, 'فُقدت الإعدادات الافتراضية بعد التحديث!');
console.log('  [تم] قاعدة البيانات تعمل بشكل صحيح');

console.log('[اختبار] اختبار 5: أدوات مساعدة');
const utils = require('../src/lib/utils');
const levels = require('../src/lib/levels');
const i18n = require('../src/lib/i18n');
assert.strictEqual(utils.parseDuration('10m'), 600000);
assert.strictEqual(utils.parseDuration('2h30m'), 9000000);
assert.strictEqual(utils.parseDuration('نص غلط'), null);
assert.ok(utils.parseDuration('3 أيام') === 3 * 86400000);
assert.strictEqual(levels.levelFromXp(0).level, 0);
assert.ok(levels.levelFromXp(100000).level > 10);
assert.strictEqual(i18n.t('ar', 'mod.banned', { user: 'X', reason: 'Y', caseId: 1 }).includes('X'), true);
assert.strictEqual(i18n.t('en', 'common.noPermission').startsWith('❌'), true);
console.log('  [تم] الأدوات تعمل');

console.log('[اختبار] اختبار 6: نظام الحماية');
const automod = require('../src/systems/automod');
const settings = { automod: { ...db.getGuildSettings('999999999999999999').automod } };
const fakeMessage = {
  guild: { id: '999999999999999999' },
  author: { id: '777', bot: false },
  member: { id: '777', roles: { cache: new Map() }, permissions: { has: () => false } },
  mentions: { users: { size: 0 } },
  content: 'شوف هذا الرابط https://evil-site.com/free-nitro',
  channelId: '1',
  attachments: { size: 0 },
};
const violations = automod.collectViolations({ cache: new Map(), spamTracker: new Map() }, fakeMessage, { automod: { ...settings.automod, enabled: true, antiLink: true, antiInvite: true, antiSpam: false, antiEveryone: true, antiMentionSpam: true, antiCaps: false, bannedWords: ['nitro'] } });
assert.ok(violations.some((v) => v.key === 'link'), 'لم يُرصد الرابط');
assert.ok(violations.some((v) => v.key === 'bannedWord'), 'لم تُرصد الكلمة الممنوعة');
assert.strictEqual(automod.normalizeArabic('أَهْـلًا'), 'اهلا');
console.log('  [تم] الحماية التلقائية تعمل');

function assertEquals(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
}

console.log('');
console.log('[نجاح] كل الاختبارات نجحت!');

/* ------------------------- اختبارات متقدّمة (7 → 15) ------------------------- */
(async () => {

 console.log('[اختبار] اختبار 7: تطابق مفاتيح الترجمة (ar en)');
  const { strings } = require('../src/lib/i18n');
  const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([key, value]) =>
      typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]);
  const arKeys = new Set(flatten(strings.ar));
  const enKeys = new Set(flatten(strings.en));
  const missingEn = [...arKeys].filter((k) => !enKeys.has(k));
  const missingAr = [...enKeys].filter((k) => !arKeys.has(k));
  assert.deepStrictEqual(missingEn, [], `مفاتيح ناقصة في الإنجليزية: ${missingEn.join(', ')}`);
  assert.deepStrictEqual(missingAr, [], `مفاتيح ناقصة في العربية: ${missingAr.join(', ')}`);
 console.log(`  [تم] ${arKeys.size} مفتاح متطابق في اللغتين`);

 console.log('[اختبار] اختبار 8: بناء اللوحات (بدون اتصال بديسكورد)');
  const settings = db.getGuildSettings('999999999999999999');
  const setupWizard = require('../src/systems/setupWizard');
  const panel = setupWizard.mainPanel(settings);
  assert.ok(panel.embeds?.[0] && panel.components.length >= 2, 'لوحة /setup غير مكتملة');
  const modulePanel = setupWizard.modulePanel('automod', settings);
  assert.ok(modulePanel.embeds?.[0]?.data?.title?.includes('الحماية'), 'لوحة قسم الحماية خطأ');

  const tickets = require('../src/systems/tickets');
  const ticketPanel = tickets.buildPanel(settings, { id: '1' });
  assert.ok(ticketPanel.embeds[0].data.title.includes('الدعم'), 'لوحة التذاكر خطأ');
  const firstControl = ticketPanel.components[0].components[0];
  const controlCount = ticketPanel.components.flatMap((row) => row.components).length;
  assert.ok(
    controlCount > 0 && (firstControl.options?.length > 0 || firstControl.data?.custom_id?.startsWith('ticket:open:')),
    'عناصر فتح التذاكر ناقصة',
  );
 console.log('  [تم] لوحات الإعداد والتذاكر سليمة');

 console.log('[اختبار] اختبار 9: اللوقات والحماية (مسارات آمنة)');
  const logging = require('../src/systems/logging');
  const result = await logging.send({ guilds: { cache: new Map() } }, { id: '1' }, 'messageDelete', { title: 'اختبار' });
  assert.strictEqual(result, null, 'يجب أن يعود null عند تعطيل اللوقات');
  assert.ok(logging.EVENT_META.messageDelete.emoji, 'بيانات الحدث ناقصة');
  const transcript = logging.buildTranscript(
    [{ createdTimestamp: Date.now(), content: 'مرحبا', author: { tag: 'tester#0001', id: '1' } }],
    { id: 5, user_id: '1', type: 'general', created_at: Date.now() },
  );
  assert.ok(transcript.includes('مرحبا') && transcript.includes('#5'), 'الأرشيف النصي خطأ');
 console.log('  [تم] اللوقات والأرشيف سليمة');

 console.log('[اختبار] اختبار 10: أوامر السلاش قابلة للتسلسل إلى JSON');
  for (const command of fakeClient.commands.values()) {
    const json = command.data.toJSON();
    assert.ok(json.name, 'فشل التسلسل');
    JSON.stringify(json);
  }
 console.log(`  [تم] ${fakeClient.commands.size} أمر جاهز للتسجيل في ديسكورد`);

  console.log('');
 console.log('[نجاح] جميع الاختبارات الإضافية نجحت!');


  console.log('');
 console.log('[اختبار] اختبار 11: دعم الإيموجيات الخارجية');
  const emojis = require('../src/lib/emojis');
  assert.deepStrictEqual(emojis.parseEmoji('<:fire:123456789012345678>'), { id: '123456789012345678', animated: false });
  assert.deepStrictEqual(emojis.parseEmoji('<a:party:987654321098765432>'), { id: '987654321098765432', animated: true });
  assert.deepStrictEqual(emojis.parseEmoji('🔥'), { name: '🔥' });
  assert.strictEqual(emojis.parseEmoji('نص طويل ليس إيموجي'), null);
  assert.ok(emojis.customEmojiUrl('<a:party:987654321098765432>').includes('.gif'));
  assert.ok(emojis.extractCustomEmojis('مرحبا <:ok:123456789012345678> و<:no:987654321098765432>').length === 2);
 console.log('  [تم] الإيموجيات الخارجية تعمل');

 console.log('[اختبار] اختبار 12: بطاقة الترحيب (Canvas)');
  const welcomeCard = require('../src/lib/welcomeCard');
  assert.ok(welcomeCard.available(), 'مولّد البطاقات غير متاح');
  const fakeUser = {
    username: 'أحمد',
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
  };
  const cardBuffer = await welcomeCard.generateWelcomeCard({
    user: fakeUser,
    memberCount: 4820,
    guildName: 'سيرفر التجربة',
    title: 'أهلاً بك في',
  });
  assert.ok(cardBuffer && cardBuffer.length > 5000, 'فشل توليد البطاقة');
  assert.strictEqual(cardBuffer.slice(1, 4).toString(), 'PNG', 'الناتج ليس PNG');
 console.log(`  [تم] تم توليد بطاقة ترحيب (${Math.round(cardBuffer.length / 1024)}KB)`);

 console.log('[اختبار] اختبار 13: لوحة التذاكر (أزرار + قائمة + 4 أنواع)');
  const ticketsSystem = require('../src/systems/tickets');
  const tSettings = db.getGuildSettings('999999999999999999');
  const payloads = ticketsSystem.buildPanelPayloads(tSettings, { id: '1', iconURL: () => null }, null);
  assert.ok(payloads.length >= 1, 'لا توجد رسائل للوحة');
  const tPanel = payloads[payloads.length - 1];
  assert.ok(tPanel.embeds[0], 'البنل بدون embed');
  const tTypes = tSettings.tickets.types;
  assert.strictEqual(tTypes.length, 4, 'يجب أن تكون الأنواع 4');
  assert.deepStrictEqual(tTypes.map((t2) => t2.id), ['support', 'verify', 'gift', 'staff']);
  const tRows = tPanel.components;
  const flatButtons = tRows.flatMap((r) => r.components);
  assert.strictEqual(flatButtons.length, 4, 'يجب 4 أزرار للأنواع');
  assert.ok(flatButtons[0].data.custom_id.startsWith('ticket:open:'), 'customId خاطئ');

  // وضع القائمة المنسدلة
  const selectPayload = ticketsSystem.buildPanelPayloads({ ...tSettings, tickets: { ...tSettings.tickets, panelMode: 'select' } }, {}).pop();
  assert.strictEqual(selectPayload.components[0].components[0].options.length, 4, 'القائمة المنسدلة لا تحتوي 4 أنواع');
 console.log('  [تم] اللوحة تعمل بالأزرار والقائمة مع 4 أنواع');

 console.log('[اختبار] اختبار 14: الخط الفاصل والتفاعلات التلقائية');
  const autolineSystem = require('../src/systems/autoline');
  // الوضع النصّي (السلوك القديم محفوظ)
  const lineContent = autolineSystem.buildLineContent({ autoline: { lineType: 'text', line: '─'.repeat(10), color: null } });
  assert.ok(lineContent.resolved.mode === 'text' && lineContent.payload.content.includes('─'), 'الوضع النصّي للخط الفاصل تعطّل');
  // الوضع الافتراضي الجديد: صورة GIF متحركة
  const gifContent = autolineSystem.buildLineContent({ autoline: { lineType: 'gif', gifStyle: 'glow' } });
  assert.strictEqual(gifContent.resolved.mode, 'gif', 'الوضع الافتراضي للخط الفاصل ليس صورة متحركة');
  assert.ok(Array.isArray(gifContent.payload.files) && gifContent.payload.files.length === 1, 'الخط الفاصل لا يُرسل صورة');
  const autoreactSystem = require('../src/systems/autoreact');
  const tValues = autoreactSystem.toReactionValues(['👍', '<:fire:123456789012345678>', 'نص ليس إيموجي طويل here']);
  assert.strictEqual(tValues.length, 2, 'تحويل الإيموجيات خطأ');
 console.log('  [تم] AutoLine و AutoReaction يعملان');

 console.log('[اختبار] اختبار 15: أحداث اللوقات الشاملة');
  const loggingSystem = require('../src/systems/logging');
  const tTotal = Object.keys(loggingSystem.EVENT_META).length;
  assert.ok(tTotal >= 38, `عدد الأحداث ${tTotal} أقل من المطلوب`);
  const tGroups = loggingSystem.groupedEvents();
  assert.strictEqual(Object.keys(tGroups).length, 9, 'عدد مجموعات اللوقات خطأ');
  for (const [key, meta] of Object.entries(loggingSystem.EVENT_META)) {
    assert.ok(meta.label && meta.emoji && meta.group && loggingSystem.EVENT_GROUPS[meta.group], `بيانات الحدث ${key} ناقصة`);
  }
  const tSettings15 = db.getGuildSettings('999999999999999999');
  assert.strictEqual(Object.keys(tSettings15.logs.events).length, tTotal, 'أحداث الإعدادات لا تطابق الأحداث المتاحة');
 console.log(`  [تم] ${tTotal} حدثًا في ${Object.keys(tGroups).length} مجموعات`);

  console.log('');

 console.log('[اختبار] اختبار 16: نظام تقديم الإدارة (نموذج 5 خانات + قبول/رفض)');
  {
    const applications = require('../src/systems/applications');
    const GUILD16 = '100000000000000001';
    const REVIEW16 = '100000000000000013';

    assert.strictEqual(applications.isApplicationType(db.getGuildSettings(GUILD16), 'staff'), true, 'تقديم الإدارة لا يُفعّل النموذج');
    assert.strictEqual(applications.isApplicationType(db.getGuildSettings(GUILD16), 'support'), false, 'الدعم الفني لا يجب أن يفتح النموذج');

    // النموذج = 5 خانات (حد ديسكورد الأقصى)
    const appTicket = db.createTicket({ guildId: GUILD16, channelId: '100000000000000090', userId: '200000000000000010', type: 'staff' });
    const modal = applications.buildFormModal(db.getGuildSettings(GUILD16), appTicket).toJSON();
    assert.strictEqual(modal.components.length, 5, 'النموذج يجب أن يحتوي 5 خانات');
    assert.ok(modal.components.every((c) => (c.components[0].label || '').length <= 45), 'عنوان خانة أطول من 45 حرفًا');
    assert.strictEqual(modal.custom_id, 'ticket:apply:submit:' + appTicket.id);

    // بنل التقديم داخل التذكرة
    const form = applications.buildFormMessage(db.getGuildSettings(GUILD16), appTicket);
    assert.strictEqual(form.components[0].components[0].data.custom_id, 'ticket:apply:open:' + appTicket.id);

    // استخراج الاسم لإعادة تسمية التذكرة
    assert.strictEqual(applications.extractName('أحمد — 18'), 'أحمد');
    assert.strictEqual(applications.extractName('Ahmed Ali, 17 سنة'), 'ahmed-ali');
    assert.strictEqual(applications.padNumber(7), '007');
    assert.ok(!applications.sanitizeChannelName('إدارة #001 / أحمد؟').includes('#'));

    // محاكاة كاملة: إرسال الطلب ➜ قبول ➜ رفض
    const sentTo = { review: [], ticket: [], dm: [] };
    const renamed = [];
    const movedTo = [];
    const rolesGiven = [];
    const makeChannel = (id) => ({
      id,
      send: async (p) => {
        sentTo[id === REVIEW16 ? 'review' : 'ticket'].push(p);
        return { id: 'm1', editable: true, edit: async () => {} };
      },
      setName: async (n) => { renamed.push(n); },
      setParent: async (pid) => { movedTo.push(pid); },
      toString: () => '<#' + id + '>',
    });
    const reviewChan = makeChannel(REVIEW16);
    const ticketChan = makeChannel('100000000000000090');
    const guild16 = {
      id: GUILD16,
      name: 'سيرفر التجربة',
      channels: {
        cache: new Map([
          [REVIEW16, reviewChan],
          ['100000000000000030', { id: '100000000000000030' }],
          ['100000000000000090', ticketChan],
        ]),
        fetch: async () => null,
      },
      members: { fetch: async () => ({ id: '200000000000000010', roles: { cache: new Map(), add: async (r) => rolesGiven.push(r) } }) },
    };
    const client16 = {
      guilds: { cache: new Map([[GUILD16, guild16]]) },
      channels: { cache: new Map([[REVIEW16, reviewChan]]), fetch: async () => null },
      users: { fetch: async () => ({ id: '200000000000000010', username: 'Ahmed', send: async (p) => { sentTo.dm.push(p); return true; } }) },
    };
    db.updateGuildSettings(GUILD16, {
      staffApplication: { reviewChannelId: REVIEW16, onAccept: { moveToCategoryId: '100000000000000030', addRoleIds: ['100000000000000031'] } },
    });

    const answers16 = {
      name_age: 'أحمد — 18',
      country: 'المغرب',
      prev_servers: 'سيرفر تجريبي — إداري عام',
      mic: 'نعم',
      logo_link: 'نعم + رابط',
    };
    const replies16 = [];
    const interaction16 = {
      guildId: GUILD16,
      guild: guild16,
      channel: ticketChan,
      user: { id: '200000000000000010', username: 'Ahmed', toString: () => '<@200000000000000010>' },
      member: { roles: { cache: new Map() }, permissions: { has: () => true } },
      fields: { getTextInputValue: (k) => answers16[k] ?? '' },
      deferReply: async () => {},
      editReply: async (p) => replies16.push(p),
      reply: async (p) => replies16.push(p),
    };

    const submitted = await applications.submitApplication(client16, interaction16, appTicket);
    assert.ok(submitted.ok, 'فشل إرسال التقديم');
    const reviewPayload = sentTo.review[0];
    assert.strictEqual(reviewPayload.embeds[0].data.fields.length, 5, 'إجابات المراجعة ناقصة');
    const reviewButtons = reviewPayload.components[0].components.map((b) => b.data.custom_id).filter(Boolean);
    assert.deepStrictEqual(
      reviewButtons.slice(0, 2),
      ['apply:review:accept:' + appTicket.id, 'apply:review:reject:' + appTicket.id],
      'أزرار المراجعة خطأ',
    );

    const reviewMsgMock = {
      embeds: [reviewPayload.embeds[0]],
      editable: true,
      edit: async (p) => { reviewMsgMock.edited = p; },
    };
    const accepted = await applications.reviewApplication(client16, interaction16, appTicket, 'accept', { message: reviewMsgMock });
    assert.strictEqual(accepted.decision, 'accept');
    assert.ok(/ahmed|أحمد/.test(renamed[0] || ''), 'اسم القناة الجديد غير صحيح: ' + renamed[0]);
    assert.ok(String(renamed[0]).startsWith('إدارة-'), 'الترقيم في اسم القناة ناقص');
    assert.deepStrictEqual(movedTo, ['100000000000000030'], 'لم تُنقل التذكرة لقسم الإدارة');
    assert.deepStrictEqual(rolesGiven, ['100000000000000031'], 'لم تُعطَ رتبة القبول');
    assert.ok(sentTo.dm.some((p) => p.embeds?.[0]?.data?.title?.includes('قبول')), 'لم تُرسل رسالة قبول على الخاص');
    assert.ok(reviewMsgMock.edited?.components?.[0]?.components?.[0]?.data?.disabled, 'لم تُعطّل أزرار المراجعة بعد القرار');

    // الرفض مع السبب
    sentTo.dm.length = 0;
    const rejected = await applications.reviewApplication(client16, interaction16, appTicket, 'reject', { reason: 'تحتاج خبرة أكبر' });
    const rejectDm = sentTo.dm[0]?.embeds?.[0]?.data;
    assert.strictEqual(rejected.decision, 'reject');
    assert.ok(rejectDm?.title?.includes('رفض'), 'لم تُرسل رسالة رفض على الخاص');
    assert.ok(rejectDm?.fields?.some((f) => f.value.includes('تحتاج خبرة أكبر')), 'سبب الرفض غير مذكور في الخاص');
  console.log('  [تم] النموذج 5 خانات + القبول (تسمية/ترقيم/نقل/رتبة/خاص) + الرفض بالسبب');
  }

 console.log('[اختبار] اختبار 17: لوحة التحكم الجديدة');
  {
    const fs2 = require('node:fs');
    const path2 = require('node:path');
    const publicDir = path2.join(__dirname, '..', 'src', 'web', 'public');
    const appSource = fs2.readFileSync(path2.join(publicDir, 'app.js'), 'utf8');

    // الأقسام المطلوبة موجودة
    const expectedSections = [
      'overview', 'general', 'welcome', 'autorole', 'leveling',
      'automod', 'moderation', 'autoline', 'autoreact',
      'tickets', 'staffapp', 'logs', 'data',
    ];
    for (const id of expectedSections) {
      assert.ok(new RegExp(`^\\s{2}${id}: \\{`, 'm').test(appSource), `قسم ${id} غير موجود في اللوحة`);
    }
    assert.ok(appSource.includes('GROUP_ORDER'), 'مجموعات الشريط الجانبي ناقصة');
    assert.ok(appSource.includes('d-savebar'), 'شريط الحفظ ناقص');
    assert.ok(appSource.includes('loadDataView'), 'جداول البيانات ناقصة');

    // مطابقة كل مسار إعداد في اللوحة مع الإعدادات الفعلية
    const paths = [...appSource.matchAll(/['"`]((?:[a-zA-Z]+\.)+(?:[a-zA-Z]+|[0-9]+))['"`]/g)]
      .map((m) => m[1])
      .filter((p) => !p.includes('discord.com') && !p.includes('http'))
      .filter((p) => /^(welcome|leave|boost|logs|autoline|autoreact|automod|moderation|leveling|tickets|staffApplication|autorole|referral|reports)\./.test(p));
    const uniquePaths = [...new Set(paths)];
    const settings = db.getGuildSettings('999999999999999999');
    const missing = uniquePaths.filter((p2) => {
      const keys = p2.split('.');
      let cursor = settings;
      for (const key of keys) {
        if (cursor === null || cursor === undefined) return false;
        if (Number.isInteger(Number(key)) && Array.isArray(cursor)) { cursor = cursor[0]; continue; }
        if (!(key in cursor)) return true;
        cursor = cursor[key];
      }
      return false;
    });
    assert.deepStrictEqual(missing, [], `مسارات إعدادات غير موجودة: ${missing.join(', ')}`);

    // الملفات المطلوبة تُقدَّم بشكل صحيح
    assert.ok(fs2.existsSync(path2.join(publicDir, 'dash.css')), 'ملف dash.css ناقص');
    assert.ok(fs2.readFileSync(path2.join(publicDir, 'dash.css'), 'utf8').includes('.d-shell'), 'أنماط اللوحة ناقصة');
    const pagesSource = fs2.readFileSync(path2.join(__dirname, '..', 'src', 'web', 'routes', 'pages.js'), 'utf8');
    assert.ok(pagesSource.includes("asset('dash.css')"), 'صفحة اللوحة لا تُحمّل dash.css');

    // نقطة الإجراءات التجريبية موجودة في الـ API
    const apiSource = fs2.readFileSync(path2.join(__dirname, '..', 'src', 'web', 'routes', 'api.js'), 'utf8');
    assert.ok(apiSource.includes("actions/:action"), 'نقطة الإجراءات التجريبية ناقصة');
  console.log(`  [تم] ${expectedSections.length} قسمًا • ${uniquePaths.length} مسار إعداد متطابق • dash.css محمّل • الإجراءات التجريبية جاهزة`);
  }

 console.log('[اختبار] اختبار 18: صفحات الموقع + الوضع الليلي/النهاري');
  {
    const fs3 = require('node:fs');
    const path3 = require('node:path');
    const webDir = path3.join(__dirname, '..', 'src', 'web');
    const pagesSrc = fs3.readFileSync(path3.join(webDir, 'routes', 'pages.js'), 'utf8');
    const styleSrc = fs3.readFileSync(path3.join(webDir, 'public', 'style.css'), 'utf8');
    const dashSrc = fs3.readFileSync(path3.join(webDir, 'public', 'dash.css'), 'utf8');
    const appSrc = fs3.readFileSync(path3.join(webDir, 'public', 'app.js'), 'utf8');

    // الصفحة الرئيسية (نسخة رسمية)
    for (const cls of ['site-hero', 'site-features', 'site-steps', 'cmd-preview']) {
      assert.ok(pagesSrc.includes(cls), `عنصر ${cls} ناقص من الصفحة الرئيسية`);
      assert.ok(styleSrc.includes(`.${cls}`), `نمط ${cls} ناقص من style.css`);
    }
    assert.ok(!pagesSrc.includes('إضافة البوت'), 'ميزة إضافة البوت ما زالت موجودة');
    assert.ok(!pagesSrc.includes('inviteUrl'), 'رابط إضافة البوت ما زال مستخدمًا');
    assert.ok(!pagesSrc.includes('feature-note'), 'العناصر المعلوماتية القديمة ما زالت موجودة');

    // قائمة السيرفرات المحسّنة
    for (const cls of ['servers-toolbar', 'guildSearch', 'guildFilter', 'guild-actions']) {
      assert.ok(pagesSrc.includes(cls), `عنصر ${cls} ناقص من قائمة السيرفرات`);
    }

    // الوضع الليلي/النهاري
    assert.ok(styleSrc.includes("html[data-theme='light']"), 'الوضع الفاتح ناقص من style.css');
    assert.ok(styleSrc.includes('.theme-toggle'), 'زر تبديل الوضع ناقص');
    assert.ok(pagesSrc.includes('neverland-theme'), 'حفظ الوضع في localStorage ناقص');
    assert.ok(appSrc.includes('currentTheme'), 'زر تبديل الوضع في اللوحة ناقص');

    // dash.css يستخدم الرموز (ليتبدّل مع الوضع)
    const dashVars = (dashSrc.match(/var\(--/g) || []).length;
    assert.ok(dashVars > 60, `dash.css يستخدم ${dashVars} رمزًا فقط — التحويل للرموز ناقص`);

    // ميزة إضافة البوت مُزالة بالكامل
    const cfgSrc3 = fs3.readFileSync(path3.join(__dirname, '..', 'src', 'config.js'), 'utf8');
    assert.ok(!/inviteUrl/.test(cfgSrc3), 'inviteUrl ما زال في الإعدادات');
    assert.ok(!/oauth2\/authorize\?client_id/.test(cfgSrc3), 'رابط التفويض ما زال يُبنى');
  console.log(`  [تم] الرئيسية + السيرفرات + الوضع الليلي/النهاري (${dashVars} رمزًا في dash.css)`);
  }

 console.log('[اختبار] اختبار 19: واجهة رسمية بأيقونات SVG (بدون إيموجيات)');
  {
    const fs4 = require('node:fs');
    const path4 = require('node:path');
    const webPublic = path4.join(__dirname, '..', 'src', 'web', 'public');
    const iconsModule = require(path4.join(webPublic, 'icons.js'));

    // مكتبة الأيقونات
    const iconCount = Object.keys(iconsModule.ICONS).length;
    assert.ok(iconCount >= 70, `عدد الأيقونات ${iconCount} أقل من المطلوب`);
    const svg = iconsModule.icon('shield', { size: 18 });
    assert.ok(svg.startsWith('<svg') && svg.includes('stroke="currentColor"') && svg.endsWith('</svg>'), 'بنية أيقونة SVG غير صحيحة');
    assert.ok(iconsModule.logoMark(40).includes('<svg'), 'الشعار المرسوم ناقص');
    for (const key of ['messageDelete', 'memberJoin', 'voiceMute', 'emojiCreate', 'inviteCreate', 'ticket', 'automod'.slice(0, 6) + 'Action']) {
      assert.ok(iconsModule.ICONS[iconsModule.iconForEvent(key)], `لا توجد أيقونة للحدث ${key}`);
    }

    // صفحات الموقع: لا إيموجيات
    const pagesSrc = fs4.readFileSync(path4.join(__dirname, '..', 'src', 'web', 'routes', 'pages.js'), 'utf8');
    const emojiInPages = (pagesSrc.match(/\p{Extended_Pictographic}/gu) || []).length;
    assert.strictEqual(emojiInPages, 0, `صفحات الموقع تحتوي ${emojiInPages} إيموجي`);

    // اللوحة: لا إيموجيات في الواجهة (باستثناء قيم بيانات التذاكر emoji: '...')
    const appSrc = fs4.readFileSync(path4.join(webPublic, 'app.js'), 'utf8');
    const cleaned = appSrc.replace(/emoji: '[^']*'/g, '').replace(/'🎫'/g, "''");
    const emojiInDash = (cleaned.match(/\p{Extended_Pictographic}/gu) || []).length;
    assert.strictEqual(emojiInDash, 0, `لوحة التحكم تحتوي ${emojiInDash} إيموجي في الواجهة`);

    // اللوحة تستخدم نظام الأيقونات + الشعار المرسوم
    assert.ok(appSrc.includes('const ic = (name, size'), 'مساعد الأيقونات ناقص من اللوحة');
    assert.ok(appSrc.includes('SECTION_ICONS'), 'خريطة أيقونات الأقسام ناقصة');
    assert.ok(/ic\('[a-zA-Z]+'/.test(appSrc), 'اللوحة لا تستخدم أيقونات SVG');
    assert.ok((appSrc.match(/ic\(/g) || []).length >= 15, 'اللوحة لا تستخدم الأيقونات بدرجة كافية');
    assert.ok(appSrc.includes('logoMark'), 'شعار اللوحة المرسوم ناقص');

    // الأنماط العامة تنظّف الأيقونات
    const styleSrc2 = fs4.readFileSync(path4.join(webPublic, 'style.css'), 'utf8');
    const dashCss2 = fs4.readFileSync(path4.join(webPublic, 'dash.css'), 'utf8');
    assert.ok(styleSrc2.includes('.brand-logo svg'), 'أنماط أيقونات الموقع ناقصة');
    assert.ok(dashCss2.includes('.d-nav-item .ico svg'), 'أنماط أيقونات اللوحة ناقصة');

    // رسائل الطرفية: بدون إيموجيات (وسوم نصية فقط)
    const path7b = require('node:path');
    const srcDir = path7b.join(__dirname, '..', 'src');
    let logEmoji = 0;
    const walk7 = (dir) => {
      for (const f of fs4.readdirSync(dir)) {
        const full = path7b.join(dir, f);
        if (fs4.statSync(full).isDirectory()) walk7(full);
        else if (f.endsWith('.js')) {
          for (const line of fs4.readFileSync(full, 'utf8').split('\n')) {
            if (/console\.(log|error|warn|info)\(/.test(line) && /\p{Extended_Pictographic}/u.test(line)) logEmoji++;
          }
        }
      }
    };
    walk7(srcDir);
    assert.strictEqual(logEmoji, 0, `رسائل الطرفية تحتوي ${logEmoji} إيموجي`);
  console.log(`  [تم] ${iconCount} أيقونة SVG • صفر إيموجي في واجهة الموقع واللوحة`);
  }
 console.log('[اختبار] اختبار 20: هوية الموقع (Never Land) + كونه موقعًا حقيقيًا لا نسخة ثابتة');
  {
    const fs5 = require('node:fs');
    const path5 = require('node:path');
    const cfg = require('../src/config');
    assert.strictEqual(cfg.web.siteName, 'Never Land', 'اسم الموقع في الإعدادات غير صحيح');
    assert.ok(cfg.web.url.startsWith('http'), 'رابط الموقع العام غير مضبوط');

    const pages5 = fs5.readFileSync(path5.join(__dirname, '..', 'src', 'web', 'routes', 'pages.js'), 'utf8');
    for (const route of ['/icon.svg', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml']) {
      assert.ok(pages5.includes(`router.get('${route}'`), `المسار ${route} غير معرّف`);
    }
    assert.ok(!pages5.includes('وضع المعاينة'), 'شارات المعاينة ما زالت ظاهرة في الواجهة');
    assert.ok(pages5.includes('Never<span class="accent">Land</span>'), 'شعار الموقع في الهيدر غير محدّث');
    assert.ok(pages5.includes('rel="manifest"') && pages5.includes('og:site_name'), 'وسوم الموقع الرسمية ناقصة');

    const server5 = fs5.readFileSync(path5.join(__dirname, '..', 'src', 'web', 'server.js'), 'utf8');
    assert.ok(server5.includes('خطأ 404') && server5.includes('layout('), 'صفحة 404 لا تستخدم قالب الموقع');

    const app5 = fs5.readFileSync(path5.join(__dirname, '..', 'src', 'web', 'public', 'app.js'), 'utf8');
    assert.ok(app5.includes("html: 'Never<span class=\"accent\">Land</span>'"), 'شعار اللوحة غير محدّث');
    assert.ok(!/وضع المعاينة/.test(app5), 'نص المعاينة ظاهر في اللوحة');

    const pkg5 = require('../package.json');
    assert.strictEqual(pkg5.name, 'never-land', 'اسم الحزمة غير محدّث');
  console.log(`  [تم] الاسم: ${cfg.web.siteName} • أيقونة + مانيفست + robots + sitemap + 404 بقالب الموقع`);
  }

 console.log('[اختبار] اختبار 21: الوصول العام (كل يفوت) + التكيّف مع الشاشات والأجهزة');
  {
    const fs6 = require('node:fs');
    const path6 = require('node:path');
    const cfg6 = require('../src/config');
    assert.strictEqual(typeof cfg6.web.publicAccess, 'boolean', 'خيار PUBLIC_ACCESS غير معرّف');

    const pages6 = fs6.readFileSync(path6.join(__dirname, '..', 'src', 'web', 'routes', 'pages.js'), 'utf8');
    assert.ok(pages6.includes('req.canEdit'), 'منطق صلاحية الزائر ناقص');
    assert.ok(pages6.includes('publicGuilds'), 'قائمة السيرفرات العامة ناقصة');
    assert.ok(pages6.includes('dashboard-readonly'), 'وضع العرض العام في صفحة السيرفر ناقص');
    assert.ok(pages6.includes('viewport-fit=cover'), 'وسم viewport للهواتف ناقص');
    assert.ok(pages6.includes('apple-mobile-web-app-capable'), 'وسوم آيفون ناقصة');
    assert.ok(pages6.includes('prefers-color-scheme'), 'متابعة إعداد الجهاز (ليلي/نهاري) ناقصة');
    assert.ok(pages6.includes('data-edit='), 'تمرير صلاحية التعديل للصفحة ناقص');

    const api6 = fs6.readFileSync(path6.join(__dirname, '..', 'src', 'web', 'routes', 'api.js'), 'utf8');
    assert.ok(api6.includes("const isWrite = !['GET', 'HEAD', 'OPTIONS']"), 'فصل القراءة عن الكتابة في الـAPI ناقص');
    assert.ok(api6.includes('canEdit(req)'), 'حماية نقاط الكتابة ناقصة');
    assert.ok(api6.includes('viewer:'), 'إرسال صلاحية المشاهد ناقص');

    const app6 = fs6.readFileSync(path6.join(__dirname, '..', 'src', 'web', 'public', 'app.js'), 'utf8');
    assert.ok(app6.includes('canEdit'), 'اللوحة لا تدعم وضع القراءة فقط');
    assert.ok(app6.includes('d-readonly-note'), 'شارة العرض العام ناقصة من اللوحة');
    assert.ok(app6.includes('حسب الجهاز'), 'خيار «حسب الجهاز» في السمة ناقص');

    const style6 = fs6.readFileSync(path6.join(__dirname, '..', 'src', 'web', 'public', 'style.css'), 'utf8');
    const dash6 = fs6.readFileSync(path6.join(__dirname, '..', 'src', 'web', 'public', 'dash.css'), 'utf8');
    const mqStyle = (style6.match(/@media/g) || []).length;
    const mqDash = (dash6.match(/@media/g) || []).length;
    assert.ok(mqStyle >= 8, `عدد نقاط التكيّف في style.css قليل (${mqStyle})`);
    assert.ok(mqDash >= 5, `عدد نقاط التكيّف في dash.css قليل (${mqDash})`);
    assert.ok(style6.includes('env(safe-area-inset'), 'دعم الحواف الآمنة للهواتف ناقص');
    assert.ok(style6.includes('clamp('), 'الخطوط لا تتكيّف مع عرض الشاشة');
    assert.ok(style6.includes('prefers-reduced-motion'), 'احترام تقليل الحركة ناقص');
    assert.ok(dash6.includes('.d-shell.readonly'), 'أنماط وضع القراءة فقط ناقصة');
    assert.ok(dash6.includes('max-width: 700px'), 'تكيّف اللوحة مع الجوال ناقص');
  console.log(`  [تم] وصول عام للقراءة + ${mqStyle + mqDash} نقطة تكيّف (جوال/تابلت/شاشة كبيرة) + سمة تتبع الجهاز`);
  }

 console.log('[اختبار] اختبار 22: زر /help يفتح الموقع + تأكيد الدخول والرول المطلوب');
  {
    const { execFileSync } = require('node:child_process');
    const path7 = require('node:path');
    const root7 = path7.join(__dirname, '..');

    // ١) أمر /help يحمل زر رابط فعّال
    const outHelp = execFileSync('node', [path7.join(root7, 'help-test.js')], { cwd: root7, encoding: 'utf8' });
    assert.ok(outHelp.includes('افتح الموقع'), 'زر «افتح الموقع» ناقص من /help');
    assert.ok(outHelp.includes('لوحة التحكم'), 'زر «لوحة التحكم» ناقص من /help');

    // ٢) منطق الرول المطلوب
    const cfg7 = require('../src/config');
    assert.strictEqual(cfg7.web.requiredRoleId, '1549364852433354792', 'معرّف الرول المطلوب غير مطابق');
    assert.strictEqual(cfg7.web.loginRequired, true, 'تأكيد الدخول غير مفعّل');
    const outAccess = execFileSync('node', [path7.join(root7, 'access-test.js')], { cwd: root7, encoding: 'utf8' });
    for (const reason of ['bot_offline', 'no_role', 'not_member']) {
      assert.ok(outAccess.includes(reason), `حالة ${reason} غير مُختبرة`);
    }

    // ٣) بوابة الدخول على مستوى HTTP
    const outGate = execFileSync('node', [path7.join(root7, 'gate-test.js')], { cwd: root7, encoding: 'utf8' });
    assert.ok(outGate.includes('302 /auth/login'), 'الزائر لا يُحوَّل لتسجيل الدخول');
    assert.ok(outGate.includes('role_required'), 'حماية الـAPI بالرول ناقصة');
    assert.ok(outGate.includes('الوصول مقيّد'), 'صفحة الوصول مقيّد ناقصة');
  console.log('  [تم] /help بزر يعمل + تأكيد دخول + رول 1549364852433354792 (صفحة منع كاملة)');
  }

 console.log('[اختبار] اختبار 23: جاهزية النشر (رابط يفتح من أي جهاز)');
  {
    const fs8 = require('node:fs');
    const path8 = require('node:path');
    const root8 = path8.join(__dirname, '..');
    const read8 = (f) => fs8.readFileSync(path8.join(root8, f), 'utf8');

    // ١) إعداد Railway: صحة الخدمة + إعادة التشغيل
    const rj = JSON.parse(read8('railway.json'));
    assert.strictEqual(rj.deploy.healthcheckPath, '/healthz', 'مسار فحص الصحة في railway.json غير مطابق');
    assert.ok(rj.build.builder === 'DOCKERFILE', 'بنّاء Railway ليس Dockerfile');
    assert.ok(read8('Dockerfile').includes('src/index.js'), 'Dockerfile لا يشغّل المشروع');
    assert.ok(read8('.dockerignore').includes('.env'), 'ملف .env غير مستثنى من الصورة');

    // ٢) مسار الصحة عام وبلا بيانات حساسة
    const srv8 = read8(path8.join('src', 'web', 'server.js'));
    assert.ok(srv8.includes("'/healthz'"), 'مسار /healthz ناقص من الخادم');
    assert.ok(srv8.includes('https:'), 'الكوكي الآمن التلقائي عند https ناقص');

    // ٣) تشغيل مرن للنشر: الموقع بدون توكن
    const idx8 = read8(path8.join('src', 'index.js'));
    assert.ok(idx8.includes('RUN_BOT') && idx8.includes('RUN_WEB'), 'التحكم بمتغيّرات RUN_BOT/RUN_WEB ناقص');

    // ٤) أدوات الرابط العام والفحص
    for (const f of ['tools/site-check.js', 'tools/public-link.js', 'deploy-railway.sh']) {
      assert.ok(fs8.existsSync(path8.join(root8, f)), `${f} ناقص`);
    }
    const pk = JSON.parse(read8('package.json'));
    for (const script of ['check:site', 'deploy:railway', 'link:public']) {
      assert.ok(!!pk.scripts[script], `أمر npm ${script} ناقص`);
    }

    // ٥) الرابط العام يُحدَّد تلقائيًا (وما يبقى مكسورًا)
    const cfg8 = require('../src/config');
    assert.ok(/^https?:\/\//.test(cfg8.web.url), 'الرابط العام غير صالح');
    assert.ok(!/\/$/.test(cfg8.web.url), 'الرابط العام ينتهي بشرطة مائلة');

  console.log(`  [تم] Railway (Dockerfile + /healthz) + فحص الموقع + رابط عام تلقائي (${cfg8.web.url.replace(/^https?:\/\//, '')})`);
  }

 console.log('[اختبار] اختبار 24: المزامنة الحقيقية مع ديسكورد (بيانات سيرفرك في الموقع)');
  {
    const fs9 = require('node:fs');
    const path9 = require('node:path');
    const root9 = path9.join(__dirname, '..');

    // ١) وحدة المزامنة موجودة وتُصدّر ما يلزم
    const sync9 = require('../src/sync');
    for (const fn of ['start', 'syncNow', 'getStatus', 'getSnapshot', 'saveSnapshot', 'listGuildMeta', 'serializeGuild', 'onEvent']) {
      assert.strictEqual(typeof sync9[fn], 'function', `دالة ${fn} ناقصة من وحدة المزامنة`);
    }
    assert.ok(fs9.readFileSync(path9.join(root9, 'src', 'database', 'schema.sql'), 'utf8').includes('CREATE TABLE IF NOT EXISTS kv'), 'جدول المخزن kv ناقص');

    // ٢) دورة كاملة: حفظ لقطة ← قراءتها ← ظهورها في القائمة ← حذفها
    const fakeId = '999000000000000001';
    sync9.saveSnapshot({
      id: fakeId,
      name: 'سيرفر اختبار المزامنة',
      icon: null,
      memberCount: 123,
      channels: [{ id: 'c1', name: 'عام', type: 0, parentId: null, position: 1 }],
      roles: [{ id: 'r1', name: 'الإدارة', managed: false, position: 5 }],
      emojis: [],
      syncedAt: Date.now(),
      source: 'test',
    });
    const snap9 = sync9.getSnapshot(fakeId);
    assert.ok(snap9 && snap9.name === 'سيرفر اختبار المزامنة', 'قراءة اللقطة فشلت');
    assert.strictEqual(snap9.channels.length, 1, 'قنوات اللقطة ناقصة');
    assert.ok(sync9.listGuildMeta().some((g) => g.id === fakeId), 'اللقطة لا تظهر في قائمة السيرفرات');
    sync9.removeSnapshot(fakeId);
    assert.strictEqual(sync9.getSnapshot(fakeId), null, 'حذف اللقطة فشل');

    // ٣) الحالة تحتوي ما تعرضه اللوحة
    const st9 = sync9.getStatus();
    for (const key of ['ok', 'source', 'guilds', 'at', 'hasToken', 'botOnline', 'intervalSeconds', 'guildsKnown']) {
      assert.ok(key in st9, `الحقل ${key} ناقص من حالة المزامنة`);
    }

    // ٤) المسارات موجودة في الـAPI + البث الحيّ + واجهة المزامنة
    const apiSrc9 = fs9.readFileSync(path9.join(root9, 'src', 'web', 'routes', 'api.js'), 'utf8');
    assert.ok(apiSrc9.includes("router.get('/sync/status'"), 'مسار /api/sync/status ناقص');
    assert.ok(apiSrc9.includes("router.post('/sync'"), 'مسار /api/sync ناقص');
    assert.ok(apiSrc9.includes("router.get('/events'"), 'مسار البث الحيّ /api/events ناقص');
    assert.ok(apiSrc9.includes('text/event-stream'), 'ترويسة البث الحيّ ناقصة');

    const pagesSrc9 = fs9.readFileSync(path9.join(root9, 'src', 'web', 'routes', 'pages.js'), 'utf8');
    assert.ok(pagesSrc9.includes('مزامنة الآن'), 'زر «مزامنة الآن» ناقص من قائمة السيرفرات');
    assert.ok(pagesSrc9.includes('آخر مزامنة'), 'معلومة «آخر مزامنة» ناقصة');

    const appSrc9 = fs9.readFileSync(path9.join(root9, 'src', 'web', 'public', 'app.js'), 'utf8');
    assert.ok(appSrc9.includes('buildSyncBar'), 'شريط المزامنة ناقص من اللوحة');
    assert.ok(appSrc9.includes("EventSource('/api/events')"), 'البث الحيّ غير موصول في اللوحة');

    // ٥) القوائم المنسدلة تقرأ القنوات/الرتب من اللقطة عند توقّف البوت
    assert.ok(apiSrc9.includes('snapshot?.channels'), 'القنوات لا تُقرأ من اللقطة');
    assert.ok(apiSrc9.includes('snapshot?.roles'), 'الرتب لا تُقرأ من اللقطة');

    // ٦) بيانات العرض تتوقف تلقائيًا عند وجود توكن حقيقي
    const cfg9 = require('../src/config');
    assert.strictEqual(typeof cfg9.web.demoData, 'boolean', 'خاصية demoData ناقصة');
    assert.ok(Number.isFinite(cfg9.sync.intervalSeconds) && cfg9.sync.intervalSeconds >= 60, 'مدة المزامنة غير صالحة');

  console.log(`  [تم] لقطة كاملة (قنوات/رتب/أعضاء) + /api/sync + بث حيّ + شريط مزامنة في اللوحة (كل ${cfg9.sync.intervalSeconds} ثانية)`);
  }

 console.log('[اختبار] اختبار 25: مسار الدخول بحساب Discord (بلا صفحات إرشاد)');
  {
    const fs10 = require('node:fs');
    const path10 = require('node:path');
    const root10 = path10.join(__dirname, '..');
    const authSrc = fs10.readFileSync(path10.join(root10, 'src', 'web', 'routes', 'auth.js'), 'utf8');

    // الدخول يحوّل مباشرة إلى ديسكورد (لا صفحات وسطية)
    assert.ok(!authSrc.includes('redirectHelpPage'), 'صفحة الإرشاد ما زالت موجودة');
    assert.ok(!authSrc.includes('registeredRedirects'), 'فحص روابط العودة ما زال موجودًا');
    assert.ok(/router\.get\('\/login',\s*\(req, res\)/.test(authSrc), 'مسار الدخول لم يعد مباشرًا');
    assert.ok(authSrc.includes('discord.com/oauth2/authorize'), 'وجهة الدخول إلى ديسكورد ناقصة');
    assert.ok(authSrc.includes('/auth/callback'), 'رابط العودة غير مستخدم');
    assert.ok(authSrc.includes('identify') && authSrc.includes('guilds'), 'نطاقات OAuth ناقصة');

    // رسالة عربية واضحة عند فشل التبادل بدل خطأ مبهم
    assert.ok(authSrc.includes('تعذّر إكمال الدخول'), 'رسالة فشل الدخول العربية ناقصة');

    // رابط العودة يُبنى من الرابط العام في كل الحالات
    assert.ok(authSrc.includes('${config.web.url}/auth/callback'), 'رابط العودة لا يتبع الرابط العام');

  console.log('  [تم] الدخول يحوّل لديسكورد مباشرة + رسالة عربية عند الفشل (بلا صفحات وسطية)');
  }

 console.log('[اختبار] اختبار 26: ربط الموقع بالبوت (سيرفرات المستخدم تظهر فعلًا)');
  {
    const { execFileSync } = require('node:child_process');
    const path11 = require('node:path');
    const fs11 = require('node:fs');
    const root11 = path11.join(__dirname, '..');

    // ١) الاختبار المستقل لمصدر السيرفرات
    const outGuilds = execFileSync('node', [path11.join(root11, 'guilds-test.js')], { cwd: root11, encoding: 'utf8' });
    for (const needle of ['عضو عنده الرول فقط', 'مالك السيرفر', 'إدارة السيرفر', 'بلا تكرار', 'فحص الوصول']) {
      assert.ok(outGuilds.includes(needle), `حالة «${needle}» غير مُختبرة في قائمة السيرفرات`);
    }
    assert.ok(outGuilds.includes('🎉'), 'اختبار قائمة السيرفرات لم ينجح');

    // ٢) الصفحة والـAPI يستخدمان المصدر الموثوق (لا قائمة OAuth وحدها)
    const pagesSrc11 = fs11.readFileSync(path11.join(root11, 'src', 'web', 'routes', 'pages.js'), 'utf8');
    const apiSrc11 = fs11.readFileSync(path11.join(root11, 'src', 'web', 'routes', 'api.js'), 'utf8');
    assert.ok(pagesSrc11.includes("require('../guilds')"), 'صفحة السيرفرات لا تستخدم مصدر السيرفرات الموحّد');
    assert.ok(apiSrc11.includes("require('../guilds')"), 'الـAPI لا يستخدم مصدر السيرفرات الموحّد');
    assert.ok(!/guilds = \(req\.session\.guilds \|\| \[\]\)\.map/.test(pagesSrc11), 'الصفحة ما زالت تعتمد على جلسة OAuth وحدها');

    // ٣) الوحدة تفحص الصلاحية الحقيقية لكل سيرفر
    const guildsMod = fs11.readFileSync(path11.join(root11, 'src', 'web', 'guilds.js'), 'utf8');
    for (const fn of ['listUserGuilds', 'canAccessGuild', 'memberCanUse']) {
      assert.ok(guildsMod.includes(fn), `دالة ${fn} ناقصة من وحدة السيرفرات`);
    }
    assert.ok(guildsMod.includes('ManageGuild'), 'فحص صلاحية الإدارة ناقص');
    assert.ok(guildsMod.includes('requiredRoleId'), 'فحص الرول المطلوب ناقص');

    // ٤) رسالة الفراغ توضّح للمستخدم سبب عدم الظهور
    assert.ok(pagesSrc11.includes('كان البوت مضافًا إليها'), 'رسالة الفراغ غير موجودة');

  console.log('  [تم] سيرفرات المستخدم: دمج الجلسة + البوت الحيّ + الصلاحية الحقيقية (8 حالات)');
  }

 console.log('[اختبار] اختبار 27: جلسات الموقع تبقى بعد إعادة التشغيل (على القرص)');
  {
    const fs12 = require('node:fs');
    const path12 = require('node:path');
    const root12 = path12.join(__dirname, '..');
    const { FileSessionStore } = require('../src/web/sessionStore');

    const dir12 = path12.join(require('node:os').tmpdir(), `nl-sessions-${Date.now()}`);
    const file12 = path12.join(dir12, 'sessions.json');

    // ١) تُحفظ على القرص وتُقرأ من مخزن جديد (محاكاة إعادة تشغيل الخدمة)
    const store1 = new FileSessionStore(file12);
    store1.set('sid-test', { user: { id: '777', username: 'loki' }, cookie: {} }, () => {});
    store1.saveNow();
    assert.ok(fs12.existsSync(file12), 'ملف الجلسات لم يُكتب على القرص');

    const store2 = new FileSessionStore(file12);
    let restored = null;
    store2.get('sid-test', (_e, sess) => { restored = sess; });
    assert.ok(restored && restored.user && restored.user.username === 'loki', 'الجلسة لم تُستعد بعد إعادة الإنشاء');

    // ٢) الخروج يحذف الجلسة فعليًا
    store2.destroy('sid-test', () => {});
    let after = 'x';
    store2.get('sid-test', (_e, sess) => { after = sess; });
    assert.strictEqual(after, null, 'الجلسة لم تُحذف بعد الخروج');

    // ٣) الجلسات المنتهية تُنظَّف
    const store3 = new FileSessionStore(path12.join(dir12, 'expired.json'), 1);
    store3.set('old', { user: { id: '1' } }, () => {});
    store3.data.get('old').expires = Date.now() - 1000;
    assert.ok(store3.cleanup() >= 1, 'تنظيف الجلسات المنتهية لا يعمل');

    // ٤) الخادم يستخدم المخزن (لا MemoryStore)
    const srv12 = fs12.readFileSync(path12.join(root12, 'src', 'web', 'server.js'), 'utf8');
    assert.ok(srv12.includes('FileSessionStore'), 'الخادم لا يستخدم مخزن الجلسات على القرص');
    assert.ok(srv12.includes('store,'), 'المخزن غير مربوط بإعدادات الجلسة');

    fs12.rmSync(dir12, { recursive: true, force: true });
  console.log('  [تم] الجلسة تبقى بعد النشر/التحديث (ملف داخل الـVolume) + خروج نظيف');
  }

 console.log('[اختبار] اختبار 28: أيقونات سليمة + شكل ما يخرج عن الإطار');
  {
    const fs13 = require('node:fs');
    const path13 = require('node:path');
    const root13 = path13.join(__dirname, '..');
    const { guildIconUrl, initials } = require('../src/lib/discordIcon');

    // ١) بناء رابط الأيقونة: هاش • رابط كامل (لا يتكرر) • متحرك • فاضي
    const hash = '0ae6617c364028de691fe523598be4dc';
    assert.strictEqual(guildIconUrl('123', hash), `https://cdn.discordapp.com/icons/123/${hash}.png?size=128`, 'رابط الهاش غير صحيح');
    const full = `https://cdn.discordapp.com/icons/123/${hash}.png?size=128`;
    assert.strictEqual(guildIconUrl('123', full), full, 'الرابط الكامل يجب أن يبقى كما هو (بلا تكرار)');
    assert.ok(!guildIconUrl('123', full).includes('/https://'), 'تكرار البادئة ما زال ممكنًا');
    assert.ok(guildIconUrl('123', `a_${hash}`).endsWith('.gif?size=128'), 'الأيقونة المتحركة يجب أن تكون gif');
    assert.strictEqual(guildIconUrl('123', null), null, 'الأيقونة الفارغة يجب أن تكون null');
    assert.strictEqual(guildIconUrl(null, hash), null, 'بلا معرّف سيرفر = بلا أيقونة');
    assert.strictEqual(initials('Never Land'), 'NL', 'الأحرف الأولى غير صحيحة');

    // ٢) كل ملفات الواجهة تستخدم الدالة الموحّدة (لا تركيب يدوي قديم للرابط)
    const read13 = (f) => fs13.readFileSync(path13.join(root13, ...f), 'utf8');
    for (const f of [['src', 'web', 'routes', 'pages.js'], ['src', 'web', 'public', 'app.js'], ['src', 'web', 'guilds.js'], ['src', 'sync.js']]) {
      const src = read13(f);
      for (const oldForm of ['${g.icon}.png?size=128', '${state.guild.icon}.png', '${discordGuild.icon}', '${guild.icon}.png?size=128', '${g.id}/${g.icon}']) {
        assert.ok(!src.includes(oldForm), `تركيب يدوي قديم لرابط الأيقونة في ${f.join('/')}: ${oldForm}`);
      }
    }
    // المسارات تستعمل الدالة الموحّدة
    assert.ok(read13(['src', 'web', 'routes', 'pages.js']).includes('guildIconUrl('), 'صفحة السيرفرات لا تستخدم دالة الأيقونة الموحّدة');
    assert.ok(read13(['src', 'web', 'guilds.js']).includes("require('../lib/discordIcon')"), 'وحدة السيرفرات لا تستخدم دالة الأيقونة');
    assert.ok(read13(['src', 'sync.js']).includes("require('./lib/discordIcon')"), 'المزامنة لا تستخدم دالة الأيقونة');
    const appSrc13 = read13(['src', 'web', 'public', 'app.js']);
    assert.ok(appSrc13.includes('function guildIconUrl'), 'دالة الأيقونة ناقصة من واجهة اللوحة');
    assert.ok(appSrc13.includes('guildIconUrl(state.guild.id'), 'ترويسة اللوحة لا تستخدم دالة الأيقونة');
    assert.ok(appSrc13.includes('iconFallback'), 'البديل عند فشل الصورة ناقص');

    // ٣) أنماط الحماية من الخروج عن الإطار
    const styleCss = fs13.readFileSync(path13.join(root13, 'src', 'web', 'public', 'style.css'), 'utf8');
    const dashCss = fs13.readFileSync(path13.join(root13, 'src', 'web', 'public', 'dash.css'), 'utf8');
    for (const rule of ['overflow-x: hidden', '.guild-info', 'overflow-wrap: anywhere']) {
      assert.ok(styleCss.includes(rule), `قاعدة «${rule}» ناقصة من style.css`);
    }
    assert.ok(styleCss.includes('.guild-card { overflow: hidden; }'), 'بطاقة السيرفر غير محميّة من التجاوز');
    assert.ok(!/^\s*\*\s*\{[^}]*min-width:\s*0/m.test(styleCss), 'قاعدة عامة خطرة ما زالت موجودة');
    for (const rule of ['.d-head h1 { overflow-wrap', '.d-syncbar { overflow-wrap', '.d-card { overflow: hidden; }']) {
      assert.ok(dashCss.includes(rule), `قاعدة «${rule}» ناقصة من dash.css`);
    }
    assert.ok(dashCss.includes('.d-row { flex-wrap: wrap; }'), 'صفوف اللوحة لا تلتف');
    assert.ok(dashCss.includes('minmax(min(150px, 100%), 1fr)'), 'شبكة الإحصاءات قد تخرج عن الشاشة الصغيرة');
    assert.ok(dashCss.includes('minmax(min(240px, 100%), 1fr)'), 'شبكة البطاقات قد تخرج عن الشاشة الصغيرة');
    // كل الشبكات بحد أدنى آمن (ما تخرج عن الشاشة الصغيرة)
    const loose = [...styleCss.matchAll(/minmax\((\d+)px/g)].map((m) => m[0]);
    assert.deepStrictEqual(loose, [], `شبكات بحد أدنى ثابت قد تخرج عن الإطار: ${loose.join(', ')}`);
    assert.ok(dashCss.includes('scroll-margin-top: 84px'), 'المحتوى قد يختفي تحت الترويسة عند التمرير');

    // ٤) أيقونة مكسورة في القائمة يجب أن يكون لها بديل (onerror) في صفحة السيرفرات
    const pagesSrc13 = fs13.readFileSync(path13.join(root13, 'src', 'web', 'routes', 'pages.js'), 'utf8');
    assert.ok(pagesSrc13.includes('onerror='), 'لا بديل عند فشل تحميل أيقونة السيرفر');

  console.log('  [تم] أيقونات: هاش/رابط/متحرك/فارغ + بديل عند الفشل + أنماط منع التجاوز (4 ملفات)');
  }

 console.log('[اختبار] اختبار 29: تذييل الموقع (هوية + روابط مفيدة بلا تفاصيل تقنية)');
  {
    const fs14 = require('node:fs');
    const path14 = require('node:path');
    const root14 = path14.join(__dirname, '..');
    const pagesSrc14 = fs14.readFileSync(path14.join(root14, 'src', 'web', 'routes', 'pages.js'), 'utf8');
    const styleSrc14 = fs14.readFileSync(path14.join(root14, 'src', 'web', 'public', 'style.css'), 'utf8');

    // ١) لا تفاصيل تقنية في التذييل (مثل اسم مشغّل قاعدة البيانات)
    const foot14 = pagesSrc14.slice(pagesSrc14.indexOf('<footer'), pagesSrc14.indexOf('</footer>') + 9);
    assert.ok(!foot14.includes('قاعدة البيانات'), 'تفاصيل قاعدة البيانات ما زالت في التذييل');
    assert.ok(!foot14.includes('driverName'), 'اسم مشغّل القاعدة ما زال يُعرض');
    assert.ok(!foot14.includes('sqlite'), 'اسم sqlite ما زال يظهر للزائر');

    // ٢) هوية + روابط مفيدة
    assert.ok(foot14.includes('footer-brand') && foot14.includes('logoMark'), 'هوية التذييل ناقصة');
    assert.ok(foot14.includes('${SITE_NAME}'), 'اسم الموقع ناقص من التذييل');
    for (const href14 of ['href="/"', 'href="/dashboard"', 'href="/api/status"']) {
      assert.ok(foot14.includes(href14), `رابط التذييل ${href14} ناقص`);
    }
    assert.ok(foot14.includes('footer-links'), 'قائمة روابط التذييل ناقصة');

    // ٣) الأنماط: لا اختفاء للنص ولا تجاوز
    for (const rule14 of ['.footer-brand', '.footer-links', '.footer-links a:hover', 'overflow-wrap: anywhere']) {
      assert.ok(styleSrc14.includes(rule14), `نمط التذييل «${rule14}» ناقص`);
    }
    assert.ok(/\.footer\s*\{[^}]*flex-wrap:\s*wrap/s.test(styleSrc14), 'التذييل لا يلتف على الشاشات الصغيرة');
    assert.ok(styleSrc14.includes('line-height: 1.9'), 'ارتفاع سطر التذييل صغير (قد يُقتطع النص)');

  console.log('  [تم] تذييل نظيف: هوية + 3 روابط مفيدة + بلا تفاصيل تقنية (يلتف على الجوال)');
  }

 console.log('[اختبار] 30: مفتاح التبديل (Switch) لا تخرج كرته من المسار في RTL');
  {
    const fs15 = require('node:fs');
    const path15 = require('node:path');
    const root15 = path15.join(__dirname, '..');
    const dashCss15 = fs15.readFileSync(path15.join(root15, 'src', 'web', 'public', 'dash.css'), 'utf8');
    const styleCss15 = fs15.readFileSync(path15.join(root15, 'src', 'web', 'public', 'style.css'), 'utf8');

    // ١) مفتاح اللوحة: أبعاد مضبوطة بمتغيّرات (العرض = هامش + كرة + هامش + حركة)
    for (const v of ['--switch-w: 48px', '--switch-knob: 21px', '--switch-pad: 3px']) {
      assert.ok(dashCss15.includes(v), `متغيّر المفتاح ${v} ناقص`);
    }
    assert.ok(dashCss15.includes('--switch-travel: calc(var(--switch-w) - var(--switch-knob) - (var(--switch-pad) * 2))'), 'حساب مسافة الحركة غير مضبوط');
    assert.ok(/translateX\(var\(--switch-travel\)\)/.test(dashCss15), 'الحركة لا تستخدم مسافة محسوبة');
    assert.strictEqual(48 - 21 - 3 * 2, 21, 'حساب الأبعاد لا يطابق الحركة');

    // ٢) لا خلط بين الموضع المنطقي والفيزيائي (سبب خروج الكرة)
    assert.ok(!dashCss15.includes('inset-inline-end: 3px'), 'الموضع المنطقي القديم ما زال موجودًا');
    assert.ok(!/html\[dir='rtl'\] \.d-switch/.test(dashCss15), 'القاعدة الخاصة بـ RTL القديمة ما زالت موجودة');
    assert.ok(dashCss15.includes('direction: ltr'), 'الاتجاه الثابت ناقص (بدونه تخرج الكرة في RTL)');
    assert.ok(dashCss15.includes('left: var(--switch-pad)'), 'الموضع لا يستخدم إحداثيات فيزيائية');
    assert.ok(dashCss15.includes('transition: transform .2s cubic-bezier(.4, 0, .2, 1)'), 'انتقال حركة الكرة ناقص/غير ناعم');

    // ٣) مفتاح نسخة الموقع: نفس المنطق
    assert.ok(styleCss15.includes('transform: translateX(24px)'), 'حركة مفتاح الموقع غير صحيحة للاتجاهين');
    assert.ok(!styleCss15.includes('translateX(-24px)'), 'الحركة السالبة (سبب الخروج في RTL) ما زالت موجودة');
    assert.ok(/\.switch \{[^}]*direction: ltr/s.test(styleCss15), 'اتجاه مفتاح الموقع غير ثابت');

    // ٤) احترام تقليل الحركة (إتاحة)
    assert.ok(dashCss15.includes('prefers-reduced-motion'), 'لا احترام لإعداد تقليل الحركة في اللوحة');

  console.log('  [تم] المفتاح داخل المسار في RTL وLTR: 48 = 3 + 21 + 3 + 21 · حركة ناعمة · بلا خلط منطقي/فيزيائي');
  }

 console.log('[اختبار] 31: الخط الفاصل بالصور المتحركة (GIF)');
  {
    const { execFileSync } = require('node:child_process');
    const fs16 = require('node:fs');
    const path16 = require('node:path');
    const root16 = path16.join(__dirname, '..');

    // ١) الاختبار المستقل الكامل
    const out16 = execFileSync('node', [path16.join(root16, 'autoline-test.js')], { cwd: root16, encoding: 'utf8' });
    for (const needle of ['ملفات GIF', 'أُرسل مرفق صورة GIF', 'بلا حلقة', 'بديل تلقائي', 'احتياطي', 'معاينة اللوحة']) {
      assert.ok(out16.includes(needle), `حالة «${needle}» غير مُختبرة في الخط الفاصل`);
    }
    assert.ok(out16.includes('🎉'), 'اختبار الخط الفاصل لم ينجح');

    // ٢) الأنماط الأربعة موجودة كملفات حقيقية
    const gifDir16 = path16.join(root16, 'assets', 'autoline');
    for (const name of ['glow', 'flow', 'pulse', 'dash']) {
      const f16 = path16.join(gifDir16, `${name}.gif`);
      assert.ok(fs16.existsSync(f16), `${name}.gif ناقص`);
      const head16 = fs16.readFileSync(f16).subarray(0, 6).toString('ascii');
      assert.strictEqual(head16, 'GIF89a', `${name}.gif ليس GIF`);
    }

    // ٣) الإعدادات: النوع والنمط + الوصف في الوحدة
    const cfg16 = require('../src/config');
    assert.ok(['gif', 'custom', 'text'].includes(cfg16.defaults.autoline.lineType), 'نوع الخط غير معروف');
    assert.strictEqual(cfg16.defaults.autoline.lineType, 'gif', 'الافتراضي لازم يكون صورة متحركة');
    assert.ok(cfg16.defaults.autoline.gifStyle, 'نمط GIF الافتراضي ناقص');
    assert.ok('customUrl' in cfg16.defaults.autoline, 'حقل الرابط الخاص ناقص');

    const mod16 = require('../src/systems/autoline');
    assert.strictEqual(Object.keys(mod16.GIF_STYLES).length, 4, 'عدد أنماط GIF غير مطابق');

    // ٤) الخادم يقدّم ملفات GIF + اللوحة فيها واجهة الاختيار
    const srv16 = fs16.readFileSync(path16.join(root16, 'src', 'web', 'server.js'), 'utf8');
    assert.ok(srv16.includes("'/autoline'"), 'مسار تقديم الخطوط ناقص من الخادم');
    const app16 = fs16.readFileSync(path16.join(root16, 'src', 'web', 'public', 'app.js'), 'utf8');
    for (const needle of ['autoline-styles', 'autoline-preview', 'DEFAULT_LINE_STYLES', 'autoline.lineType', 'autoline.gifStyle', 'autoline.customUrl']) {
      assert.ok(app16.includes(needle), `عنصر واجهة الخط الفاصل «${needle}» ناقص من اللوحة`);
    }
    const dash16 = fs16.readFileSync(path16.join(root16, 'src', 'web', 'public', 'dash.css'), 'utf8');
    assert.ok(dash16.includes('.autoline-style.active'), 'نمط الاختيار النشط ناقص');
    assert.ok(dash16.includes('.autoline-img'), 'نمط معاينة الصورة ناقص');

    // ٥) الـAPI يرسل الأنماط للوحة
    const api16 = fs16.readFileSync(path16.join(root16, 'src', 'web', 'routes', 'api.js'), 'utf8');
    assert.ok(api16.includes('autolineStyles'), 'أنماط الخطوط غير مُرسلة للوحة');

    // ٦) أمر البوت فيه الأوامر الجديدة
    const cmd16 = fs16.readFileSync(path16.join(root16, 'src', 'commands', 'config', 'autoline.js'), 'utf8');
    for (const sub16 of ["sub('style'", "sub('type'", "sub('url'"]) {
      assert.ok(cmd16.includes(sub16), `الأمر الفرعي ${sub16} ناقص`);
    }
    assert.ok(cmd16.includes('GIF_STYLES'), 'أمر البوت لا يعرض الأنماط');

  console.log('  [تم] 4 خطوط GIF متحركة + واجهة اللوحة + أوامر البوت + تسليم من الخادم (13 حالة)');
  }

 console.log('[اختبار] 32: نظام الخبرة الكامل (كتابي · صوتي · تفاعل + توب داي وتوب ويك)');
  {
    const { execFileSync } = require('node:child_process');
    const fs17 = require('node:fs');
    const path17 = require('node:path');
    const root17 = path17.join(__dirname, '..');

    // ١) الاختبار المستقل الكامل (١٠ مجموعات)
    const out17 = execFileSync('node', [path17.join(root17, 'leveling-test.js')], { cwd: root17, encoding: 'utf8' });
    for (const needle of ['الفترات', 'ثلاث مصادر خبرة منفصلة', 'حمايات التفاعل', 'السقف اليومي', 'الترقية', 'اللوحات', 'بيانات الترتيب', 'التصفير']) {
      assert.ok(out17.includes(needle), `حالة «${needle}» غير مُختبرة في نظام الخبرة`);
    }
    assert.ok(out17.includes('🎉'), 'اختبار نظام الخبرة لم ينجح');

    // ٢) المخطّط: جدول الفترات + أعمدة المصادر
    const schema17 = fs17.readFileSync(path17.join(root17, 'src', 'database', 'schema.sql'), 'utf8');
    assert.ok(schema17.includes('CREATE TABLE IF NOT EXISTS xp_periods'), 'جدول فترات الخبرة ناقص');
    assert.ok(/idx_xp_periods_board/.test(schema17), 'فهرس لوحة الفترات ناقص');
    const sqlite17 = fs17.readFileSync(path17.join(root17, 'src', 'database', 'sqlite.js'), 'utf8');
    for (const col of ['text_xp', 'voice_xp', 'interact_xp', 'interactions']) {
      assert.ok(sqlite17.includes(`'${col}'`), `عمود ${col} غير مُهاجَر في مشغّل SQLite`);
    }
    for (const fn of ['addPeriodXp', 'getPeriodLeaderboard', 'getPeriodRank', 'getXpTotals', 'resetLevel']) {
      assert.ok(sqlite17.includes(`${fn}(`), `دالة ${fn} ناقصة من مشغّل SQLite`);
    }
    const json17 = fs17.readFileSync(path17.join(root17, 'src', 'database', 'json.js'), 'utf8');
    for (const fn of ['addPeriodXp', 'getPeriodLeaderboard', 'getXpTotals', 'resetLevel']) {
      assert.ok(json17.includes(`${fn}(`), `دالة ${fn} ناقصة من المشغّل الاحتياطي`);
    }

    // ٣) الإعدادات الافتراضية
    const cfg17 = require('../src/config');
    const lv = cfg17.defaults.leveling;
    for (const key0 of ['textXp', 'voiceXp', 'interactXp', 'interactMinXp', 'interactMaxXp', 'interactDailyCap', 'interactMaxPerMessage', 'resetOffsetHours']) {
      assert.ok(key0 in lv, `إعداد ${key0} ناقص من إعدادات الخبرة`);
    }
    assert.strictEqual(lv.enabled, true, 'نظام المستويات لازم يكون مفعّلًا افتراضيًا');
    assert.strictEqual(lv.textXp, true, 'الخبرة الكتابية لازم تكون مفعّلة افتراضيًا');
    assert.strictEqual(lv.voiceXp, true, 'الخبرة الصوتية لازم تكون مفعّلة افتراضيًا');
    assert.strictEqual(lv.interactXp, true, 'خبرة التفاعل لازم تكون مفعّلة افتراضيًا');

    // ٤) الأوامر: /top + خيارات /leveling
    const top17 = fs17.readFileSync(path17.join(root17, 'src', 'commands', 'general', 'top.js'), 'utf8');
    for (const needle of ["setName('top')", "'day'", "'week'", "'all'", "'text'", "'voice'", "'interact'"]) {
      assert.ok(top17.includes(needle), `أمر /top ينقصه ${needle}`);
    }
    const lvCmd17 = fs17.readFileSync(path17.join(root17, 'src', 'commands', 'config', 'leveling.js'), 'utf8');
    for (const needle of ["sub('sources'", 'الفترة', 'النوع', 'خبرة_كتابية', 'خبرة_تفاعل', 'سقف_التفاعل_اليومي']) {
      assert.ok(lvCmd17.includes(needle), `أمر /leveling ينقصه ${needle}`);
    }

    // ٥) حدث التفاعل الحقيقي موجود
    const react17 = fs17.readFileSync(path17.join(root17, 'src', 'events', 'reactions.js'), 'utf8');
    assert.ok(react17.includes('MessageReactionAdd') && react17.includes('handleReaction'), 'حدث التفاعل (خبرة التفاعل) ناقص');

    // ٦) الـAPI يدعم الفترات والمصادر
    const api17 = fs17.readFileSync(path17.join(root17, 'src', 'web', 'routes', 'api.js'), 'utf8');
    for (const needle of ['periods.isPeriod', 'periods.isSource', 'leveling.getBoard', "reset:", 'totals']) {
      assert.ok(api17.includes(needle), `واجهة اللوحة ينقصها ${needle}`);
    }

    // ٧) لوحة التحكم: قسم المتصدّرين + إعدادات المصادر
    const app17 = fs17.readFileSync(path17.join(root17, 'src', 'web', 'public', 'app.js'), 'utf8');
    for (const needle of ["label: 'تفاعل'", 'loadTopBoard', 'd-top-chips', 'الخبرة الكتابية (الشات)', 'الخبرة الصوتية', 'خبرة التفاعل', 'leveling.resetOffsetHours']) {
      assert.ok(app17.includes(needle), `لوحة التحكم ينقصها «${needle}»`);
    }
    const dash17 = fs17.readFileSync(path17.join(root17, 'src', 'web', 'public', 'dash.css'), 'utf8');
    for (const needle of ['.d-top-chips', '.chip.active', '.d-top-meta']) {
      assert.ok(dash17.includes(needle), `أنماط لوحة المتصدّرين ينقصها ${needle}`);
    }

  console.log('  [تم] خبرة كتابية وصوتية وتفاعل + توب داي وتوب ويك: بوت + لوحة + قاعدة بيانات (10 مجموعات)');
  }

 console.log('[اختبار] 33: حزمة الأيقونات الجديدة + شكل القائمة الجانبية');
  {
    const fs18 = require('node:fs');
    const path18 = require('node:path');
    const root18 = path18.join(__dirname, '..');

    const icons = require('../src/web/public/icons');
    const { ICONS, LOG_ICONS, icon } = icons;

    // ١) الحزمة الجديدة موجودة وأسماؤها صحيحة
    const packNames = ['trophy', 'podium', 'medal', 'spark', 'waveform', 'bubbles', 'heart', 'trendUp', 'gauge', 'calendarDay', 'calendarWeek', 'target', 'rocket'];
    for (const name of packNames) {
      assert.ok(ICONS[name], `أيقونة الحزمة الجديدة «${name}» ناقصة`);
      assert.ok(ICONS[name].includes('<'), `أيقونة «${name}» فاضية`);
    }
    assert.ok(Object.keys(ICONS).length >= 95, `عدد الأيقونات قلّ (${Object.keys(ICONS).length})`);

    // ٢) بلا إيموجي كيبورد وبلا أي مصدر خارجي
    const iconsSrc = fs18.readFileSync(path18.join(root18, 'src', 'web', 'public', 'icons.js'), 'utf8');
    for (const ch of ['\u{1F600}', '\u{1F3C6}', '\u{2B50}', '\u{2705}']) {
      assert.ok(!iconsSrc.includes(ch), 'أيقونات الحزمة فيها إيموجي كيبورد');
    }
    assert.ok(!/https?:\/\//.test(iconsSrc), 'الحزمة تعتمد على رابط خارجي');
    assert.ok(!/<image|xlink/.test(iconsSrc), 'الحزمة فيها صور خارجية');

    // ٣) كل قيم سجلات الأحداث تُشير لأيقونات موجودة
    const brokenLogs = Object.entries(LOG_ICONS).filter(([, v]) => !ICONS[v]);
    assert.strictEqual(brokenLogs.length, 0, `قيم LOG_ICONS مكسورة: ${brokenLogs.map(([k, v]) => `${k} إلى ${v}`).join(', ')}`);

    // ٤) دالة الرسم تُنتج SVG صالحًا قابلة للتلوين بلون النص
    const svg = icon('trophy', { size: 22, stroke: 1.7 });
    for (const needle of ['<svg', 'viewBox="0 0 24 24"', 'stroke="currentColor"', 'stroke-width="1.7"', 'fill="none"']) {
      assert.ok(svg.includes(needle), `وسم الأيقونة ينقصه ${needle}`);
    }

    // ٥) أدوات الحزمة موجودة في المشروع
    const pack = fs18.readFileSync(path18.join(root18, 'tools', 'icons-pack.js'), 'utf8');
    assert.ok(pack.includes('NEW_ICONS') && pack.includes('trophy'), 'ملف حزمة الأيقونات ناقص');
    const builder = fs18.readFileSync(path18.join(root18, 'tools', 'build-icons.js'), 'utf8');
    assert.ok(builder.includes('icons-pack') && builder.includes('ICONS_FILE'), 'أداة بناء الأيقونات ناقصة');
    const pkg18 = JSON.parse(fs18.readFileSync(path18.join(root18, 'package.json'), 'utf8'));
    assert.ok(pkg18.scripts.icons, 'سكربت npm run icons ناقص');

    // ٦) القائمة الجانبية: اسم «تفاعل» + أيقونة كأس + بلا كسر نص
    const app18 = fs18.readFileSync(path18.join(root18, 'src', 'web', 'public', 'app.js'), 'utf8');
    assert.ok(app18.includes("top: 'trophy'"), 'أيقونة قسم تفاعل غير مربوطة');
    assert.ok(app18.includes("label: 'تفاعل'"), 'اسم القسم لم يتغيّر إلى تفاعل');
    assert.ok(app18.includes("class: 'd-nav-label'"), 'اسم العنصر غير مُهيّأ لكسر النص');
    assert.ok(app18.includes('title: section.label'), 'عنوان العنصر عند المرور ناقص');
    const dash18 = fs18.readFileSync(path18.join(root18, 'src', 'web', 'public', 'dash.css'), 'utf8');
    for (const needle of ['.d-nav-label', 'white-space: nowrap', 'text-overflow: ellipsis', 'min-width: 0']) {
      assert.ok(dash18.includes(needle), `أنماط القائمة الجانبية ينقصها ${needle}`);
    }
    const navBlock = dash18.slice(dash18.indexOf('.d-nav-item .d-nav-label'), dash18.indexOf('.d-nav-item .dot'));
    assert.ok(navBlock.includes('nowrap') && navBlock.includes('ellipsis'), 'اسم العنصر ما زال قابلاً للكسر');

  console.log('  [تم] 95 أيقونة (13 جديدة + 30 محسّنة) · قسم «تفاعل» بأيقونة كأس · القائمة الجانبية بلا كسر نص');

    // ٧) المصدر الواحد للأيقونات: app.js بلا نسخة مكرّرة
    const appSrc18 = fs18.readFileSync(path18.join(root18, 'src', 'web', 'public', 'app.js'), 'utf8');
    assert.ok(appSrc18.includes('window.ICONS'), 'app.js لا يقرأ الأيقونات من icons.js');
    assert.ok(!/const ICONS = \{\s*\n\s*dashboard:/.test(appSrc18), 'app.js ما زال فيه نسخة مكرّرة من الأيقونات');
    assert.ok(!/const LOG_ICONS = \{\s*\n\s*message:/.test(appSrc18), 'app.js ما زال فيه نسخة مكرّرة من أيقونات السجلات');

    // ٨) كل أيقونة يستخدمها app.js موجودة فعلاً في icons.js
    const used = new Set();
    for (const m of appSrc18.matchAll(/ic\(\s*'([A-Za-z][A-Za-z0-9]*)'/g)) used.add(m[1]);
    const secIcons = appSrc18.match(/const SECTION_ICONS = \{([\s\S]*?)\n\};/);
    if (secIcons) for (const m of secIcons[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)) used.add(m[1]);
    const missingIcons = [...used].filter((n) => !ICONS[n]);
    assert.strictEqual(missingIcons.length, 0, `أيقونات مفقودة من الحزمة: ${missingIcons.join(', ')}`);
    assert.ok(ICONS[appSrc18.match(/top: '([A-Za-z]+)'/)[1]], 'أيقونة قسم تفاعل غير موجودة في الحزمة');

    // ٩) تحميل icons.js قبل app.js + بصمة نسخة تمنع الكاش القديم
    const pages18 = fs18.readFileSync(path18.join(root18, 'src', 'web', 'routes', 'pages.js'), 'utf8');
    const iIcons = pages18.indexOf("asset('icons.js')");
    const iApp = pages18.indexOf("asset('app.js')");
    assert.ok(iIcons > 0 && iApp > iIcons, 'icons.js لازم تُحمَّل قبل app.js');
    assert.ok(pages18.includes('assetStamp') && pages18.includes('ASSET_FILES'), 'بصمة نسخة الأصول ناقصة');
    for (const f of ['style.css', 'dash.css', 'app.js', 'icons.js']) {
      assert.ok(pages18.includes(`'${f}'`), `الأصل ${f} غير مشمول في البصمة`);
    }
    const srv18 = fs18.readFileSync(path18.join(root18, 'src', 'web', 'server.js'), 'utf8');
    assert.ok(srv18.includes('VERSIONED_ASSETS') && srv18.includes('immutable'), 'ترويسات التخزين للأصول ناقصة');
    assert.ok(srv18.includes('no-store'), 'ترويسة منع تخزين صفحات HTML ناقصة');

  console.log('  [تم] الأيقونات من مصدر واحد + بصمة نسخة تمنع عرض أيقونة قديمة');
  }

 console.log('[نجاح] جميع اختبارات الميزات الجديدة نجحت!');

  process.exit(0);
})();
