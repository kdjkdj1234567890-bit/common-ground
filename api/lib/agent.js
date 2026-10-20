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
  { key: 'dinner', target: 'urn:entity:place', label: 'Dinner', take: 8 },
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
// happy member is still happy. Tie-break on group average.
function scoreAndPick(cands, resolved, domain, trace) {
  if (!cands || !cands.picks || !cands.picks.length) return null;
  const scored = cands.picks.map((p) => {
    // Honesty rule: a member with no per-member Qloo signal for this
    // candidate is UNKNOWN, never a fabricated number. Maximin runs over
    // known evidence only, and the card reports how much evidence exists.
    const affs = resolved.map((_, i) => {
      const a = cands.perMember[i].get(p.id);
      return typeof a === 'number' ? a : null;
    });
    const known = affs.filter((a) => a !== null);
    const coverage = known.length / affs.length;
    // No per-member evidence at all: fall back to the union-signal affinity,
    // flagged as group-signal-only so the UI can say so.
    const groupOnly = known.length === 0;
    const base = groupOnly ? (p.affinity || 0) : Math.min(...known);
    const avg = known.length ? known.reduce((s2, x) => s2 + x, 0) / known.length : (p.affinity || 0);
    const bestIdx = affs.indexOf(known.length ? Math.max(...known) : -1);
    return { pick: p, affs, min: base, avg, bestIdx, coverage, groupOnly };
  });
  // Rank: real per-member evidence first, then maximin, then average.
  scored.sort((a, b) => (b.coverage - a.coverage) || (b.min - a.min) || (b.avg - a.avg));
  const winner = scored[0];
  const lowOverlap = winner.min < 0.2;
  tracePush(trace, 'score', `${domain.label}: "${winner.pick.name}" wins - least-excited evidenced member scores ${(winner.min * 100).toFixed(0)}% (maximin, evidence for ${Math.round(winner.coverage * 100)}% of members)${winner.groupOnly ? ' - group signal only' : ''}${lowOverlap ? ' - weak overlap, best available' : ''}`, null);
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
          ? `aligns with ${m.label}'s ${seeds.join(' + ')} signal in Qloo's taste graph`
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

module.exports = { plan };
