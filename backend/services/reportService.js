/**
 * Reporting Service — Fashion Feedback Intelligence Platform (Phase 7)
 *
 * Provides enterprise-grade CSV and PDF report generation.
 * Security & Governance:
 * - By default, exports strictly include only { moderationStatus: { $in: ['published', 'approved'] } }
 * - Protected against CSV Formula Injection (DDE injection)
 * - Safe filename generation with strict path traversal prevention
 * - Reuses Phase 5 analytics calculations for 100% data consistency
 */

const PDFDocument = require('pdfkit');
const Feedback = require('../models/Feedback');
const analyticsService = require('./analyticsService');
const searchService = require('./searchService');

/**
 * Sanitizes a single cell value for CSV output.
 * Prevents CSV / Spreadsheet Formula Injection (CWE-1236).
 * Values beginning with =, +, -, @, \t, or \r are neutralized with a leading single-quote.
 */
function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Protect against formula injection if the string starts with trigger characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Double-quote wrap and escape internal quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Converts an array of rows (each row being an array of cells) into a CSV string.
 */
function toCsvString(headers, rows) {
  const headerLine = headers.map(h => sanitizeCsvCell(h)).join(',');
  const rowLines = rows.map(row => row.map(cell => sanitizeCsvCell(cell)).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Generates a safe, traversal-proof filename.
 * @param {String} prefix e.g. 'feedback-report'
 * @param {String} ext e.g. 'csv' or 'pdf'
 * @param {Date} [date] Optional date
 */
function getSafeFilename(prefix, ext, date = new Date()) {
  const safePrefix = String(prefix || 'report').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeExt = String(ext || 'bin').replace(/[^a-zA-Z0-9]/g, '');
  const iso = date.toISOString().split('T')[0];
  return `${safePrefix}-${iso}.${safeExt}`;
}

/**
 * 1. Generates CSV string of feedback submissions.
 * Respects all search and attribute filters.
 * Excludes rejected feedback. Excludes flagged feedback by default.
 */
async function generateFeedbackCSV(filters = {}, options = {}) {
  const includeModeration = Boolean(options.includeModeration);

  // Build query: if not explicitly requesting moderation, enforce published/approved only
  const query = searchService.buildSearchQuery(filters, includeModeration);

  // If includeModeration is false, strictly force published/approved
  if (!includeModeration) {
    query.moderationStatus = { $in: ['published', 'approved'] };
  }

  // Projection: limit memory, omit internal auth fields
  const feedbacks = await Feedback.find(query)
    .sort({ submittedAt: -1 })
    .limit(10000)
    .lean()
    .exec();

  const headers = [
    'Feedback ID',
    'Product',
    'Rating',
    'Review',
    'Sentiment',
    'Sentiment Confidence',
    'Aspects',
    'Customer Name',
    'Submitted Date',
    'Moderation Status'
  ];

  if (includeModeration) {
    headers.push('Spam Score', 'Spam Reasons');
  }

  const rows = feedbacks.map(fb => {
    const aspectsSummary = (fb.aspects || [])
      .map(a => `${a.name}: ${a.sentiment} (${a.score > 0 ? '+' : ''}${a.score})`)
      .join('; ');

    const dateStr = fb.submittedAt ? new Date(fb.submittedAt).toISOString().replace('T', ' ').slice(0, 19) : '';
    const confidencePct = fb.sentimentConfidence ? `${Math.round(fb.sentimentConfidence * 100)}%` : 'N/A';

    const row = [
      String(fb._id),
      fb.product || 'General',
      fb.rating || 0,
      fb.feedback || '',
      fb.sentiment || 'Neutral',
      confidencePct,
      aspectsSummary,
      fb.name || 'Anonymous',
      dateStr,
      fb.moderationStatus || 'published'
    ];

    if (includeModeration) {
      const spamPct = typeof fb.spamScore === 'number' ? `${Math.round(fb.spamScore * 100)}%` : '0%';
      const spamReasonsStr = (fb.spamReasons || []).join('; ') || 'None';
      row.push(spamPct, spamReasonsStr);
    }

    return row;
  });

  return toCsvString(headers, rows);
}

/**
 * 2. Generates CSV string of business analytics.
 * Reuses Phase 5 analytics calculations.
 */
async function generateAnalyticsCSV(filters = {}) {
  const [overview, sentiment, ratings, topPositive, topNegative, products] = await Promise.all([
    analyticsService.getOverviewStats(filters),
    analyticsService.getSentimentDistribution(filters),
    analyticsService.getRatingDistribution(filters),
    analyticsService.getTopPositiveAspects(filters, 10),
    analyticsService.getTopNegativeAspects(filters, 10),
    analyticsService.getProductInsights(filters)
  ]);

  const sections = [];

  // Section 1: Executive Overview
  sections.push(['=== EXECUTIVE OVERVIEW ===', '']);
  sections.push(['Metric', 'Value']);
  sections.push(['Total Valid Feedback', overview.totalValidFeedback]);
  sections.push(['Average Rating', `${overview.averageRating} / 5`]);
  sections.push(['Positive Feedback', `${overview.positive} (${overview.positivePercent}%)`]);
  sections.push(['Negative Feedback', `${overview.negative} (${overview.negativePercent}%)`]);
  sections.push(['Neutral Feedback', `${overview.neutral} (${overview.neutralPercent}%)`]);
  sections.push(['Mixed Feedback', `${overview.mixed} (${overview.mixedPercent}%)`]);
  sections.push(['Flagged (Spam) Count', overview.flaggedFeedback]);
  sections.push(['Admin Approved Count', overview.approvedFeedback]);
  sections.push(['', '']);

  // Section 2: Sentiment Distribution
  sections.push(['=== SENTIMENT DISTRIBUTION ===', '']);
  sections.push(['Sentiment Class', 'Count']);
  sections.push(['Positive', sentiment.Positive]);
  sections.push(['Negative', sentiment.Negative]);
  sections.push(['Neutral', sentiment.Neutral]);
  sections.push(['Mixed', sentiment.Mixed]);
  sections.push(['', '']);

  // Section 3: Rating Distribution
  sections.push(['=== RATING DISTRIBUTION ===', '']);
  sections.push(['Star Rating', 'Review Count']);
  for (let star = 1; star <= 5; star++) {
    sections.push([`${star} Star${star > 1 ? 's' : ''}`, ratings[star] || 0]);
  }
  sections.push(['', '']);

  // Section 4: Top Positive Aspects
  sections.push(['=== TOP PRAISED ASPECTS ===', '', '', '']);
  sections.push(['Aspect', 'Mentions', 'Positive Mentions', 'Avg Score']);
  if (topPositive.length > 0) {
    topPositive.forEach(a => {
      sections.push([a.aspect, a.mentions, `${a.positive} (${a.positivePercent}%)`, a.avgScore]);
    });
  } else {
    sections.push(['No aspect data available', '', '', '']);
  }
  sections.push(['', '']);

  // Section 5: Top Complaints
  sections.push(['=== TOP COMPLAINTS (NEEDS ATTENTION) ===', '', '', '']);
  sections.push(['Aspect', 'Mentions', 'Complaints', 'Avg Score']);
  if (topNegative.length > 0) {
    topNegative.forEach(a => {
      sections.push([a.aspect, a.mentions, `${a.negative} (${a.negativePercent}%)`, a.avgScore]);
    });
  } else {
    sections.push(['No complaint data available', '', '', '']);
  }
  sections.push(['', '']);

  // Section 6: Product Performance
  sections.push(['=== PRODUCT PERFORMANCE MATRIX ===', '', '', '', '', '']);
  sections.push(['Product', 'Feedback Count', 'Avg Rating', 'Positive %', 'Negative %', 'Status']);
  if (products.length > 0) {
    products.forEach(p => {
      sections.push([p.product, p.total, p.avgRating, `${p.positivePercent}%`, `${p.negativePercent}%`, p.status]);
    });
  } else {
    sections.push(['No product feedback available', '', '', '', '', '']);
  }

  // Format all lines safely
  return sections
    .map(line => line.map(cell => sanitizeCsvCell(cell)).join(','))
    .join('\r\n');
}

/**
 * 3. Generates automated data-driven business interpretation for the report.
 */
function generateExecutiveSummaryInsights(overview, topPositive, topNegative, products) {
  const insights = [];

  if (overview.totalValidFeedback === 0) {
    return ['Insufficient feedback data available for this report period.'];
  }

  // Sentiment conclusion
  if (overview.positivePercent >= 60) {
    insights.push(`Overall sentiment is predominantly positive (${overview.positivePercent}% of verified feedback).`);
  } else if (overview.negativePercent >= 40) {
    insights.push(`Caution: Customer dissatisfaction is elevated with ${overview.negativePercent}% negative feedback.`);
  } else if (overview.mixedPercent >= 25) {
    insights.push(`Customer sentiment is nuanced with a notable volume of mixed feedback (${overview.mixedPercent}%).`);
  } else {
    insights.push(`Customer sentiment is distributed evenly across positive, negative, and neutral categories.`);
  }

  // Top complaint conclusion
  if (topNegative.length > 0 && topNegative[0].negative > 0) {
    const topComp = topNegative[0];
    insights.push(`${topComp.aspect} is currently the primary customer complaint with ${topComp.negative} negative mentions (${topComp.negativePercent}% of its mentions).`);
  }

  // Top praise conclusion
  if (topPositive.length > 0 && topPositive[0].positive > 0) {
    const topPraised = topPositive[0];
    insights.push(`Customers praise ${topPraised.aspect} most frequently (${topPraised.positive} positive mentions, average score +${topPraised.avgScore}).`);
  }

  // Volume leader conclusion
  if (products.length > 0) {
    const topVolProd = products[0];
    insights.push(`${topVolProd.product} commands the highest customer feedback volume with ${topVolProd.total} reviews (Avg rating: ${topVolProd.avgRating}/5).`);
  }

  return insights;
}

/**
 * 4. Generates a styled, publication-ready PDF Business Report.
 * Returns a Promise that completes once the PDF stream finishes.
 * @param {Object} filters Applied filters
 * @param {Stream.Writable} writeStream Destination stream (e.g. Express res)
 */
async function generatePDFReport(filters = {}, writeStream) {
  const [overview, sentiment, ratings, topPositive, topNegative, products] = await Promise.all([
    analyticsService.getOverviewStats(filters),
    analyticsService.getSentimentDistribution(filters),
    analyticsService.getRatingDistribution(filters),
    analyticsService.getTopPositiveAspects(filters, 5),
    analyticsService.getTopNegativeAspects(filters, 5),
    analyticsService.getProductInsights(filters)
  ]);

  const insights = generateExecutiveSummaryInsights(overview, topPositive, topNegative, products);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: 'Fashion Feedback Intelligence - Executive Business Report',
          Author: 'StyleFeedback Platform',
          Subject: 'Business Analytics & Sentiment Report'
        }
      });

      doc.on('error', reject);
      doc.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);

      const brandPink = '#e91e63';
      const textDark = '#2c2c2c';
      const textGrey = '#666666';

      // ── Header Banner ──────────────────────────────────────────────
      doc.rect(40, 40, 515, 60).fill('#2c2c2c');
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
         .text('STYLEFEEDBACK INTELLIGENCE', 55, 52);
      doc.fontSize(10).font('Helvetica')
         .fillColor('#ff80ab')
         .text('FASHION FEEDBACK & SENTIMENT ANALYTICS REPORT', 55, 75);

      // Metadata block
      const nowStr = new Date().toLocaleString();
      const filterSummary = [
        filters.product && filters.product !== 'all' ? `Product: ${filters.product}` : 'Product: All',
        filters.sentiment && filters.sentiment !== 'all' ? `Sentiment: ${filters.sentiment}` : 'Sentiment: All',
        filters.date && filters.date !== 'all' ? `Period: Last ${filters.date} Days` : 'Period: All Time'
      ].join('  |  ');

      doc.fillColor(textGrey).fontSize(8.5).font('Helvetica')
         .text(`Generated: ${nowStr}   |   ${filterSummary}`, 40, 110, { align: 'right' });

      doc.moveDown(1.5);

      // ── Section 1: Executive Summary ───────────────────────────────
      doc.fillColor(brandPink).fontSize(13).font('Helvetica-Bold')
         .text('1. EXECUTIVE SUMMARY', 40, 135);
      doc.rect(40, 150, 515, 2).fill(brandPink);

      // Stats 4-box grid
      const boxY = 160;
      const boxW = 120;
      const boxH = 45;
      const stats = [
        { label: 'Total Feedback', val: String(overview.totalValidFeedback), color: '#1565c0', bg: '#e3f2fd' },
        { label: 'Average Rating', val: `${overview.averageRating} / 5`, color: '#e65100', bg: '#fff8e1' },
        { label: 'Positive Ratio', val: `${overview.positivePercent}%`, color: '#2e7d32', bg: '#e8f5e9' },
        { label: 'Negative Ratio', val: `${overview.negativePercent}%`, color: '#c62828', bg: '#ffebee' }
      ];

      stats.forEach((s, idx) => {
        const x = 40 + idx * (boxW + 11);
        doc.rect(x, boxY, boxW, boxH).fill(s.bg);
        doc.fillColor(s.color).fontSize(14).font('Helvetica-Bold')
           .text(s.val, x, boxY + 8, { width: boxW, align: 'center' });
        doc.fillColor(textDark).fontSize(8).font('Helvetica')
           .text(s.label, x, boxY + 28, { width: boxW, align: 'center' });
      });

      // Automated Narrative Insights Box
      doc.rect(40, 215, 515, 55).fill('#f9f9f9');
      doc.rect(40, 215, 4, 55).fill(brandPink);
      doc.fillColor(textDark).fontSize(9).font('Helvetica-Bold')
         .text('KEY BUSINESS TAKEAWAYS:', 52, 222);
      doc.font('Helvetica').fontSize(8.5).fillColor('#333333');
      insights.slice(0, 3).forEach((line, i) => {
        doc.text(`• ${line}`, 52, 236 + i * 11, { width: 490 });
      });

      // ── Section 2: Sentiment & Rating Overview ─────────────────────
      doc.fillColor(brandPink).fontSize(13).font('Helvetica-Bold')
         .text('2. SENTIMENT & RATING BREAKDOWN', 40, 285);
      doc.rect(40, 300, 515, 2).fill(brandPink);

      // Left Column: Sentiment
      doc.fillColor(textDark).fontSize(10).font('Helvetica-Bold')
         .text('Sentiment Distribution', 40, 310);
      const sentRows = [
        ['Positive', sentiment.Positive, `${overview.positivePercent}%`, '#2e7d32'],
        ['Negative', sentiment.Negative, `${overview.negativePercent}%`, '#c62828'],
        ['Neutral', sentiment.Neutral, `${overview.neutralPercent}%`, '#616161'],
        ['Mixed', sentiment.Mixed, `${overview.mixedPercent}%`, '#7b1fa2']
      ];
      let rowY = 328;
      sentRows.forEach(([name, count, pct, col]) => {
        doc.fillColor(col).fontSize(9).font('Helvetica-Bold').text(name, 45, rowY);
        doc.fillColor(textDark).font('Helvetica').text(`${count} (${pct})`, 180, rowY, { align: 'right', width: 80 });
        rowY += 15;
      });

      // Right Column: Ratings
      doc.fillColor(textDark).fontSize(10).font('Helvetica-Bold')
         .text('Star Ratings Distribution', 320, 310);
      let starY = 328;
      for (let star = 5; star >= 1; star--) {
        const count = ratings[star] || 0;
        const pct = overview.totalValidFeedback > 0 ? Math.round((count / overview.totalValidFeedback) * 100) : 0;
        doc.fillColor('#f57c00').fontSize(9).font('Helvetica-Bold')
           .text(`${'★'.repeat(star)}${'☆'.repeat(5 - star)}`, 320, starY);
        doc.fillColor(textDark).font('Helvetica')
           .text(`${count} (${pct}%)`, 450, starY, { align: 'right', width: 95 });
        starY += 14;
      }

      // ── Section 3: Aspect Insights ─────────────────────────────────
      doc.fillColor(brandPink).fontSize(13).font('Helvetica-Bold')
         .text('3. FASHION ASPECT INTELLIGENCE', 40, 410);
      doc.rect(40, 425, 515, 2).fill(brandPink);

      // Most Praised
      doc.fillColor('#2e7d32').fontSize(10).font('Helvetica-Bold')
         .text('Most Praised Aspects', 40, 435);
      let posAspectY = 452;
      if (topPositive.length > 0) {
        topPositive.slice(0, 3).forEach((a, i) => {
          doc.fillColor(textDark).fontSize(8.5).font('Helvetica')
             .text(`${i + 1}. ${a.aspect}`, 45, posAspectY);
          doc.fillColor('#2e7d32')
             .text(`${a.positive} praises (${a.positivePercent}%)  |  Score: +${a.avgScore}`, 140, posAspectY);
          posAspectY += 14;
        });
      } else {
        doc.fillColor(textGrey).fontSize(8.5).text('No positive aspect data.', 45, posAspectY);
      }

      // Top Complaints
      doc.fillColor('#c62828').fontSize(10).font('Helvetica-Bold')
         .text('Top Customer Complaints (Needs Attention)', 320, 435);
      let negAspectY = 452;
      if (topNegative.length > 0) {
        topNegative.slice(0, 3).forEach((a, i) => {
          doc.fillColor(textDark).fontSize(8.5).font('Helvetica')
             .text(`${i + 1}. ${a.aspect}`, 320, negAspectY);
          doc.fillColor('#c62828')
             .text(`${a.negative} complaints (${a.negativePercent}%)`, 405, negAspectY);
          negAspectY += 14;
        });
      } else {
        doc.fillColor(textGrey).fontSize(8.5).text('No complaint aspect data.', 320, negAspectY);
      }

      // ── Section 4: Product Performance Matrix ──────────────────────
      doc.fillColor(brandPink).fontSize(13).font('Helvetica-Bold')
         .text('4. PRODUCT PERFORMANCE MATRIX', 40, 515);
      doc.rect(40, 530, 515, 2).fill(brandPink);

      // Table Header
      const tableHeadY = 538;
      doc.rect(40, tableHeadY, 515, 18).fill('#f0f0f0');
      doc.fillColor(textDark).fontSize(8).font('Helvetica-Bold');
      doc.text('PRODUCT', 45, tableHeadY + 5);
      doc.text('REVIEWS', 160, tableHeadY + 5, { width: 50, align: 'right' });
      doc.text('RATING', 230, tableHeadY + 5, { width: 50, align: 'right' });
      doc.text('POS %', 300, tableHeadY + 5, { width: 45, align: 'right' });
      doc.text('NEG %', 360, tableHeadY + 5, { width: 45, align: 'right' });
      doc.text('STATUS', 440, tableHeadY + 5);

      let prodRowY = tableHeadY + 22;
      const displayProds = products.slice(0, 6);
      if (displayProds.length > 0) {
        displayProds.forEach((p, idx) => {
          if (idx % 2 === 1) doc.rect(40, prodRowY - 2, 515, 16).fill('#fafafa');
          doc.fillColor(textDark).fontSize(8.5).font('Helvetica').text(p.product, 45, prodRowY);
          doc.text(String(p.total), 160, prodRowY, { width: 50, align: 'right' });
          doc.text(`${p.avgRating} ★`, 230, prodRowY, { width: 50, align: 'right' });
          doc.fillColor('#2e7d32').text(`${p.positivePercent}%`, 300, prodRowY, { width: 45, align: 'right' });
          doc.fillColor('#c62828').text(`${p.negativePercent}%`, 360, prodRowY, { width: 45, align: 'right' });

          const statusColor = p.status === 'Excellent' ? '#2e7d32' : (p.status === 'Good' ? '#1565c0' : '#c62828');
          doc.fillColor(statusColor).font('Helvetica-Bold').text(p.status, 440, prodRowY);
          prodRowY += 17;
        });
      } else {
        doc.fillColor(textGrey).fontSize(8.5).text('No product feedback recorded for this period.', 45, prodRowY);
      }

      // ── Footer ─────────────────────────────────────────────────────
      const footerY = 770;
      doc.rect(40, footerY - 5, 515, 1).fill('#dddddd');
      doc.fillColor(textGrey).fontSize(7.5).font('Helvetica')
         .text('StyleFeedback Intelligence Platform — Confidential Business Document', 40, footerY);
      doc.text('Page 1 of 1', 500, footerY, { align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateFeedbackCSV,
  generateAnalyticsCSV,
  generatePDFReport,
  sanitizeCsvCell,
  getSafeFilename,
  generateExecutiveSummaryInsights
};
