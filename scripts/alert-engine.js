'use strict';

const { buildEmail } = require('./email-template.js');

// ── SCHEME MAP (mirrors mfapi.js) ──
const SCHEME_MAP = {
  'sbi-psu':     119732,
  'hdfc-flexi':  118955,
  'pp-flexi':    122639,
  'quant-sc':    120828,
  'mirae-lc':    118825,
  'axis-bc':     120465,
  'icici-tech':  120594,
  'nippon-sc':   118778,
  'hdfc-nifty':  119063,
  'motilal-mid': 127042,
};

function resolveSchemeCode(id) {
  if (SCHEME_MAP[id]) return SCHEME_MAP[id];
  const n = parseInt(id, 10);
  return isNaN(n) ? null : n;
}

function checkThresholds(config, pctChange) {
  const triggers = [];
  if (config.drop_on && pctChange <= -config.drop_val) triggers.push('drop');
  if (config.rise_on && pctChange >= config.rise_val)  triggers.push('rise');
  return triggers;
}

module.exports = { resolveSchemeCode, checkThresholds };
