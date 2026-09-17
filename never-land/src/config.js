'use strict';

/**
 * config.js
 * -------------------------------------------------------------
 * تحميل الإعدادات من ملف .env + قيم افتراضية آمنة.
 * كل باقي المشروع يقرأ الإعدادات من هنا فقط.
 * -------------------------------------------------------------
 */

require('dotenv').config();

const path = require('node:path');

/** تحويل نص إلى قيمة منطقية */
const bool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'نعم'].includes(String(v).trim().toLowerCase());
};

/** تحويل نص إلى رقم صحيح */
const int = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

/** تحويل نص مفصول بفواصل إلى مصفوفة */
const list = (v) => String(v ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const root = path.resolve(__dirname, '..');

const config = {
  root,

  bot: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    defaultLanguage: (process.env.DEFAULT_LANGUAGE || 'ar').trim().toLowerCase().startsWith('en') ? 'en' : 'ar',
    developerIds: list(process.env.DEVELOPER_IDS),
    resetCommands: bool(process.env.RESET_COMMANDS, false),
    /** ألوان embeddings */
    colors: {
      primary: 0x5865f2,
      success: 0x57f287,
      warning: 0xfee75c,
      danger: 0xed4245,
      neutral: 0x2b2d31,
      info: 0x00b0f4,
    },
  },

  web: {
    enabled: true,
    /** الاسم الذي يظهر في الموقع وكل الصفحات */
    siteName: process.env.SITE_NAME || 'Never Land',
    demoMode: bool(process.env.DEMO_MODE, false),
    /** المنفذ: DASHBOARD_PORT أو PORT (تُضبط تلقائيًا في Railway/Render/Heroku) */
    port: int(process.env.DASHBOARD_PORT || process.env.PORT, 3000),
    /**
     * الرابط العام: DASHBOARD_URL، أو نطاق Railway التلقائي، وإلا localhost.
     * يُستخدم في روابط OAuth والـ sitemap ووسوم og.
     */
    url: (
      process.env.DASHBOARD_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
      `http://localhost:${int(process.env.DASHBOARD_PORT || process.env.PORT, 3000)}`
    ).replace(/\/$/, ''),
    sessionSecret: process.env.SESSION_SECRET || 'never-land-change-me',
    /** رابط إضافة البوت (يُبنى تلقائيًا من CLIENT_ID إن لم يُحدّد) */
    inviteUrl: process.env.INVITE_URL || null,
  },

  database: {
    /** sqlite (افتراضي) أو json (بدون أي إعتماد خارجي) */
    driver: (process.env.DATABASE_DRIVER || 'sqlite').toLowerCase(),
    path: path.isAbsolute(process.env.DATABASE_PATH || '')
      ? process.env.DATABASE_PATH
      : path.join(root, process.env.DATABASE_PATH || 'data/neverland.db'),
  },

  /** قيم افتراضية لإعدادات كل سيرفر */
  defaults: {
    language: process.env.DEFAULT_LANGUAGE || 'ar',
    prefix: '!',
    welcome: {
      enabled: false,
      channelId: null,
      message: 'أهلاً بك {user} في **{server}**، عدد الأعضاء الآن **{memberCount}**.',
      embed: true,
      dm: false,
      dmMessage: 'أهلاً بك في **{server}**. يُرجى الاطلاع على قوانين السيرفر قبل المشاركة.',
      autoDeleteAfter: 0,
      /** صورة الترحيب: none | avatar | card | custom */
      imageMode: 'card',
      /** رابط صورة مخصّصة (عند imageMode = custom) أو خلفية للبطاقة */
      imageUrl: null,
      cardBackground: null,
      cardTheme: { from: '#5865f2', to: '#2b2f6b', accent: '#ffffff' },
      /** إرسال صورة الأفتار أيضًا كـ thumbnail في الـ embed */
      avatarThumbnail: true,
      /** إرسال الصورة كصورة مرفقة (attachment) بدل الرابط */
      attachImage: true,
    },
    leave: {
      enabled: false,
      channelId: null,
      message: 'غادر {user} السيرفر.',
    },
    boost: {
      enabled: false,
      channelId: null,
      message: 'شكرًا {user} على دعم السيرفر. المستوى الحالي {level}.',
    },
    logs: {
      enabled: false,
      channelId: null,
      /** كل الأحداث — كل حدث يُشغَّل/يُطفأ على حدة */
      events: {
        // --- الرسائل ---
        messageDelete: true,
        messageEdit: true,
        messageBulkDelete: true,
        // --- الأعضاء ---
        memberJoin: true,
        memberLeave: true,
        memberKick: true,
        memberBan: true,
        memberUnban: true,
        memberTimeout: true,
        memberBoost: true,
        memberRoleUpdate: true,
        memberNickname: true,
        memberAvatar: true,
        memberUsername: true,
        // --- الرتب ---
        roleCreate: true,
        roleDelete: true,
        roleUpdate: true,
        // --- القنوات ---
        channelCreate: true,
        channelDelete: true,
        channelUpdate: true,
        channelPermissions: true,
        // --- السيرفر ---
        serverUpdate: true,
        emojiCreate: true,
        emojiDelete: true,
        stickerCreate: true,
        stickerDelete: true,
        // --- الدعوات ---
        inviteCreate: true,
        inviteDelete: false,
        // --- المواضيع (Threads) ---
        threadCreate: false,
        threadDelete: false,
        // --- الصوت ---
        voiceJoin: false,
        voiceLeave: false,
        voiceMove: false,
        voiceMute: false,
        voiceDeafen: false,
        // --- الأنظمة ---
        modActions: true,
        automod: true,
        ticket: true,
      },
      /** تجاهل القنوات/الرتب في اللوقات */
      ignoredChannels: [],
      ignoredRoles: [],
    },
    /** خط فاصل تلقائي بعد كل رسالة (AutoLine) */
    autoline: {
      enabled: false,
      channels: [],
      line: '─'.repeat(24),
      color: null,        // null = بدون لون، أو hex مثل '#5865f2'
      deletePrevious: true, // حذف الخط السابق عند وصول رسالة جديدة
      deleteAfter: 0,      // حذف الخط بعد X ثانية (0 = بدون)
      deleteLineWithMessage: true, // حذف الخط عند حذف الرسالة التي بعده
    },
    /** تفاعلات تلقائية (AutoReaction) — إيموجيات تُضاف تلقائيًا لرسائل القنوات */
    autoreact: {
      enabled: false,
      channels: [],        // قنوات يتم التفاعل على كل رسالة فيها
      emojis: ['👍'],      // يدعم الإيموجيات الخارجية <:name:id>
      /** تفاعل عند احتواء الرسالة على كلمة معيّنة: [{ word: 'ترحيب', emoji: '👋' }] */
      words: [],
      ignoreBots: true,
    },
    /** الرتب التلقائية (Autorole) — تُعطى تلقائيًا لكل عضو جديد */
    autorole: {
      enabled: false,
      roleIds: [],      // رتب تُعطى للأعضاء
      botRoleIds: [],   // رتب تُعطى للبوتات
    },
    automod: {
      enabled: true,
      antiSpam: true,
      spamMessages: 6,
      spamIntervalSeconds: 5,
      antiLink: false,
      antiInvite: true,
      antiEveryone: true,
      antiCaps: false,
      capsPercent: 70,
      antiMentionSpam: true,
      mentionLimit: 5,
      bannedWords: [],
      whitelistChannels: [],
      whitelistRoles: [],
      whitelistDomains: ['tenor.com', 'giphy.com'],
      punishment: 'delete', // delete | warn | timeout | kick | ban
      timeoutMinutes: 10,
      // مكافحة الهجمات (Anti-Raid)
      antiRaid: true,
      raidThreshold: 10,
      raidWindowSeconds: 60,
      raidAction: 'alert', // alert | kick
      raidMinAccountAgeDays: 7,
    },
    moderation: {
      /** عند تجاوز عدد التحذيرات المحدّد تُطبق عقوبة تلقائية */
      warnThreshold: 0, // 0 = معطّل
      warnAction: 'none', // none | timeout | kick | ban
    },
    reports: {
      channelId: null,
    },
    leveling: {
      enabled: false,
      minXp: 15,
      maxXp: 25,
      cooldownSeconds: 60,
      announceChannelId: null,
      levelUpMessage: 'وصل {user} إلى المستوى **{level}**.',
      rewards: [], // [{level: 5, roleId: '...'}]
      voiceXp: false,
      voiceMinXp: 5,
      voiceMaxXp: 10,
      ignoredChannels: [],
      ignoredRoles: [],
      silent: false,
    },
    tickets: {
      enabled: false,
      categoryId: null,
      supportRoleIds: [],
      logChannelId: null,
      panelTitle: 'مركز الدعم',
      panelDescription: 'اختر نوع التذكرة من القائمة بالأسفل وسيتم فتح غرفة خاصة لك.',
      panelFooter: 'Never Land — فريق الدعم',
      responseTime: '24 ساعة',
      /** select = قائمة منسدلة • buttons = أزرار (حتى 5 أنواع) */
      panelMode: 'buttons',
      /** إرسال رسالة البنل كـ embed منفصل + رسالة تعليمات */
      panelSeparateInfo: true,
      panelInfoMessage: '**كيف أحصل على الدعم؟**\nاختر نوع الطلب من الأزرار أدناه، وسيُفتح لك روم خاص مع فريق الدعم.',
      /** الأنواع الأربعة الأساسية (دعم فني • توثيق • هدايا • تقديم إدارة) */
      types: [
        {
          id: 'support',
          label: 'الدعم الفني',
          emoji: '🛠️',
          description: 'مشكلة تقنية أو استفسار عن البوت والسيرفر',
          intro: 'اكتب مشكلتك بالتفصيل (وصف المشكلة • متى حدثت • أي صور إن وُجدت) وسيساعدك فريق الدعم الفني.',
          buttonStyle: 'Primary',
        },
        {
          id: 'verify',
          label: 'التوثيق',
          emoji: '✅',
          description: 'طلب توثيق حساب أو رتبة موثّق',
          intro: 'لطلب التوثيق أرسل: من أنت • لماذا تطلب التوثيق • روابط حساباتك الرسمية.',
          buttonStyle: 'Success',
        },
        {
          id: 'gift',
          label: 'الهدايا',
          emoji: '🎁',
          description: 'استلام جائزة أو مشكلة في هدية/سحب',
          intro: 'اذكر اسم السحب/الهدية ورقم الرسالة وصورة من الفوز إن وُجدت.',
          buttonStyle: 'Secondary',
        },
        {
          id: 'staff',
          label: 'تقديم إدارة',
          emoji: '📋',
          description: 'تقديم طلب للانضمام لفريق الإدارة',
          intro: 'اضغط زر «تعبئة النموذج» أدناه، ثم املأ الخانات، وسيصل طلبك إلى الإدارة تلقائيًا.',
          buttonStyle: 'Danger',
        },
      ],
      maxOpenPerUser: 3,
      transcriptOnClose: true,
    },
    /**
     * نظام تقديم الإدارة (Application) — مرتبط بنوع تذكرة "تقديم إدارة"
     * عند فتح تذكرة تقديم إدارة: يُرسل البوت رسالة فيها زر يفتح **نموذج (Modal)** من 5 خانات،
     * وبعد تعبئته تُرسَل الإجابات لقناة مراجعة الإدارة مع زرّي ✅ قبول / ❌ رفض.
     */
    staffApplication: {
      enabled: true,
      /** أنواع التذاكر التي تُفعّل فيها الاستمارة (أو ضع application:true داخل النوع) */
      onlyForTypes: ['staff'],
      /** قناة مراجعة الطلبات (إن كانت null تُستخدم قناة سجلات التذاكر) */
      reviewChannelId: null,
      /** رتب تُنَبَّه عند وصول طلب جديد */
      pingRoleIds: [],
      formTitle: 'نموذج تقديم الإدارة',
      formIntro:
        'عبّئ الخانات أدناه بدقة، وسيصل رد الإدارة إلى بريدك الخاص.' + '\n\n' + '> التقديم الناقص أو غير الدقيق يُرفض.',
      formButtonLabel: 'تعبئة النموذج',
      resendButtonLabel: 'إعادة إرسال النموذج',
      /** الحقول الخمسة (أقصى حد مسموح في Discord = 5) */
      fields: [
        {
          id: 'name_age',
          label: 'الاسم والعمر',
          placeholder: 'مثال: أحمد — 18',
          style: 'short',
          required: true,
          maxLength: 100,
        },
        {
          id: 'country',
          label: 'من أي بلد أنت؟',
          placeholder: 'مثال: المغرب',
          style: 'short',
          required: true,
          maxLength: 60,
        },
        {
          id: 'prev_servers',
          label: 'سيرفرات كنت فيها إدارياً؟',
          placeholder: 'اذكر أسماء السيرفرات وعدد الأعضاء ورتبتك فيها',
          style: 'paragraph',
          required: true,
          maxLength: 700,
        },
        {
          id: 'mic',
          label: 'هل تقدر تفتح مايك؟',
          placeholder: 'نعم / لا — مع ذكر الوقت المتاح يوميًا',
          style: 'short',
          required: true,
          maxLength: 200,
        },
        {
          id: 'logo_link',
          label: 'هل تقدر تحط شعار ورابط؟',
          placeholder: 'مثال: نعم — الشعار جاهز والرابط: https://...',
          style: 'short',
          required: true,
          maxLength: 300,
        },
      ],
      /** حقل يُستخرج منه الاسم لإعادة تسمية التذكرة عند القبول */
      nameFieldId: 'name_age',
      /** رسائل النتيجة */
      acceptMessage:
        'تم قبول طلبك للانضمام إلى فريق الإدارة.' + '\n' + 'سيتواصل معك أحد المسؤولين لبدء التدريب.',
      rejectMessage:
        'نُشكر لك اهتمامك بالتقديم، ولم يتم قبول طلبك في هذه المرة.' + '\n' + 'يمكنك إعادة التقديم لاحقًا.',
      /** سؤال سبب الرفض قبل الإرسال */
      askRejectReason: true,
      /** إعدادات القبول */
      onAccept: {
        postInTicket: '{user} تم قبول عرضك، وسُجّلت تذكرتك في ملف الإدارة برقم **#{number}**.',
        dmApplicant: true,
        renameChannel: true,
        /** {name} = اسم المتقدّم • {number} = رقم الطلب • {ticket} = رقم التذكرة */
        channelNameFormat: 'إدارة-{number}-{name}',
        /** نقل التذكرة إلى قسم "تكتات الإدارة" */
        moveToCategoryId: null,
        addRoleIds: [],
        pingApplicant: true,
      },
      /** إعدادات الرفض */
      onReject: {
        postInTicket: '{user} تم رفض تقديمك، ويمكنك إعادة المحاولة لاحقًا.',
        dmApplicant: true,
        closeTicket: false,
      },
    },
    selfRoles: {
      enabled: false,
      panels: [], // [{channelId, messageId, title, options:[{roleId,label,emoji}]}]
    },
    referral: {
      enabled: false,
      channelId: null,
    },
  },
};

/** رابط إضافة البوت (مع صلاحيات Administrator + أوامر السلاش) */
config.web.inviteUrl =
  config.web.inviteUrl ||
  (/^\d{17,20}$/.test(String(config.bot.clientId || ''))
    ? `https://discord.com/oauth2/authorize?client_id=${config.bot.clientId}&permissions=8&scope=bot%20applications.commands`
    : '#');

/** فحص الإعدادات الأساسية وإرجاع قائمة بالمشاكل */
config.validate = () => {
  const problems = [];
  if (!config.bot.token) problems.push('DISCORD_TOKEN غير موجود في ملف .env');
  if (!config.bot.clientId) problems.push('CLIENT_ID غير موجود في ملف .env');
  if (config.web.enabled && !config.web.demoMode && config.web.sessionSecret.includes('change-me')) {
    problems.push('SESSION_SECRET افتراضي — غيّره قبل النشر على الإنترنت');
  }
  return problems;
};

config.isDev = () => config.bot.developerIds.length > 0;

module.exports = config;
