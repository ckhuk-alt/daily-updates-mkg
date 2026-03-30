'use strict';

const fs = require('fs');
const path = require('path');
const { getSources } = require('../utils/config');
const { scrapeRss } = require('./rss');
const { scrapeHtml } = require('./html');
const { scrapeSocial } = require('./social');
const logger = require('../utils/logger');

const DOMAIN_DELAY_MS = 2000; // 2s delay between requests to the same domain

// Track last request time per domain for polite crawling
const domainLastRequest = {};

async function waitForDomain(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }
  const now = Date.now();
  const last = domainLastRequest[hostname] || 0;
  const elapsed = now - last;
  if (elapsed < DOMAIN_DELAY_MS) {
    const wait = DOMAIN_DELAY_MS - elapsed;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  domainLastRequest[hostname] = Date.now();
}

/**
 * Determine which scraper to use based on source method.
 * Social/Nitter sources use the social scraper.
 */
function isSocialSource(source) {
  return source.url.includes('nitter') ||
    source.url.includes('x.com') ||
    source.url.includes('twitter.com') ||
    source.method === 'social';
}

/**
 * Run the full scraper across all enabled sources.
 * Outputs `data/scraped_articles.json`.
 * Also updates SQLite with consecutive failure tracking.
 */
async function runScraper(db, options = {}) {
  const sources = getSources().filter(s => s.enabled !== false);
  const allArticles = [];
  const sourceHealth = {};

  logger.info({ count: sources.length }, 'Starting scraper');

  for (const source of sources) {
    await waitForDomain(source.url);

    try {
      let articles;
      if (isSocialSource(source)) {
        articles = await scrapeSocial(source);
      } else if (source.method === 'html') {
        articles = await scrapeHtml(source);
      } else {
        // Default: RSS
        articles = await scrapeRss(source);
      }

      allArticles.push(...articles);
      sourceHealth[source.id] = { success: true, count: articles.length };

      // Reset consecutive failures in DB
      if (db) {
        db.prepare(
          `UPDATE source_health SET consecutive_failures = 0, last_success = datetime('now') WHERE source_id = ?`
        ).run(source.id);

        // Ensure row exists
        db.prepare(
          `INSERT OR IGNORE INTO source_health (source_id, source_name, consecutive_failures) VALUES (?, ?, 0)`
        ).run(source.id, source.name);
      }

    } catch (err) {
      logger.warn({ source: source.id, error: err.message }, 'Source failed');
      sourceHealth[source.id] = { success: false, error: err.message };

      if (db) {
        // Upsert and increment consecutive_failures
        db.prepare(
          `INSERT INTO source_health (source_id, source_name, consecutive_failures, last_failure)
           VALUES (?, ?, 1, datetime('now'))
           ON CONFLICT(source_id) DO UPDATE SET
             consecutive_failures = consecutive_failures + 1,
             last_failure = datetime('now')`
        ).run(source.id, source.name);
      }
    }
  }

  // Write raw output
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const outputPath = path.join(dataDir, 'scraped_articles.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    scrapedAt: new Date().toISOString(),
    totalSources: sources.length,
    totalArticles: allArticles.length,
    sourceHealth,
    articles: allArticles
  }, null, 2));

  logger.info({ total: allArticles.length, outputPath }, 'Scraper complete');
  return { articles: allArticles, sourceHealth };
}

module.exports = { runScraper };
