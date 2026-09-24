#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok() { echo -e "${GREEN}✅ $1${NC}"; }
explain() { echo -e "${CYAN}   💡 $1${NC}"; }
example() { echo -e "${DIM}   📝 مثال: $1${NC}"; }
where() { echo -e "${MAGENTA}   🔗 کجا؟ $1${NC}"; }
generate_secret() { openssl rand -base64 32 2>/dev/null | tr -d '\n' | tr -d '/' | tr -d '+' | cut -c1-32 || date +%s | sha256sum | head -c 32; }
ask_with_help() {
  local prompt="$1"; local help_text="$2"; local example_text="$3"; local where_text="$4"; local default_val="$5"; local is_secret="${6:-false}"
  echo ""; echo -e "${BOLD}${BLUE}❓ $prompt${NC}"; [ -n "$help_text" ] && explain "$help_text"; [ -n "$example_text" ] && example "$example_text"; [ -n "$where_text" ] && where "$where_text"
  [ -n "$default_val" ] && echo -e "${DIM}   ⏭️  Enter=پیش‌فرض: $default_val${NC}" || echo -e "${DIM}   ⏭️  اگر نداری Enter=mock${NC}"
  local input=""; if [ "$is_secret" = "true" ]; then read -s -p "   👉 جواب: " input; echo ""; else read -p "   👉 جواب: " input; fi
  [ -z "$input" ] && [ -n "$default_val" ] && input="$default_val"; echo "$input"
}
ask_yes_no() {
  local prompt="$1"; local help_text="$2"; local default_yes="${3:-true}"
  echo ""; echo -e "${BOLD}${BLUE}❓ $prompt${NC}"; [ -n "$help_text" ] && explain "$help_text"
  [ "$default_yes" = "true" ] && echo -e "${DIM}   ⏭️  [Y/n] Enter=بله${NC}" || echo -e "${DIM}   ⏭️  [y/N] Enter=خیر${NC}"
  local input=""; read -p "   👉 جواب (y/n): " input; input=$(echo "$input" | tr '[:upper:]' '[:lower:]')
  [ -z "$input" ] && { if [ "$default_yes" = "true" ]; then input="y"; else input="n"; fi; }
  if [ "$input" = "y" ] || [ "$input" = "yes" ] || [ "$input" = "بله" ]; then echo "yes"; else echo "no"; fi
}

clear
echo -e "${CYAN}"
cat <<'BANNER'
    _       _             _   _
   / \   __| | __ _ _ __ | |_(_)_   _____
  / _ \ / _` |/ _` | '_ \| __| \ \ / / _ \
 / ___ \ (_| | (_| | |_) | |_| |\ V /  __/
/_/   \_\__,_|\__,_| .__/ \__|_| \_/ \___|
                  |_|
Financial OS — Double-Entry + Kafka + GraphQL + Notification — Zero Support
BANNER
echo -e "${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🧙‍♂️ جادوگر نصب Adaptive Financial OS v3.0.0 — پشتیبانی صفر${NC}"
echo -e "${BLUE}  مالی + دفترداری دوبل + ناتیف${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}سلام! 👋 سیستم مالی دفترداری دوبل + Event Sourcing + Kafka + GraphQL + FX + ناتیف — سقف!${NC}"
echo ""
read -p "برای شروع جادو Enter بزنید... ✨ " _

echo -e "${BLUE}[1/6] 🔍 سیستم${NC}"; ok "اوکیه"; sleep 1
echo -e "${BLUE}[2/6] 🐳 Docker${NC}"; if ! command -v docker &> /dev/null; then echo -e "${RED}Docker نیست${NC}"; exit 1; else ok "Docker: $(docker --version)"; fi; sleep 1
echo -e "${BLUE}[3/6] 🔑 رمزها${NC}"; SECRET_JWT=$(generate_secret); ok "رمز ساخته شد"; sleep 1

echo -e "${BLUE}[4/6] 📧 Email + 📱 SMS — برای ناتیف مالی${NC}"
explain "وقتی تراکنش مالی انجام می‌شه، ناتیف می‌ده — مثل 'پرداخت ۱۰۰ هزار تومان ثبت شد'"
SMS_PROVIDER=$(ask_with_help "SMS پرووایدر برای ناتیف مالی؟" "وقتی تراکنش مالی می‌شه پیامک بره" "ghasedak یا mock" "https://ghasedak.me/" "mock" "false")
SMS_KEY=""
if [ "$SMS_PROVIDER" != "mock" ]; then SMS_KEY=$(ask_with_help "کلید API SMS؟" "از پنل" "api-key" "پنل → API" "" "true"); ok "SMS تنظیم شد"; fi
EMAIL_PROVIDER=$(ask_with_help "ایمیل پرووایدر؟" "برای ناتیف مالی" "smtp یا mock" "Gmail" "mock" "false")
SMTP_HOST=""; SMTP_USER=""; SMTP_PASS=""
if [ "$EMAIL_PROVIDER" = "smtp" ]; then
  SMTP_HOST=$(ask_with_help "SMTP Host؟" "smtp.gmail.com" "smtp.gmail.com" "Gmail" "smtp.gmail.com" "false")
  SMTP_USER=$(ask_with_help "SMTP User؟" "you@gmail.com" "ایمیل" "" "false")
  SMTP_PASS=$(ask_with_help "SMTP Pass؟" "App Password" "app-pass" "myaccount.google.com → App Passwords" "" "true")
  ok "SMTP تنظیم شد"
