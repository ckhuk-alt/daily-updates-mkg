'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

const URGENCY_EMOJI = {
  'Act Now': '🔴',
  'Plan Ahead': '🟡',
  'Monitor': '🔵',
  'FYI': '⚪'
};

/**
 * Format a date string for display.
 */
function formatDate(isoDate) {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  } catch {
    return isoDate;
  }
}

/**
 * Build a Google Chat Card V2 payload for the top 3 stories.
 * @param {Array} scoredArticles - Sorted scored articles array
 * @param {object} stats - { totalScanned, totalPassed, runDate }
 * @returns {object} Google Chat cards payload
 */
function buildChatCard(scoredArticles, stats) {
  const top3 = scoredArticles.slice(0, 3);
  const date = formatDate(stats.runDate || new Date().toISOString());

  if (top3.length === 0) {
    return {
      text: `📡 *SEM Intel Digest — ${date}*\nNo significant SEM/PPC news today. ${stats.totalScanned} sources scanned.`
    };
  }

  const sections = top3.map((article, i) => {
    const urgencyEmoji = URGENCY_EMOJI[article.urgency] || '⚪';
    const scoreBar = buildScoreBar(article.impact_score);

    return {
      header: `${urgencyEmoji} #${i + 1} · ${article.category || 'General'}`,
      widgets: [
        {
          decoratedText: {
            topLabel: `Impact: ${article.impact_score}/10  ${scoreBar}  ${article.urgency}`,
            text: `<b>${escapeHtml(article.headline)}</b>`,
            bottomLabel: truncate(article.summary, 200),
            button: {
              text: 'Read →',
              onClick: {
                openLink: { url: article.url }
              }
            }
          }
        }
      ]
    };
  });

  // Footer section
  sections.push({
    widgets: [
      {
        textParagraph: {
          text: `<i>📧 Full digest in your Gmail draft · ${stats.totalScanned} articles scanned · ${stats.totalPassed} passed filter</i>`
        }
      }
    ]
  });

  return {
    cardsV2: [
      {
        cardId: 'sem-intel-digest',
        card: {
          header: {
            title: '📡 SEM Intel Digest',
            subtitle: `${date} · ${top3.length} top ${top3.length === 1 ? 'story' : 'stories'}`
          },
          sections
        }
      }
    ]
  };
}

/**
 * Simple ASCII score bar (5 chars wide).
 */
function buildScoreBar(score) {
  const filled = Math.round((score / 10) * 5);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/**
 * POST the card payload to the Google Chat webhook URL.
 * @param {string} webhookUrl
 * @param {object} payload
 */
async function postToGoogleChat(webhookUrl, payload) {
  if (!webhookUrl || webhookUrl.startsWith('${')) {
    logger.warn('Google Chat webhook URL not configured — skipping');
    return { success: false, reason: 'Webhook URL not configured' };
  }

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    logger.info({ status: response.status }, 'Google Chat webhook posted successfully');
    return { success: true };
  } catch (err) {
    logger.warn({ error: err.message }, 'Google Chat webhook POST failed');
    return { success: false, reason: err.message };
  }
}

/**
 * Build a test card payload to verify webhook connectivity.
 */
function buildTestCard() {
  return {
    cardsV2: [
      {
        cardId: 'sem-intel-test',
        card: {
          header: {
            title: '📡 SEM Intel Agent — Test',
            subtitle: 'Webhook connectivity test'
          },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: '✅ <b>Webhook is configured and working!</b>\n\nThis is a test message from SEM Intel Agent. Your daily digests will appear here at 7:00 AM CET.'
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  };
}

module.exports = { buildChatCard, postToGoogleChat, buildTestCard };
