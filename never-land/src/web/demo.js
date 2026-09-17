'use strict';

/**
 * web/demo.js
 * -------------------------------------------------------------
 * بيانات تجريبية لوضع المعاينة (DEMO_MODE):
 * تملأ قاعدة البيانات بسيرفر وهمي + حالات + تذاكر + مستويات
 * حتى تستطيع تجربة لوحة التحكم كاملة بدون ربط البوت.
 * -------------------------------------------------------------
 */

const db = require('../database');

const DEMO_GUILD_ID = '100000000000000001';

/* قنوات السيرفر ورتبه (تُحفظ كلقطة مزامنة حتى تظهر القوائم المنسدلة بأسماء حقيقية) */
const DEMO_CHANNELS = [
  { id: '100000000000000030', name: 'التذاكر', type: 4, parentId: null, position: 0 },
  { id: '100000000000000010', name: 'الترحيب', type: 0, parentId: null, position: 1 },
  { id: '100000000000000011', name: 'الوداع', type: 0, parentId: null, position: 2 },
  { id: '100000000000000012', name: 'الدعم', type: 0, parentId: null, position: 3 },
  { id: '100000000000000013', name: 'السجلات', type: 0, parentId: null, position: 4 },
  { id: '100000000000000014', name: 'عام', type: 0, parentId: null, position: 5 },
  { id: '100000000000000015', name: 'الخط-الفاصل', type: 0, parentId: null, position: 6 },
  { id: '100000000000000016', name: 'التفاعل', type: 0, parentId: null, position: 7 },
  { id: '100000000000000017', name: 'صوتي عام', type: 2, parentId: null, position: 8 },
];

const DEMO_ROLES = [
  { id: '100000000000000031', name: 'الإدارة', color: '#5865f2', position: 10, managed: false, hoist: true },
  { id: '100000000000000032', name: 'الدعم', color: '#57f287', position: 9, managed: false, hoist: true },
  { id: '100000000000000022', name: 'نشِط', color: '#fee75c', position: 5, managed: false, hoist: false },
  { id: '100000000000000023', name: 'متفاعل', color: '#eb459e', position: 4, managed: false, hoist: false },
  { id: '100000000000000024', name: 'أسطورة', color: '#ed4245', position: 3, managed: false, hoist: false },
  { id: '100000000000000021', name: 'عضو جديد', color: '#99aab5', position: 2, managed: false, hoist: false },
  { id: '100000000000000020', name: 'محصّن', color: '#3ba55d', position: 1, managed: false, hoist: false },
];

const DEMO_META = {
  guilds: [
    {
      id: DEMO_GUILD_ID,
      name: 'مجتمع Never Land',
      icon: null,
      memberCount: 4820,
      ownerName: 'Never Land',
      botPresent: true,
    },
  ],
};

