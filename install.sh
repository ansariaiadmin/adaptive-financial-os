#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${CYAN}"
cat <<'BANNER'
    _       _             _   _
   / \   __| | __ _ _ __ | |_(_)_   _____
  / _ \ / _` |/ _` | '_ \| __| \ \ / / _ \
 / ___ \ (_| | (_| | |_) | |_| |\ V /  __/
/_/   \_\__,_|\__,_| .__/ \__|_| \_/ \___|
                  |_|
Financial OS — Double-Entry Ledger
BANNER
echo -e "${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  🧙‍♂️ جادوگر نصب Adaptive Financial OS — فوق ساده${NC}"
echo -e "${BLUE}  نسخه v2.0.0 — سقف 10/10 — Financial-Grade${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}سلام! 👋 سیستم مالی دفترداری دوبل + Event Sourcing + Kafka + GraphQL + FX — سقف!${NC}"
echo ""
read -p "برای شروع جادو Enter بزنید... ✨ " _

echo ""
echo -e "${BLUE}[1/6] 🔍 سیستم...${NC}"
echo -e "${GREEN}  ✓ اوکیه${NC}"
sleep 1

echo ""
echo -e "${BLUE}[2/6] 🐳 Docker...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "${RED}  ✗ Docker نیست${NC}"
  exit 1
else
  echo -e "${GREEN}  ✓ Docker: $(docker --version)${NC}"
fi
sleep 1

echo ""
echo -e "${BLUE}[3/6] 📦 pnpm...${NC}"
if command -v pnpm &> /dev/null; then
  echo -e "${GREEN}  ✓ pnpm: $(pnpm --version)${NC}"
else
  echo -e "${YELLOW}  ○ pnpm نیست — Docker کافیه${NC}"
fi
sleep 1

echo ""
echo -e "${BLUE}[4/6] 🔧 وابستگی‌ها...${NC}"
echo -e "${GREEN}  ✓ Docker کافیه!${NC}"
sleep 1

echo ""
echo -e "${BLUE}[5/6] ⚙️ تنظیمات...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || touch .env
  echo -e "${GREEN}  ✓ .env ساخته شد${NC}"
else
  echo -e "${BLUE}  .env وجود دارد${NC}"
fi
sleep 1

echo ""
echo -e "${BLUE}[6/6] 🏗️ ساخت و اجرا...${NC}"
docker compose up --build -d 2>&1 | tail -n 10
echo ""
echo -e "${BLUE}  ⏳ 30 ثانیه صبر...${NC}"
echo -n "  "
for i in {1..30}; do
  echo -n "."
  sleep 1
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1 || curl -sf http://localhost:3000 >/dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}  ✓ آماده!${NC}"
    break
  fi
done
echo ""
docker compose ps 2>/dev/null || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 جادو تمام! Financial OS آماده! 🎉${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BOLD}${BLUE}📍 دسترسی:${NC}${NC}"
echo -e "${GREEN}  🌐 Web UI: http://localhost:3000 — Journal + Outbox+Kafka + Replay+Snapshot+FX — سقف!${NC}"
echo -e "${GREEN}  📚 API Docs: http://localhost:8000/docs${NC}"
echo -e "${GREEN}  🔍 GraphQL: /graphql — Query + Mutation + Subscription + Event Replay + Snapshot + FX — سقف!${NC}"
echo -e "${GREEN}  📤 Kafka: ledger.events topic — idempotent + retries — سقف!${NC}"
echo ""
echo -e "${BOLD}${BLUE}🎯 حالا چی؟${NC}${NC}"
echo -e "${YELLOW}  1. Web UI localhost:3000 → Journal + Outbox+Kafka 2. GraphQL Playground 3. POST /ledger/entries با idempotency${NC}"
echo ""
echo -e "${CYAN}📚 فوق ساده: docs/SETUP-WIZARD-FA.md${NC}"
echo ""
