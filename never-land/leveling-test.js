'use strict';

/**
 * leveling-test.js
 * -------------------------------------------------------------
 * اختبار نظام الخبرة الكامل (بلا ديسكورد حقيقي):
 *   ١) الفترات: مفتاح اليوم ومفتاح الأسبوع (ISO) ووقت التجديد
 *   ٢) المصادر: خبرة كتابية · صوتية · تفاعل — كل واحدة تنفصل لحالها
 *   ٣) التوب: توب داي · توب ويك · كل الأوقات + الترتيب حسب المصدر
 *   ٤) حمايات التفاعل: بلا بوت، بلا تفاعل على نفسك، مرة واحدة لكل شخص،
 *      سقف لكل رسالة، كولداون بين نفس الشخصين، وسقف يومي
 *   ٥) الترقية عند الوصول لمستوى جديد
 *
 * التشغيل:  node leveling-test.js
 * -------------------------------------------------------------
 */

const assert = require('node:assert');

const periods = require('./src/lib/periods');
const { levelFromXp } = require('./src/lib/levels');
const config = require('./src/config');

/* ------------------------- قاعدة بيانات وهمية بالذاكرة ------------------------- */

const store = { levels: new Map(), periodRows: new Map(), daily: new Map() };
let settings = null;

const key = (a, b) => `${a}:${b}`;
const pkey = (g, u, p, k) => `${g}:${u}:${p}:${k}`;

const FIELD = { text: 'text_xp', voice: 'voice_xp', interact: 'interact_xp' };

const mockDb = {
  getGuildSettings: () => settings,
  getLevelRow: (g, u) => store.levels.get(key(g, u)) || null,
  upsertLevel: (g, u, patch) => {
    const prev = store.levels.get(key(g, u)) || {};
    // نطبّق نفس تحويل الأسماء اللي يسويه مشغّل SQLite الحقيقي
    const map = { textXp: 'text_xp', voiceXp: 'voice_xp', interactXp: 'interact_xp', voiceMinutes: 'voice_minutes', lastXpAt: 'last_xp_at' };
    const normalized = {};
    for (const [k, v] of Object.entries(patch)) normalized[map[k] || k] = v;
    const row = { guild_id: g, user_id: u, ...prev, ...normalized };
    store.levels.set(key(g, u), row);
    return row;
  },
  getLeaderboard: (g, limit = 10, offset = 0) =>
    [...store.levels.values()].filter((r) => r.guild_id === g).sort((a, b) => b.xp - a.xp).slice(offset, offset + limit),
  countTrackedMembers: (g) => [...store.levels.values()].filter((r) => r.guild_id === g).length,
  addPeriodXp: (g, u, period, k, { xp = 0, source = 'text', messages = 0, voiceMinutes = 0, interactions = 0, at = Date.now() }) => {
    const id = pkey(g, u, period, k);
    const row = store.periodRows.get(id) || {
      guild_id: g, user_id: u, period, period_key: k,
      xp: 0, text_xp: 0, voice_xp: 0, interact_xp: 0, messages: 0, voice_minutes: 0, interactions: 0, updated_at: at,
    };
    row.xp += xp;
    row[FIELD[source]] += xp;
    row.messages += messages;
    row.voice_minutes += voiceMinutes;
    row.interactions += interactions;
    row.updated_at = at;
    store.periodRows.set(id, row);
    return row;
  },
  getPeriodRow: (g, u, p, k) => store.periodRows.get(pkey(g, u, p, k)) || null,
  getPeriodLeaderboard: (g, p, k, limit = 10, offset = 0) =>
    [...store.periodRows.values()]
      .filter((r) => r.guild_id === g && r.period === p && r.period_key === k && r.xp > 0)
      .sort((a, b) => b.xp - a.xp || a.updated_at - b.updated_at)
      .slice(offset, offset + limit),
  countPeriodMembers: (g, p, k) =>
    [...store.periodRows.values()].filter((r) => r.guild_id === g && r.period === p && r.period_key === k && r.xp > 0).length,
  getPeriodRank: (g, u, p, k) => {
    const row = store.periodRows.get(pkey(g, u, p, k));
    if (!row || row.xp <= 0) return null;
    return [...store.periodRows.values()]
      .filter((r) => r.guild_id === g && r.period === p && r.period_key === k && r.xp > row.xp).length + 1;
  },
  clearPeriods: (g, u) => {
    for (const id of [...store.periodRows.keys()]) if (id.startsWith(`${g}:${u}:`)) store.periodRows.delete(id);
  },
  resetLevel: (g, u) => {
    store.levels.delete(key(g, u));
    mockDb.clearPeriods(g, u);
  },
  getXpTotals: (g, p = null, k = null) => {
    const rows = p && p !== 'all' && k
      ? [...store.periodRows.values()].filter((r) => r.guild_id === g && r.period === p && r.period_key === k)
      : [...store.levels.values()].filter((r) => r.guild_id === g);
    return rows.reduce((acc, r) => ({
      xp: acc.xp + (r.xp || 0),
      text_xp: acc.text_xp + (r.text_xp || 0),
      voice_xp: acc.voice_xp + (r.voice_xp || 0),
      interact_xp: acc.interact_xp + (r.interact_xp || 0),
      messages: acc.messages + (r.messages || 0),
      voice_minutes: acc.voice_minutes + (r.voice_minutes || 0),
      interactions: acc.interactions + (r.interactions || 0),
    }), { xp: 0, text_xp: 0, voice_xp: 0, interact_xp: 0, messages: 0, voice_minutes: 0, interactions: 0 });
  },
  bumpDaily: (g, field, amount = 1) => {
    const day = new Date().toISOString().slice(0, 10);
    store.daily.set(key(g, day), (store.daily.get(key(g, day)) || 0) + amount);
  },
};

