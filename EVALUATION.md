# Evaluation

Date: 2026-10-26 (third run; supersedes the 2026-10-20 runs - the recovery
loop and scoring honesty fixes changed the pipeline).
Target: the deployed app at
https://common-ground-kdjkdj1234567890-bits-projects.vercel.app (live Qloo mode).

Two reproducible comparisons over the same 10 fixed scripted 3-member
scenarios (`scripts/scenarios.mjs`), city fixed to New York.

## Comparison 1: taste-aware picks vs a popularity-only baseline

Method: for each scenario we POST `/api/plan` (taste-aware, full Qloo
pipeline with multi-pass recovery) and compare every domain pick against
`/api/baseline`, which queries the SAME Qloo catalog for the same city with
zero taste signal and takes the most popular entity - the generic
"top picks near you" answer. Both sides restrict dinner candidates to
restaurant-category places (`urn:tag:category:place:restaurant`).

Reproduce: `node scripts/evaluate.mjs` (~10 minutes, rate-limit friendly),
or in chunks: `START=4 COUNT=2 node scripts/evaluate.mjs`.

| Scenario | Domain | Group pick | Compromise score | Coverage | Generic pick | Differs? |
|---|---|---|---|---|---|---|
| S1 | Dinner | Beetle House | 50% | 67% | Katz's Delicatessen | yes |
| S1 | Movie | Marriage Story | 50% | 67% | The Dark Knight | yes |
| S1 | Playlist | Tyler, the Creator | 50% | 33% | Coldplay | yes |
| S2 | Dinner | Little Italy | 74% | 100% | Katz's Delicatessen | yes |
| S2 | Movie | Gifted | 50% | 33% | The Dark Knight | yes |
| S2 | Playlist | Selena Gomez & the Scene | 50% | 67% | Coldplay | yes |
| S3 | Dinner | Hard Rock Cafe | 50% | 67% | Katz's Delicatessen | yes |
| S3 | Movie | The Best Years | 50% | 33% | The Dark Knight | yes |
| S3 | Playlist | Hélène Ségara | 50% | 33% | Coldplay | yes |
| S4 | Dinner | Smithfield Hall NYC | 50% | 67% | Katz's Delicatessen | yes |
| S4 | Movie | BlacKkKlansman | 50% | 33% | The Dark Knight | yes |
| S4 | Playlist | NAS | 50% | 33% | Coldplay | yes |
| S5 | Dinner | Little Italy | 86% | 100% | Katz's Delicatessen | yes |
| S5 | Movie | Children of Men | 50% | 33% | The Dark Knight | yes |
| S5 | Playlist | The Doors | 50% | 67% | Coldplay | yes |
| S6 | Dinner | Le Pain Quotidien | 50% | 67% | Katz's Delicatessen | yes |
| S6 | Movie | Promising Young Woman | 50% | 67% | The Dark Knight | yes |
| S6 | Playlist | Olivia Rodrigo | 50% | 33% | Coldplay | yes |
| S7 | Dinner | Starr Bar | 83% | 100% | Katz's Delicatessen | yes |
| S7 | Movie | Jojo Rabbit | 50% | 67% | The Dark Knight | yes |
| S7 | Playlist | ZAYN | 50% | 33% | Coldplay | yes |
| S8 | Dinner | VIDA SteakHouse NYC | 50% | 67% | Katz's Delicatessen | yes |
| S8 | Movie | Papillon | 50% | 33% | The Dark Knight | yes |
| S8 | Playlist | Dr. Dre | 50% | 33% | Coldplay | yes |
| S9 | Dinner | Perry St | 50% | 67% | Katz's Delicatessen | yes |
| S9 | Movie | Crazy About Her | 50% | 33% | The Dark Knight | yes |
| S9 | Playlist | Sin Bandera | 50% | 33% | Coldplay | yes |
| S10 | Dinner | Little Italy | 75% | 100% | Katz's Delicatessen | yes |
| S10 | Movie | Ford v Ferrari | 50% | 67% | The Dark Knight | yes |
| S10 | Playlist | FAVLAV | 50% | 33% | Coldplay | yes |

Summary (this run):