function seed() {
  db.init();

  // لقطة مزامنة للعرض: تجعل القوائم المنسدلة والبطاقات تعرض أسماء قنوات/رتب حقيقية
  try {
    const sync = require('../sync');
    const g = DEMO_META.guilds[0];
    sync.saveSnapshot({
      id: g.id,
      name: g.name,
      icon: null,
      memberCount: g.memberCount,
      ownerId: null,
      ownerName: g.ownerName,
      createdAt: Date.now() - 210 * 24 * 3600 * 1000,
      channels: DEMO_CHANNELS,
      roles: DEMO_ROLES,
      emojis: [],
      syncedAt: Date.now(),
      source: 'demo',
    });
  } catch { /* المزامنة اختيارية */ }

  const existing = db.getGuild(DEMO_GUILD_ID);
  if (existing && existing.settings?.welcome?.channelId) return; // ممنوح مسبقًا

  db.updateGuildSettings(DEMO_GUILD_ID, {
    language: 'ar',
    staffApplication: {
      enabled: true,
      reviewChannelId: '100000000000000013',
      pingRoleIds: ['100000000000000031'],
      onAccept: {
        moveToCategoryId: '100000000000000030',
        addRoleIds: ['100000000000000031'],
      },
    },
    welcome: {
      enabled: true,
      channelId: '100000000000000010',
      message: 'أهلاً بك {user} في **{server}**، أنت العضو رقم **{memberCount}**.',
      embed: true,
      dm: true,
      imageMode: 'card',
      avatarThumbnail: true,
      attachImage: true,
      cardTheme: { from: '#5865f2', to: '#2b2f6b', accent: '#ffffff' },
    },
    autoline: {
      enabled: true,
      channels: ['100000000000000014', '100000000000000015'],
      line: '─'.repeat(24),
      deletePrevious: true,
      deleteAfter: 0,
      deleteLineWithMessage: true,
    },
    autoreact: {
      enabled: true,
      channels: ['100000000000000016'],
      emojis: ['👍', '🔥'],
      words: [
        { word: 'ترحيب', emoji: '👋' },
        { word: 'مبروك', emoji: '🎉' },
      ],
      ignoreBots: true,
    },
    leave: { enabled: true, channelId: '100000000000000011', message: 'غادر {user} السيرفر.' },
    boost: { enabled: true, channelId: '100000000000000012' },
    logs: {
      enabled: true,
      channelId: '100000000000000013',
      events: {
        messageDelete: true, messageEdit: true, memberJoin: true, memberLeave: true,
        memberBan: true, memberUnban: true, memberUpdate: true, channelCreate: true,
        channelDelete: true, roleCreate: true, roleDelete: true, voiceJoin: false,
        voiceLeave: false, modActions: true,
      },
    },
    automod: {
      enabled: true,
      antiSpam: true,
      spamMessages: 5,
      spamIntervalSeconds: 4,
      antiLink: true,
      antiInvite: true,
      antiEveryone: true,
      antiCaps: false,
      antiMentionSpam: true,
      bannedWords: ['كلمة_ممنوعة', 'spam', 'اشتراك مقابل'],
      punishment: 'timeout',
      timeoutMinutes: 15,
      whitelistChannels: ['100000000000000014'],
      whitelistRoles: ['100000000000000020'],
    },
    autorole: { enabled: true, roleIds: ['100000000000000021'], botRoleIds: [] },
    leveling: {
      enabled: true,
      minXp: 15,
      maxXp: 25,
      cooldownSeconds: 45,
      voiceXp: true,
      announceChannelId: '100000000000000010',
      rewards: [
        { level: 5, roleId: '100000000000000022' },
        { level: 10, roleId: '100000000000000023' },
        { level: 25, roleId: '100000000000000024' },
      ],
    },
    tickets: {
      enabled: true,
      categoryId: '100000000000000030',
      supportRoleIds: ['100000000000000031', '100000000000000032'],
      logChannelId: '100000000000000013',
      panelMode: 'buttons',
      panelSeparateInfo: true,
      panelFooter: 'Never Land • فريق الدعم جاهز لمساعدتك',
      types: require('../config').defaults.tickets.types,
    },
    moderation: { warnThreshold: 3, warnAction: 'timeout' },
  });

  // حالات تجريبية
  const types = ['warn', 'warn', 'warn', 'ban', 'kick', 'timeout', 'unban', 'timeout'];
  types.forEach((type, i) => {
    db.addCase({
      guildId: DEMO_GUILD_ID,
      type,
      userId: `20000000000000000${i}`,
      userTag: `member_${i}#000${i}`,
      moderatorId: '300000000000000001',
      moderatorTag: 'Admin#0001',
      reason: ['مخالفة القوانين', 'سبام في الشات', 'إساءة للأعضاء', 'نشر روابط', 'تجاهل تحذيرات'][i % 5],
      duration: type === 'timeout' ? 600000 : null,
    });
  });

  // تذاكر تجريبية
  ['open', 'open', 'closed', 'closed', 'closed'].forEach((status, i) => {
    const ticket = db.createTicket({
      guildId: DEMO_GUILD_ID,
      channelId: `40000000000000000${i}`,
      userId: `20000000000000001${i}`,
      type: ['support', 'verify', 'gift', 'staff'][i % 4],
    });
    if (status === 'closed') db.updateTicket(ticket.id, { status: 'closed', closed_at: Date.now() - i * 3600000 });
    if (i === 0) db.updateTicket(ticket.id, { claimed_by: '300000000000000001' });
  });

  // مستويات تجريبية
  const names = ['Omar', 'Sara', 'Youssef', 'Lina', 'Khalid', 'Nour', 'Adam', 'Maya', 'Zaid', 'Hana'];
  names.forEach((_, i) => {
    const xp = Math.round(24000 / (i + 1)) + Math.round(Math.random() * 500);
    let level = 0;
    let rest = xp;
    while (level < 500 && rest >= 5 * level * level + 50 * level + 100) {
      rest -= 5 * level * level + 50 * level + 100;
      level += 1;
    }
    db.upsertLevel(DEMO_GUILD_ID, `2000000000000000${10 + i}`, {
      xp,
      level,
      messages: 1200 - i * 90,
      voiceMinutes: 800 - i * 55,
      lastXpAt: Date.now() - i * 60000,
    });
  });

  // إحصائيات يومية لآخر 14 يومًا (للرسم البياني في لوحة التحكم)
  for (let i = 13; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    db.setDaily(DEMO_GUILD_ID, day, {
      messages: 380 + Math.round(Math.random() * 820),
      joins: 4 + Math.round(Math.random() * 26),
      leaves: 2 + Math.round(Math.random() * 11),
    });
  }

  console.log('[تهيئة] تم تحضير بيانات السيرفر الافتراضي (مجتمع Never Land).');
}

/**
 * إزالة بيانات العرض: تُنادى تلقائيًا عند ربط توكن Discord حقيقي
 * حتى لا تختلط بيانات العرض بسيرفراتك الفعلية.
 */
function cleanup() {
  try {
    require('../sync').removeSnapshot(DEMO_GUILD_ID);
  } catch { /* تجاهل */ }
  try {
    db.deleteGuild?.(DEMO_GUILD_ID);
  } catch { /* تجاهل */ }
  console.log('[تهيئة] أُزيلت بيانات العرض — الموقع يعرض سيرفراتك الحقيقية فقط.');
}

module.exports = { seed, cleanup, DEMO_GUILD_ID, DEMO_META };
