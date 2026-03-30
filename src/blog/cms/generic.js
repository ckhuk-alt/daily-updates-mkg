'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * POST the full digest payload to a generic webhook URL.
 * @param {object} cmsConfig - { api_url, auth_token }
 * @param {object} post - { title, htmlContent, markdownContent, date, scoredArticles, meta }
 */
async function publishToGenericWebhook(cmsConfig, post) {
  const { api_url, auth_token } = cmsConfig;
  if (!api_url) {
    logger.warn('Generic CMS webhook URL not configured — skipping');
    return { success: false, reason: 'No api_url configured' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (auth_token && !auth_token.startsWith('${')) {
    headers['Authorization'] = `Bearer ${auth_token}`;
  }

  const payload = {
    title: post.title,
    date: post.date,
    html: post.htmlContent,
    markdown: post.markdownContent,
    articles: post.scoredArticles || [],
    meta: post.meta || {}
  };

  try {
    const response = await axios.post(api_url, payload, { headers, timeout: 15000 });
    logger.info({ status: response.status }, 'Generic webhook published successfully');
    return { success: true };
  } catch (err) {
    logger.warn({ error: err.message }, 'Generic webhook publish failed');
    return { success: false, reason: err.message };
  }
}

module.exports = { publishToGenericWebhook };
