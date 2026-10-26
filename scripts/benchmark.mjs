// Maximin vs arithmetic-mean benchmark over the SAME Qloo candidate pool.
// Runs the 10 scripted scenarios against the DEPLOYED app and reports:
//  - how often recovery shrinks unknown (member, candidate) evidence pairs
//  - how often the two aggregation rules pick differently
//  - the least-happy-member floor under each rule's pick
//
// Usage:  node scripts/benchmark.mjs [baseUrl]
// Default baseUrl: https://common-ground-kdjkdj1234567890-bits-projects.vercel.app
//
// Honesty notes: scripted scenarios over Qloo aggregate affinities. These
// numbers compare SCORING RULES on the same evidence; they say nothing
// about real human satisfaction with the picks. Both baselines are simple
// heuristics we chose; neither is verified against any shipping product's
// actual aggregation.

import { SCENARIOS } from './scenarios.mjs';

const BASE = process.argv[2] || 'https://common-ground-kdjkdj1234567890-bits-projects.vercel.app';
const CITY = 'New York';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
  return r.json();
}

const START = parseInt(process.env.START || '0', 10);
const COUNT = parseInt(process.env.COUNT || String(SCENARIOS.length), 10);
if (START === 0) console.log('| Scenario | Domain | Maximin pick (floor) | Mean pick (floor) | Naive mean-of-known pick (floor) | Differs vs mean / vs naive | Unknown pairs before -> after |');
console.log('|---|---|---|---|---|---|---|');
let n = 0, diff = 0, diffNaive = 0, uBefore = 0, uAfter = 0, pairs = 0, liftSum = 0, liftPos = 0, liftNaiveSum = 0, liftNaivePos = 0, errors = 0;
for (const sc of SCENARIOS.slice(START, START + COUNT)) {
  try {
    const res = await post('/api/benchmark', {
      city: CITY,
      members: sc.members.map(([label, likes]) => ({ label, likes: likes.split(',').map((s) => s.trim()) })),
    });
    if (res.mode !== 'live') throw new Error('not live: ' + res.mode);
    for (const d of res.domains) {
      n++;
      diff += d.differ ? 1 : 0; diffNaive += d.differNaive ? 1 : 0;
      uBefore += d.unknownBefore; uAfter += d.unknownAfter; pairs += d.pairs;
      const lift = d.maximin.floor - d.meanPick.floor;
      liftSum += lift; if (lift > 0.005) liftPos++;
      const liftN = d.maximin.floor - d.naivePick.floor;
      liftNaiveSum += liftN; if (liftN > 0.005) liftNaivePos++;
      const pct = (x) => (x * 100).toFixed(0) + '%';
      console.log(`| ${sc.id} | ${d.label} | ${d.maximin.name} (${pct(d.maximin.floor)}) | ${d.meanPick.name} (${pct(d.meanPick.floor)}) | ${d.naivePick.name} (${pct(d.naivePick.floor)}) | ${d.differ ? 'yes' : 'no'} / ${d.differNaive ? 'yes' : 'no'} | ${d.unknownBefore} -> ${d.unknownAfter} |`);
    }
  } catch (e) {
    errors++;
    console.log(`| ${sc.id} | ERROR | ${String(e.message).slice(0, 60)} | - | - | - |`);
  }
  await sleep(1500); // be gentle with the hackathon rate limit
}
console.log('');
console.log(`Chunk start=${START} count=${COUNT}. Decisions: ${n} (${errors} errors). Maximin differs vs adjusted-mean: ${diff}/${n}; vs naive mean-of-known: ${diffNaive}/${n}.`);
console.log(`Unknown evidence pairs: ${uBefore} -> ${uAfter} of ${pairs} (${uBefore ? (100 * (uBefore - uAfter) / uBefore).toFixed(0) : 0}% reduction by recovery).`);
console.log(`Least-happy-member floor, maximin pick minus adjusted-mean pick: mean lift ${(100 * liftSum / Math.max(n, 1)).toFixed(1)} pts, strictly higher in ${liftPos}/${n}; minus naive pick: mean lift ${(100 * liftNaiveSum / Math.max(n, 1)).toFixed(1)} pts, strictly higher in ${liftNaivePos}/${n}.`);
