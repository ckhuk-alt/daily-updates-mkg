'use strict';

const { scrapeRss } = require('./rss');
const logger = require('../utils/logger');

// Known Nitter instances to try in order
const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org'
];

/**
 * Build a Nitter RSS URL for a given Twitter handle or URL.
 */
function buildNitterRssUrl(twitterUrl, instance) {
  // Extract handle from URL like https://x.com/GinnyMarvin or https://twitter.com/GinnyMarvin
  const match = twitterUrl.match(/(?:x\.com|twitter\.com|nitter\.[^/]+)\/([^/?#]+)/);
  if (!match) return null;
  const handle = match[1];
  return `${instance}/${handle}/rss`;
}

/**
 * Try multiple Nitter instances for a social/Twitter source.
 * Falls back gracefully if all instances are unreachable.
 */
async function scrapeSocial(source) {
  // If the URL already looks like a Nitter RSS feed, just parse it
  if (source.url.includes('/rss')) {
    try {
      return await scrapeRss({ ...source });
    } catch (err) {
      logger.warn({ source: source.id, error: err.message }, 'Direct Nitter RSS failed');
    }
  }

  // Try each Nitter instance
  for (const instance of NITTER_INSTANCES) {
    const rssUrl = buildNitterRssUrl(source.url, instance);
    if (!rssUrl) continue;

    try {
      logger.info({ source: source.id, instance }, 'Trying Nitter instance');
      return await scrapeRss({ ...source, url: rssUrl });
    } catch (err) {
      logger.warn({ source: source.id, instance, error: err.message }, 'Nitter instance failed');
    }
  }

  logger.warn({ source: source.id }, 'All Nitter instances failed — skipping social source');
  return [];
}

module.exports = { scrapeSocial };
