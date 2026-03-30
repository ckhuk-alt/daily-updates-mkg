'use strict';

const URGENCY_COLORS = {
  'Act Now': { bg: '#fee2e2', border: '#ef4444', badge: '#dc2626', text: '#7f1d1d', emoji: '🔴' },
  'Plan Ahead': { bg: '#fef9c3', border: '#eab308', badge: '#ca8a04', text: '#713f12', emoji: '🟡' },
  'Monitor': { bg: '#dbeafe', border: '#3b82f6', badge: '#2563eb', text: '#1e3a8a', emoji: '🔵' },
  'FYI': { bg: '#f3f4f6', border: '#9ca3af', badge: '#6b7280', text: '#1f2937', emoji: '⚪' }
};

const CATEGORY_COLORS = {
  'Platform Update': '#e0f2fe',
  'Shopping/PLA': '#fce7f3',
  'Bidding & Automation': '#f0fdf4',
  'Measurement & Tracking': '#fdf4ff',
  'Policy & Privacy': '#fff7ed',
  'AI & Emerging': '#f0f9ff',
  'Microsoft/Bing': '#eff6ff',
  'Industry Trend': '#f9fafb'
};

function formatDate(isoDate) {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  } catch {
    return isoDate;
  }
}

function formatDateShort(isoDate) {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch {
    return isoDate;
  }
}

