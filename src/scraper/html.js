'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

const USER_AGENT = 'SEM-Intel-Agent/1.0 (internal news digest)';

/**
 * Strip HTML and trim text.
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
 * Resolve a relative URL to absolute using the base URL.
 */
function resolveUrl(href, base) {
  if (!href) return '';
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

/**
 * Scrape an HTML page for articles using CSS selectors from source config.
 * @param {object} source
 * @returns {Promise<Array>}
 */
async function scrapeHtml(source) {
  logger.info({ source: source.id }, `Fetching HTML: ${source.url}`);

  let html;
  try {
    const response = await axios.get(source.url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 20000
    });
    html = response.data;
  } catch (err) {
    logger.warn({ source: source.id, error: err.message }, 'HTML fetch failed');
    throw err;
  }

  const $ = cheerio.load(html);
  const selectors = source.selectors || {
    articles: 'article, .post, .blog-post, .entry',
    title: 'h2, h1, .post-title, .entry-title',
    link: 'a',
    date: 'time, .date, .post-date, .published',
    snippet: 'p, .excerpt, .post-excerpt, .entry-summary'
  };

  const articles = [];

  $(selectors.articles).each((i, el) => {
    const $el = $(el);

    const titleEl = $el.find(selectors.title).first();
    const title = titleEl.text().trim();
    if (!title) return;

    // Find the canonical link — prefer link within the title, else first <a>
    const titleLink = titleEl.find('a').first().attr('href') ||
      $el.find(selectors.link).first().attr('href') || '';
    const url = resolveUrl(titleLink, source.url);

    // Date
    const dateEl = $el.find(selectors.date).first();
    const dateStr = dateEl.attr('datetime') || dateEl.text().trim() || '';

    // Snippet
    const snippetEl = $el.find(selectors.snippet).first();
    const snippetText = stripHtml(snippetEl.html() || '').slice(0, 500);

    // Full text: collect all <p> text under the article element
    const paragraphs = [];
    $el.find('p').each((j, p) => {
      const text = $(p).text().trim();
      if (text.length > 20) paragraphs.push(text);
    });
    const fullText = paragraphs.join(' ').slice(0, 3000);

    if (url) {
      articles.push({
        title,
        url,
        source: source.name,
        sourceId: source.id,
        tier: source.tier,
        publishedDate: dateStr || new Date().toISOString(),
        author: '',
        snippet: snippetText || fullText.slice(0, 500),
        fullText: fullText || snippetText
      });
    }
  });

  logger.info({ source: source.id, count: articles.length }, 'HTML scrape complete');
  return articles;
}

module.exports = { scrapeHtml };
