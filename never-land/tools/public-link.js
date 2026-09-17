'use strict';

/**
 * public-link.js
 * -------------------------------------------------------------
 * ينشئ رابطًا عامًا مؤقتًا يعمل من أي جهاز (جوال/كمبيوتر) بدون حساب.
 *   npm run link:public            → ينشئ الرابط ويطبع
 *   npm run link:public -- --save  → يحفظ الرابط في .env (DASHBOARD_URL) أيضًا
 * الفكرة: نفق Cloudflare سريع (trycloudflare.com) يوجّه للبورت المحلي.
 * ملاحظة: هذا الرابط مؤقت وينتهي عند إغلاق البرنامج — للرابط الدائم انشر على
 * Railway (npm run deploy:railway) أو أي سيرفر.
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const os = require('node:os');
const config = require('../src/config');

const BIN = path.join(os.tmpdir(), 'cloudflared');
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const save = process.argv.includes('--save');

/** تنزيل cloudflared إن لم يكن موجودًا */
function ensureBinary() {
  if (fs.existsSync(BIN)) return BIN;
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
  console.log('[تنزيل] جارٍ تنزيل cloudflared (مرة واحدة)...');
  execFileSync('sh', ['-c', `curl -sL -o "${BIN}" "${url}" && chmod +x "${BIN}"`], { stdio: 'inherit' });
  return BIN;
}

/** تحديث DASHBOARD_URL في .env */
function saveUrl(url) {
  const envPath = path.join(config.root, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('[تنبيه] ما في ملف .env — ضع الرابط يدويًا في DASHBOARD_URL.');
    return;
  }
  let env = fs.readFileSync(envPath, 'utf8');
  if (/^DASHBOARD_URL=/m.test(env)) {
    env = env.replace(/^DASHBOARD_URL=.*$/m, `DASHBOARD_URL=${url}`);
  } else {
    env += `\nDASHBOARD_URL=${url}\n`;
  }
  fs.writeFileSync(envPath, env, 'utf8');
  console.log('[تم] حُفظ الرابط في .env (DASHBOARD_URL).');
  console.log('      أعد تشغيل المشروع ليستخدمه /help والصفحات.');
}

(async () => {
  const bin = ensureBinary();
  const port = config.web.port;

  console.log(`[نفق] جارٍ فتح رابط عام للمنفذ ${port}...`);
  const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let done = false;
  const onData = (buf) => {
    const text = buf.toString();
    const m = text.match(URL_RE);
    if (m && !done) {
      done = true;
      const url = m[0];
      console.log('');
      console.log('────────────────────────────────────────────────');
      console.log(`[تم] الرابط العام: ${url}`);
      console.log('────────────────────────────────────────────────');
      console.log('افتحه من أي جهاز (جوال/كمبيوتر) — طالما هذا الأمر شغّال.');
      console.log('ملاحظة: الرابط مؤقت ويتغيّر كل مرة. للرابط الدائم: npm run deploy:railway');
      console.log('لإيقاف النفق: Ctrl+C');
      console.log('');
      if (save) saveUrl(url);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('exit', (code) => {
    console.log(`[إيقاف] انتهى النفق (رمز ${code}).`);
    process.exit(code || 0);
  });

  const stop = () => { try { child.kill('SIGTERM'); } catch { /* تجاهل */ } process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // مهلة قصيرة: إن لم يظهر رابط خلال 90 ثانية نُبلّغ
  setTimeout(() => {
    if (!done) console.log('[تنبيه] تأخّر ظهور الرابط — تأكد من الاتصال بالإنترنت.');
  }, 90000);
})();
