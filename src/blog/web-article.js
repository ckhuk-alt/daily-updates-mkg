'use strict';

/**
 * Generates a polished, public-facing web article from scored articles.
 * Suitable for publishing as a standalone webpage, blog post, or archive page.
 *
 * Features:
 * - Open Graph + Twitter Card meta tags (shareable)
 * - Sticky header with date and article count
 * - Table of contents with jump links
 * - Full article cards with urgency/category badges
 * - Compact "more stories" grid below the fold
 * - Print-friendly CSS
 * - Responsive (mobile-first)
 */

const URGENCY = {
  'Act Now':    { bg: '#fef2f2', border: '#fca5a5', badge: '#dc2626', emoji: '🔴' },
  'Plan Ahead': { bg: '#fffbeb', border: '#fcd34d', badge: '#d97706', emoji: '🟡' },
  'Monitor':    { bg: '#eff6ff', border: '#93c5fd', badge: '#2563eb', emoji: '🔵' },
  'FYI':        { bg: '#f9fafb', border: '#d1d5db', badge: '#6b7280', emoji: '⚪' }
};

const CATEGORY_COLOR = {
  'Platform Update':       '#0ea5e9',
  'Shopping/PLA':          '#ec4899',
  'Bidding & Automation':  '#10b981',
  'Measurement & Tracking':'#8b5cf6',
  'Policy & Privacy':      '#f97316',
  'AI & Emerging':         '#06b6d4',
  'Microsoft/Bing':        '#3b82f6',
  'Industry Trend':        '#6b7280'
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  } catch { return iso; }
}

function fmtDateShort(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  } catch { return iso; }
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

function scoreBar(score) {
  const pct = Math.round((score / 10) * 100);
  return `<div class="score-bar-wrap">
    <div class="score-bar" style="width:${pct}%"></div>
    <span class="score-label">${score}/10</span>
  </div>`;
}

function topCard(article, n) {
  const u = URGENCY[article.urgency] || URGENCY['FYI'];
  const catColor = CATEGORY_COLOR[article.category] || '#6b7280';
  const slug = slugify(article.headline || article.url);
  const sourceLine = [article.source, article.author, article.publishedDate ? fmtDateShort(article.publishedDate) : null]
    .filter(Boolean).join(' · ');

  return `
  <article id="${slug}" class="article-card" style="border-left:4px solid ${u.badge}; background:${u.bg};">
    <div class="card-meta">
      <span class="badge urgency-badge" style="background:${u.badge};">${u.emoji} ${esc(article.urgency)}</span>
      <span class="badge cat-badge" style="color:${catColor}; border-color:${catColor}33;">${esc(article.category)}</span>
      <span class="card-num">#${n}</span>
    </div>
    <h2 class="card-title">
      <a href="${esc(article.url)}" target="_blank" rel="noopener">${esc(article.headline)}</a>
    </h2>
    <p class="card-source">${esc(sourceLine)}</p>
    <p class="card-summary">${esc(article.summary)}</p>
    <div class="impact-box">
      <span class="impact-label">💡 What this means for PPC teams</span>
      <p>${esc(article.impact_analysis)}</p>
    </div>
    ${scoreBar(article.impact_score)}
  </article>`;
}

function moreCard(article, n) {
  const u = URGENCY[article.urgency] || URGENCY['FYI'];
  const slug = slugify(article.headline || article.url);
  const firstSentence = (article.summary || '').split('.')[0];
  return `
  <div id="${slug}" class="more-card" style="border-left:3px solid ${u.badge};">
    <div class="more-meta">
      <span class="more-num">#${n}</span>
      <span class="more-score">${article.impact_score}/10</span>
      <span class="more-urgency" style="color:${u.badge};">${u.emoji} ${esc(article.urgency)}</span>
    </div>
    <h3 class="more-title"><a href="${esc(article.url)}" target="_blank" rel="noopener">${esc(article.headline)}</a></h3>
    <p class="more-summary">${esc(firstSentence)}${firstSentence ? '.' : ''} <span class="more-source">— ${esc(article.source)}</span></p>
  </div>`;
}

function tocItem(article, n) {
  const slug = slugify(article.headline || article.url);
  const u = URGENCY[article.urgency] || URGENCY['FYI'];
  return `<li><a href="#${slug}">${u.emoji} <strong>#${n}</strong> ${esc(article.headline)}</a></li>`;
}

