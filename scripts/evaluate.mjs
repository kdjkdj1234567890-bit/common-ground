// Reproducible evaluation: taste-aware plan vs popularity-only baseline.
// Scenarios live in scripts/scenarios.mjs (shared with benchmark.mjs).
// Runs 10 contrasting 3-member scenarios against the DEPLOYED app (live
// Qloo), and reports coverage, compromise score, and how often the group
// pick differs from the generic popularity-only pick.
//
// Usage:  node scripts/evaluate.mjs [baseUrl]
// Default baseUrl: https://common-ground-kdjkdj1234567890-bits-projects.vercel.app
//
// Honesty notes: members are scripted scenarios, not human testers. Votes
// and vetoes are client-side demo interactions and are NOT measured here.
// Numbers depend on live Qloo responses and drift over time.

const BASE = process.argv[2] || 'https://common-ground-kdjkdj1234567890-bits-projects.vercel.app';
const CITY = 'New York';

import { SCENARIOS } from './scenarios.mjs';

const START = parseInt(process.env.START || '0', 10);
const COUNT = parseInt(process.env.COUNT || String(SCENARIOS.length), 10);

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
  return r.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseline = await post('/api/baseline', { city: CITY });
if (baseline.mode !== 'live') throw new Error('baseline not in live mode: ' + baseline.mode);
const baseByDomain = Object.fromEntries(baseline.baseline.map((b) => [b.domain, b.name]));

if (START === 0) { console.log('| Scenario | Domain | Group pick | Compromise score | Coverage | Generic pick | Differs? |');
console.log('|---|---|---|---|---|---|---|'); }
let n = 0, diff = 0, sumCov = 0, sumScore = 0, weak = 0, errors = 0;
for (const sc of SCENARIOS.slice(START, START + COUNT)) {
  try {
    const res = await post('/api/plan', {
      city: CITY,
      members: sc.members.map(([label, likes]) => ({ label, likes: likes.split(',').map((s) => s.trim()) })),
    });
    if (res.mode !== 'live') throw new Error('plan not live: ' + res.mode);
    for (const card of res.plan) {
      const b = baseByDomain[card.domain] || '(none)';
      const differs = b !== '(none)' && card.name !== b;
      n++; diff += differs ? 1 : 0; sumCov += card.coverage; sumScore += card.score; weak += card.lowOverlap ? 1 : 0;
      console.log(`| ${sc.id} | ${card.label} | ${card.name} | ${(card.score * 100).toFixed(0)}% | ${Math.round(card.coverage * 100)}% | ${b} | ${differs ? 'yes' : 'no'} |`);
    }
  } catch (e) {
    errors++;
    console.log(`| ${sc.id} | ERROR | ${String(e.message).slice(0, 60)} | - | - | - | - |`);
  }
  await sleep(1500); // be gentle with the hackathon rate limit
}
console.log('');
console.log(`Chunk start=${START} count=${COUNT} (${errors} errors). Domain picks: ${n}.`);
console.log(`Mean coverage: ${(100 * sumCov / Math.max(n, 1)).toFixed(0)}%. Mean compromise score: ${(100 * sumScore / Math.max(n, 1)).toFixed(0)}%.`);
console.log(`Differs from popularity-only baseline: ${diff}/${n} (${(100 * diff / Math.max(n, 1)).toFixed(0)}%). Weak-overlap picks: ${weak}/${n}.`);
