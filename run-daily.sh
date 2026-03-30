#!/bin/bash
# SEM Intel Agent — Full autonomous daily run
# Usage: ./run-daily.sh
# Schedule: 0 7 * * * /Users/khgroupon/daily-updates-mkg/run-daily.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="logs/$(date +%Y-%m-%d)-cron.log"
mkdir -p logs data output/blog output/email

exec >> "$LOG_FILE" 2>&1

echo ""
echo "======================================"
echo "SEM Intel Agent — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

# Phase 1: Scrape + dedup
echo "[1/2] Running scraper..."
node src/index.js

# Check if there are new articles to score
NEW_COUNT=$(node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('data/new_articles.json','utf8'));
    console.log(d.newCount || d.articles?.length || 0);
  } catch(e) { console.log(0); }
")

echo "New articles: $NEW_COUNT"

# Phase 2 + 3: Score, summarize, deliver (Claude Code handles everything)
echo "[2/2] Running Claude Code pipeline..."
claude --dangerously-skip-permissions -p \
  "Execute the SEM Intel Agent scoring and delivery pipeline as described in CLAUDE.md. \
   Read data/new_articles.json, score and summarize each article following the rubric in CLAUDE.md, \
   write data/scored_articles.json, then run 'node src/index.js --deliver' to post to Google Chat \
   and generate blog files, then read data/email_draft.json and create a Gmail draft using the \
   gmail_create_draft MCP tool. Complete all steps without asking for confirmation."

echo "======================================"
echo "Done — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"
