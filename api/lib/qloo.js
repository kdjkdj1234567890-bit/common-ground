// Qloo API client. The API key lives ONLY here on the server side
// (Qloo hackathon rule: never expose the key in a browser app).
// Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
// Base URL: hackathon keys work only against hackathon.api.qloo.com.

const BASE_URL = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';
const API_KEY = process.env.QLOO_API_KEY || '';

function hasKey() {
  return API_KEY.length > 0;
}

async function qlooGet(path, params) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { 'X-Api-Key': API_KEY, 'Accept': 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Qloo ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Entity Search: free text -> candidate entities (for disambiguation).
// e.g. searchEntities('jazz', 'urn:entity:artist')
async function searchEntities(query, type, limit = 5) {
  const params = { query, limit };
  if (type) params.types = type;
  const data = await qlooGet('/v2/search', params);
  return normalizeEntities(data);
}

// Insights: taste-graph affinities.
// entityIds: array of Qloo entity ids used as the taste signal.
// targetType: what to get back (urn:entity:place / movie / artist ...).
async function insights(targetType, { entityIds = [], tags = [], locationQuery, extra = {} } = {}) {
  const params = {
    'filter.type': targetType,
    'feature.explainability': 'true',
    take: 10,
    ...extra,
  };
  if (entityIds.length) params['signal.interests.entities'] = entityIds.join(',');
  if (tags.length) params['filter.tags'] = tags.join(',');
  if (locationQuery) params['filter.location.query'] = locationQuery;
  const data = await qlooGet('/v2/insights', params);
  return normalizeInsights(data);
}

function normalizeEntities(data) {
  const list = data.results || data.entities || data.data || [];
  return list.map((e) => ({
    id: e.entity_id || e.id,
    name: e.name,
    type: e.type || e.subtype,
    tags: (e.tags || []).map((t) => t.name).slice(0, 6),
    popularity: e.popularity,
    image: e.image && e.image.url,
    description: e.description || (e.properties && e.properties.description) || '',
  }));
}

function normalizeInsights(data) {
  const list = data.results || data.entities || data.data || [];
  return list.map((e) => ({
    id: e.entity_id || e.id,
    name: e.name,
    type: e.type || e.subtype,
    affinity: e.affinity !== undefined ? e.affinity : e.score,
    popularity: e.popularity,
    image: e.image && e.image.url,
    explain: e.explainability || e.explanation || null,
    tags: (e.tags || []).map((t) => t.name).slice(0, 6),
    address: e.properties && (e.properties.address || (e.properties.geocode && e.properties.geocode.name)),
    rating: e.properties && (e.properties.business_rating || e.properties.rating),
    priceLevel: e.properties && e.properties.price_level,
  }));
}

module.exports = { hasKey, searchEntities, insights, BASE_URL };
