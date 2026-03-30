'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Publish a post to WordPress via the REST API.
 * @param {object} cmsConfig - { api_url, auth_token }
 * @param {object} post - { title, htmlContent, date }
 */
async function publishToWordPress(cmsConfig, post) {
  const { api_url, auth_token } = cmsConfig;
  if (!api_url || !auth_token || auth_token.startsWith('${')) {
    logger.warn('WordPress CMS config incomplete — skipping publish');
    return { success: false, reason: 'Incomplete config' };
  }

  const endpoint = `${api_url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

  try {
    const response = await axios.post(endpoint, {
      title: post.title,
      content: post.htmlContent,
      status: 'draft',
      date: post.date
    }, {
      headers: {
        Authorization: `Bearer ${auth_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    logger.info({ postId: response.data.id, link: response.data.link }, 'WordPress draft created');
    return { success: true, postId: response.data.id, link: response.data.link };
  } catch (err) {
    logger.warn({ error: err.message }, 'WordPress publish failed');
    return { success: false, reason: err.message };
  }
}

module.exports = { publishToWordPress };
