'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const INDEX_FILE = 'index.json';

/**
 * Load the blog index from disk, or return an empty index.
 */
function loadIndex(outputDir) {
  const indexPath = path.join(outputDir, INDEX_FILE);
  if (fs.existsSync(indexPath)) {
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      return { posts: [] };
    }
  }
  return { posts: [] };
}

/**
 * Add or update a post entry in the blog index and save it.
 * @param {string} outputDir
 * @param {object} postMeta - { date, title, topScore, mdFile, htmlFile, summary }
 */
function upsertIndexEntry(outputDir, postMeta) {
  const index = loadIndex(outputDir);

  const existing = index.posts.findIndex(p => p.date === postMeta.date);
  if (existing >= 0) {
    index.posts[existing] = postMeta;
  } else {
    index.posts.unshift(postMeta); // newest first
  }

  // Keep index sorted newest-first
  index.posts.sort((a, b) => b.date.localeCompare(a.date));

  const indexPath = path.join(outputDir, INDEX_FILE);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  logger.info({ date: postMeta.date }, 'Blog index updated');
}

module.exports = { upsertIndexEntry, loadIndex };