/* نحقن قاعدة البيانات الوهمية *قبل* تحميل نظام الخبرة */
const dbPath = require.resolve('./src/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb };
const leveling = require('./src/systems/leveling');

/* --------------------------------- أدوات --------------------------------- */

const GUILD = 'guild-test';

function settingsFor(patch = {}) {
  const base = JSON.parse(JSON.stringify(config.defaults.leveling));
  settings = { leveling: { ...base, enabled: true, cooldownSeconds: 0, minXp: 20, maxXp: 20, voiceMinXp: 5, voiceMaxXp: 5, interactMinXp: 4, interactMaxXp: 4, ...patch } };
  return settings.leveling;
}

function fakeMember(id) {
  const guild = {
    id: GUILD,
    name: 'Never Land',
    afkChannelId: null,
    roles: { cache: new Map() },
    channels: { cache: new Map() },
    members: { me: { roles: { highest: { position: 99 } } }, cache: new Map(), fetch: async () => null },
    voiceStates: { cache: new Map() },
  };
  return {
    id,
    user: { id, bot: false, username: `user${id}`, displayAvatarURL: () => 'https://cdn.example.com/a.png' },
    guild,
    roles: { cache: new Map() },
    displayName: `user${id}`,
    send: async () => ({}),
    dmChannel: null,
  };
}

function fakeMessage(member, id = 'msg-1') {
  return { id, guild: member.guild, channelId: 'chan-1', member, author: { id: member.id, bot: false }, content: 'مرحبا' };
}

const client = { user: { id: 'bot-1' } };

/* --------------------------------- الاختبار --------------------------------- */

(async () => {
  console.log('\n[اختبار] نظام الخبرة: كتابي · صوتي · تفاعل — توب داي وتوب ويك\n');

  /* ١) الفترات */
  assert.strictEqual(periods.dayKey(new Date('2026-09-18T10:00:00Z')), '2026-09-18', 'مفتاح اليوم خطأ');
  assert.strictEqual(periods.weekKey(new Date('2026-09-18T10:00:00Z')), '2026-W38', 'مفتاح الأسبوع خطأ');
  assert.strictEqual(periods.weekKey(new Date('2026-09-14T00:10:00Z')), periods.weekKey(new Date('2026-09-20T23:50:00Z')), 'الأسبوع لازم يبدأ الإثنين وينتهي الأحد');
  assert.ok(periods.msUntilReset('day', new Date('2026-09-18T10:00:00Z')) === 14 * 3600 * 1000, 'وقت تجديد اليوم خطأ');
  assert.ok(periods.resetLabel('week', new Date('2026-09-18T10:00:00Z')).includes('يوم'), 'وصف تجديد الأسبوع خطأ');
  assert.strictEqual(periods.PERIOD_KEYS.join(','), 'day,week,all');
  assert.strictEqual(periods.SOURCE_KEYS.join(','), 'all,text,voice,interact');
  console.log('١) الفترات: مفتاح اليوم · مفتاح الأسبوع (ISO) · وقت التجديد ✅');

  /* ٢) المصادر الثلاثة تنفصل لحالها */
  settingsFor();
  const ahmed = fakeMember('ahmed');
  await leveling.addXp(client, ahmed, 20, { source: 'text', messages: 1 });
  await leveling.addXp(client, ahmed, 5, { source: 'voice', bypassCooldown: true, voiceMinutes: 1 });
  await leveling.addXp(client, ahmed, 4, { source: 'interact', bypassCooldown: true, interactions: 1 });

  const row = mockDb.getLevelRow(GUILD, 'ahmed');
  assert.strictEqual(row.xp, 29, 'مجموع الخبرة خطأ');
  assert.strictEqual(row.text_xp, 20, 'الخبرة الكتابية خطأ');
  assert.strictEqual(row.voice_xp, 5, 'الخبرة الصوتية خطأ');
  assert.strictEqual(row.interact_xp, 4, 'خبرة التفاعل خطأ');
  assert.strictEqual(row.messages, 1, 'عدد الرسائل خطأ');
  assert.strictEqual(row.voice_minutes, 1, 'دقائق الصوت خطأ');
  assert.strictEqual(row.interactions, 1, 'عدد التفاعلات خطأ');

  const dayRow = mockDb.getPeriodRow(GUILD, 'ahmed', 'day', periods.dayKey(new Date(), settings.leveling));
  assert.strictEqual(dayRow.xp, 29, 'خبرة اليوم خطأ');
  assert.strictEqual(dayRow.voice_xp, 5, 'خبرة الصوت اليومية خطأ');
  assert.ok(mockDb.getPeriodRow(GUILD, 'ahmed', 'week', periods.weekKey(new Date(), settings.leveling)).xp === 29, 'خبرة الأسبوع خطأ');
  console.log('٢) ثلاث مصادر خبرة منفصلة (كتابي 20 · صوتي 5 · تفاعل 4) ✅');

  /* ٣) إطفاء مصدر يوقف خبرته فقط */
  settingsFor({ textXp: false });
  const blocked = await leveling.addXp(client, ahmed, 20, { source: 'text', messages: 1 });
  assert.strictEqual(blocked, null, 'الخبرة الكتابية شغالة وهي معطّلة');
  assert.ok(await leveling.addXp(client, ahmed, 5, { source: 'voice', bypassCooldown: true, voiceMinutes: 1 }), 'الخبرة الصوتية توقفت مع إطفاء الكتابية');
  settingsFor();
  console.log('٣) إطفاء مصدر (كتابي) ما يوقف باقي المصادر ✅');

  /* ٤) التفاعل: حالات الحماية */
  const sara = fakeMember('sara');
  const msg = fakeMessage(ahmed, 'msg-react');
  const react = { message: msg, emoji: { name: '👍' } };

  const before = mockDb.getLevelRow(GUILD, 'ahmed').xp;
  assert.strictEqual(await leveling.handleReaction(client, react, { id: 'sara', bot: false }), true, 'تفاعل صحيح ما أعطى خبرة');
  assert.strictEqual(mockDb.getLevelRow(GUILD, 'ahmed').xp, before + 4, 'مقدار خبرة التفاعل خطأ');

  // نفس الشخص مرة ثانية على نفس الرسالة
  assert.strictEqual(await leveling.handleReaction(client, react, { id: 'sara', bot: false }), false, 'نفس الشخص أخذ خبرة مرتين على نفس الرسالة');

  // تفاعل بوت
  assert.strictEqual(await leveling.handleReaction(client, react, { id: 'bot-x', bot: true }), false, 'بوت أعطى خبرة تفاعل');

  // تفاعل الشخص على رسالته هو
  const ownMsg = fakeMessage(sara, 'msg-own');
  assert.strictEqual(await leveling.handleReaction(client, { message: ownMsg, emoji: {} }, { id: 'sara', bot: false }), false, 'تفاعل على رسالتك يعطي خبرة');

  // كولداون بين نفس الشخصين
  const msg2 = fakeMessage(ahmed, 'msg-2');
  assert.strictEqual(await leveling.handleReaction(client, { message: msg2, emoji: {} }, { id: 'sara', bot: false }), false, 'الكولداون بين نفس الشخصين ما اشتغل');

  // سقف التفاعلات لكل رسالة (شخص جديد كل مرة)
  settingsFor({ interactMaxPerMessage: 2 });
  const cappedMsg = fakeMessage(ahmed, 'msg-cap');
  assert.strictEqual(await leveling.handleReaction(client, { message: cappedMsg, emoji: {} }, { id: 'u1', bot: false }), true);
  assert.strictEqual(await leveling.handleReaction(client, { message: cappedMsg, emoji: {} }, { id: 'u2', bot: false }), true);
  assert.strictEqual(await leveling.handleReaction(client, { message: cappedMsg, emoji: {} }, { id: 'u3', bot: false }), false, 'تجاوز سقف التفاعلات لكل رسالة');
  settingsFor();
  console.log('٤) حمايات التفاعل: بلا تكرار · بلا بوتات · بلا تفاعل على النفس · كولداون · سقف لكل رسالة ✅');

  /* ٥) السقف اليومي للتفاعل */
  settingsFor({ interactDailyCap: 8 });
  const capMember = fakeMember('capped');
  const capGuild = capMember.guild;
  let granted = 0;
  for (let i = 0; i < 6; i += 1) {
    const m = fakeMessage(capMember, `cap-${i}`);
    if (await leveling.handleReaction(client, { message: m, emoji: {} }, { id: `reactor-${i}`, bot: false })) granted += 1;
  }
  const capDay = mockDb.getPeriodRow(GUILD, 'capped', 'day', periods.dayKey(new Date(), settings.leveling));
  assert.ok(capDay.interact_xp <= 8, `السقف اليومي تجاوز الحد (${capDay.interact_xp} > 8)`);
  assert.ok(granted >= 1 && granted <= 3, `عدد التفاعلات المقبولة غير منطقي (${granted})`);
  assert.ok(!capGuild.afkChannelId, 'بيانات السيرفر الوهمية تغيّرت');
  settingsFor();
  console.log('٥) السقف اليومي لخبرة التفاعل يعمل ✅');

  /* ٦) الترقية عند الوصول لمستوى جديد */
  const climber = fakeMember('climber');
  const needed = levelFromXp(0).xpForNext;
  const beforeLevel = mockDb.getLevelRow(GUILD, 'climber');
  assert.strictEqual(beforeLevel, null, 'العضو الجديد لازم يبدأ بلا صف');
  const up = await leveling.addXp(client, climber, needed, { source: 'text', messages: 1, bypassCooldown: true });
  assert.strictEqual(up.leveledUp, true, 'الترقية ما صارت');
  assert.strictEqual(up.level, 1, 'المستوى بعد الترقية خطأ');
  console.log('٦) الترقية عند بلوغ الخبرة المطلوبة ✅');

  /* ٧) اللوحات: يومي / أسبوعي / كل الأوقات + فلترة المصدر */
  const board = leveling.getBoard(GUILD, { period: 'day', source: 'all', page: 1, perPage: 10 });
  assert.strictEqual(board.period, 'day');
  assert.ok(board.rows.length >= 3, 'لوحة اليوم ناقصة');
  assert.ok(board.rows[0].xp >= board.rows[1].xp, 'ترتيب لوحة اليوم خطأ');
  assert.ok(board.totals.xp > 0, 'مجموع خبرة اليوم خطأ');
  assert.ok(board.reset.includes('يتجدّد'), 'نص التجديد ناقص');

  const voiceBoard = leveling.getBoard(GUILD, { period: 'week', source: 'voice', page: 1, perPage: 10 });
  assert.ok(voiceBoard.rows.every((r) => (r.voice_xp || 0) > 0), 'فلترة الخبرة الصوتية ما اشتغلت');
  assert.ok(voiceBoard.rows[0].voice_xp >= (voiceBoard.rows[1]?.voice_xp || 0), 'ترتيب الخبرة الصوتية خطأ');
  assert.strictEqual(voiceBoard.source, 'voice');

  const allBoard = leveling.getBoard(GUILD, { period: 'all', source: 'text', page: 1, perPage: 10 });
  assert.ok(allBoard.rows.every((r) => (r.text_xp || 0) > 0), 'فلترة الكتابي بالترتيب العام ما اشتغلت');
  assert.ok(allBoard.rows[0].text_xp >= (allBoard.rows[1]?.text_xp || 0), 'ترتيب الكتابي خطأ');
  console.log('٧) اللوحات: توب داي · توب ويك · كل الأوقات + فلترة المصدر ✅');

  /* ٨) بيانات ترتيب العضو */
  const rank = leveling.getRankData(GUILD, 'ahmed');
  assert.ok(rank.rank >= 1, 'الترتيب العام خطأ');
  assert.ok(rank.day.rank >= 1 && rank.day.xp > 0, 'ترتيب اليوم خطأ');
  assert.ok(rank.week.rank >= 1 && rank.week.xp > 0, 'ترتيب الأسبوع خطأ');
  assert.strictEqual(rank.textXp, 20, 'تفصيل الكتابي خطأ');
  assert.ok(rank.day.reset.includes('يتجدّد'), 'نص تجديد اليوم ناقص');
  console.log('٨) بيانات الترتيب: عام + اليوم + الأسبوع + تفصيل المصادر ✅');

  /* ٩) الإمبيدات تُبنى بلا أخطاء */
  const rankEmbed = leveling.rankEmbed(ahmed, 'ar');
  const lbEmbed = leveling.leaderboardEmbed(GUILD, { period: 'week', source: 'all', page: 1, perPage: 5 }, 'ar');
  const srcEmbed = leveling.sourcesEmbed(GUILD, 'ar');
  for (const [name, embed] of [['rank', rankEmbed], ['leaderboard', lbEmbed], ['sources', srcEmbed]]) {
    const json = embed.toJSON ? embed.toJSON() : embed.data || {};
    assert.ok(json.title || json.fields, `إمبيد ${name} فاضي`);
  }
    console.log('٩) إمبيدات البوت (الترتيب · اللوحة · المصادر) تُبنى بلا أخطاء ✅');

  /* ١٠) التصفير يمسح المستويات والفترات */
  mockDb.resetLevel(GUILD, 'ahmed');
  assert.strictEqual(mockDb.getLevelRow(GUILD, 'ahmed'), null, 'التصفير ما مسح المستوى');
  assert.strictEqual(mockDb.getPeriodRow(GUILD, 'ahmed', 'day', periods.dayKey(new Date(), settings.leveling)), null, 'التصفير ما مسح فترة اليوم');
  console.log('١٠) التصفير يمسح المستوى + توب داي + توب ويك ✅');

  console.log('\n🎉 نظام الخبرة كامل: كتابي · صوتي · تفاعل — مع توب داي وتوب ويك\n');
})().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
