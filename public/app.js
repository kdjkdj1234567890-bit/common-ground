/* Common Ground frontend (no dependencies). */
const $ = (s) => document.querySelector(s);
const membersEl = $('#members');
const traceEl = $('#trace');
const cardsEl = $('#cards');
const chipsEl = $('#chips');
const errEl = $('#err');

const state = {
  members: [
    { label: '', likes: '' },
    { label: '', likes: '' },
  ],
  session: null,
  vetoes: [],
  constraints: {},
  mode: 'sample',
  accepted: [],
  baseline: null,
  baselineCity: null,
  showBaseline: false,
};

const SAMPLE_GROUP = [
  { label: 'Mia', likes: 'Frank Ocean, Studio Ghibli, ramen', sample: true },
  { label: 'Jordan', likes: 'Christopher Nolan, Radiohead, steakhouse', sample: true },
  { label: 'Sam', likes: 'lofi, Everything Everywhere All at Once, vegan', sample: true },
];

function renderMembers() {
  membersEl.innerHTML = '';
  state.members.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'member';
    div.innerHTML = `
      <div class="row">
        <input type="text" placeholder="Name or label (stays on your device)" value="${escapeHtml(m.label)}" data-i="${i}" data-f="label" maxlength="30">${m.sample ? '<span class="sample-tag">SAMPLE</span>' : ''}
      </div>
      <div class="likes">
        <input type="text" placeholder="A few things they love - artists, films, dishes..." value="${escapeHtml(m.likes)}" data-i="${i}" data-f="likes">
      </div>`;
    membersEl.appendChild(div);
  });
  membersEl.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const i = +e.target.dataset.i;
      state.members[i][e.target.dataset.f] = e.target.value;
      state.members[i].sample = false;
      syncShareHash();
    });
  });
}

