'use strict';
/**
 * help-test.js — يتأكد أن أمر /help يحمل زرًا حقيقيًا يفتح الموقع.
 *   node help-test.js
 */
const assert = require('node:assert');
const { Collection } = require('discord.js');
const config = require('./src/config');
const help = require('./src/commands/general/help');

const catalog = require('./src/data/commandCatalog');

/** عميل وهمي فيه أوامر بأقسام مختلفة (الجمهور يُقرأ من الكتالوج الحقيقي) */
function fakeClient() {
  const commands = new Collection();
  const add = (name, category, description = 'وصف تجريبي') => {
    commands.set(name, {
      data: { name, description, options: [] },
      category,
      cooldown: 3,
      audience: catalog.audienceOf(name),
    });
  };
  add('ban', 'moderation');
  add('kick', 'moderation');
  add('help', 'general');
  add('ping', 'general');
  add('tickets', 'config');
  add('remind', 'utility');
  return { commands };
}

/** عضو من الإدارة (يملك إدارة السيرفر) */
const staffMember = () => ({
  id: '1',
  guild: { ownerId: '9' },
  permissions: { has: (p) => p === 'ManageGuild' || p === 32n },
});

/** عضو عادي بلا أي صلاحية */
const plainMember = () => ({ id: '2', guild: { ownerId: '9' }, permissions: { has: () => false } });

/** تفاعل وهمي يلتقط ما تم إرساله */
function fakeInteraction() {
  const captured = { replies: [] };
  return {
    captured,
    member: staffMember(),
    options: { getString: () => null, getFocused: () => '' },
    reply: async (payload) => {
      captured.replies.push(payload);
      return payload;
    },
  };
}

function linkButtons(rows) {
  return rows
    .flatMap((r) => (r.components || []).map((c) => (typeof c.toJSON === 'function' ? c.toJSON() : c)))
    .filter((c) => c.style === 5)
    .map((c) => ({ label: c.label, url: c.url }));
}

(async () => {
  console.log('١) رابط الموقع في الإعدادات:', config.web.url);
  assert.ok(/^https?:\/\//i.test(config.web.url), 'رابط الموقع غير صالح');

  const client = fakeClient();
  const interaction = fakeInteraction();
  await help.run(client, interaction, 'ar');
  const payload = interaction.captured.replies[0];
  assert.ok(payload?.embeds?.length, 'لم يُرسل embed');

  const links = linkButtons(payload.components || []);
  console.log('٢) أزرار الروابط في /help:', links.map((l) => `${l.label} → ${l.url}`).join(' | '));
  assert.ok(links.length >= 2, 'أزرار الروابط ناقصة');
  assert.strictEqual(links[0].label, 'افتح الموقع');
  assert.strictEqual(links[0].url, config.web.url, 'رابط «افتح الموقع» غير مطابق');
  assert.strictEqual(links[1].label, 'لوحة التحكم');
  assert.strictEqual(links[1].url, `${config.web.url}/dashboard`.replace('//dashboard', '/dashboard'), 'رابط اللوحة غير مطابق');

  const desc = payload.embeds[0].data?.description || payload.embeds[0].description || '';
  console.log('٣) نص الرسالة يحتوي رابط الموقع:', desc.includes(config.web.url) ? '✅' : '❌');
  assert.ok(desc.includes(config.web.url), 'النص لا يحتوي الرابط');

  // ٤) تفاصيل أمر معيّن: زر الموقع موجود أيضًا
  const interaction2 = fakeInteraction();
  interaction2.options.getString = () => 'ban';
  await help.run(client, interaction2, 'ar');
  const links2 = linkButtons(interaction2.captured.replies[0].components || []);
  console.log('٤) تفاصيل /ban → أزرار:', links2.map((l) => l.label).join(' | '));
  assert.ok(links2.some((l) => l.label === 'افتح الموقع'), 'زر الموقع ناقص في تفاصيل الأمر');

  // ٥) لو الرابط غير مضبوط: ما نعرض زرًا مكسورًا
  const good = config.web.url;
  config.web.url = 'localhost:3000';
  const interaction3 = fakeInteraction();
  await help.run(fakeClient(), interaction3, 'ar');
  const links3 = linkButtons(interaction3.captured.replies[0].components || []);
  console.log('٥) رابط غير صالح → أزرار روابط:', links3.length, '(المتوقع 0)');
  assert.strictEqual(links3.length, 0, 'ظهر زر مكسور مع رابط غير صالح');
  const desc3 = interaction3.captured.replies[0].embeds[0].data?.description || '';
  assert.ok(desc3.includes('DASHBOARD_URL'), 'ما ظهر تنبيه بضبط الرابط');
  config.web.url = good;

  // ٦) العضو العادي: أوامر الإدارة مخفية عنه تمامًا
  const plain = fakeInteraction();
  plain.member = plainMember();
  await help.run(client, plain, 'ar');
  const visible = help.visibleCommands(client, plain.member).map((c) => c.data.name).sort();
  console.log('٦) العضو العادي يشوف:', visible.join(' · '));
  assert.deepStrictEqual(visible, ['help', 'ping', 'remind'], 'قائمة أوامر العضو غير صحيحة (لازم بلا ban/kick/tickets)');

  const plainBan = fakeInteraction();
  plainBan.member = plainMember();
  plainBan.options.getString = () => 'ban';
  await help.run(client, plainBan, 'ar');
  const plainReply = plainBan.captured.replies[0];
  console.log('٧) العضو العادي يطلب /help ban →', plainReply.content?.slice(0, 40));
  assert.ok(!plainReply.embeds?.length, 'العضو العادي شاف تفاصيل أمر إدارة!');
  assert.ok(/ما لقيت/.test(plainReply.content || ''), 'ما ظهر رد الرفض');

  // ٨) الإدارة تشوف كل شي: عدد الأوامر كامل + تفاصيل أمر الإدارة
  const staffList = help.visibleCommands(client, staffMember()).map((c) => c.data.name);
  console.log('٨) الإدارة تشوف:', staffList.length, 'أمر (ban موجود؟', staffList.includes('ban'), ')');
  assert.strictEqual(staffList.length, client.commands.size, 'الإدارة لازم تشوف كل الأوامر');

  // ٩) الكتالوج الحقيقي: ١٠ أوامر أعضاء + ١٩ أمر إدارة
  const memberNames = catalog.namesOf('member');
  const staffNames = catalog.namesOf('staff');
  console.log('٩) الكتالوج: أوامر الأعضاء', memberNames.length, '· أوامر الإدارة', staffNames.length);
  assert.strictEqual(memberNames.length, 10, 'عدد أوامر الأعضاء تغيّر');
  assert.strictEqual(staffNames.length, 19, 'عدد أوامر الإدارة تغيّر');
  assert.strictEqual(memberNames.length + staffNames.length, Object.keys(catalog.COMMANDS).length, 'أمر بلا تصنيف');

  console.log('\n🎉 أمر /help يحمل زرًا فعّالًا يفتح الموقع واللوحة · وأوامر الإدارة مخفية عن الأعضاء');
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
