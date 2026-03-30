# SEM Intel Agent

## What this project does
Daily SEM/PPC news digest agent. Node.js handles HTTP fetching, RSS parsing, SQLite deduplication,
Google Chat webhook delivery, and blog file generation. Claude Code handles article scoring,
summarization, HTML email rendering, and Gmail draft creation via the Gmail MCP.

---

## Daily pipeline — YOUR ROLE

When invoked, run this sequence:

### Phase 1: Scrape + Dedup (Node.js)
```bash
node src/index.js
```
This writes `data/new_articles.json` with all unseen articles from the last 24 hours.
Read the log output — it tells you how many new articles were found.

**If `data/new_articles.json` shows 0 new articles:** Run the empty-state delivery:
```bash
node src/index.js --deliver
```
Then create a Gmail draft from `data/email_draft.json`. Done.

---

### Phase 2: Score + Summarize (YOU — Claude Code natively)

Read `data/new_articles.json`. For each article in the `articles` array:

#### Pass 1: Relevance filter
Include articles that cover:
- Platform feature changes, beta launches, or deprecations (Google Ads, Microsoft Ads)
- Algorithm or auction changes (Quality Score, Smart Bidding, PMAX signals)
- Shopping feed, Merchant Center, or product listing changes
- Bidding strategy insights backed by data
- Automation, scripts, or API changes
- Audience targeting or measurement changes (GA4, conversion tracking, privacy)
- Regulatory or privacy changes affecting paid search
- AI/LLM features in ad platforms (AI Overviews, conversational campaign creation)

Exclude:
- Generic marketing advice without PPC specifics
- Social media or SEO-only content
- Brand awareness / upper-funnel only strategies
- Company earnings, personnel changes, or pure PR

#### Pass 2: Score and summarize each relevant article

For each relevant article, produce this JSON structure:
```json
{
  "url": "<original url>",
  "source": "<source name>",
  "publishedDate": "<ISO date>",
  "author": "<author if known>",
  "tier": <1-4>,
  "impact_score": <1-10>,
  "headline": "<max 15 words — rewritten, punchy, focused on the 'so what'>",
  "summary": "<2-3 sentences: what changed and why it matters for PPC practitioners>",
  "impact_analysis": "<2-3 sentences: concrete implications — what should a PPC team do differently?>",
  "category": "<one of: Platform Update | Shopping/PLA | Bidding & Automation | Measurement & Tracking | Policy & Privacy | AI & Emerging | Microsoft/Bing | Industry Trend>",
  "urgency": "<one of: Act Now | Plan Ahead | Monitor | FYI>"
}
```

**Impact score rubric:**
- 9-10: Immediate action required (breaking change, mandatory policy enforcement, deprecated feature)
- 7-8: Strategic importance (major new feature rollout, significant algorithm change, beta going GA)
- 5-6: Worth knowing (optimization tip backed by data, minor UI change, notable industry trend)
- 3-4: Nice to know (opinion piece, case study, minor update)
- 1-2: Marginal relevance (passed filter but barely)

Sort by `impact_score` descending. If scores are tied, prefer Tier 1 > Tier 2 > Tier 3 > Tier 4.

**Token budget:** Keep total article input under 50,000 tokens. If there are more articles than fit,
prioritize Tier 1 and Tier 2, then include Tier 3–4 in order until budget is reached.

#### Write output
Write the scored articles to `data/scored_articles.json` in this format:
```json
{
  "generatedAt": "<ISO timestamp>",
  "meta": {
    "runDate": "<YYYY-MM-DD>",
    "totalScanned": <N>,
    "totalPassed": <N>,
    "sourceWarnings": ["⚠️ Source X has been unreachable for 3 days."]
  },
  "articles": [ /* sorted array of scored article objects */ ]
}
```

---

### Phase 3: Deliver (Node.js + Gmail MCP)

**3a. Run delivery script (Node.js handles Chat webhook + blog):**
```bash
node src/index.js --deliver
```
This writes:
- `output/blog/YYYY-MM-DD-sem-intel-digest.md`
- `output/blog/YYYY-MM-DD-sem-intel-digest.html`
- `output/blog/index.json` (updated)
- `data/email_draft.json` (HTML email ready to send)

