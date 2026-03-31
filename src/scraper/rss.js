'use strict';

const Parser = require('rss-parser');
const axios = require('axios');
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
 * Google News RSS items have redirect URLs like:
 * https://news.google.com/rss/articles/CBMi...
 * Follow the redirect to get the real article URL.
 */
async function resolveGoogleNewsUrl(redirectUrl) {
  try {
    const response = await axios.get(redirectUrl, {
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 5,
      timeout: 8000,
      validateStatus: () => true // accept any status, we just want the final URL
    });
    // axios follows redirects and gives us the final URL
    return response.request?.res?.responseUrl || response.config?.url || redirectUrl;
  } catch {
    return redirectUrl; // fall back to original if resolution fails
  }
}

function isGoogleNewsSource(source) {
  return source.url.includes('news.google.com');
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
  const isGNews = isGoogleNewsSource(source);

  for (const item of (feed.items || [])) {
    const fullText = stripHtml(item.contentEncoded || item.content || item['content:encoded'] || '');
    const snippet = stripHtml(item.contentSnippet || item.summary || '').slice(0, 500);
    const body = fullText || snippet;

    // Google News items: extract the publisher name from the title suffix " - Publisher"
    // and resolve the redirect to get the real article URL
    let title = item.title ? item.title.trim() : '';
    let author = item.creator || item.author || '';
    let url = item.link || item.guid || '';

    if (isGNews) {
      // Title format: "Article headline - Publisher Name"
      const titleMatch = title.match(/^(.+?)\s+-\s+([^-]+)$/);
      if (titleMatch) {
        title = titleMatch[1].trim();
        author = author || titleMatch[2].trim();
      }
      // Resolve the Google News redirect URL to the real article URL
      if (url.includes('news.google.com')) {
        url = await resolveGoogleNewsUrl(url);
      }
    }

    articles.push({
      title,
      url,
      source: source.name,
      sourceId: source.id,
      tier: source.tier,
      publishedDate: item.pubDate || item.isoDate || new Date().toISOString(),
      author,
      snippet: snippet || body.slice(0, 500),
      fullText: body.slice(0, 3000)
    });
  }

  logger.info({ source: source.id, count: articles.length }, 'RSS fetch complete');
  return articles;
}

module.exports = { scrapeRss };
