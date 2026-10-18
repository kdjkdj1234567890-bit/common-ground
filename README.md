# Common Ground

**An agent that ends the "what should we do?" deadlock - powered by the Qloo taste graph.**

Three friends want a night out. One loves Frank Ocean and ramen, one loves Nolan
and steakhouses, one loves lo-fi and vegan bowls. Twenty minutes of "anything is
fine" later, nobody has picked anything. Generic chatbots make this worse: they
average the group into bland, hallucinated suggestions nobody is excited about.

Common Ground takes the deadlock seriously. Each person lists a few things they
love. The agent grounds those to real entities, uses Qloo's cross-domain taste
affinities (music <-> film <-> dining) to find the overlap nobody can see, and
proposes a concrete plan - dinner, a movie, a playlist - with a per-person
explanation of why each pick works. Anyone can veto or push back, and the agent
replans around the new constraint.

## Why this only works with Qloo

The core problem is **cross-domain compromise**: nobody shares a favorite, so the
answer has to come from *taste adjacency* - the fact that people who love X tend
to love Y. That adjacency is exactly what Qloo's taste graph (250M+ entities)
provides and what an LLM alone can only fake. Without Qloo this app is a generic
chatbot guessing; with Qloo every suggestion carries an affinity provenance.

## The agent loop

1. **Intake** - each member's free-text likes.
2. **Resolve** - Qloo Entity Search grounds each like to a real entity
   (disambiguation is shown in the trace).
3. **Clash detection** - if members share no entity domains, the agent says so
   and leans fully on cross-domain affinities.
4. **Candidates** - Qloo Insights with the *union* of everyone's entity signals
   (`signal.interests.entities`), per target domain (place / movie / artist),
   places filtered to the chosen city (`filter.location.query`).
5. **Attribution** - the agent re-runs Insights per member and checks which
   member's own signal each candidate leans toward - this powers the honest
   "why this works for Mia" rows.
6. **Maximin scoring** - the winning pick maximizes the *least* excited member's
   affinity (tie-break: group average). A compromise nobody hates beats a pick
   one person loves and another vetoes.
7. **Replan** - vetoes add `filter.exclude.entities`; "make it cheaper" adds
   `filter.price_level.max=2`; the loop re-runs with the new constraints.

The whole loop is visible in the UI as a live trace, because an agent you can't
watch is just a form.

## Qloo usage (request -> result, redacted)

- `GET /v2/search?query=<like>` - free text -> entity candidates for grounding.
- `GET /v2/insights?filter.type=urn:entity:place|movie|artist&signal.interests.entities=<ids>&filter.location.query=<city>&feature.explainability=true`
  - candidates from individual and combined taste signals.
- Constraints map to documented filters: `filter.exclude.entities`,
  `filter.price_level.max`.
- Entity/tag choices (e.g. which "Jazz" we meant) are surfaced in the trace
  rather than silently picked.

## Responsible data handling

- No names, emails, or any personal data are sent to Qloo - only entity IDs and
  taste tags. Member labels never leave the browser except as display strings.
- Affinities are **aggregate cultural patterns**, presented as associations,
  never as predictions about an individual. The UI and this README say so.
- The Qloo API key lives only in a server-side environment variable
  (hackathon rule: never in a browser app). All Qloo traffic goes through the
  `api/` serverless proxy.

## Modes

- **Live mode** (`QLOO_API_KEY` set): every pick and affinity comes from the
  real Qloo taste graph.
- **Sample mode** (no key): the app still demonstrates the full flow with
  clearly-invented data, badged SAMPLE in the header, a banner, the API
  response, and `sample-data/README.md`. Sample values are never mixed with
  live ones; the mode is decided per deployment, not per request.

## Tech

- Static frontend (`public/`, no framework, no build step).
- Serverless API (`api/`, Node, zero dependencies) designed for Vercel:
  - `POST /api/plan` - members + city -> trace + plan.
  - `POST /api/replan` - prior session + constraints -> revised plan.
  - `GET /api/health` - live vs sample mode.
- No database, no accounts: group state lives in the browser and is posted back
  for replans.

## Run locally

```bash
export QLOO_API_KEY=<your hackathon key>   # omit for sample mode
node tools/dev-server.js                   # http://localhost:3461
```

## Deploy (Vercel, free)

```bash
npm i -g vercel
vercel env add QLOO_API_KEY     # paste the key (server-side only)
vercel deploy --prod
```

## Known limitations

- Affinity scores reflect group-level cultural patterns; a high score is not a
  guarantee any person will enjoy the pick.
- Free-text likes that Qloo cannot ground are dropped (shown in the trace)
  rather than guessed.
- Place results depend on Qloo's coverage of the chosen city.
- Session state is client-held; nothing is stored server-side.