function buildScoreBar(score, maxWidth = 120) {
  const filled = Math.round((score / 10) * maxWidth);
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
      <div style="flex:1;background:#e5e7eb;border-radius:9999px;height:8px;max-width:${maxWidth}px;">
        <div style="background:#2563eb;height:8px;border-radius:9999px;width:${filled}px;"></div>
      </div>
      <span style="font-size:12px;color:#6b7280;font-weight:600;">${score}/10</span>
    </div>`;
}

function articleCard(article, index, isEmail = true) {
  const maxWidth = isEmail ? 580 : 760;
  const urgency = URGENCY_COLORS[article.urgency] || URGENCY_COLORS['FYI'];
  const catColor = CATEGORY_COLORS[article.category] || '#f3f4f6';

  return `
  <div style="background:${urgency.bg};border:1px solid ${urgency.border};border-radius:10px;padding:20px;margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <span style="background:${urgency.badge};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:9999px;letter-spacing:.5px;">${urgency.emoji} ${article.urgency || 'FYI'}</span>
      <span style="background:${catColor};color:#374151;font-size:11px;font-weight:600;padding:3px 10px;border-radius:9999px;">${article.category || 'General'}</span>
      <span style="margin-left:auto;font-size:13px;color:${urgency.badge};font-weight:700;">#${index + 1}</span>
    </div>
    <h2 style="margin:0 0 8px;font-size:17px;line-height:1.4;color:#111827;">
      <a href="${article.url}" style="color:#1d4ed8;text-decoration:none;">${escapeHtml(article.headline)}</a>
    </h2>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">
      ${escapeHtml(article.source || '')}${article.author ? ` · ${escapeHtml(article.author)}` : ''}${article.publishedDate ? ` · ${formatDateShort(article.publishedDate)}` : ''}
    </p>
    <p style="margin:12px 0 8px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(article.summary || '')}</p>
    <div style="background:rgba(255,255,255,0.6);border-left:3px solid ${urgency.border};padding:10px 14px;border-radius:4px;margin:10px 0;">
      <span style="font-size:12px;font-weight:700;color:#374151;">💡 Impact: </span>
      <span style="font-size:13px;line-height:1.5;color:#374151;">${escapeHtml(article.impact_analysis || '')}</span>
    </div>
    ${buildScoreBar(article.impact_score, isEmail ? 150 : 200)}
  </div>`;
}

function compactRow(article, index) {
  const urgency = URGENCY_COLORS[article.urgency] || URGENCY_COLORS['FYI'];
  const shortSummary = (article.summary || '').split('.')[0];
  return `
  <div style="border-bottom:1px solid #e5e7eb;padding:10px 0;">
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
      <span style="font-size:12px;font-weight:700;color:#9ca3af;">#${index + 1}</span>
      <a href="${article.url}" style="font-size:14px;font-weight:600;color:#1d4ed8;text-decoration:none;">${escapeHtml(article.headline)}</a>
      <span style="font-size:12px;color:${urgency.badge};font-weight:600;">${article.impact_score}/10</span>
    </div>
    <p style="margin:4px 0 0 20px;font-size:13px;color:#6b7280;">${escapeHtml(shortSummary)}${shortSummary ? '.' : ''} <span style="color:#9ca3af;">— ${escapeHtml(article.source || '')}</span></p>
  </div>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a complete HTML email string.
 * @param {Array} scoredArticles
 * @param {object} meta - { date, totalScanned, totalPassed, sourceWarnings, runTimestamp }
 * @param {object} options - { maxWidth: 640 (email) or 800 (blog), isEmail: true/false }
 * @returns {string} Full HTML document
 */
function generateHtmlEmail(scoredArticles, meta, options = {}) {
  const { maxWidth = 640, isEmail = true } = options;
  const date = meta.date || new Date().toISOString().split('T')[0];
  const displayDate = formatDate(date);
  const topScore = scoredArticles.length > 0 ? scoredArticles[0].impact_score : 0;
  const topArticles = scoredArticles.slice(0, 3);
  const moreArticles = scoredArticles.slice(3, 10);

  const headerTitle = isEmail
    ? `📡 SEM Intel Digest — ${displayDate}`
    : `SEM Intel Digest — ${displayDate}`;

  const topCardsHtml = topArticles.map((a, i) => articleCard(a, i, isEmail)).join('');
  const compactRowsHtml = moreArticles.map((a, i) => compactRow(a, i + 3)).join('');

  const moreSection = moreArticles.length > 0 ? `
  <div style="margin-top:24px;">
    <details>
      <summary style="cursor:pointer;font-size:14px;font-weight:600;color:#2563eb;padding:10px 0;">▶ Show ${moreArticles.length} more ${moreArticles.length === 1 ? 'story' : 'stories'}</summary>
      <div style="margin-top:12px;">
        ${compactRowsHtml}
      </div>
    </details>
  </div>` : '';

  const warningsHtml = (meta.sourceWarnings || []).length > 0
    ? `<div style="margin-top:16px;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;">⚙️ Source Health</p>
        ${meta.sourceWarnings.map(w => `<p style="margin:6px 0 0;font-size:13px;color:#b45309;">${escapeHtml(w)}</p>`).join('')}
      </div>`
    : '';

  const emptyState = scoredArticles.length === 0
    ? `<div style="text-align:center;padding:40px 20px;">
        <p style="font-size:16px;color:#6b7280;">No significant SEM/PPC news today.</p>
        <p style="font-size:14px;color:#9ca3af;">Sources scanned: ${meta.totalScanned || 0}. Check back tomorrow.</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${headerTitle}</title>
<style>
  @media (prefers-color-scheme: dark) {
    body { background-color: #111827 !important; color: #f9fafb !important; }
    .email-wrapper { background-color: #1f2937 !important; }
    .email-header { background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%) !important; }
    a { color: #93c5fd !important; }
  }
</style>
</head>
<body style="margin:0;padding:20px;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:${maxWidth}px;margin:0 auto;">
    <div class="email-wrapper" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

      <!-- Header -->
      <div class="email-header" style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:28px 32px;color:#fff;">
        <h1 style="margin:0;font-size:22px;font-weight:700;">📡 SEM Intel Digest</h1>
        <p style="margin:6px 0 0;font-size:14px;opacity:.85;">${displayDate}</p>
        <p style="margin:4px 0 0;font-size:13px;opacity:.75;">${meta.totalScanned || 0} articles scanned · Top ${topArticles.length} curated${topScore > 0 ? ` · Top impact: ${topScore}/10` : ''}</p>
      </div>

      <!-- Body -->
      <div style="padding:24px 32px;">

        ${emptyState}
        ${topCardsHtml}
        ${moreSection}
        ${warningsHtml}

        <!-- Footer -->
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
          <p style="margin:0;">⚙️ Agent run: ${escapeHtml(meta.runTimestamp || new Date().toISOString())} · Scanned: ${meta.totalScanned || 0} · Passed filter: ${meta.totalPassed || 0}</p>
          <p style="margin:6px 0 0;">This digest is generated by SEM Intel Agent. To adjust sources or frequency, edit <code>config/sources.json</code>.</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateHtmlEmail, escapeHtml };
