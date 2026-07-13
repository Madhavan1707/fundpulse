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

  // Today in mfapi's DD-MM-YYYY format — to tell whether a cached NAV is
  // actually today's published NAV or yesterday's carry-over
  function todayISTNavDate() {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date()).replace(/\//g, '-');
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
        // Once we have TODAY'S published NAV it can't change — cache all day.
        // A carry-over NAV (yesterday's, cached before the ~9:30 PM publish)
        // only lives 1 hour, so the evening update actually shows up.
        if (cached && cached.day === todayIST()) {
          const isTodaysNav = cached.navDate === todayISTNavDate();
          const recentEnough = (Date.now() - (cached.fetchedAt || 0)) < 3600000;
          if (isTodaysNav || recentEnough) { result[f.id] = cached; return; }
        }
      } catch (e) {}

      try {
        const res = await fetch(MFAPI + '/' + code);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data; // [{ nav, date }, ...] newest first
        if (!data || data.length < 2) return;

        const today = parseFloat(data[0].nav);
        const prev  = parseFloat(data[1].nav);
        const pct   = ((today - prev) / prev) * 100;
        const nav = {
          price:   '₹' + today.toFixed(2),
          change:  (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
          dir:     pct >= 0 ? 'up' : 'down',
          day:     todayIST(),
          navDate: data[0].date,
          fetchedAt: Date.now(),
        };
        if (data.length > 5) {
          const w = parseFloat(data[5].nav);
          if (!isNaN(w) && w > 0) nav.ret1w = ((today - w) / w * 100).toFixed(2);
        }
        if (data.length > 21) {
          const m = parseFloat(data[21].nav);
          if (!isNaN(m) && m > 0) nav.ret1m = ((today - m) / m * 100).toFixed(2);
        }
        const yearVals = data.slice(0, Math.min(data.length, 252)).map(d => parseFloat(d.nav)).filter(v => !isNaN(v));
        if (yearVals.length > 0) {
          nav.high52w = '₹' + Math.max(...yearVals).toFixed(2);
          nav.low52w  = '₹' + Math.min(...yearVals).toFixed(2);
        }
        result[f.id] = nav;
        try { localStorage.setItem(cacheKey, JSON.stringify(nav)); } catch (e) {}
      } catch (e) {}
    }));
    return result;
  }

  // Returns the searchable AMFI fund list, cached 24h. Returns null if fetch fails.
  // The raw list is ~40k schemes / several MB — that blows the localStorage quota,
  // the setItem silently fails, and every page load re-downloads the whole thing.
  // So we keep only Direct+Growth schemes (the only ones searchFunds ever shows),
  // slim each row to { schemeCode, schemeName }, and hold an in-memory copy as a
  // fallback for browsers where even the slim list won't fit.
  let _fundListInflight = null;
  let _fundListMemory   = null;
  let _fundListMemoryTs = 0;

  async function getFundList() {
    if (_fundListMemory && (Date.now() - _fundListMemoryTs) < 86400000) return _fundListMemory;

    try {
      const ts  = parseInt(localStorage.getItem('fp_fund_list_ts') || '0', 10);
      const age = Date.now() - ts;
      if (age < 86400000) {
        const cached = JSON.parse(localStorage.getItem('fp_fund_list'));
        if (cached && cached.length) {
          _fundListMemory   = cached;
          _fundListMemoryTs = ts;
          return cached;
        }
      }
    } catch (e) {}

    if (_fundListInflight) return _fundListInflight;

    _fundListInflight = (async function () {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(MFAPI, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        const raw  = await res.json();
        const list = raw
          .filter(function (f) {
            const n = (f.schemeName || '').toLowerCase();
            return n.indexOf('direct') !== -1 && n.indexOf('growth') !== -1;
          })
          .map(function (f) { return { schemeCode: f.schemeCode, schemeName: f.schemeName }; });
        _fundListMemory   = list;
        _fundListMemoryTs = Date.now();
        try {
          localStorage.setItem('fp_fund_list', JSON.stringify(list));
          localStorage.setItem('fp_fund_list_ts', String(_fundListMemoryTs));
        } catch (e) { /* quota exceeded — in-memory copy still serves this session */ }
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
      .filter(f => {
        const n = f.schemeName.toLowerCase();
        return n.includes(q) && n.includes('direct') && n.includes('growth');
      })
      .slice(0, 7)
      .map(f => ({
        id:         String(f.schemeCode),
        name:       parseName(f.schemeName),
        amc:        parseAMC(f.schemeName),
        cat:        '',
        schemeCode: f.schemeCode,
        variant:    f.schemeName.split(' - ').slice(1).join(' · ').trim(),
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
