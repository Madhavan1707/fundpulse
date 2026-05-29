'use strict';

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEWSDATA_API_KEY     = process.env.NEWSDATA_API_KEY;

const SB_HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

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

async function fetchUniqueFunds() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/watchlist?select=fund_id,fund_name,fund_amc&limit=2000`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) throw new Error(`watchlist fetch failed: ${res.status}`);
  const rows = await res.json();
  const seen = new Set();
  return rows.filter(r => {
    if (seen.has(r.fund_id)) return false;
    seen.add(r.fund_id);
    return true;
  });
}

async function fetchNewsArticles(query) {
  const url =
    `https://newsdata.io/api/1/news` +
    `?apikey=${NEWSDATA_API_KEY}` +
    `&country=in&category=business` +
    `&q=${encodeURIComponent(query)}&language=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsData fetch failed (${query}): ${res.status}`);
  const json = await res.json();
  return json.results || [];
}

async function insertNewArticles(articles) {
  if (!articles.length) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news?on_conflict=article_id`,
    {
      method:  'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'resolution=ignore-duplicates' },
      body:    JSON.stringify(articles),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`insert failed: ${res.status} ${body}`);
  }
}

async function deleteOldArticles() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news?published_at=lt.${encodeURIComponent(cutoff)}`,
    { method: 'DELETE', headers: SB_HEADERS }
  );
  if (!res.ok) console.warn(`cleanup skipped: ${res.status}`);
}

async function main() {
  console.log('=== FundPulse News Fetcher ===');

  const funds = await fetchUniqueFunds();
  console.log(`${funds.length} unique funds loaded`);

  const [mfRaw, etfRaw] = await Promise.all([
    fetchNewsArticles('mutual fund'),
    fetchNewsArticles('ETF india'),
  ]);

  const seen = new Set();
  const deduped = [...mfRaw, ...etfRaw].filter(a => {
    if (!a.article_id || seen.has(a.article_id)) return false;
    seen.add(a.article_id);
    return true;
  });
  console.log(`${deduped.length} unique raw articles`);

  const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
  const recent = deduped.filter(a => !a.pubDate || new Date(a.pubDate).getTime() > cutoff48h);
  console.log(`${recent.length} articles within 48h`);

  const formatted = recent.map(a => formatArticle(a, funds));
  await insertNewArticles(formatted);
  console.log(`Inserted ${formatted.length} articles (existing skipped)`);

  await deleteOldArticles();
  console.log('Old articles cleaned up');
  console.log('=== Done ===');
}

module.exports = { matchFundTags, formatArticle };
if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}
