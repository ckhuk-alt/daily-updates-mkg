'use strict';

const Parser = require('rss-parser');
const logger = require('../utils/logger');

const USER_AGENT = 'SEM-Intel-Agent/1.0 (internal news digest)';

const parser = new Parser({
  headers: { 'User-Agent': USER_AGENT },
  timeout: 15000,
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['dc:creator', 'creator'],
      ['content:encoded', 'contentEncoded']
    ]
  }
});

/**
 * Strip HTML tags and collapse whitespace from a string.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scrape an RSS feed and return an array of article objects.
 * @param {object} source - Source config object
 * @returns {Promise<Array>}
 */
async function scrapeRss(source) {
  logger.info({ source: source.id }, `Fetching RSS: ${source.url}`);

  let feed;
  try {
    feed = await parser.parseURL(source.url);
  } catch (err) {
    logger.warn({ source: source.id, error: err.message }, 'RSS fetch failed');
    throw err;
  }

  const articles = [];

  for (const item of (feed.items || [])) {
    const fullText = stripHtml(item.contentEncoded || item.content || item['content:encoded'] || '');
    const snippet = stripHtml(item.contentSnippet || item.summary || '').slice(0, 500);
    const body = fullText || snippet;

    articles.push({
      title: item.title ? item.title.trim() : '',
      url: item.link || item.guid || '',
      source: source.name,
      sourceId: source.id,
      tier: source.tier,
      publishedDate: item.pubDate || item.isoDate || new Date().toISOString(),
      author: item.creator || item.author || '',
      snippet: snippet || body.slice(0, 500),
      fullText: body.slice(0, 3000)
    });
  }

  logger.info({ source: source.id, count: articles.length }, 'RSS fetch complete');
  return articles;
}

module.exports = { scrapeRss };