// --- Multi-device share links -----------------------------------------
// The whole group session (members, city, vetoes, accepts, constraints)
// serializes into the URL fragment. A link opened on another phone
// hydrates the same session - real multi-device input with no accounts
// and nothing stored on a server.
function encodeShareState() {
  const payload = {
    v: 1,
    members: state.members
      .filter((m) => (m.likes || '').trim() || (m.label || '').trim())
      .map((m) => ({ label: m.label || '', likes: m.likes || '' })),
    city: $('#city').value,
    vetoes: state.vetoes,
    accepted: state.accepted,
    constraints: state.constraints,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShareState(s) {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(decodeURIComponent(escape(atob(b))));
    return p && p.v === 1 ? p : null;
  } catch { return null; }
}

function syncShareHash() {
  try { history.replaceState(null, '', '#s=' + encodeShareState()); } catch { /* ignore */ }
}

function shareLink() {
  return location.origin + location.pathname + '#s=' + encodeShareState();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseMembers() {
  return state.members
    .map((m) => ({
      label: (m.label || '').trim() || 'Someone',
      likes: m.likes.split(',').map((s) => s.trim()).filter(Boolean),
    }))
    .filter((m) => m.likes.length > 0);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function renderTrace(trace) {
  traceEl.innerHTML = '';
  trace.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'trace-item';
    div.style.animationDelay = `${Math.min(i * 90, 1200)}ms`;
    div.innerHTML = `<span class="dot">&#9679;</span><span>${escapeHtml(t.text)}${t.detail ? ` <span class="detail">${escapeHtml(t.detail)}</span>` : ''}</span>`;
    traceEl.appendChild(div);
  });
}

function renderPlan(result) {
  $('#empty')?.remove();
  state.lastPlan = result;
  renderCards(result);
  if (!result.plan.length) return;
  chipsEl.hidden = false;
  // A new plan (or replan) resets the group's acceptance - the compromise
  // changed, so the question "is everyone in?" must be answered again.
  state.accepted = [];
  renderConsensus(result);
  renderBaselineToggle();
}

function renderCards(result) {
  cardsEl.innerHTML = '';
  if (!result.plan.length) {
    cardsEl.innerHTML = '<div class="empty">The agent found nothing that clears the bar. Loosen a constraint and try again.</div>';
    return;
  }
  for (const card of result.plan) {
    const el = document.createElement('article');
    el.className = 'card';
    const whyRows = card.why.map((w) => `
      <div class="why-row ${w.strongest ? 'strongest' : ''}">
        <span class="who">${escapeHtml(w.member)}</span>
        ${w.affinity === null
          ? '<span class="bar"><i style="width:0%"></i></span><span class="pct">no data</span>'
          : `<span class="bar"><i style="width:${Math.round(w.affinity * 100)}%"></i></span><span class="pct">${Math.round(w.affinity * 100)}%</span>`}
        <span class="reason">${escapeHtml(w.reason)}</span>
      </div>`).join('');
    const evidenceLine = (card.evidence && card.evidence.length)
      ? `<div class="evidence">${card.evidence.map(escapeHtml).join(' · ')}</div>` : '';
    const overlapLine = card.lowOverlap
      ? '<div class="note">Honest caveat: overlap across this group is weak - this is the best available compromise, not a pick everyone loves.</div>' : '';
    el.innerHTML = `
      <div class="kind">${escapeHtml(card.label)}</div>
      <h3 class="display">${escapeHtml(card.name)}</h3>
      ${card.note ? `<div class="note">${escapeHtml(card.note)}</div>` : ''}
      <div class="score-line">Compromise score (maximin): ${(card.score * 100).toFixed(0)}% - picked so the least-excited person still wins; members with no Qloo signal count at a cautious 50% prior, never ignored${card.groupOnly ? ' - group signal only, no per-member evidence' : ''}${typeof card.coverage === 'number' ? ` - evidence for ${Math.round(card.coverage * 100)}% of members` : ''}${card.sample ? ' - SAMPLE' : ''}</div>
      ${overlapLine}
      ${evidenceLine}
      <div class="why">${whyRows}</div>
      ${baselineLine(card)}
      <div class="actions">
        <button class="ghost" data-veto="${escapeHtml(card.id)}">veto this pick</button>
      </div>`;
    cardsEl.appendChild(el);
  }
  cardsEl.querySelectorAll('[data-veto]').forEach((b) => {
    b.addEventListener('click', () => {
      state.vetoes.push(b.dataset.veto);
      syncShareHash();
      replan(`vetoed one pick`);
    });
  });
}

// --- Popularity-only baseline (the honest control group) -------------
function baselineLine(card) {
  if (!state.showBaseline || !state.baseline) return '';
  const b = state.baseline.find((x) => x.domain === card.domain);
  if (!b) return '';
  const same = b.name.trim().toLowerCase() === card.name.trim().toLowerCase();
  const verdict = same
    ? 'Same pick - popularity alone would have landed here.'
    : 'Not the group pick - Qloo\'s taste graph changed this outcome.';
  return `<div class="baseline-line">Generic popularity-only pick: <strong>${escapeHtml(b.name)}</strong> - ${verdict}</div>`;
}

function renderBaselineToggle() {
  const zone = $('#baselineZone');
  if (!zone) return;
  zone.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'ghost';
  btn.id = 'baselineBtn';
  btn.textContent = state.showBaseline
    ? 'hide the generic-app comparison'
    : 'what would a generic app pick? (popularity-only, no taste signal)';
  btn.addEventListener('click', async () => {
    state.showBaseline = !state.showBaseline;
    const city = $('#city').value;
    if (state.showBaseline && (!state.baseline || state.baselineCity !== city)) {
      btn.textContent = 'asking Qloo for the popularity-only control group...';
      btn.disabled = true;
      try {
        const res = await api('/api/baseline', { city });
        state.baseline = res.baseline;
        state.baselineCity = city;
      } catch (e) {
        errEl.textContent = e.message;
      }
      btn.disabled = false;
    }
    // re-render cards with the comparison lines
    if (state.lastPlan) renderCards(state.lastPlan);
    renderBaselineToggle();
  });
  zone.appendChild(btn);
}

// --- Consensus closure -------------------------------------------------
function renderConsensus(result) {
  const box = $('#consensus');
  if (!box || !result || !result.session) return;
  const members = result.session.members.map((m) => m.label);
  const allIn = members.length > 0 && members.every((m) => state.accepted.includes(m));
  if (allIn) {
    const picks = result.plan.map((c) => `${c.label}: ${c.name}`).join(' + ');
    box.innerHTML = `<div class="agreed-banner">Deadlock broken - ${members.map(escapeHtml).join(', ')} all agreed.<br><strong>${escapeHtml(picks)}</strong><br><span class="agreed-sub">Consensus reached after ${state.vetoes.length} veto${state.vetoes.length === 1 ? '' : 'es'}. This is the group's decision, recorded from their own accept votes.</span></div>`;
    return;
  }
  box.innerHTML = `<div class="consensus-box"><div class="consensus-q">Is everyone in? Each person answers for themselves:</div><div class="accept-row" id="acceptRow"></div></div>`;
  const row = box.querySelector('#acceptRow');
  members.forEach((m) => {
    const b = document.createElement('button');
    const isIn = state.accepted.includes(m);
    b.className = 'accept-chip' + (isIn ? ' in' : '');
    b.textContent = isIn ? `${m} is in` : `${m}?`;
    b.addEventListener('click', () => {
      if (state.accepted.includes(m)) state.accepted = state.accepted.filter((x) => x !== m);
      else state.accepted.push(m);
      syncShareHash();
      renderConsensus(state.lastPlan);
    });
    row.appendChild(b);
  });
}

async function run() {
  errEl.textContent = '';
  const members = parseMembers();
  if (members.length < 2) {
    errEl.textContent = 'Add at least two people with at least one like each.';
    return;
  }
  $('#go').disabled = true;
  $('#go').textContent = 'The agent is thinking...';
  traceEl.innerHTML = '';
  try {
    const result = await api('/api/plan', {
      members,
      city: $('#city').value,
      constraints: state.constraints,
    });
    state.session = result.session;
    state.mode = result.mode;
    syncShareHash();
    setModeBadge(result.mode, result.note);
    renderTrace(result.trace);
    renderPlan(result);
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    $('#go').disabled = false;
    $('#go').textContent = 'Find common ground';
  }
}

async function replan(why) {
  if (!state.session) return;
  traceEl.innerHTML = '';
  try {
    const result = await api('/api/replan', {
      session: state.session,
      constraints: { ...state.constraints, vetoes: state.vetoes },
      reaction: why,
    });
    renderTrace(result.trace);
    renderPlan(result);
  } catch (e) {
    errEl.textContent = e.message;
  }
}

function setModeBadge(mode, note) {
  const badge = $('#modeBadge');
  const banner = $('#sampleBanner');
  if (mode === 'live') {
    badge.textContent = 'LIVE Qloo data';
    badge.className = 'badge live';
    banner.hidden = true;
  } else {
    badge.textContent = 'SAMPLE DATA mode';
    badge.className = 'badge sample';
    banner.textContent = note || 'Sample mode: all entities and affinities are invented for demonstration.';
    banner.hidden = false;
  }
}

async function init() {
  const shared = location.hash.startsWith('#s=') ? decodeShareState(location.hash.slice(3)) : null;
  if (shared) {
    if (Array.isArray(shared.members) && shared.members.length) {
      state.members = shared.members.slice(0, 6).map((m) => ({
        label: String(m.label || ''), likes: String(m.likes || ''),
      }));
    }
    if (shared.city && [...$('#city').options].some((o) => o.value === shared.city || o.text === shared.city)) {
      $('#city').value = shared.city;
    }
    state.vetoes = Array.isArray(shared.vetoes) ? shared.vetoes : [];
    state.accepted = Array.isArray(shared.accepted) ? shared.accepted : [];
    state.constraints = shared.constraints && typeof shared.constraints === 'object' ? shared.constraints : {};
    const note = $('#shareNote');
    if (note) {
      note.textContent = 'Group session loaded from a shared link - add or edit your own likes, then pass the link on. Nothing is stored on a server; the session travels in the link.';
      note.hidden = false;
    }
  }
  renderMembers();
  const shareBtn = $('#shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      syncShareHash();
      const link = shareLink();
      try {
        await navigator.clipboard.writeText(link);
        shareBtn.textContent = 'link copied - send it to the group';
      } catch {
        window.prompt('Copy this link and send it to the group:', link);
      }
      setTimeout(() => { shareBtn.textContent = 'invite the group - copy a share link'; }, 2600);
    });
  }
  $('#city').addEventListener('change', syncShareHash);
  $('#addMember').addEventListener('click', () => {
    if (state.members.length < 6) { state.members.push({ label: '', likes: '' }); renderMembers(); }
  });
  $('#loadSample').addEventListener('click', () => {
    state.members = SAMPLE_GROUP.map((m) => ({ ...m }));
    renderMembers();
  });
  $('#go').addEventListener('click', run);
  chipsEl.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const c = chip.dataset.constraint;
      if (c === 'cheaper') {
        state.constraints.maxPrice = 2;
        chip.classList.add('on');
      }
      if (c === 'different') {
        state.plan?.forEach?.(() => {});
        // veto everything currently shown and replan
        document.querySelectorAll('[data-veto]').forEach((b) => state.vetoes.push(b.dataset.veto));
      }
      replan(chip.textContent);
    });
  });
  try {
    const res = await fetch('/api/health');
    const h = await res.json();
    state.mode = h.mode;
    setModeBadge(h.mode, h.note);
  } catch {
    setModeBadge('sample', 'Could not reach the API - showing sample mode.');
  }
}
init();
