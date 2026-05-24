(function () {
  'use strict';
  const MFAPI = 'https://api.mfapi.in/mf';

  // Static mapping: custom string IDs → AMFI scheme codes for the 10 hardcoded funds
  // All are Direct Plan - Growth variants
  const SCHEME_MAP = {
    'sbi-psu':     119732,  // SBI PSU Fund - DIRECT PLAN - GROWTH
    'hdfc-flexi':  118955,  // HDFC Flexi Cap Fund - Growth Option - Direct Plan
    'pp-flexi':    122639,  // Parag Parikh Flexi Cap Fund - Direct Plan - Growth
    'quant-sc':    120828,  // quant Small Cap Fund - Growth Option - Direct Plan
    'mirae-lc':    118825,  // Mirae Asset Large Cap Fund - Direct Plan - Growth
    'axis-bc':     120465,  // Axis Large Cap Fund - Direct Plan - Growth (formerly Axis Bluechip)
    'icici-tech':  120594,  // ICICI Prudential Technology Fund - Direct Plan - Growth
    'nippon-sc':   118778,  // Nippon India Small Cap Fund - Direct Plan Growth Plan - Growth Option
    'hdfc-nifty':  119063,  // HDFC Nifty 50 Index Fund - Direct Plan
    'motilal-mid': 127042,  // Motilal Oswal Midcap Fund-Direct Plan-Growth Option
  };

  // 'sbi-psu' → 119732 | '120503' → 120503 | 120503 → 120503 | unknown → null
  function resolveSchemeCode(fundId) {
    if (SCHEME_MAP[fundId]) return SCHEME_MAP[fundId];
    const n = parseInt(fundId, 10);
    return isNaN(n) ? null : n;
  }

  // Returns today's date string in IST — used to check NAV cache freshness
  function todayIST() {
    return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  }

  // funds: array of { id, name, amc, cat } from fp_funds
  // returns: Promise<{ [fundId]: { price, change, dir } }>
  async function fetchNAVs(funds) {
    const result = {};
    await Promise.all(funds.map(async (f) => {
      const code = resolveSchemeCode(f.id);
      if (code === null) return;

      const cacheKey = 'fp_nav_' + code;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached && cached.day === todayIST()) { result[f.id] = cached; return; }
      } catch (e) {}

      try {
        const res = await fetch(MFAPI + '/' + code);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data; // [{ nav, date }, ...] newest first
        if (!data || data.length < 2) return;

        const today   = parseFloat(data[0].nav);
        const prev    = parseFloat(data[1].nav);
        const pct     = ((today - prev) / prev) * 100;
        const dir     = pct >= 0 ? 'up' : 'down';
        const nav = {
          price:  '₹' + today.toFixed(2),
          change: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
          dir:    dir,
          day:    todayIST(),
        };
        result[f.id] = nav;
        try { localStorage.setItem(cacheKey, JSON.stringify(nav)); } catch (e) {}
      } catch (e) {}
    }));
    return result;
  }

  // Returns the full AMFI fund list, cached 24h in localStorage. Returns null if fetch fails.
  let _fundListInflight = null;

  async function getFundList() {
    try {
      const ts  = parseInt(localStorage.getItem('fp_fund_list_ts') || '0', 10);
      const age = Date.now() - ts;
      if (age < 86400000) {
        const cached = JSON.parse(localStorage.getItem('fp_fund_list'));
        if (cached && cached.length) return cached;
      }
    } catch (e) {}

    if (_fundListInflight) return _fundListInflight;

    _fundListInflight = (async function () {
      try {
        const res = await fetch(MFAPI);
        if (!res.ok) return null;
        const list = await res.json();
        try {
          localStorage.setItem('fp_fund_list', JSON.stringify(list));
          localStorage.setItem('fp_fund_list_ts', String(Date.now()));
        } catch (e) {}
        return list;
      } catch (e) { return null; }
      finally { _fundListInflight = null; }
    })();

    return _fundListInflight;
  }

  // "HDFC Flexi Cap Fund - Direct Plan - Growth" → "HDFC Flexi Cap Fund"
  function parseName(schemeName) {
    return schemeName.split(' - ')[0].trim();
  }

  // Returns the scheme base name minus fund-type suffix words — used as the AMC display label.
  // "HDFC Flexi Cap Fund - Direct Plan - Growth" → "HDFC Flexi Cap"
  // "Nippon India Small Cap Fund - Direct Plan"  → "Nippon India Small Cap"
  // "Mirae Asset Large Cap Fund - Direct Plan"   → "Mirae Asset Large Cap"
  function parseAMC(schemeName) {
    const base = schemeName.split(' - ')[0];
    const cleaned = base
      .replace(/\s+(Direct|Regular|Growth|Dividend|Bonus|IDCW|FoF|ETF|Fund|Plan|Scheme)\b.*/i, '')
      .trim();
    return cleaned || base.split(' ').slice(0, 2).join(' ');
  }

  // Fallback when live search is unavailable
  const FALLBACK_FUNDS = [
    { id:'sbi-psu',     name:'SBI PSU Direct Fund',      amc:'SBI Mutual Fund',     cat:'Thematic · PSU'    },
    { id:'hdfc-flexi',  name:'HDFC Flexi Cap Fund',       amc:'HDFC Mutual Fund',    cat:'Flexi Cap'         },
    { id:'pp-flexi',    name:'Parag Parikh Flexi Cap',    amc:'PPFAS Mutual Fund',   cat:'Flexi Cap'         },
    { id:'quant-sc',    name:'Quant Small Cap Fund',      amc:'Quant Mutual Fund',   cat:'Small Cap'         },
    { id:'mirae-lc',    name:'Mirae Asset Large Cap',     amc:'Mirae Asset MF',      cat:'Large Cap'         },
    { id:'axis-bc',     name:'Axis Bluechip Fund',        amc:'Axis Mutual Fund',    cat:'Large Cap'         },
    { id:'icici-tech',  name:'ICICI Pru Technology Fund', amc:'ICICI Prudential MF', cat:'Sectoral · Tech'   },
    { id:'nippon-sc',   name:'Nippon India Small Cap',    amc:'Nippon India MF',     cat:'Small Cap'         },
    { id:'hdfc-nifty',  name:'HDFC Nifty 50 Index Fund',  amc:'HDFC Mutual Fund',    cat:'Index · Large Cap' },
    { id:'motilal-mid', name:'Motilal Oswal Midcap Fund', amc:'Motilal Oswal MF',    cat:'Mid Cap'           },
  ];

  // query: string → Promise<[{ id, name, amc, cat, schemeCode }]> max 7 results
  async function searchFunds(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const list = await getFundList();
    if (!list) {
      return FALLBACK_FUNDS
        .filter(f => f.name.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q))
        .slice(0, 7);
    }
    return list
      .filter(f => f.schemeName.toLowerCase().includes(q))
      .slice(0, 7)
      .map(f => ({
        id:         String(f.schemeCode),
        name:       parseName(f.schemeName),
        amc:        parseAMC(f.schemeName),
        cat:        '',
        schemeCode: f.schemeCode,
      }));
  }

  // Call on page load to warm the fund list cache silently
  function prefetchFundList() {
    getFundList().catch(function () {});
  }

  window.resolveSchemeCode = resolveSchemeCode;
  window.fetchNAVs         = fetchNAVs;
  window.searchFunds       = searchFunds;
  window.prefetchFundList  = prefetchFundList;
  window._mfapi            = true;

  // Fire ready after current execution context so listeners are set up first
  setTimeout(function () {
    window.dispatchEvent(new Event('mfapi_ready'));
  }, 0);
}());