**3b. Create Gmail draft (YOU via Gmail MCP):**
Read `data/email_draft.json`:
```json
{
  "to": "c_khuk@groupon.com",
  "subject": "📡 SEM Intel Digest — Mon, Mar 30, 2026 (9/10 top impact)",
  "htmlBody": "<full HTML email>",
  "fallbackPath": "output/email/YYYY-MM-DD-digest.html"
}
```

Use the Gmail MCP `gmail_create_draft` tool:
- `to`: value from `email_draft.json`
- `subject`: value from `email_draft.json`
- `body`: value from `htmlBody` field
- `mimeType`: `text/html`

If the Gmail MCP draft creation fails, log the error and note that the HTML email is available
at `fallbackPath` for manual sending.

---

## Configuration files

| File | Purpose |
|------|---------|
| `config/sources.json` | Source list — set `"enabled": false` to disable a source |
| `config/delivery.json` | Email recipient, Chat webhook URL, blog settings |

**Environment variables:**
- `GOOGLE_CHAT_WEBHOOK_URL` — Google Chat webhook URL (replaces `${GOOGLE_CHAT_WEBHOOK_URL}` in config)
- `CMS_AUTH_TOKEN` — CMS authentication token (if CMS publishing is enabled)

---

## CLI reference

| Command | Description |
|---------|-------------|
| `node src/index.js` | Full scrape + dedup (Phase 1) |
| `node src/index.js --deliver` | Delivery phase — run after scoring |
| `node src/index.js --dry-run` | Scrape and print articles, no delivery |
| `node src/index.js --scrape-only` | Scrape only, skip dedup |
| `node src/index.js --sources` | List all sources and health status |
| `node src/index.js --webhook-test` | Send test card to Google Chat |
| `node src/index.js --stats` | Show DB stats and source health |

---

## Project structure

```
sem-intel-agent/
├── src/
│   ├── index.js              # Main entry point
│   ├── scraper/              # RSS, HTML, and social scrapers
│   ├── dedup/                # SQLite deduplication layer
│   ├── webhook/              # Google Chat Card V2 formatter
│   ├── blog/                 # Markdown + HTML blog generators + CMS adapters
│   └── utils/                # Logger (pino) and config loader
├── config/
│   ├── sources.json          # Source list with enabled toggles
│   └── delivery.json         # Delivery settings
├── data/                     # Transient data files (gitignored)
│   ├── articles.db           # SQLite dedup database
│   ├── scraped_articles.json
│   ├── new_articles.json     # ← Your input for scoring
│   ├── scored_articles.json  # ← Your output after scoring
│   └── email_draft.json      # ← Your input for Gmail MCP
├── output/
│   ├── blog/                 # Generated blog posts
│   └── email/                # Email HTML fallbacks
└── logs/                     # Daily log files (14-day rotation)
```

---

## Important constraints

- **No Anthropic API key needed** — you ARE the LLM; scoring runs natively in Claude Code.
- **No SMTP credentials** — Gmail MCP handles email draft creation.
- **Scraping ethics**: Respect robots.txt; 2-second delay between same-domain requests; never scrape LinkedIn directly.
- **Idempotent**: Safe to run twice in one day — dedup layer prevents duplicate scoring and delivery.
- **Graceful degradation**: If all sources fail, deliver a diagnostic-only message.
- **Token budget**: Keep total scoring input under 50,000 tokens (prioritize Tier 1–2 if needed).

---

## Scheduling

### Cron (run daily at 5:00 UTC = 7:00 CET):
```
0 5 * * * cd /path/to/daily-updates-mkg && node src/index.js && claude -p "Execute the SEM Intel Agent scoring and delivery pipeline as described in CLAUDE.md"
```

### GitHub Actions:
See `.github/workflows/sem-intel-daily.yml` for a full workflow definition.

---

## Troubleshooting

- **All sources returning 0 articles**: Check network access; run `node src/index.js --sources` to see health.
- **SQLite error on first run**: Ensure the `data/` directory is writable.
- **Gmail MCP fails**: Check that the Gmail MCP server is connected; HTML fallback is at `output/email/`.
- **Google Chat webhook 404**: Regenerate the webhook URL in Google Chat settings.
- **Score output missing fields**: Re-run scoring and ensure all required JSON fields are present.