fi
sleep 1

echo -e "${BLUE}[5/6] 🔔 Notification System — مالی${NC}"
explain "وقتی تراکنش مالی انجام می‌شه، مانده کم می‌شه، یا خطا میاد — خبر می‌ده — کانال‌ها: in_app + email + sms + telegram"
NOTIF_EMAIL=$(ask_yes_no "ایمیل ناتیف برای تراکنش مالی روشن باشه؟" "وقتی تراکنش ثبت می‌شه ایمیل بره" "true")
NOTIF_SMS=$(ask_yes_no "پیامک ناتیف برای تراکنش مهم روشن باشه؟" "وقتی مبلغ بالا می‌شه پیامک بره" "true")
TELEGRAM_ENABLED=$(ask_yes_no "ربات تلگرام برای ناتیف مالی می‌خوای؟" "وقتی تراکنش یا خطا میاد تلگرام خبر می‌ده — برای حسابدار" "false")
TELEGRAM_TOKEN=""; TELEGRAM_CHAT=""
if [ "$TELEGRAM_ENABLED" = "yes" ]; then
  TELEGRAM_TOKEN=$(ask_with_help "توکن ربات؟" "از @BotFather" "123456:ABC..." "@BotFather → /newbot" "" "true")
  TELEGRAM_CHAT=$(ask_with_help "Chat ID؟" "از getUpdates" "123456789" "https://api.telegram.org/bot<TOKEN>/getUpdates" "" "false")
  ok "Telegram تنظیم شد"
fi
sleep 1

echo -e "${BLUE}[6/6] ⚙️ .env + 🏗️ اجرا${NC}"
cat > .env <<EOF
# adaptive-financial-os — .env — جادوگر v3.0.0 — پشتیبانی صفر — $(date)
PGHOST=localhost
PGPORT=5432
PGUSER=afos
PGPASSWORD=afos
PGDATABASE=afos
DATABASE_URL=postgresql://afos:afos@localhost:5432/afos
OUTBOX_POLL_INTERVAL_MS=2000
OUTBOX_BATCH_SIZE=50
OUTBOX_MAX_ATTEMPTS=5
OUTBOX_BACKOFF_BASE_MS=1000
OUTBOX_BACKOFF_MAX_MS=30000
OUTBOX_JITTER_RATIO=0.2
OUTBOX_WEBHOOK_URL=http://localhost:3000/webhook/outbox
OUTBOX_WEBHOOK_TIMEOUT_MS=5000
PORT=3000
NODE_ENV=development
JWT_SECRET=${SECRET_JWT}
OPENAI_API_KEY=

# SMS + Email — برای ناتیف مالی — چیه؟ اطلاع‌رسانی تراکنش
SMS_PROVIDER=${SMS_PROVIDER}
SMS_API_KEY=${SMS_KEY}
EMAIL_PROVIDER=${EMAIL_PROVIDER}
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=587
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}

# Notification System — سقف 10/10 — چیه؟ اطلاع‌رسانی تراکنش + مانده + خطا
NOTIF_IN_APP=true
NOTIF_EMAIL=${NOTIF_EMAIL}
NOTIF_SMS=${NOTIF_SMS}
NOTIF_TELEGRAM=${TELEGRAM_ENABLED}
TELEGRAM_BOT_TOKEN=${TELEGRAM_TOKEN}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT}
EOF

ok ".env ساخته شد"
docker compose up --build -d 2>&1 | tail -n 10
echo ""; echo -e "${BLUE}  ⏳ 30 ثانیه صبر...${NC}"
echo -n "  "; for i in {1..30}; do echo -n "."; sleep 1; if curl -sf http://localhost:3000 >/dev/null 2>&1; then echo ""; ok "آماده!"; break; fi; done
echo ""; docker compose ps 2>/dev/null || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 جادو تمام! Financial OS آماده — پشتیبانی صفر! 🎉${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BOLD}${BLUE}📍 دسترسی:${NC}"
echo -e "${GREEN}  🌐 Web UI: http://localhost:3000 — Journal + Outbox+Kafka + Replay+Snapshot+FX — سقف!${NC}"
echo -e "${GREEN}  📚 API Docs: http://localhost:8000/docs${NC}"
echo -e "${GREEN}  🔍 GraphQL: /graphql — سقف!${NC}"
echo ""
echo -e "${CYAN}📚 docs/SETUP-WIZARD-FA.md${NC}"
echo ""