- Scenarios: 10 (0 errors). Domain picks: 30.
- **Pick differs from the popularity-only baseline in 30/30 domain
  comparisons (100%).** The taste signals, not the catalog, drive the
  outcome; the generic baseline returns Katz's Delicatessen / The Dark
  Knight / Coldplay for every scenario regardless of group taste.
- Mean evidence coverage: 56% of members have a per-member Qloo signal for
  the winning pick (51% in the 2026-10-20 run, before multi-pass recovery).
- Mean compromise score: 54% (uncertainty-adjusted maximin; members with no
  signal count at a cautious 50% prior).
- Weak-overlap picks (compromise score under 20%): 0/30.

## Comparison 2: maximin vs simpler aggregation over the SAME candidate pool

Method: `/api/benchmark` builds the candidate pool exactly once per
(scenario, domain), runs the same multi-pass recovery the planner uses,
then scores the final pool three ways:

- **Maximin + cautious prior** (the app's rule): rank by the least-happy
  member's affinity, unknown members counted at the 50% prior.
- **Adjusted arithmetic mean**: rank by the group mean with the same 50%
  prior for unknowns. This isolates the aggregation rule (min vs mean) and
  nothing else.
- **Naive mean-of-known**: rank by the mean over only the members who HAVE
  evidence, ignoring unknown members entirely. A simple heuristic baseline
  we chose; not verified against any shipping product's aggregation.

Reproduce: `node scripts/benchmark.mjs` (same chunking as evaluate.mjs).

| Scenario | Domain | Maximin pick (floor) | Mean pick (floor) | Naive mean-of-known pick (floor) | Differs vs mean / vs naive | Unknown pairs before -> after |
|---|---|---|---|---|---|---|
| S1 | Dinner | Beetle House (50%) | Beetle House (50%) | Art Bar (50%) | no / yes | 48 -> 45 |
| S1 | Movie | Marriage Story (50%) | Marriage Story (50%) | Free Guy (50%) | no / yes | 43 -> 40 |
| S1 | Playlist | Tyler, the Creator (50%) | Tyler, the Creator (50%) | Tyler, the Creator (50%) | no / no | 52 -> 52 |
| S2 | Dinner | Little Italy (74%) | Little Italy (74%) | The Iridium (50%) | no / yes | 33 -> 33 |
| S2 | Movie | Gifted (50%) | Gifted (50%) | Gifted (50%) | no / no | 53 -> 47 |
| S2 | Playlist | Selena Gomez & the Scene (50%) | Selena Gomez & the Scene (50%) | Britney Spears (50%) | no / yes | 44 -> 44 |
| S3 | Dinner | Hard Rock Cafe (50%) | Hard Rock Cafe (50%) | Katz's Delicatessen (50%) | no / yes | 56 -> 55 |
| S3 | Movie | The Best Years (50%) | The Best Years (50%) | The Best Years (50%) | no / no | 49 -> 44 |
| S3 | Playlist | Hélène Ségara (50%) | Hélène Ségara (50%) | Hélène Ségara (50%) | no / no | 52 -> 52 |
| S4 | Dinner | Smithfield Hall NYC (50%) | Smithfield Hall NYC (50%) | Red Rooster Harlem (50%) | no / yes | 55 -> 51 |
| S4 | Movie | BlacKkKlansman (50%) | BlacKkKlansman (50%) | BlacKkKlansman (50%) | no / no | 47 -> 43 |
| S4 | Playlist | NAS (50%) | NAS (50%) | NAS (50%) | no / no | 47 -> 47 |
| S5 | Dinner | Little Italy (86%) | Little Italy (86%) | Little Italy (86%) | no / no | 32 -> 32 |
| S5 | Movie | Children of Men (50%) | Children of Men (50%) | Children of Men (50%) | no / no | 48 -> 43 |
| S5 | Playlist | The Doors (50%) | The Doors (50%) | The Who (50%) | no / yes | 42 -> 39 |
| S6 | Dinner | Le Pain Quotidien (50%) | Le Pain Quotidien (50%) | Koneko (50%) | no / yes | 51 -> 48 |
| S6 | Movie | Promising Young Woman (50%) | Promising Young Woman (50%) | Midsommar (50%) | no / yes | 42 -> 36 |
| S6 | Playlist | Olivia Rodrigo (50%) | Olivia Rodrigo (50%) | Olivia Rodrigo (50%) | no / no | 51 -> 50 |
| S7 | Dinner | Starr Bar (83%) | Starr Bar (83%) | Subway (50%) | no / yes | 52 -> 49 |
| S7 | Movie | Jojo Rabbit (50%) | Jojo Rabbit (50%) | Marriage Story (50%) | no / yes | 48 -> 48 |
| S7 | Playlist | ZAYN (50%) | ZAYN (50%) | ZAYN (50%) | no / no | 47 -> 47 |
| S8 | Dinner | VIDA SteakHouse NYC (50%) | VIDA SteakHouse NYC (50%) | Harlem Hookah (50%) | no / yes | 53 -> 53 |
| S8 | Movie | Papillon (50%) | Papillon (50%) | Papillon (50%) | no / no | 51 -> 50 |
| S8 | Playlist | Dr. Dre (50%) | Dr. Dre (50%) | Dr. Dre (50%) | no / no | 52 -> 52 |
| S9 | Dinner | Perry St (50%) | Perry St (50%) | Ume (50%) | no / yes | 59 -> 50 |
| S9 | Movie | Crazy About Her (50%) | Crazy About Her (50%) | Crazy About Her (50%) | no / no | 52 -> 52 |
| S9 | Playlist | Sin Bandera (50%) | Sin Bandera (50%) | Sin Bandera (50%) | no / no | 47 -> 47 |
| S10 | Dinner | Little Italy (76%) | Little Italy (76%) | Birdland Jazz Club (50%) | no / yes | 42 -> 42 |
| S10 | Movie | Ford v Ferrari (50%) | Ford v Ferrari (50%) | Tolkien (50%) | no / yes | 43 -> 43 |
| S10 | Playlist | FAVLAV (50%) | FAVLAV (50%) | FAVLAV (50%) | no / no | 53 -> 53 |

Summary (this run):

- Decisions: 30 (0 errors).
- **Maximin vs adjusted mean: identical picks in 30/30 decisions.** With
  unknowns priced identically on both sides, min-ranking and mean-ranking
  agree on this scenario set. The project claims no advantage over a
  prior-adjusted mean, and this run found none.
- **Maximin vs the naive mean-of-known baseline: different picks in 15/30
  decisions.** That baseline's pick sacrifices the least-happy member
  (floor strictly lower) in 3/30 decisions; mean floor lift across all 30
  decisions is +2.7 points. This shows maximin differs from ONE simple
  straw-man rule on half the decisions - not that it beats real products,
  whose aggregation we did not inspect. Two further caveats: the floor
  metric favors maximin by construction (maximin optimizes exactly that
  minimum, so a nonnegative lift is largely a consequence of the objective,
  not independent validation), and the naive comparison varies two factors
  at once (aggregation rule AND missing-data handling), so it cannot
  isolate which one drives the difference.
- Recovery reduced unknown (member, candidate) evidence pairs from 1,444
  to 1,387 of 1,800 (3.9%) - real but modest: recovery targets evidence
  for the leading pick, not pool-wide coverage.

## What these numbers do and do not show

- These are scripted scenarios over Qloo's aggregate cultural affinities.
  They compare SCORING RULES and pipelines on fixed inputs; they say
  nothing about whether real groups are happier, decide faster, or reach
  consensus more often. No human study was run and none is claimed.
- Difference from the popularity baseline shows the taste input changes the
  outcome; it does not by itself prove the outcome is better liked.
- Numbers depend on live Qloo responses and drift as the catalog changes;
  re-run the scripts to reproduce rather than trusting this snapshot.

## What changed since the 2026-10-20 runs

- Recovery is now multi-pass (bounded: max 3 passes, each member
  deep-queried at most once per domain); a recovered-evidence leader change
  triggers evidence checks for the new leader.
- The 2026-10-20 first run's invalid dinner picks (landmarks/hotels) remain
  superseded: dinner candidates are restaurant-category on both sides.
