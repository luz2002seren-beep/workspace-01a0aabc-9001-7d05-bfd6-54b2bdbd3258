#!/usr/bin/env bash
# ---------------------------------------------------------------
#  Never Land  →  Railway  (رفع بأمر واحد)
#  الاستخدام:  ./deploy-railway.sh
#  ما يحتاج توكن مكتوب: Railway يفتح المتصفح أو يعطيك كود جهاز.
# ---------------------------------------------------------------
set -e
CLI_DIR="/tmp/railway-cli"

echo "==> تثبيت Railway CLI (مرة واحدة) ..."
if [ ! -x "$CLI_DIR/node_modules/.bin/railway" ]; then
  mkdir -p "$CLI_DIR"
  npm i --prefix "$CLI_DIR" @railway/cli --silent
fi
RAILWAY="$CLI_DIR/node_modules/.bin/railway"
"$RAILWAY" --version

echo
echo "==> تسجيل الدخول ..."
echo "   إذا كنت على جهازك: يفتح المتصفح تلقائيًا."
echo "   إذا كنت على سيرفر: سيطبع كودًا تدخله في railway.com"
"$RAILWAY" login

echo
echo "==> إنشاء المشروع ورفعه ..."
"$RAILWAY" up -y --new --name never-land

echo
echo "==> تذكير: اضبط المتغيّرات وأضف Volume على /data من لوحة Railway:"
cat <<'VARS'
   DISCORD_TOKEN      = توكن البوت
   CLIENT_ID          = ايدي التطبيق
   CLIENT_SECRET      = سر التطبيق
   SESSION_SECRET     = نص عشوائي طويل
   DEMO_MODE          = false
   DATABASE_PATH      = /data/neverland.db
VARS
echo
echo "✅ تم الرفع. افتح: https://railway.com/dashboard"