/**
 * Generate a standalone web article HTML file.
 * @param {Array} scoredArticles
 * @param {object} meta - { date, totalScanned, totalPassed, sourceWarnings, runTimestamp }
 * @returns {string} Complete HTML document
 */
function generateWebArticle(scoredArticles, meta) {
  const date = meta.date || new Date().toISOString().split('T')[0];
  const displayDate = fmtDate(date);
  const topScore = scoredArticles.length > 0 ? scoredArticles[0].impact_score : 0;
  const topArticles = scoredArticles.slice(0, 3);
  const moreArticles = scoredArticles.slice(3, 10);
  const pageTitle = `SEM Intel Digest — ${displayDate}`;
  const metaDesc = scoredArticles.length > 0
    ? `Today's top story: ${scoredArticles[0].headline}. ${scoredArticles.length} articles curated from ${meta.totalScanned || 0} sources.`
    : `No significant SEM/PPC news today. ${meta.totalScanned || 0} sources scanned.`;

  const topCardsHtml = topArticles.map((a, i) => topCard(a, i + 1)).join('\n');
  const moreCardsHtml = moreArticles.map((a, i) => moreCard(a, i + 4)).join('\n');
  const tocHtml = scoredArticles.slice(0, 10).map((a, i) => tocItem(a, i + 1)).join('\n');
  const sourceNames = [...new Set(scoredArticles.map(a => a.source).filter(Boolean))];

  const warningsHtml = (meta.sourceWarnings || []).length > 0 ? `
  <div class="warnings">
    <h3>⚙️ Source Health</h3>
    ${meta.sourceWarnings.map(w => `<p>${esc(w)}</p>`).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <meta name="author" content="SEM Intel Agent">
  <meta name="robots" content="index, follow">

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${date}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --blue: #2563eb;
      --dark: #111827;
      --mid: #374151;
      --muted: #6b7280;
      --border: #e5e7eb;
      --bg: #f9fafb;
      --white: #ffffff;
      --radius: 10px;
      --shadow: 0 1px 4px rgba(0,0,0,.08);
    }

    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--dark); line-height: 1.6; font-size: 16px; }

    /* Header */
    .site-header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; padding: 32px 24px 28px; text-align: center; }
    .site-header h1 { font-size: clamp(20px, 4vw, 32px); font-weight: 800; letter-spacing: -.5px; }
    .site-header .subtitle { margin-top: 8px; font-size: 15px; opacity: .85; }
    .site-header .stats { margin-top: 6px; font-size: 13px; opacity: .7; }

    /* Layout */
    .container { max-width: 800px; margin: 0 auto; padding: 0 16px; }
    .main { padding: 32px 0 64px; }

    /* TOC */
    .toc { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 32px; box-shadow: var(--shadow); }
    .toc h2 { font-size: 14px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 12px; }
    .toc ol { padding-left: 20px; }
    .toc li { font-size: 14px; margin-bottom: 6px; }
    .toc a { color: var(--blue); text-decoration: none; }
    .toc a:hover { text-decoration: underline; }

    /* Article cards (top 3) */
    .section-label { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; margin: 0 0 16px; }
    .article-card { background: var(--white); border-radius: var(--radius); padding: 24px; margin-bottom: 20px; box-shadow: var(--shadow); }
    .card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; }
    .urgency-badge { color: #fff; }
    .cat-badge { border: 1px solid; background: transparent; }
    .card-num { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--muted); }
    .card-title { font-size: clamp(16px, 2.5vw, 20px); font-weight: 700; line-height: 1.3; margin-bottom: 6px; }
    .card-title a { color: var(--dark); text-decoration: none; }
    .card-title a:hover { color: var(--blue); }
    .card-source { font-size: 12px; color: var(--muted); margin-bottom: 12px; }
    .card-summary { font-size: 15px; color: var(--mid); line-height: 1.65; margin-bottom: 14px; }
    .impact-box { background: rgba(0,0,0,.03); border-left: 3px solid var(--blue); padding: 10px 14px; border-radius: 4px; margin-bottom: 12px; }
    .impact-label { font-size: 12px; font-weight: 700; color: var(--mid); display: block; margin-bottom: 4px; }
    .impact-box p { font-size: 13px; color: var(--mid); line-height: 1.6; }

    /* Score bar */
    .score-bar-wrap { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
    .score-bar-wrap > div { flex: 1; max-width: 160px; height: 6px; background: var(--border); border-radius: 9999px; overflow: hidden; }
    .score-bar { height: 6px; background: var(--blue); border-radius: 9999px; }
    .score-label { font-size: 12px; font-weight: 700; color: var(--muted); }

    /* More stories grid */
    .more-section { margin-top: 40px; }
    .more-grid { display: grid; gap: 14px; }
    .more-card { background: var(--white); border-radius: 8px; padding: 14px 16px; box-shadow: var(--shadow); }
    .more-meta { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
    .more-num { font-size: 12px; font-weight: 700; color: var(--muted); }
    .more-score { font-size: 12px; font-weight: 700; color: var(--blue); background: #eff6ff; padding: 1px 7px; border-radius: 9999px; }
    .more-urgency { font-size: 12px; font-weight: 600; }
    .more-title { font-size: 15px; font-weight: 600; line-height: 1.35; margin-bottom: 4px; }
    .more-title a { color: var(--dark); text-decoration: none; }
    .more-title a:hover { color: var(--blue); }
    .more-summary { font-size: 13px; color: var(--muted); }
    .more-source { font-style: italic; }

    /* Warnings */
    .warnings { background: #fff7ed; border: 1px solid #fed7aa; border-radius: var(--radius); padding: 16px 20px; margin-top: 32px; }
    .warnings h3 { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px; }
    .warnings p { font-size: 13px; color: #b45309; }

    /* Footer */
    .site-footer { background: var(--white); border-top: 1px solid var(--border); padding: 24px; text-align: center; font-size: 12px; color: var(--muted); margin-top: 48px; }
    .site-footer p + p { margin-top: 4px; }

    /* Empty state */
    .empty-state { text-align: center; padding: 64px 24px; }
    .empty-state h2 { font-size: 20px; color: var(--muted); margin-bottom: 8px; }
    .empty-state p { font-size: 15px; color: #9ca3af; }

    /* Print */
    @media print {
      .site-header { background: #1e3a8a !important; -webkit-print-color-adjust: exact; }
      .article-card, .more-card { break-inside: avoid; }
    }

    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      :root { --dark: #f9fafb; --mid: #d1d5db; --muted: #9ca3af; --border: #374151; --bg: #111827; --white: #1f2937; }
      .impact-box { background: rgba(255,255,255,.05); }
    }
  </style>
</head>
<body>

<header class="site-header">
  <div class="container">
    <h1>📡 SEM Intel Digest</h1>
    <p class="subtitle">${esc(displayDate)}</p>
    <p class="stats">${meta.totalScanned || 0} sources scanned · ${scoredArticles.length} articles curated${topScore > 0 ? ` · Top impact: ${topScore}/10` : ''}</p>
  </div>
</header>

<main class="main">
  <div class="container">

${scoredArticles.length === 0 ? `
    <div class="empty-state">
      <h2>No significant SEM/PPC news today.</h2>
      <p>${meta.totalScanned || 0} sources scanned. Check back tomorrow.</p>
    </div>` : `

    <!-- Table of contents -->
    <nav class="toc" aria-label="Table of contents">
      <h2>In this digest</h2>
      <ol>${tocHtml}</ol>
    </nav>

    <!-- Top 3 full cards -->
    <p class="section-label">Top stories</p>
    ${topCardsHtml}

    ${moreArticles.length > 0 ? `
    <!-- More stories -->
    <div class="more-section">
      <p class="section-label">More stories</p>
      <div class="more-grid">
        ${moreCardsHtml}
      </div>
    </div>` : ''}

    ${warningsHtml}
`}

  </div>
</main>

<footer class="site-footer">
  <div class="container">
    <p>Generated by <strong>SEM Intel Agent</strong> · ${esc(meta.runTimestamp || date)}</p>
    ${sourceNames.length > 0 ? `<p>Sources: ${esc(sourceNames.slice(0, 6).join(', '))}${sourceNames.length > 6 ? ` + ${sourceNames.length - 6} more` : ''}</p>` : ''}
    <p>To adjust sources or frequency, edit <code>config/sources.json</code></p>
  </div>
</footer>

</body>
</html>`;
}

module.exports = { generateWebArticle };
