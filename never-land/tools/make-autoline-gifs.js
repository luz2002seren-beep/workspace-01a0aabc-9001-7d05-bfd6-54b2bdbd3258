'use strict';

/**
 * tools/make-autoline-gifs.js
 * -------------------------------------------------------------
 * يُنتج خطوط الفصل المتحركة (GIF) الخاصة بنظام AutoLine.
 * تُحفظ في: assets/autoline/*.gif  ويستخدمها البوت مباشرة كصورة.
 *
 * التشغيل:  npm run make:gifs
 * المتطلبات: omggif (devDependency — للترميز فقط، لا يحتاجها التشغيل)
 *
 * الأنماط المُنتَجة:
 *   glow  → توهّج أبيض يمرّ على الخط (من اليمين لليسار — يناسب العربية)
 *   flow  → تدرّج لوني يتدفّق
 *   pulse → نبض إضاءة هادئ
 *   dash  → شرطات تتحرّك
 * -------------------------------------------------------------
 */

const fs = require('node:fs');
const path = require('node:path');

let GifWriter;
try {
  ({ GifWriter } = require('omggif'));
} catch {
  console.error('[خطأ] مكتبة omggif غير مثبّتة. شغّل:  npm install');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'assets', 'autoline');

/* الأبعاد: خط رفيع بعرض مناسب لديسكورد */
const W = 640;
const H = 12;
const THICK = 6;              // سماكة الخط
const TOP = Math.floor((H - THICK) / 2);
const FRAMES = 24;            // عدد الإطارات
const DELAY = 5;              // 5/100 ثانية = 20 إطارًا في الثانية
const TRANSPARENT = 0;        // الفهرس الشفاف

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/* لوحة ألوان ثابتة: شفاف + 63 لونًا = 64 (قوة 2 كما يفرض GIF) */
function makePalette(fromHex, toHex, steps = 63) {
  const from = hex(fromHex);
  const to = hex(toHex);
  const palette = [0x000000]; // الفهرس 0 = شفاف
  for (let i = 0; i < steps; i += 1) {
    const [r, g, b] = mix(from, to, i / (steps - 1));
    palette.push((r << 16) | (g << 8) | b);
  }
  return palette;
}

/** هل البكسل داخل الخط (مع أطراف دائرية)؟ */
function inLine(x, y, width = W, top = TOP, thick = THICK) {
  if (y < top || y >= top + thick) return false;
  const radius = thick / 2;
  // أطراف دائرية ناعمة
  if (x < radius) {
    const dx = radius - x;
    const dy = Math.abs(y - (top + radius - 0.5));
    return dx * dx + dy * dy <= radius * radius;
  }
  if (x >= width - radius) {
    const dx = x - (width - radius - 1);
    const dy = Math.abs(y - (top + radius - 0.5));
    return dx * dx + dy * dy <= radius * radius;
  }
  return true;
}

/**
 * يرسم إطارًا واحدًا ويعيد مصفوفة الفهارس.
 * @param {(x:number)=>number} colorAt دالة تعيد فهرس اللون (1..62) لكل x
 */
function renderFrame(colorAt) {
  const pixels = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const idx = inLine(x, y) ? colorAt(x) : TRANSPARENT;
      pixels[y * W + x] = idx;
    }
  }
  return pixels;
}

/** تشويش بسيط في حافة الخط لتبدو أكثر نعومة */
function softAlpha(x) {
  const edge = 22;
  if (x < edge) return 0.35 + (0.65 * x) / edge;
  if (x > W - edge) return 0.35 + (0.65 * (W - x)) / edge;
  return 1;
}

const clampIdx = (v) => Math.max(1, Math.min(63, Math.round(v)));

/* ------------------------------- الأنماط ------------------------------- */

const STYLES = {
  /** توهّج يمرّ من اليمين لليسار */
  glow: {
    from: '#3b47c9',
    to: '#8ea0ff',
    frame: (t) => (x) => {
      const pos = W - ((t / FRAMES) * (W + 220) - 110);   // من اليمين لليسار
      const d = Math.abs(x - pos);
      const glow = Math.max(0, 1 - d / 150);
      const base = 22 * softAlpha(x);
      return clampIdx(base + glow * 44);
    },
  },

  /** تدرّج يتدفّق */
  flow: {
    from: '#4c53e0',
    to: '#22d3ee',
    frame: (t) => (x) => {
      const phase = (x / W + t / FRAMES) % 1;
      const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const base = 34 + wave * 26;
      return clampIdx(base * softAlpha(x));
    },
  },

  /** نبض إضاءة */
  pulse: {
    from: '#2f3aa8',
    to: '#a5b4ff',
    frame: (t) => (x) => {
      const wave = 0.5 + 0.5 * Math.sin((t / FRAMES) * Math.PI * 2);
      const base = 20 + wave * 40;
      return clampIdx(base * softAlpha(x) * (0.75 + 0.25 * Math.sin((x / W) * Math.PI)));
    },
  },

  /** شرطات تتحرّك */
  dash: {
    from: '#3730a3',
    to: '#c7d2fe',
    frame: (t) => (x) => {
      const shift = Math.round((t / FRAMES) * 48);
      const inDash = (x + shift) % 48 < 30;
      const base = inDash ? 52 : 12;
      return clampIdx(base * softAlpha(x));
    },
  },
};

/* ------------------------------- التوليد ------------------------------- */

function writeGif(file, style) {
  const palette = makePalette(style.from, style.to);
  const buffer = Buffer.alloc(W * H * FRAMES * 2 + 4096);
  const writer = new GifWriter(buffer, W, H, { loop: 0, palette });

  for (let t = 0; t < FRAMES; t += 1) {
    writer.addFrame(0, 0, W, H, renderFrame(style.frame(t)), {
      palette,
      delay: DELAY,
      disposal: 2,
      transparent: TRANSPARENT,
    });
  }
  const size = writer.end();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(file, buffer.subarray(0, size));
  return size;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n[توليد] خطوط AutoLine المتحركة → ${path.relative(path.join(__dirname, '..'), OUT_DIR)}\n`);
  for (const [name, style] of Object.entries(STYLES)) {
    const file = path.join(OUT_DIR, `${name}.gif`);
    const size = writeGif(file, style);
    console.log(`  [تم] ${name}.gif  (${W}×${H} · ${FRAMES} إطار · ${(size / 1024).toFixed(1)} كيلوبايت)`);
  }
  console.log('\n[تم] جهزت الخطوط. البوت يستخدمها مباشرة عند تفعيل نمط GIF.\n');
}

if (require.main === module) main();

module.exports = { STYLES, W, H, FRAMES, OUT_DIR };
