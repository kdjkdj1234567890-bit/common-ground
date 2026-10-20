# Evaluation: taste-aware picks vs a popularity-only baseline

Date: 2026-10-20 (second run; the first run is superseded - see below).
Target: the deployed app at
https://common-ground-kdjkdj1234567890-bits-projects.vercel.app (live Qloo mode).

## Method

10 scripted 3-member scenarios with deliberately contrasting tastes (S1-S10,
see `scripts/evaluate.mjs`), city fixed to New York. For each scenario we
POST `/api/plan` (taste-aware, full Qloo pipeline) and compare every domain
pick against `/api/baseline`, which queries the SAME Qloo catalog for the
same city with zero taste signal and takes the most popular entity - the
honest control group: the generic "top picks near you" answer. Both sides
restrict dinner candidates to restaurant-category places
(`urn:tag:category:place:restaurant`), so the comparison is same-category.

Reproduce:

```
node scripts/evaluate.mjs            # full run, ~10 minutes (rate-limit friendly)
START=4 COUNT=2 node scripts/evaluate.mjs   # or in chunks
```

## Results

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
| S5 | Playlist | The Who | 50% | 33% | Coldplay | yes |
| S6 | Dinner | Le Pain Quotidien | 50% | 67% | Katz's Delicatessen | yes |
| S6 | Movie | Midsommar | 50% | 33% | The Dark Knight | yes |
| S6 | Playlist | Olivia Rodrigo | 50% | 33% | Coldplay | yes |
| S7 | Dinner | Gran Torino | 50% | 67% | Katz's Delicatessen | yes |
| S7 | Movie | Jojo Rabbit | 50% | 67% | The Dark Knight | yes |
| S7 | Playlist | ZAYN | 50% | 33% | Coldplay | yes |
| S8 | Dinner | VIDA SteakHouse NYC | 50% | 67% | Katz's Delicatessen | yes |
| S8 | Movie | Papillon | 50% | 33% | The Dark Knight | yes |
| S8 | Playlist | Dr. Dre | 50% | 33% | Coldplay | yes |
| S9 | Dinner | Nusr-Et Steakhouse New York | 50% | 33% | Katz's Delicatessen | yes |
| S9 | Movie | Crazy About Her | 50% | 33% | The Dark Knight | yes |
| S9 | Playlist | Sin Bandera | 50% | 33% | Coldplay | yes |
| S10 | Dinner | Little Italy | 75% | 100% | Katz's Delicatessen | yes |
| S10 | Movie | Ford v Ferrari | 50% | 67% | The Dark Knight | yes |
| S10 | Playlist | FAVLAV | 50% | 33% | Coldplay | yes |

## Summary

- Scenarios: 10 (0 errors). Domain picks: 30.
- Mean evidence coverage: 51% of members have a per-member Qloo signal for the winning pick.
- Mean compromise score: 53% (uncertainty-adjusted maximin; members with no signal count at a cautious 50% prior).
- **Pick differs from the popularity-only baseline in 30/30 domain comparisons (100%).** The taste signals, not the catalog, drive the outcome.
- Weak-overlap picks (compromise score under 20% on raw evidence): 0/30.
- All 10 dinner picks are restaurants; the generic baseline returns Katz's
  Delicatessen for every scenario regardless of group taste.

## What changed since the first run

The first run of this evaluation (same date, earlier commit) let the place
query return any high-affinity place, so 6 of 10 dinner "picks" were
landmarks or hotels (Brooklyn Bridge, One World Trade Center, the
Guggenheim). That run is superseded and should be ignored: a recommendation
that is not a restaurant is not a valid dinner pick. Dinner candidates are
now restricted to restaurant-category places on both the taste-aware and
the baseline side.

## Honest limitations

- Members are scripted scenarios, not human testers. Nobody voted; the
  accept/veto flow is a client-side demo interaction and is not measured
  here. Difference from baseline shows the taste input changes the outcome;
  it does not by itself prove the outcome is better liked by real groups.
- Coverage is real but partial: about half of member-pick pairs have no
  per-member Qloo signal, and those members count at the 50% prior rather
  than being silently dropped. This pulls compromise scores toward 50% and
  is visible in the table, by design.
- Numbers depend on live Qloo responses and drift as the catalog changes;
  re-run the script to reproduce rather than trusting this snapshot.
