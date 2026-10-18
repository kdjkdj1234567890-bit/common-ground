// SAMPLE DATA — used only when no live Qloo API key is configured.
// Everything in this file is invented for demonstration and is badged
// as SAMPLE in the UI and in every API response (sample: true).
// None of these entities, affinities, or rationales come from Qloo.

const SAMPLE_MODE_NOTE =
  'SAMPLE DATA — the live Qloo API key is not configured yet, so every entity, affinity and rationale on this page is invented for demonstration only.';

// Sample entity catalog keyed by lowercase query fragment.
const SAMPLE_ENTITIES = {
  'frank ocean': { id: 'SAMPLE-E001', name: 'Frank Ocean', type: 'urn:entity:artist' },
  'fred again': { id: 'SAMPLE-E002', name: 'Fred Again..', type: 'urn:entity:artist' },
  'lofi': { id: 'SAMPLE-E003', name: 'Lofi Girl', type: 'urn:entity:artist' },
  'ghibli': { id: 'SAMPLE-E004', name: 'Studio Ghibli', type: 'urn:entity:brand' },
  'spirited away': { id: 'SAMPLE-E005', name: 'Spirited Away', type: 'urn:entity:movie' },
  'nolan': { id: 'SAMPLE-E006', name: 'Christopher Nolan', type: 'urn:entity:person' },
  'everything everywhere': { id: 'SAMPLE-E007', name: 'Everything Everywhere All at Once', type: 'urn:entity:movie' },
  'ramen': { id: 'SAMPLE-E008', name: 'Ramen', type: 'urn:entity:place' },
  'vegan': { id: 'SAMPLE-E009', name: 'Vegan bowls', type: 'urn:entity:place' },
  'steak': { id: 'SAMPLE-E010', name: 'Steakhouse', type: 'urn:entity:place' },
  'korean': { id: 'SAMPLE-E011', name: 'Korean barbecue', type: 'urn:entity:place' },
  'bts': { id: 'SAMPLE-E012', name: 'BTS', type: 'urn:entity:artist' },
  'radiohead': { id: 'SAMPLE-E013', name: 'Radiohead', type: 'urn:entity:artist' },
  'pastel': { id: 'SAMPLE-E014', name: 'Pastel de nata bakery', type: 'urn:entity:place' },
};

// Sample affinity picks per (targetType -> per-member-seed attribution).
// In live mode these come from /v2/insights; here they are invented.
const SAMPLE_PICKS = {
  'urn:entity:place': [
    { id: 'SAMPLE-P1', name: 'Neo-soul brunch bar (sample)', affinity: 0.91, bestFor: 0, note: 'warm vinyl DJ brunch, shared plates' },
    { id: 'SAMPLE-P2', name: 'Hand-pulled noodle house (sample)', affinity: 0.87, bestFor: 2, note: 'counter seating, rich broth, low price' },
    { id: 'SAMPLE-P3', name: 'Korean barbecue with private grill rooms (sample)', affinity: 0.84, bestFor: 1, note: 'group grilling, late hours' },
    { id: 'SAMPLE-P4', name: 'Plant-based tasting counter (sample)', affinity: 0.79, bestFor: 2, note: 'vegan tasting menu, calm room' },
    { id: 'SAMPLE-P5', name: 'Old-school steakhouse (sample)', affinity: 0.72, bestFor: 1, note: 'classic cuts, whiskey list' },
  ],
  'urn:entity:movie': [
    { id: 'SAMPLE-M1', name: 'Past Lives (2023, sample pick)', affinity: 0.9, bestFor: 0, note: 'quiet emotional drama' },
    { id: 'SAMPLE-M2', name: 'The Boy and the Heron (sample pick)', affinity: 0.88, bestFor: 2, note: 'Ghibli-adjacent fantasy' },
    { id: 'SAMPLE-M3', name: 'John Wick 4 (sample pick)', affinity: 0.8, bestFor: 1, note: 'precision action set-pieces' },
    { id: 'SAMPLE-M4', name: 'Past Midnight documentary (sample pick)', affinity: 0.7, bestFor: 0, note: 'music-scene documentary' },
  ],
  'urn:entity:artist': [
    { id: 'SAMPLE-A1', name: 'Snarky Puppy (sample pick)', affinity: 0.89, bestFor: 0, note: 'instrumental groove collective' },
    { id: 'SAMPLE-A2', name: 'Joe Hisaishi (sample pick)', affinity: 0.86, bestFor: 2, note: 'Ghibli scores' },
    { id: 'SAMPLE-A3', name: 'Royal Blood (sample pick)', affinity: 0.78, bestFor: 1, note: 'heavy riffs, two-piece' },
    { id: 'SAMPLE-A4', name: 'Nujabes (sample pick)', affinity: 0.85, bestFor: 2, note: 'jazzy lo-fi hip-hop' },
  ],
};

function sampleSearch(query) {
  const q = String(query || '').toLowerCase();
  const hits = Object.keys(SAMPLE_ENTITIES).filter((k) => q.includes(k) || k.includes(q));
  if (hits.length) return hits.map((k) => ({ ...SAMPLE_ENTITIES[k], sample: true }));
  // Unknown free text: mint a clearly-marked sample entity so the flow continues.
  const clean = String(query || '').trim().slice(0, 60) || 'Unknown';
  return [{
    id: 'SAMPLE-E-' + Buffer.from(clean).toString('hex').slice(0, 8).toUpperCase(),
    name: clean + ' (sample)',
    type: 'urn:entity:unknown',
    sample: true,
  }];
}

function sampleInsights(targetType, memberCount) {
  const picks = SAMPLE_PICKS[targetType] || [];
  return picks.map((p) => ({
    ...p,
    type: targetType,
    bestFor: p.bestFor % Math.max(1, memberCount),
    sample: true,
  }));
}

module.exports = { SAMPLE_MODE_NOTE, sampleSearch, sampleInsights };
