# -------------------------------------------------------------
#  Never Land — نشر من جذر المستودع (Railway / Render / أي سيرفر)
#  يبني مجلد never-land/ مباشرة، فيعمل النشر المربوط بـ GitHub
#  بدون أي إعداد إضافي (Root Directory = الجذر أو never-land، الاثنان يعملان).
# -------------------------------------------------------------
FROM node:20-slim

# أدوات بناء better-sqlite3 (تُحذف لاحقًا لتقليل حجم الصورة)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY never-land/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY never-land/ ./

# مجلد قاعدة البيانات (يُربط كـ volume في Railway)
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
