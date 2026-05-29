'use strict';

const STOP_WORDS = new Set([
  'fund', 'funds', 'direct', 'small', 'large', 'india', 'nifty',
  'asset', 'flexi', 'midcap', 'bluechip', 'cap', 'plan', 'growth', 'index',
  'axis',
]);

function matchFundTags(title, description, funds) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  return funds
    .filter(f => {
      const words = (f.fund_name || '').toLowerCase().split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
      const amcWords = (f.fund_amc || '').toLowerCase().split(' ').filter(w => w.length > 2).slice(0, 2);
      const amcMatch = amcWords.length >= 2
        ? amcWords.every(w => text.includes(w))
        : amcWords.length === 1 && text.includes(amcWords[0]);
      return words.some(w => text.includes(w)) || amcMatch;
    })
    .map(f => f.fund_id);
}

function formatArticle(raw, funds) {
  return {
    article_id:   raw.article_id || null,
    title:        raw.title       || null,
    description:  raw.description || null,
    source_name:  raw.source_id   || null,
    url:          raw.link        || null,
    published_at: (() => {
      if (!raw.pubDate) return null;
      try { return new Date(raw.pubDate).toISOString(); } catch { return null; }
    })(),
    fund_tags:    matchFundTags(raw.title, raw.description, funds),
  };
}

module.exports = { matchFundTags, formatArticle };
