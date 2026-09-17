'use strict';

/**
 * handlers/events.js
 * -------------------------------------------------------------
 * تحميل كل ملفات الأحداث من مجلد events/.
 * كل ملف يُصدّر: { name, once?, execute(client, ...args) }
 * -------------------------------------------------------------
 */

const path = require('node:path');
const { walk } = require('./commands');

const eventsPath = path.join(__dirname, '..', 'events');

function loadEvents(client) {
  const files = walk(eventsPath);
  let loaded = 0;
  const problems = [];

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const exported = require(file);
      // الملف يمكن أن يُصدّر حدثًا واحدًا أو مصفوفة أحداث
      const events = Array.isArray(exported) ? exported : [exported];

      for (const event of events) {
        if (!event?.name || typeof event.execute !== 'function') {
          problems.push(`${path.relative(eventsPath, file)} — ينقصه name أو execute`);
          continue;
        }

        const handler = (...args) => {
          Promise.resolve(event.execute(client, ...args)).catch((err) => {
            client.errorCount += 1;
            console.error(`❌ خطأ داخل الحدث ${event.name}:`, err);
          });
        };

        if (event.once) client.once(event.name, handler);
        else client.on(event.name, handler);

        loaded += 1;
      }
    } catch (err) {
      problems.push(`${path.relative(eventsPath, file)} — ${err.message}`);
    }
  }

  console.log(`🔔 تم تحميل ${loaded} حدث`);
  if (problems.length) problems.forEach((p) => console.warn(`   • ${p}`));
  return { loaded, problems };
}

module.exports = { loadEvents };
