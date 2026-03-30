# 📡 SEM Intel Agent

A Claude Code headless agent that runs daily, scrapes top SEM/PPC marketing sources, scores and summarizes them by practitioner impact, and delivers the digest through three channels:

1. **Gmail draft** — polished HTML email ready to review and send
2. **Google Chat webhook** — condensed top-3 card posted to a team space
3. **Blog post** — formatted Markdown/HTML article written to `output/blog/`

**No external LLM API keys required.** Claude Code IS the LLM — scoring and summarization happen natively. Email delivery uses the Gmail MCP connection.

---

## Architecture

```
Claude Code (daily, 7:00 AM CET)
  │
  ├─ [Node.js] Scraper: fetch + parse RSS/HTML from 17 sources
  ├─ [Node.js] Dedup: SQLite — skip articles seen in last 14 days
  ├─ [Claude Code native] Scoring & summarization (no API key)
  ├─ [Claude Code native] Render HTML email + Chat card + blog post
  ├─ [Node.js] Google Chat webhook POST
  ├─ [Gmail MCP] Create email draft in Gmail
  └─ [Node.js] Blog publisher (Markdown + HTML files)
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure sources
Edit `config/sources.json` — set `"enabled": false` on any source you want to skip.

### 3. Configure delivery
Edit `config/delivery.json` — set the recipient email address and enable/disable channels.

### 4. Set environment variables
```bash
export GOOGLE_CHAT_WEBHOOK_URL="https://chat.googleapis.com/v1/spaces/..."
```

### 5. Run the agent (full pipeline via Claude Code)
```bash
# Phase 1: Scrape and dedup
node src/index.js

# Phase 2 & 3: Score + deliver (run via Claude Code)
claude -p "Execute the SEM Intel Agent scoring and delivery pipeline as described in CLAUDE.md"
```

Or use a single Claude Code invocation for the full pipeline:
```bash
claude --dangerously-skip-permissions -p "Execute the SEM Intel Agent pipeline: run the scraper, dedup, score articles, generate digest, create Gmail draft, post to Google Chat, and write blog post."
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `node src/index.js` | Full scrape + dedup (writes `data/new_articles.json`) |
| `node src/index.js --deliver` | Delivery phase after scoring |
| `node src/index.js --dry-run` | Scrape and print, no delivery |
| `node src/index.js --scrape-only` | Scrape only, skip dedup |
| `node src/index.js --sources` | List all sources and health status |
| `node src/index.js --webhook-test` | Send test card to Google Chat |
| `node src/index.js --stats` | Show DB stats and source health |

---

## Sources

### Tier 1 — Official platform blogs
- Google Ads Blog, Google Ads Developer Blog, Google Merchant Center Blog
- Microsoft Advertising Blog, Google Search Central Blog

### Tier 2 — Industry publications
- Search Engine Land, Search Engine Journal, PPC Hero
- WordStream Blog, Optmyzr Blog, Adalysis Blog

### Tier 3 — Expert voices
- Brad Geddes (BGTheory), Mike Rhodes, Kirk Williams (ZATO), Ginny Marvin (X/Twitter)

### Tier 4 — Newsletters & aggregators
- PPC Chat (X/Twitter), Paid Search Association

---

## Output Channels

### Gmail Draft
Polished HTML email with urgency badges, category pills, impact score bars, and a collapsible section for stories 4–10. Created via Gmail MCP — no SMTP required.

### Google Chat Card
Top-3 stories in Google Chat Card V2 format. Rich, scannable, with direct "Read →" links.

### Blog Post
Daily Markdown and HTML files in `output/blog/`. An `index.json` tracks all generated posts.

Optional CMS publishing (WordPress, Ghost, generic webhook) is configurable via `config/delivery.json`.

---

## Scheduling

### Cron
```bash
0 5 * * * cd /path/to/sem-intel-agent && node src/index.js && claude --dangerously-skip-permissions -p "Execute the SEM Intel Agent scoring and delivery pipeline as described in CLAUDE.md"
```

### GitHub Actions
The `.github/workflows/sem-intel-daily.yml` workflow runs daily at 5:00 UTC (7:00 CET) with:
- SQLite DB persistence via GitHub Actions cache
- Blog output committed back to the repository
- Logs uploaded as workflow artifacts

**Required secrets:**
- `ANTHROPIC_API_KEY` — for running Claude Code in CI
- `GOOGLE_CHAT_WEBHOOK_URL` — Google Chat incoming webhook URL

---

## Configuration

### `config/sources.json`
```json
{
  "sources": [
    {
      "id": "google-ads-blog",
      "name": "Google Ads Blog",
      "url": "https://blog.google/products/ads-commerce/rss/",
      "method": "rss",
      "tier": 1,
      "enabled": true
    }
  ]
}
```

### `config/delivery.json`
```json
{
  "email": { "enabled": true, "to": "c_khuk@groupon.com" },
  "google_chat": { "enabled": true, "webhook_url": "${GOOGLE_CHAT_WEBHOOK_URL}" },
  "blog": {
    "enabled": true,
    "output_dir": "output/blog",
    "cms": { "enabled": false, "type": "wordpress" }
  }
}
```

---

## Scoring Rubric

| Score | Meaning |
|-------|---------|
| 9–10 | Immediate action required — breaking change, mandatory policy, deprecated feature |
| 7–8 | Strategic importance — major rollout, significant algorithm change, beta going GA |
| 5–6 | Worth knowing — optimization tip, minor UI change, notable trend |
| 3–4 | Nice to know — opinion piece, case study, minor update |
| 1–2 | Marginal relevance |

Categories: `Platform Update`, `Shopping/PLA`, `Bidding & Automation`, `Measurement & Tracking`, `Policy & Privacy`, `AI & Emerging`, `Microsoft/Bing`, `Industry Trend`

Urgency: `Act Now`, `Plan Ahead`, `Monitor`, `FYI`

---

## Error Handling

- Source failures are logged and the pipeline continues with remaining sources.
- Sources with 3+ consecutive failures trigger a warning in the digest footer.
- If the Gmail MCP draft creation fails, the HTML email is saved to `output/email/YYYY-MM-DD-digest.html`.
- If all sources fail, a diagnostic-only message is delivered.
- Logs are written to `logs/YYYY-MM-DD.log` with 14-day rotation.

---

## Future Enhancements

- Slack webhook delivery
- Multi-recipient support with per-recipient topic preferences
- Weekly "trends" summary aggregating the week's articles into themes
- Competitive intelligence module
- Static site generator (11ty/Hugo) for a browsable archive
- RSS feed output of the digest itself