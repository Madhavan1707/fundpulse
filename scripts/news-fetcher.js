'use strict';

function matchFundTags(title, description, funds) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  return funds
    .filter(f => {
      const words = (f.fund_name || '').toLowerCase().split(' ').filter(w => w.length > 3);
      const amc   = (f.fund_amc  || '').toLowerCase().split(' ')[0];
      return words.some(w => text.includes(w)) || (amc && text.includes(amc));
    })
    .map(f => f.fund_id);
}

function formatArticle(raw, funds) {
  return {
    article_id:   raw.article_id,
    title:        raw.title       || null,
    description:  raw.description || null,
    source_name:  raw.source_id   || null,
    url:          raw.link        || null,
    published_at: raw.pubDate ? new Date(raw.pubDate).toISOString() : null,
    fund_tags:    matchFundTags(raw.title, raw.description, funds),
  };
}

module.exports = { matchFundTags, formatArticle };
