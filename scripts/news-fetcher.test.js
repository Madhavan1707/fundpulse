'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { matchFundTags, formatArticle } = require('./news-fetcher.js');

const SAMPLE_FUNDS = [
  { fund_id: 'hdfc-flexi', fund_name: 'HDFC Flexi Cap Fund',   fund_amc: 'HDFC Mutual Fund'  },
  { fund_id: 'sbi-psu',    fund_name: 'SBI PSU Direct Fund',   fund_amc: 'SBI Mutual Fund'   },
  { fund_id: 'pp-flexi',   fund_name: 'Parag Parikh Flexi Cap', fund_amc: 'PPFAS Mutual Fund' },
];

test('matchFundTags: matches by fund name word', () => {
  const tags = matchFundTags('HDFC Flexi Cap Fund raises equity exposure', '', SAMPLE_FUNDS);
  assert.ok(tags.includes('hdfc-flexi'));
});

test('matchFundTags: matches by AMC first word', () => {
  const tags = matchFundTags('SBI Mutual Fund announces new scheme', '', SAMPLE_FUNDS);
  assert.ok(tags.includes('sbi-psu'));
});

test('matchFundTags: returns [] for unrelated article', () => {
  const tags = matchFundTags('RBI cuts repo rate by 25bps', 'Central bank decision', SAMPLE_FUNDS);
  assert.deepEqual(tags, []);
});

test('matchFundTags: is case-insensitive', () => {
  const tags = matchFundTags('HDFC FLEXI CAP performance review', '', SAMPLE_FUNDS);
  assert.ok(tags.includes('hdfc-flexi'));
});

test('matchFundTags: handles null description', () => {
  const tags = matchFundTags('HDFC Flexi Cap rises', null, SAMPLE_FUNDS);
  assert.ok(tags.includes('hdfc-flexi'));
});

test('formatArticle: maps NewsData.io shape to DB row shape', () => {
  const raw = {
    article_id:  'abc123',
    title:       'HDFC Flexi Cap Fund gains on rally',
    description: 'Strong quarterly returns reported',
    source_id:   'economictimes',
    link:        'https://example.com/article',
    pubDate:     '2026-05-29 10:00:00',
  };
  const result = formatArticle(raw, SAMPLE_FUNDS);
  assert.equal(result.article_id,  'abc123');
  assert.equal(result.title,       'HDFC Flexi Cap Fund gains on rally');
  assert.equal(result.description, 'Strong quarterly returns reported');
  assert.equal(result.source_name, 'economictimes');
  assert.equal(result.url,         'https://example.com/article');
  assert.ok(result.published_at.startsWith('2026'));
  assert.ok(result.fund_tags.includes('hdfc-flexi'));
});

test('formatArticle: handles null description and missing date', () => {
  const raw = { article_id: 'xyz', title: 'SBI PSU Fund update', description: null, pubDate: null };
  const result = formatArticle(raw, SAMPLE_FUNDS);
  assert.equal(result.description,  null);
  assert.equal(result.published_at, null);
  assert.ok(result.fund_tags.includes('sbi-psu'));
});

test('matchFundTags: generic word "fund" does not match everything', () => {
  // "fund" alone should not match — it's a stopword
  const tags = matchFundTags('Mutual fund industry sees record inflows', '', SAMPLE_FUNDS);
  assert.deepEqual(tags, []);
});

test('matchFundTags: AMC match requires both brand words to prevent collision', () => {
  // "Axis Bank results" — "axis" appears but "mutual" does not → should NOT match axis-bc
  const fundsWithAxis = [{ fund_id: 'axis-bc', fund_name: 'Axis Bluechip Fund', fund_amc: 'Axis Mutual Fund' }];
  const tags = matchFundTags('Axis Bank Q4 results disappoint', 'Banking sector news', fundsWithAxis);
  assert.deepEqual(tags, []);
});

test('matchFundTags: AMC two-word match works when both words present', () => {
  const fundsWithAxis = [{ fund_id: 'axis-bc', fund_name: 'Axis Bluechip Fund', fund_amc: 'Axis Mutual Fund' }];
  const tags = matchFundTags('Axis Mutual Fund announces new SIP plan', '', fundsWithAxis);
  assert.ok(tags.includes('axis-bc'));
});

test('formatArticle: handles malformed pubDate without throwing', () => {
  const raw = { article_id: 'xyz', title: 'Test', description: null, pubDate: 'not-a-date' };
  const result = formatArticle(raw, SAMPLE_FUNDS);
  assert.equal(result.published_at, null);
});

test('matchFundTags: lone brand word does not tag bank/corporate stories', () => {
  // "HDFC" appears but nothing fund-related — HDFC Bank news must not be
  // tagged as HDFC Flexi Cap news (regression: single-word name match)
  const tags = matchFundTags('HDFC Bank trims workforce amid tech, AI ramp up', 'Banking layoffs', SAMPLE_FUNDS);
  assert.deepEqual(tags, []);
});

test('matchFundTags: lone brand word + fund context still tags', () => {
  const tags = matchFundTags('HDFC flexi strategies gain favour', '', SAMPLE_FUNDS);
  assert.ok(tags.includes('hdfc-flexi'));
});

test('matchFundTags: support word matches whole words only', () => {
  // "mcap" contains "cap" as a substring — must not count as fund context
  const tags = matchFundTags('HDFC leads market mcap gains this week', '', SAMPLE_FUNDS);
  assert.deepEqual(tags, []);
});
