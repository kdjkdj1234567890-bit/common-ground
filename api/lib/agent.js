// Common Ground agent core.
//
// The agent's job: given a group of people and a handful of things each
// person loves, find the overlap nobody can see - picks EVERYONE will
// enjoy - and explain, per person, why each pick works for them.
//
// Loop: intake -> resolve (Qloo Entity Search) -> clash detection ->
// candidates (Qloo Insights, union signal) -> per-member attribution
// (per-member Insights) -> maximin scoring -> plan. Reactions feed a
// replan with new constraints. Every step is written to a visible trace
// so judges can watch the agent think.
//
// Data honesty: Qloo affinities describe aggregate cultural patterns,
// never individual prediction. Rationale text uses association language.
// No personal data (names, emails, ids) is ever sent to Qloo - only
// entity ids and taste tags.

const qloo = require('./qloo');
const sample = require('./sample-data');

const DOMAINS = [
  { key: 'dinner', target: 'urn:entity:place', label: 'Dinner', take: 8,
    // Dinner means restaurants: without this tag filter Qloo's place graph
    // happily returns high-affinity landmarks, hotels and museums.
    tags: ['urn:tag:category:place:restaurant'] },
  { key: 'movie', target: 'urn:entity:movie', label: 'Movie', take: 6 },
  { key: 'music', target: 'urn:entity:artist', label: 'Playlist', take: 6 },
];

function tracePush(trace, step, text, detail) {
  trace.push({ step, text, detail: detail || null, at: new Date().toISOString() });
}

function cityParam(city) {
  const c = String(city || '').trim();
  return c || 'New York';
}

