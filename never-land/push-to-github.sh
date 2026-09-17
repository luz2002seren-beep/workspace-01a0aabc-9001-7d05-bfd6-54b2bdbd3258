#!/usr/bin/env bash
# ---------------------------------------------------------------
#  Never Land — رفع المشروع إلى GitHub بأمر واحد
#  الاستخدام:
#     ./push-to-github.sh <اسم-المستخدم> <اسم-المستودع> [خاص|عام]
#  مثال:
#     ./push-to-github.sh ahmad never-land خاص
#  ملاحظة: يحتاج توكن GitHub مرة واحدة (سيُطلب منك إدخاله ككلمة مرور).
# ---------------------------------------------------------------
set -e
USER_NAME="${1:?اكتب اسم مستخدم GitHub}"
REPO="${2:?اكتب اسم المستودع}"
VISIBILITY="${3:-خاص}"

if [ ! -d .git ]; then
  git init -q
  git branch -M main
fi

git add -A
git commit -m "Never Land — بوت إدارة سيرفرات ديسكورد + لوحة تحكم عربية" || echo "(لا تغييرات جديدة)"

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${USER_NAME}/${REPO}.git"

echo
echo "سيُطلب منك اسم المستخدم (${USER_NAME}) وكلمة المرور = توكن GitHub (Personal Access Token)."
echo "لإنشاء التوكن: https://github.com/settings/tokens  بصلاحية repo"
echo
git push -u origin main

if [ "$VISIBILITY" = "عام" ] || [ "$VISIBILITY" = "public" ]; then
  echo "لجعل المستودع عامًا: افتحه من الموقع ثم Settings ← تغيير الظهور إلى Public."
else
  echo "المستودع خاص افتراضيًا. لتحويله لعام: Settings ← Danger Zone ← Change visibility."
fi
echo "✅ تم. الرابط: https://github.com/${USER_NAME}/${REPO}"
