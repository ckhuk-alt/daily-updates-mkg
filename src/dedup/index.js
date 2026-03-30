'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('../utils/logger');

const DB_PATH = path.join(process.cwd(), 'data', 'articles.db');
const DEDUP_WINDOW_DAYS = 14;
const PURGE_AFTER_DAYS = 30;

/**
 * Compute a stable ID for an article based on its canonical URL.
 */
function articleId(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

/**
 * Open (or create) the SQLite database and ensure schema is up to date.
 */
function openDb() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      published_date TEXT,
      scraped_at TEXT DEFAULT (datetime('now')),
      score REAL,
      included_in_digest INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS source_health (
      source_id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      consecutive_failures INTEGER DEFAULT 0,
      last_success TEXT,
      last_failure TEXT
    );
  `);

  return db;
}

/**
 * Purge articles older than PURGE_AFTER_DAYS from the database.
 */
function purgeOldArticles(db) {
  const result = db.prepare(
    `DELETE FROM articles WHERE scraped_at < datetime('now', '-${PURGE_AFTER_DAYS} days')`
  ).run();
  if (result.changes > 0) {
    logger.info({ purged: result.changes }, 'Purged old articles from DB');
  }
}

/**
 * Filter out already-seen articles and store new ones in the DB.
 * Reads from `data/scraped_articles.json`, writes `data/new_articles.json`.
 *
 * @param {object} db - SQLite database handle
 * @param {Array} articles - Raw scraped articles
 * @returns {{ newArticles: Array, skipped: number, sourceWarnings: string[] }}
 */
function deduplicateArticles(db, articles) {
  purgeOldArticles(db);

  const checkStmt = db.prepare(
    `SELECT 1 FROM articles WHERE id = ? AND scraped_at >= datetime('now', '-${DEDUP_WINDOW_DAYS} days')`
  );
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO articles (id, url, title, source, published_date) VALUES (?, ?, ?, ?, ?)`
  );

  const newArticles = [];
  let skipped = 0;

  for (const article of articles) {
    if (!article.url) { skipped++; continue; }
    const id = articleId(article.url);
    const existing = checkStmt.get(id);
    if (existing) {
      skipped++;
      continue;
    }

    // Mark as seen
    insertStmt.run(id, article.url, article.title, article.source, article.publishedDate || null);
    newArticles.push({ ...article, _id: id });
  }

  // Check for sources with 3+ consecutive failures
  const failingSources = db.prepare(
    `SELECT source_name, consecutive_failures FROM source_health WHERE consecutive_failures >= 3`
  ).all();

  const sourceWarnings = failingSources.map(
    row => `⚠️ Source "${row.source_name}" has been unreachable for ${row.consecutive_failures} days.`
  );

  logger.info({ new: newArticles.length, skipped }, 'Deduplication complete');

  return { newArticles, skipped, sourceWarnings };
}

/**
 * Update an article's score and digest inclusion status after scoring.
 */
function updateArticleScore(db, articleId, score, includedInDigest) {
  db.prepare(
    `UPDATE articles SET score = ?, included_in_digest = ? WHERE id = ?`
  ).run(score, includedInDigest ? 1 : 0, articleId);
}

/**
 * Read stats from the database for --stats CLI mode.
 */
function getStats(db) {
  const totalArticles = db.prepare('SELECT COUNT(*) as count FROM articles').get();
  const recentArticles = db.prepare(
    `SELECT COUNT(*) as count FROM articles WHERE scraped_at >= datetime('now', '-7 days')`
  ).get();
  const topScored = db.prepare(
    `SELECT title, source, score, included_in_digest FROM articles WHERE score IS NOT NULL ORDER BY score DESC LIMIT 10`
  ).all();
  const sourceHealth = db.prepare('SELECT * FROM source_health ORDER BY consecutive_failures DESC').all();

  return { totalArticles: totalArticles.count, recentArticles: recentArticles.count, topScored, sourceHealth };
}

module.exports = { openDb, deduplicateArticles, updateArticleScore, getStats, articleId };
