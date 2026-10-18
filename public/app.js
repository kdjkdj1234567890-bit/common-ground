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
    });
  });
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
  cardsEl.innerHTML = '';
  $('#empty')?.remove();
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
      <div class="score-line">Compromise score (maximin): ${(card.score * 100).toFixed(0)}% - picked so the least-excited person still wins${card.groupOnly ? ' - group signal only, no per-member evidence' : ''}${typeof card.coverage === 'number' ? ` - evidence for ${Math.round(card.coverage * 100)}% of members` : ''}${card.sample ? ' - SAMPLE' : ''}</div>
      ${overlapLine}
      ${evidenceLine}
      <div class="why">${whyRows}</div>
      <div class="actions">
        <button class="ghost" data-veto="${escapeHtml(card.id)}">veto this pick</button>
      </div>`;
    cardsEl.appendChild(el);
  }
  cardsEl.querySelectorAll('[data-veto]').forEach((b) => {
    b.addEventListener('click', () => {
      state.vetoes.push(b.dataset.veto);
      replan(`vetoed one pick`);
    });
  });
  chipsEl.hidden = false;
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
  renderMembers();
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
