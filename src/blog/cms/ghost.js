'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Publish a post to Ghost CMS via the Admin API.
 * @param {object} cmsConfig - { api_url, auth_token }
 * @param {object} post - { title, htmlContent, date }
 */
async function publishToGhost(cmsConfig, post) {
  const { api_url, auth_token } = cmsConfig;
  if (!api_url || !auth_token || auth_token.startsWith('${')) {
    logger.warn('Ghost CMS config incomplete — skipping publish');
    return { success: false, reason: 'Incomplete config' };
  }

  const endpoint = `${api_url.replace(/\/$/, '')}/ghost/api/admin/posts/`;

  try {
    const response = await axios.post(endpoint, {
      posts: [{
        title: post.title,
        html: post.htmlContent,
        status: 'draft',
        published_at: post.date,
        tags: [{ name: 'SEM' }, { name: 'PPC' }, { name: 'Daily Digest' }]
      }]
    }, {
      headers: {
        Authorization: `Ghost ${auth_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const created = response.data.posts[0];
    logger.info({ postId: created.id, url: created.url }, 'Ghost draft created');
    return { success: true, postId: created.id, url: created.url };
  } catch (err) {
    logger.warn({ error: err.message }, 'Ghost publish failed');
    return { success: false, reason: err.message };
  }
}

module.exports = { publishToGhost };
