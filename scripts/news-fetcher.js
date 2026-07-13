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
  'asset', 'flexi', 'midcap', 'cap', 'plan', 'growth', 'index',
]);

function matchFundTags(title, description, funds) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  return funds
    .filter(f => {
      // Name match: every distinctive word must appear — a lone "axis" must not
      // tag Axis Bluechip Fund from an Axis Bank story.
      const allWords = (f.fund_name || '').toLowerCase().split(' ').filter(w => w.length > 2);
      const words = allWords.filter(w => !STOP_WORDS.has(w));
      // A single distinctive word ("hdfc") is not enough on its own — it tags
      // every HDFC Bank story. Require one of the fund's own generic words
      // ("flexi", "cap", "fund", "nifty"…) to appear too, as a whole word.
      const supportWords = allWords.filter(w => STOP_WORDS.has(w));
      const hasSupport = supportWords.some(w => new RegExp('\\b' + w + 's?\\b').test(text));
      const nameMatch = words.length > 0 && words.every(w => text.includes(w)) &&
        (words.length >= 2 || hasSupport);
      // AMC match: first two significant words must both appear ("axis" + "mutual").
      const amcWords = (f.fund_amc || '').toLowerCase().split(' ').filter(w => w.length > 2).slice(0, 2);
      const amcMatch = amcWords.length > 0 && amcWords.every(w => text.includes(w));
      return nameMatch || amcMatch;
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

// These 10 funds are always tagged regardless of watchlist state.
// When users add custom funds from live search, those get merged in from Supabase.
const KNOWN_FUNDS = [
  { fund_id: 'sbi-psu',     fund_name: 'SBI PSU Direct Fund',        fund_amc: 'SBI Mutual Fund'     },
  { fund_id: 'hdfc-flexi',  fund_name: 'HDFC Flexi Cap Fund',         fund_amc: 'HDFC Mutual Fund'    },
  { fund_id: 'pp-flexi',    fund_name: 'Parag Parikh Flexi Cap',      fund_amc: 'PPFAS Mutual Fund'   },
  { fund_id: 'quant-sc',    fund_name: 'Quant Small Cap Fund',        fund_amc: 'Quant Mutual Fund'   },
  { fund_id: 'mirae-lc',    fund_name: 'Mirae Asset Large Cap',       fund_amc: 'Mirae Asset MF'      },
  { fund_id: 'axis-bc',     fund_name: 'Axis Bluechip Fund',          fund_amc: 'Axis Mutual Fund'    },
  { fund_id: 'icici-tech',  fund_name: 'ICICI Pru Technology Fund',   fund_amc: 'ICICI Prudential MF' },
  { fund_id: 'nippon-sc',   fund_name: 'Nippon India Small Cap',      fund_amc: 'Nippon India MF'     },
  { fund_id: 'hdfc-nifty',  fund_name: 'HDFC Nifty 50 Index Fund',    fund_amc: 'HDFC Mutual Fund'    },
  { fund_id: 'motilal-mid', fund_name: 'Motilal Oswal Midcap Fund',   fund_amc: 'Motilal Oswal MF'    },
];

async function fetchUniqueFunds() {
  const seen = new Set(KNOWN_FUNDS.map(f => f.fund_id));
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/watchlist?select=fund_id,fund_name,fund_amc&limit=2000`,
      { headers: SB_HEADERS }
    );
    if (!res.ok) throw new Error(`watchlist fetch failed: ${res.status}`);
    const rows = await res.json();
    // merge in any user-added funds not in the hardcoded list
    const extra = rows.filter(r => {
      if (seen.has(r.fund_id)) return false;
      seen.add(r.fund_id);
      return true;
    });
    return [...KNOWN_FUNDS, ...extra];
  } catch (e) {
    console.warn('watchlist fetch failed, using hardcoded list:', e.message);
    return KNOWN_FUNDS;
  }
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

function buildAMCQueries(funds) {
  const seen = new Set();
  const queries = [];
  const GENERIC = new Set(['mutual fund', 'mf']);
  funds.forEach(f => {
    // Clean AMC name: drop "Mutual Fund" / "MF" suffix
    const amcClean = (f.fund_amc || '').replace(/\s*(mutual\s*fund|mf)\b/gi, '').trim();
    if (amcClean && !seen.has(amcClean.toLowerCase())) {
      seen.add(amcClean.toLowerCase());
      if (!GENERIC.has(amcClean.toLowerCase())) queries.push(amcClean);
    }
    // Also add distinctive fund name words (catches "Parag Parikh" from PPFAS funds)
    const SKIP = new Set(['fund', 'direct', 'flexi', 'small', 'large', 'bluechip', 'midcap', 'index', 'plan', 'growth', 'nifty', 'cap']);
    const nameKey = (f.fund_name || '').split(' ')
      .filter(w => w.length > 3 && !SKIP.has(w.toLowerCase()))
      .slice(0, 2).join(' ');
    if (nameKey && !seen.has(nameKey.toLowerCase())) {
      seen.add(nameKey.toLowerCase());
      queries.push(nameKey);
    }
  });
  return queries;
}

async function retagExistingArticles(funds) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news?select=article_id,title,description&limit=500`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) { console.warn('retag fetch failed:', res.status); return; }
  const articles = await res.json();
  let updated = 0;
  await Promise.all(articles.map(async a => {
    const tags = matchFundTags(a.title, a.description, funds);
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/news?article_id=eq.${encodeURIComponent(a.article_id)}`,
      {
        method: 'PATCH',
        headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ fund_tags: tags }),
      }
    );
    if (patchRes.ok) updated++;
  }));
  console.log(`Retagged ${updated} existing articles`);
}

async function main() {
  console.log('=== FundPulse News Fetcher ===');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !NEWSDATA_API_KEY) {
    console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEWSDATA_API_KEY');
    process.exit(1);
  }

  const funds = await fetchUniqueFunds();
  console.log(`${funds.length} unique funds loaded`);

  const amcQueries = buildAMCQueries(funds);
  console.log(`AMC queries: ${amcQueries.join(', ')}`);

  const allResults = await Promise.all(
    ['mutual fund', 'ETF india', ...amcQueries].map(q => fetchNewsArticles(q).catch(() => []))
  );
  const allRaw = allResults.flat();

  const seen = new Set();
  const deduped = allRaw.filter(a => {
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

  await retagExistingArticles(funds);
  await deleteOldArticles();
  console.log('Old articles cleaned up');
  console.log('=== Done ===');
}

module.exports = { matchFundTags, formatArticle };
if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}
