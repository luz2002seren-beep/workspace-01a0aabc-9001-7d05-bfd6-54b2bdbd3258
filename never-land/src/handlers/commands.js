'use strict';

/**
 * handlers/commands.js
 * -------------------------------------------------------------
 * قراءة كل ملفات الأوامر من مجلد commands/ تسلسليًا وتحميلها في
 * client.commands. إضافة أمر جديد = إنشاء ملف فقط (بدون أي تسجيل يدوي).
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');

const commandsPath = path.join(__dirname, '..', 'commands');

/** قراءة كل ملفات .js داخل مجلد وكل مجلداته الفرعية */
function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

function loadCommands(client) {
  const files = walk(commandsPath);
  let loaded = 0;
  const problems = [];

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const command = require(file);
      const category = path.basename(path.dirname(file));

      if (!command?.data?.name || typeof command.run !== 'function') {
        problems.push(`${path.relative(commandsPath, file)} — ينقصه data أو run`);
        continue;
      }

      command.category = command.category || category;
      command.filePath = file;
      client.commands.set(command.data.name, command);
      loaded += 1;
    } catch (err) {
      problems.push(`${path.relative(commandsPath, file)} — ${err.message}`);
    }
  }

  console.log(`📦 تم تحميل ${loaded} أمر من ${files.length} ملف`);
  if (problems.length) {
    console.warn('⚠️  ملفات أوامر بها مشاكل:');
    problems.forEach((p) => console.warn(`   • ${p}`));
  }
  return { loaded, problems };
}

module.exports = { loadCommands, walk };