// Step 1-2: resolve each member's free-text likes to grounded entities.
async function resolveMembers(members, live, trace) {
  const resolved = [];
  for (const m of members) {
    const label = String(m.label || 'Member').slice(0, 30);
    const likes = (Array.isArray(m.likes) ? m.likes : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
    const entities = [];
    for (const like of likes) {
      let ent = null;
      if (live) {
        try {
          const hits = await qloo.searchEntities(like, null, 5);
          // First-hit acceptance is naive: "sushi" resolves to an actor,
          // "techno" to a YouTuber. Prefer a non-person match when one
          // exists in the top hits; people are rarely what a group
          // means by a like, and the trace shows what was picked.
          ent = hits.find((h) => h.type !== 'urn:entity:person') || hits[0] || null;
          if (ent) {
            tracePush(trace, 'resolve', `Resolved "${like}" -> ${ent.name}`, ent.id);
          } else {
            tracePush(trace, 'resolve', `"${like}" had no Qloo match - kept as a weak text signal`, null);
          }
        } catch (e) {
          tracePush(trace, 'resolve', `Qloo search failed for "${like}" (${e.message}) - skipping`, null);
        }
      } else {
        const hits = sample.sampleSearch(like);
        ent = hits[0];
        tracePush(trace, 'resolve', `Resolved "${like}" -> ${ent.name} (sample)`, ent.id);
      }
      if (ent) entities.push({ like, id: ent.id, name: ent.name, type: ent.type });
    }
    resolved.push({ label, likes, entities });
    tracePush(trace, 'intake', `${label}: ${entities.length} of ${likes.length} likes grounded to entities`, null);
  }
  return resolved;
}

// Step 3: note where the group clashes outright (no shared domains).
function detectClashes(resolved, trace) {
  const types = resolved.map((m) => new Set(m.entities.map((e) => (e.type || '').split(':').pop())));
  const shared = types.reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
  if (resolved.length > 1 && shared.size === 0) {
    tracePush(trace, 'clash', 'No shared entity domains across the group - the compromise has to come from cross-domain taste affinities, not shared favorites', null);
  } else if (shared.size > 0) {
    tracePush(trace, 'clash', `Shared domains exist (${[...shared].join(', ')}) - cross-domain affinities still used to widen the overlap`, null);
  }
}

// Step 5+6: candidates from the union signal, then per-member attribution.
async function buildCandidates(domain, resolved, live, city, constraints, trace) {
  const unionIds = [...new Set(resolved.flatMap((m) => m.entities.map((e) => e.id)))];
  const vetoed = new Set(constraints.vetoes || []);

  if (!live) {
    const picks = sample.sampleInsights(domain.target, resolved.length)
      .filter((p) => !vetoed.has(p.id));
    return attributeSample(picks, resolved, trace, domain);
  }

  const extra = { take: domain.take * 3 };
  if (domain.target === 'urn:entity:place') {
    // locationQuery only applies to places
  }
  if (constraints.maxPrice) extra['filter.price_level.max'] = constraints.maxPrice;
  if (vetoed.size) extra['filter.exclude.entities'] = [...vetoed].join(',');

  let unionPicks = [];
  try {
    unionPicks = await qloo.insights(domain.target, {
      entityIds: unionIds,
      tags: domain.tags || [],
      locationQuery: domain.target === 'urn:entity:place' ? cityParam(city) : undefined,
      extra,
    });
  } catch (e) {
    tracePush(trace, 'candidates', `Insights call failed for ${domain.label}: ${e.message}`, null);
    return [];
  }
  tracePush(trace, 'candidates', `${domain.label}: ${unionPicks.length} candidates from the group's combined taste signal`, null);

  // Per-member attribution: run each member's own signal and see who
  // each candidate leans toward. This powers "why this works for Mia".
  const perMember = [];
  for (const m of resolved) {
    const ids = m.entities.map((e) => e.id);
    if (!ids.length) { perMember.push(new Map()); continue; }
    try {
      const picks = await qloo.insights(domain.target, {
        entityIds: ids,
        tags: domain.tags || [],
        locationQuery: domain.target === 'urn:entity:place' ? cityParam(city) : undefined,
        extra: { take: domain.take * 3, ...(constraints.maxPrice ? { 'filter.price_level.max': constraints.maxPrice } : {}), ...(vetoed.size ? { 'filter.exclude.entities': [...vetoed].join(',') } : {}) },
      });
      perMember.push(new Map(picks.map((p) => [p.id, p.affinity !== undefined ? p.affinity : 0])));
    } catch {
      perMember.push(new Map());
    }
  }
  return { picks: unionPicks, perMember };
}

function attributeSample(picks, resolved, trace, domain) {
  const perMember = resolved.map((_, i) => {
    const m = new Map();
    for (const p of picks) m.set(p.id, p.bestFor === i ? p.affinity : p.affinity * 0.55);
    return m;
  });
  tracePush(trace, 'candidates', `${domain.label}: ${picks.length} candidates (sample)`, null);
  return { picks, perMember };
}

// Step 7: maximin scoring - the best pick is the one where the LEAST
// happy member is still happy. Members with no evidence are not ignored:
// they count as a cautious neutral prior, so incomplete coverage is
// treated as uncertainty, never as a silent pass.
const UNKNOWN_PRIOR = 0.5;
function scoreAndPick(cands, resolved, domain, trace, opts = {}) {
  if (!cands || !cands.picks || !cands.picks.length) return null;
  const scored = cands.picks.map((p) => {
    // Honesty rule: a member with no per-member Qloo signal for this
    // candidate is UNKNOWN, never a fabricated number. The card reports
    // how much evidence exists, and the maximin counts unknown members
    // at a cautious 50% prior instead of dropping them. The prior is a
    // heuristic, not a guarantee: a pick strongly evidenced for one member
    // can still edge out a pick the whole group only mildly likes.
    const affs = resolved.map((_, i) => {
      const a = cands.perMember[i].get(p.id);
      return typeof a === 'number' ? a : null;
    });
    const known = affs.filter((a) => a !== null);
    const coverage = known.length / affs.length;
    // No per-member evidence at all: fall back to the union-signal affinity,
    // flagged as group-signal-only so the UI can say so.
    const groupOnly = known.length === 0;
    const adjusted = affs.map((a) => (a === null ? UNKNOWN_PRIOR : a));
    const base = groupOnly ? (p.affinity || 0) : Math.min(...adjusted);
    const minKnown = known.length ? Math.min(...known) : null;
    const avg = known.length ? known.reduce((s2, x) => s2 + x, 0) / known.length : (p.affinity || 0);
    const bestIdx = affs.indexOf(known.length ? Math.max(...known) : -1);
    return { pick: p, affs, min: base, minKnown, avg, bestIdx, coverage, groupOnly };
  });
  // Rank: uncertainty-adjusted maximin first (unknown members counted at
  // the 50% prior); group-signal-only picks always rank below evidenced
  // ones. Raw coverage breaks ties.
  scored.sort((a, b) => ((b.groupOnly ? -1 : 0) - (a.groupOnly ? -1 : 0))
    || (b.min - a.min) || (b.coverage - a.coverage) || (b.avg - a.avg));
  const winner = scored[0];
  const lowOverlap = winner.min < 0.2;
  if (!opts.quiet) tracePush(trace, 'score', `${domain.label}: "${winner.pick.name}" wins - compromise estimate ${(winner.min * 100).toFixed(0)}% (maximin; unknown members counted at a cautious ${(UNKNOWN_PRIOR * 100).toFixed(0)}% prior, evidence for ${Math.round(winner.coverage * 100)}% of members)${winner.groupOnly ? ' - group signal only' : ''}${lowOverlap ? ' - weak overlap, best available' : ''}`, null);
  const explainBits = [];
  if (winner.pick.explain) {
    // Live Qloo shape: { 'signal.interests.entities': [{entity_id, score}] } -
    // the members' own likes that drove this pick, with influence scores.
    const drivers = winner.pick.explain['signal.interests.entities'] || [];
    const names = [];
    for (const d of drivers.slice(0, 4)) {
      const hit = resolved.flatMap((m) => m.entities).find((e) => (e.id || '').toUpperCase() === String(d.entity_id || '').toUpperCase());
      names.push(hit ? hit.name : null);
    }
    const known = names.filter(Boolean);
    if (known.length) explainBits.push(`Qloo explainability: driven by the group's ${known.join(' + ')} signal`);
  }
  if (winner.pick.tags && winner.pick.tags.length) explainBits.push(`taste tags: ${winner.pick.tags.slice(0, 4).join(', ')}`);
  const why = resolved.map((m, i) => {
    const seeds = m.entities.slice(0, 2).map((e) => e.name);
    const a = winner.affs[i];
    return {
      member: m.label,
      affinity: a,
      strongest: winner.bestIdx === i,
      reason: a === null
        ? `no Qloo signal linking this pick to ${m.label}'s likes - shown as unknown, not guessed`
        : seeds.length
          ? `aligns with ${m.label}'s own Qloo taste signal (grounded from: ${seeds.join(' + ')})`
          : `carried by the group signal`,
    };
  });
  return {
    domain: domain.key, label: domain.label, ...winner.pick,
    score: winner.min, why,
    coverage: winner.coverage,
    groupOnly: winner.groupOnly,
    lowOverlap,
    evidence: explainBits,
  };
}

// Step 6b - agentic recovery: when the leading pick has no per-member
// signal for someone, the agent does not just plug in the cautious prior.
// It widens the retrieval net for that member (one deeper query, take=50).
// A hit proves the pick sat outside the first retrieval window; a
// continued miss stays inconclusive and is reported as honestly unknown -
// absence from 50 results does not prove "genuinely no signal".
const MAX_RECOVERY_PASSES = 3;
async function recoverUnknowns(card, cands, resolved, domain, live, city, constraints, trace, targetIdx) {
  if (!live || !card || !cands || !cands.picks) return false;
  const unknownIdx = targetIdx || card.why
    .map((w, i) => (w.affinity === null ? i : -1))
    .filter((i) => i >= 0 && resolved[i].entities.length > 0);
  if (!unknownIdx.length) return false;
  let recovered = 0;
  for (const i of unknownIdx) {
    const m = resolved[i];
    const ids = m.entities.map((e) => e.id);
    try {
      const deeper = await qloo.insights(domain.target, {
        entityIds: ids,
        tags: domain.tags || [],
        locationQuery: domain.target === 'urn:entity:place' ? cityParam(city) : undefined,
        extra: { take: 50, ...(constraints.maxPrice ? { 'filter.price_level.max': constraints.maxPrice } : {}), ...(constraints.vetoes && constraints.vetoes.length ? { 'filter.exclude.entities': constraints.vetoes.join(',') } : {}) },
      });
      const before = cands.perMember[i].size;
      for (const p of deeper) {
        if (!cands.perMember[i].has(p.id)) cands.perMember[i].set(p.id, p.affinity !== undefined ? p.affinity : 0);
      }
      const hit = cands.perMember[i].has(card.id);
      tracePush(trace, 'recovery', hit
        ? `Agent noticed missing evidence for ${m.label} on "${card.name}" and widened the search net - found a direct signal after all (was outside the first retrieval window)`
        : `Agent widened the search net for ${m.label} on "${card.name}" - still no direct signal, kept as honestly unknown`, null);
      if (cands.perMember[i].size > before) recovered++;
    } catch (e) {
      tracePush(trace, 'recovery', `Agent's deeper search for ${m.label} failed (${String(e.message || e).slice(0, 120)}) - kept as honestly unknown`, null);
    }
  }
  return recovered > 0;
}

// Recovery repeats (bounded): recovered evidence can change the leader,
// and the new leader may have missing evidence of its own. Each member is
// deep-queried at most once per domain, so the API budget stays bounded.
async function recoverUntilStable(card, cands, resolved, domain, live, city, constraints, trace) {
  if (!live || !card) return card;
  const queried = new Set();
  let passes = 0;
  while (card && passes < MAX_RECOVERY_PASSES) {
    const unknownIdx = card.why
      .map((w, i) => (w.affinity === null ? i : -1))
      .filter((i) => i >= 0 && resolved[i].entities.length > 0 && !queried.has(i));
    if (!unknownIdx.length) break;
    unknownIdx.forEach((i) => queried.add(i));
    passes++;
    await recoverUnknowns(card, cands, resolved, domain, live, city, constraints, trace, unknownIdx);
    const next = scoreAndPick(cands, resolved, domain, trace, { quiet: true });
    if (next && next.id !== card.id) {
      tracePush(trace, 'recovery', `Recovered evidence changed the ${domain.label} leader to "${next.name}" - checking the new leader's evidence too`, null);
    }
    card = next;
  }
  const remaining = card ? card.why.filter((w) => w.affinity === null).length : 0;
  if (card && remaining > 0 && passes >= MAX_RECOVERY_PASSES) {
    tracePush(trace, 'recovery', `Recovery budget (${MAX_RECOVERY_PASSES} passes) used - ${remaining} member signal${remaining === 1 ? '' : 's'} still unknown, kept at the cautious prior`, null);
  }
  return card;
}

// Count (member, candidate) pairs with no per-member evidence - the
// quantity recovery is meant to shrink.
function countUnknownPairs(cands, resolved) {
  if (!cands || !cands.picks) return { unknown: 0, total: 0 };
  let unknown = 0;
  const total = cands.picks.length * resolved.length;
  for (const p of cands.picks) {
    for (let i = 0; i < resolved.length; i++) {
      if (typeof cands.perMember[i].get(p.id) !== 'number') unknown++;
    }
  }
  return { unknown, total };
}

// Full planning run.
async function plan({ members, city, constraints = {} }) {
  const live = qloo.hasKey();
  const trace = [];
  tracePush(trace, 'start', live
    ? 'Agent starting - live Qloo taste graph mode'
    : 'Agent starting - SAMPLE DATA mode (no live Qloo key configured)', null);

  const resolved = await resolveMembers(members, live, trace);
  detectClashes(resolved, trace);

  const planCards = [];
  for (const domain of DOMAINS) {
    const cands = await buildCandidates(domain, resolved, live, city, constraints, trace);
    const first = scoreAndPick(cands, resolved, domain, trace, { quiet: true });
    if (first && live) await recoverUntilStable(first, cands, resolved, domain, live, city, constraints, trace);
    // final scoring (traced) reflects any recovered evidence
    const card = scoreAndPick(cands, resolved, domain, trace);
    if (card) planCards.push(card);
  }

  tracePush(trace, 'done', `Plan ready: ${planCards.map((c) => c.name).join(' + ') || 'no picks'}`, null);

  return {
    mode: live ? 'live' : 'sample',
    note: live ? null : sample.SAMPLE_MODE_NOTE,
    trace,
    plan: planCards,
    session: { members: resolved.map((m) => ({ label: m.label, likes: m.likes })), city: cityParam(city) },
  };
}

// Popularity-only baseline: what the SAME Qloo catalog suggests for the
// same city with zero taste signal - the generic "top picks near you"
// answer any ratings app gives. This is the honest control group that
// shows whether Qloo's taste graph actually changed the outcome.
async function baseline({ city }) {
  const live = qloo.hasKey();
  const out = [];
  for (const domain of DOMAINS) {
    let picks = [];
    if (live) {
      try {
        picks = await qloo.insights(domain.target, {
          entityIds: [],
          tags: domain.tags || [],
          locationQuery: cityParam(city),
          extra: { take: 5 },
        });
      } catch { picks = []; }
    } else {
      picks = sample.sampleInsights(domain.target, 1);
    }
    const top = [...picks].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    if (top) out.push({ domain: domain.key, label: domain.label, name: top.name, popularity: top.popularity !== undefined ? top.popularity : null });
  }
  return { mode: live ? 'live' : 'sample', baseline: out };
}

// Benchmark: maximin vs arithmetic-mean aggregation over the SAME
// candidate pool with the SAME recovered evidence - isolating the
// aggregation rule, which is the project's distinguishing claim. Scripted
// scenarios on Qloo aggregate affinities only: this measures score
// behavior of the two rules, never human satisfaction.
async function benchmark({ members, city }) {
  const live = qloo.hasKey();
  const trace = [];
  const resolved = await resolveMembers(members, live, trace);
  const domains = [];
  for (const domain of DOMAINS) {
    const cands = await buildCandidates(domain, resolved, live, city, {}, trace);
    if (!cands || !cands.picks || !cands.picks.length) continue;
    const before = countUnknownPairs(cands, resolved);
    const first = scoreAndPick(cands, resolved, domain, trace, { quiet: true });
    await recoverUntilStable(first, cands, resolved, domain, live, city, {}, trace);
    const after = countUnknownPairs(cands, resolved);
    // Re-score the final pool both ways. Candidates with zero per-member
    // evidence are excluded: neither aggregation rule can rank them fairly.
    const scored = cands.picks.map((p) => {
      const raw = resolved.map((_, i) => cands.perMember[i].get(p.id));
      const known = raw.filter((a) => typeof a === 'number');
      if (!known.length) return null;
      const affs = raw.map((a) => (typeof a === 'number' ? a : UNKNOWN_PRIOR));
      return { name: p.name, min: Math.min(...affs), mean: affs.reduce((s, x) => s + x, 0) / affs.length, coverage: known.length / raw.length };
    }).filter(Boolean);
    if (!scored.length) continue;
    const maximin = [...scored].sort((a, b) => b.min - a.min || b.mean - a.mean)[0];
    const meanPick = [...scored].sort((a, b) => b.mean - a.mean || b.min - a.min)[0];
    domains.push({
      domain: domain.key, label: domain.label,
      candidates: scored.length,
      unknownBefore: before.unknown, unknownAfter: after.unknown, pairs: before.total,
      maximin: { name: maximin.name, floor: +maximin.min.toFixed(3), mean: +maximin.mean.toFixed(3) },
      meanPick: { name: meanPick.name, floor: +meanPick.min.toFixed(3), mean: +meanPick.mean.toFixed(3) },
      differ: maximin.name !== meanPick.name,
    });
  }
  return { mode: live ? 'live' : 'sample', city: cityParam(city), domains };
}

module.exports = { plan, baseline, benchmark };
