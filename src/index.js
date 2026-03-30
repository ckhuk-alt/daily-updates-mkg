'use strict';

/**
 * SEM Intel Agent — Main Entry Point (Node.js)
 *
 * Responsibilities:
 *  1. Run the scraper and write data/scraped_articles.json
 *  2. Run deduplication and write data/new_articles.json
 *  3. Signal Claude Code to score and summarize (via CLAUDE.md instructions)
 *  4. Post to Google Chat webhook
 *  5. Generate blog Markdown + HTML files
 *  6. Optionally publish to CMS
 *
 * Claude Code reads/writes scored_articles.json and creates the Gmail draft.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { getDeliveryConfig } = require('./utils/config');
const { openDb, deduplicateArticles, getStats } = require('./dedup/index');
const { runScraper } = require('./scraper/index');
const { buildChatCard, postToGoogleChat, buildTestCard } = require('./webhook/google-chat');
const { generateMarkdownPost } = require('./blog/markdown');
const { generateHtmlEmail } = require('./blog/html');
const { upsertIndexEntry } = require('./blog/index-builder');
const { publishToWordPress } = require('./blog/cms/wordpress');
const { publishToGhost } = require('./blog/cms/ghost');
const { publishToGenericWebhook } = require('./blog/cms/generic');

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_BLOG_DIR = path.join(process.cwd(), 'output', 'blog');
const OUTPUT_EMAIL_DIR = path.join(process.cwd(), 'output', 'email');

// Ensure output directories exist
[DATA_DIR, OUTPUT_BLOG_DIR, OUTPUT_EMAIL_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const args = process.argv.slice(2);
const isScrapeOnly = args.includes('--scrape-only');
const isDryRun = args.includes('--dry-run');
const isSourcesMode = args.includes('--sources');
const isWebhookTest = args.includes('--webhook-test');
const isStatsMode = args.includes('--stats');

async function main() {
  const db = openDb();
  const runTimestamp = new Date().toISOString();
  const runDate = runTimestamp.split('T')[0];

  logger.info({ runDate, mode: getMode() }, '=== SEM Intel Agent starting ===');

  // ─── --sources mode ─────────────────────────────────────────────────────────
  if (isSourcesMode) {
    const { getSources } = require('./utils/config');
    const sources = getSources();
    const health = db.prepare('SELECT * FROM source_health').all();
    const healthMap = Object.fromEntries(health.map(h => [h.source_id, h]));

    console.log('\n📡 Configured Sources:\n');
    for (const s of sources) {
      const h = healthMap[s.id];
      const status = s.enabled === false ? '🔴 DISABLED'
        : h && h.consecutive_failures >= 3 ? `⚠️  ${h.consecutive_failures} consecutive failures`
        : h && h.consecutive_failures > 0 ? `🟡 ${h.consecutive_failures} failure(s)`
        : '✅ OK';
      console.log(`  [Tier ${s.tier}] ${s.name.padEnd(35)} ${status}`);
      console.log(`           ${s.url}`);
    }
    console.log('');
    return;
  }

  // ─── --stats mode ────────────────────────────────────────────────────────────
  if (isStatsMode) {
    const stats = getStats(db);
    console.log('\n📊 SEM Intel Agent Statistics:\n');
    console.log(`  Total articles in DB:      ${stats.totalArticles}`);
    console.log(`  Articles (last 7 days):    ${stats.recentArticles}`);
    console.log(`\n  Top scored articles:\n`);
    for (const a of stats.topScored) {
      console.log(`  [${(a.score || 0).toFixed(1)}] ${a.title?.slice(0, 60)} — ${a.source}`);
    }
    console.log(`\n  Source health:\n`);
    for (const h of stats.sourceHealth) {
      console.log(`  ${h.source_name}: ${h.consecutive_failures} consecutive failure(s)`);
    }
    console.log('');
    return;
  }

  // ─── --webhook-test mode ─────────────────────────────────────────────────────
  if (isWebhookTest) {
    const delivery = getDeliveryConfig();
    if (!delivery.google_chat.enabled) {
      console.log('Google Chat webhook is disabled in config/delivery.json');
      return;
    }
    const testPayload = buildTestCard();
    const result = await postToGoogleChat(delivery.google_chat.webhook_url, testPayload);
    console.log(result.success ? '✅ Webhook test succeeded!' : `❌ Webhook test failed: ${result.reason}`);
    return;
  }

  // ─── STEP 1: Scrape ──────────────────────────────────────────────────────────
  logger.info('Step 1: Running scraper');
  const { articles: scraped, sourceHealth } = await runScraper(db);
  logger.info({ count: scraped.length }, 'Scrape complete');

  if (isScrapeOnly) {
    console.log(`\nScrape-only mode. ${scraped.length} articles written to data/scraped_articles.json\n`);
    return;
  }

  // ─── STEP 2: Deduplicate ─────────────────────────────────────────────────────
  logger.info('Step 2: Deduplicating');
  const { newArticles, skipped, sourceWarnings } = deduplicateArticles(db, scraped);
  logger.info({ new: newArticles.length, skipped }, 'Deduplication complete');

  // Write new_articles.json for Claude Code to score
  const newArticlesPath = path.join(DATA_DIR, 'new_articles.json');
  fs.writeFileSync(newArticlesPath, JSON.stringify({
    generatedAt: runTimestamp,
    runDate,
    totalScanned: scraped.length,
    newCount: newArticles.length,
    skipped,
    sourceWarnings,
    articles: newArticles
  }, null, 2));

  if (newArticles.length === 0) {
    logger.info('No new articles after deduplication — delivering empty-state messages');
    await deliverEmptyState(db, { runTimestamp, runDate, totalScanned: scraped.length, sourceWarnings });
    return;
  }

  logger.info(`✅ data/new_articles.json written with ${newArticles.length} articles.`);
  logger.info('');
  logger.info('=== HANDOFF TO CLAUDE CODE ===');
  logger.info('Claude Code should now:');
  logger.info('  1. Read data/new_articles.json');
  logger.info('  2. Score and summarize each article (see CLAUDE.md for rubric)');
  logger.info('  3. Write data/scored_articles.json');
  logger.info('  4. Call node src/index.js --deliver to complete delivery');
  logger.info('');
  logger.info('Context for scoring:');
  logger.info(`  - ${newArticles.length} new articles to evaluate`);
  logger.info(`  - Tier breakdown: ${tierBreakdown(newArticles)}`);

  // In dry-run mode, print articles to stdout and stop
  if (isDryRun) {
    console.log('\n=== DRY RUN — New articles to score ===\n');
    for (const a of newArticles) {
      console.log(`[Tier ${a.tier}] ${a.title}`);
      console.log(`  Source: ${a.source} | ${a.publishedDate}`);
      console.log(`  ${a.snippet?.slice(0, 150)}...`);
      console.log('');
    }
    return;
  }
}

// ─── Delivery phase (called after Claude Code writes scored_articles.json) ────
async function deliver() {
  const runTimestamp = new Date().toISOString();
  const runDate = runTimestamp.split('T')[0];
  const db = openDb();

  // Read scored articles
  const scoredPath = path.join(DATA_DIR, 'scored_articles.json');
  if (!fs.existsSync(scoredPath)) {
    logger.error('data/scored_articles.json not found — cannot deliver');
    process.exit(1);
  }

  const scoredData = JSON.parse(fs.readFileSync(scoredPath, 'utf8'));
  const scoredArticles = scoredData.articles || scoredData;
  const meta = scoredData.meta || {};

  const delivery = getDeliveryConfig();
  const runMeta = {
    date: meta.runDate || runDate,
    totalScanned: meta.totalScanned || 0,
    totalPassed: scoredArticles.length,
    sourceWarnings: meta.sourceWarnings || [],
    runTimestamp
  };

  logger.info({ articles: scoredArticles.length }, 'Starting delivery phase');

  // Update DB scores
  const { updateArticleScore, articleId } = require('./dedup/index');
  const top10 = scoredArticles.slice(0, 10);
  for (const a of scoredArticles) {
    updateArticleScore(db, articleId(a.url), a.impact_score, top10.includes(a));
  }

  // ── STEP 5: Google Chat webhook ───────────────────────────────────────────
  if (delivery.google_chat.enabled) {
    logger.info('Step 5: Posting to Google Chat');
    const card = buildChatCard(scoredArticles, { ...runMeta, runDate: runMeta.date });
    const result = await postToGoogleChat(delivery.google_chat.webhook_url, card);
    if (!result.success) {
      logger.warn({ reason: result.reason }, 'Google Chat delivery failed — continuing');
    }
  }

  // ── STEP 6: Blog post generation ──────────────────────────────────────────
  if (delivery.blog.enabled) {
    logger.info('Step 6: Generating blog post');
    const mdContent = generateMarkdownPost(scoredArticles, runMeta);
    const htmlContent = generateHtmlEmail(scoredArticles, runMeta, { maxWidth: 800, isEmail: false });

    const mdFile = `${runMeta.date}-sem-intel-digest.md`;
    const htmlFile = `${runMeta.date}-sem-intel-digest.html`;
    const mdPath = path.join(OUTPUT_BLOG_DIR, mdFile);
    const htmlPath = path.join(OUTPUT_BLOG_DIR, htmlFile);

    fs.writeFileSync(mdPath, mdContent);
    fs.writeFileSync(htmlPath, htmlContent);
    logger.info({ mdPath, htmlPath }, 'Blog files written');

    upsertIndexEntry(OUTPUT_BLOG_DIR, {
      date: runMeta.date,
      title: `SEM Intel Digest — ${runMeta.date}`,
      topScore: scoredArticles.length > 0 ? scoredArticles[0].impact_score : 0,
      articleCount: scoredArticles.length,
      mdFile,
      htmlFile,
      summary: scoredArticles.length > 0 ? scoredArticles[0].headline : 'No significant news today.'
    });

    // Optional CMS publish
    const cms = delivery.blog.cms;
    if (cms && cms.enabled) {
      const post = {
        title: `SEM Intel Digest — ${runMeta.date}`,
        htmlContent,
        markdownContent: mdContent,
        date: runMeta.date,
        scoredArticles,
        meta: runMeta
      };
      if (cms.type === 'wordpress') {
        await publishToWordPress(cms, post);
      } else if (cms.type === 'ghost') {
        await publishToGhost(cms, post);
      } else {
        await publishToGenericWebhook(cms, post);
      }
    }
  }

  // ── STEP 7: Email HTML fallback (Gmail MCP handles the actual draft) ───────
  // Write the HTML email to output/email/ as a fallback in case Gmail MCP fails
  const emailHtml = generateHtmlEmail(scoredArticles, runMeta, { maxWidth: 640, isEmail: true });
  const emailPath = path.join(OUTPUT_EMAIL_DIR, `${runMeta.date}-digest.html`);
  fs.writeFileSync(emailPath, emailHtml);

  // Also write structured data for Claude Code to use when creating the Gmail draft
  const emailDataPath = path.join(DATA_DIR, 'email_draft.json');
  fs.writeFileSync(emailDataPath, JSON.stringify({
    to: delivery.email.to,
    subject: buildEmailSubject(scoredArticles, runMeta.date),
    htmlBody: emailHtml,
    fallbackPath: emailPath
  }, null, 2));

  logger.info({ emailPath }, 'Email HTML written (Claude Code will create the Gmail draft)');
  logger.info('');
  logger.info('=== DELIVERY PHASE COMPLETE ===');
  logger.info('Claude Code should now:');
  logger.info('  1. Read data/email_draft.json');
  logger.info('  2. Create a Gmail draft using the Gmail MCP tool');
  logger.info(`  3. Send to: ${delivery.email.to}`);
}

// ─── Empty-state delivery ─────────────────────────────────────────────────────
async function deliverEmptyState(db, meta) {
  const delivery = getDeliveryConfig();

  if (delivery.google_chat.enabled) {
    const emptyCard = buildChatCard([], { ...meta, totalScanned: meta.totalScanned });
    await postToGoogleChat(delivery.google_chat.webhook_url, emptyCard);
  }

  const emptyHtml = generateHtmlEmail([], meta, { maxWidth: 640, isEmail: true });
  const emailPath = path.join(OUTPUT_EMAIL_DIR, `${meta.runDate}-digest.html`);
  fs.writeFileSync(emailPath, emptyHtml);

  fs.writeFileSync(path.join(DATA_DIR, 'email_draft.json'), JSON.stringify({
    to: delivery.email.to,
    subject: `📡 SEM Intel Digest — ${meta.runDate} (No new news today)`,
    htmlBody: emptyHtml,
    fallbackPath: emailPath
  }, null, 2));

  logger.info('Empty-state delivery complete');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildEmailSubject(scoredArticles, date) {
  const topScore = scoredArticles.length > 0 ? scoredArticles[0].impact_score : 0;
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
  return `📡 SEM Intel Digest — ${formattedDate} (${topScore}/10 top impact)`;
}

function tierBreakdown(articles) {
  const counts = {};
  for (const a of articles) {
    counts[`Tier ${a.tier}`] = (counts[`Tier ${a.tier}`] || 0) + 1;
  }
  return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
}

function getMode() {
  if (args.includes('--deliver')) return 'deliver';
  if (isScrapeOnly) return 'scrape-only';
  if (isDryRun) return 'dry-run';
  if (isSourcesMode) return 'sources';
  if (isWebhookTest) return 'webhook-test';
  if (isStatsMode) return 'stats';
  return 'full';
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────
if (args.includes('--deliver')) {
  deliver().catch(err => {
    logger.error({ error: err.message }, 'Delivery phase failed');
    process.exit(1);
  });
} else {
  main().catch(err => {
    logger.error({ error: err.message, stack: err.stack }, 'Main pipeline failed');
    process.exit(1);
  });
}
