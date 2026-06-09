/**
 * app.js — WormLab Course Edition.
 *
 * One app, two roles (chosen at the login gate):
 *   • STUDENT  — join a class with a code + group name + member names, then track
 *                plates (only the unlocked strains) and count worms in photos.
 *                Their data syncs to the cloud under their group.
 *   • TEACHER  — passcode-gated. Sees every group's plates/data live, and can open
 *                the GROWTH SIMULATION for any plate (students do not get the sim).
 */
import { STRAINS, getStages, getCurrentStage, getTotalHours, adultLifespanHours, fmtHours }
  from './LifeCycle.js?v=9';
import { strainOptions, isUnlockedForStudent } from './strains.js?v=9';
import { initCloud, cloud, cloudMode, groupIdFromName, normalizeClassCode } from './cloud.js?v=9';
import { TEACHER_PASSCODE, FIREBASE_READY } from '../firebase-config.js?v=9';
import { showToast, showConfirm } from './Toast.js?v=9';
import { PlateCanvas } from './PlateCanvas.js?v=9';
import { WormCounter } from './WormCounter.js?v=9';
import { WormLearner } from './WormLearner.js?v=9';
import { WormLabeler, LABEL_CATS } from './WormLabeler.js?v=9';
import {
  isMaleStrain, isCourseGeneticStrain, strainGeno, selfProgeny, crossProgeny,
  phenoDist, ratioOf, conditionOnPheno, phenoOfLoci, genoText, dpyName, LOCI,
} from './genetics.js?v=9';

const $   = id => document.getElementById(id);
const app = $('app');
const SESSION_KEY = 'wlc_session_v1';
const WORM_CATS = ['l1', 'l2', 'l3', 'l4', 'adult'];
const MAX_GROUP = 6;
const STAGE_ORDER = ['egg', 'l1', 'l2', 'l3', 'l4', 'young_adult', 'adult'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// 15 worm/critter CHARACTER avatars students pick when making their account.
const ICONS = [
  { emoji: '🪱', name: 'Wiggles' },
  { emoji: '🐛', name: 'Squirms' },
  { emoji: '🐍', name: 'Slinky' },
  { emoji: '🐉', name: 'The Wyrm' },
  { emoji: '🐲', name: 'Drake' },
  { emoji: '🐌', name: 'Turbo' },
  { emoji: '🦠', name: 'Germy' },
  { emoji: '👾', name: 'Lil Critter' },
  { emoji: '👽', name: 'Squiggy' },
  { emoji: '🤖', name: 'Wormbot' },
  { emoji: '🐙', name: 'Inky' },
  { emoji: '🦎', name: 'Gecko' },
  { emoji: '🐢', name: 'Shellby' },
  { emoji: '🦖', name: 'Rexy' },
  { emoji: '🐸', name: 'Hops' },
];
let gateIcon = ICONS[0].emoji;
function iconFor(name) { return state.config?.icons?.[normName(name)] || '🪱'; }
function withIcon(name) { return `${iconFor(name)} ${esc(name)}`; }

const state = {
  role: null, classCode: null,
  group: { id: null, name: '', members: [] },
  plates: [],
  bin: [],
  view: 'plate',
  teacherGroups: [],
  teacherClass: null,
  unsub: null,
  lastBy: '',
  newWorms: [],   // worm types being assembled in the "new plate" builder
  binFilter: 'all',
};

// ── Boot ────────────────────────────────────────────────────────────────────
(async function boot() {
  app.innerHTML = `<div class="center-msg">Connecting…</div>`;
  await initCloud();
  if (cloudMode() === 'local') {
    setTimeout(() => showToast(
      FIREBASE_READY ? 'Cloud unavailable — running on this device only.'
                     : 'Cloud sync not set up yet — running on this device only. See SETUP.md to enable teacher↔student sync.',
      'warn', 6000), 400);
  }
  const saved = loadSession();
  if (saved?.role === 'student' && saved.classCode && saved.name) {
    startStudent(saved.classCode, saved.name, saved.icon || '🪱');
  } else if (saved?.role === 'teacher' && saved.classCode) {
    enterTeacher(saved.classCode);
  } else {
    renderGate();
  }
})();

function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function saveSession(o) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(o)); } catch {} }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function signOut() {
  if (state.unsub) { try { state.unsub(); } catch {} state.unsub = null; }
  clearSession();
  Object.assign(state, { role: null, classCode: null, group: { id: null, name: '', members: [] }, plates: [], bin: [], teacherGroups: [], classGroups: [], profile: null, config: null, _screen: null });
  renderGate();
}

// ── Login gate ────────────────────────────────────────────────────────────────
function renderGate() {
  app.innerHTML = `
    <div class="gate">
      <div class="gate-card">
        <div class="brand">🧫 <span>WormLab</span></div>
        <div class="brand-sub">Genetics Lab Course</div>

        <div class="seg" id="roleSeg">
          <button class="seg-btn active" data-r="student">👩‍🎓 Student</button>
          <button class="seg-btn" data-r="teacher">👨‍🏫 Teacher</button>
        </div>

        <div id="studentForm">
          <div class="card-h" style="margin-bottom:6px">🧫 Make your account</div>
          <label class="fld">Class code
            <input id="gClass" placeholder="e.g. BIO101" autocomplete="off" maxlength="24"></label>
          <label class="fld">Your name <span class="muted">(your profile)</span>
            <input id="gName" placeholder="e.g. Maria Lopez" autocomplete="off" maxlength="40"></label>
          <label class="fld">Pick your worm icon</label>
          <div class="icongrid" id="iconGrid">${ICONS.map(ic =>
            `<button class="iconbtn${ic.emoji === gateIcon ? ' on' : ''}" data-icon="${ic.emoji}" title="${esc(ic.name)}">${ic.emoji}</button>`).join('')}</div>
          <button class="btn-primary" id="btnJoin">Continue →</button>
        </div>

        <div id="teacherForm" class="hidden">
          <label class="fld">Class code
            <input id="tClass" placeholder="e.g. BIO101" autocomplete="off" maxlength="24"></label>
          <label class="fld">Teacher passcode
            <input id="tPass" type="password" placeholder="passcode" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
          <button class="btn-primary" id="btnTeach">Open dashboard →</button>
        </div>

        <div class="gate-foot">${cloudMode() === 'cloud'
          ? '☁ Cloud sync on' : '⚠ Local-only (no cross-device sync yet)'}</div>
        <div class="gate-foot"><a class="lnk" href="../index.html?choose=1">← Full WormTrace app</a></div>
      </div>
    </div>`;

  $('roleSeg').querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
    $('roleSeg').querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('studentForm').classList.toggle('hidden', b.dataset.r !== 'student');
    $('teacherForm').classList.toggle('hidden', b.dataset.r !== 'teacher');
  });

  $('iconGrid')?.querySelectorAll('.iconbtn').forEach(b => b.onclick = () => {
    gateIcon = b.dataset.icon;
    $('iconGrid').querySelectorAll('.iconbtn').forEach(x => x.classList.toggle('on', x === b));
  });

  $('btnJoin').onclick = () => {
    const classCode = normalizeClassCode($('gClass').value);
    const name = $('gName').value.trim();
    if (!classCode) return showToast('Enter a class code (ask your instructor).', 'warn');
    if (!name) return showToast('Enter your name.', 'warn');
    startStudent(classCode, name, gateIcon);
  };

  $('btnTeach').onclick = () => {
    const classCode = normalizeClassCode($('tClass').value);
    if (!classCode) return showToast('Enter the class code.', 'warn');
    if ($('tPass').value.trim().toLowerCase() !== TEACHER_PASSCODE.trim().toLowerCase())
      return showToast('Incorrect passcode.', 'error');
    enterTeacher(classCode);
  };
}

// ── STUDENT ─────────────────────────────────────────────────────────────────
// A student has a PROFILE (their name). Their group = whichever group's members[]
// contains their name. Joining is either self-serve or teacher-assigned (class config).
const CONFIG_ID = '__config__';
const normName = s => String(s || '').trim().toLowerCase();
function defaultConfig() { return { groupSize: MAX_GROUP, joinMode: 'self', roster: [] }; }
function groupSizeLimit() { return state.config?.groupSize || MAX_GROUP; }

async function startStudent(classCode, name, icon = '🪱') {
  state.role = 'student'; state.classCode = classCode;
  state.profile = { name, icon }; state._screen = null;
  saveSession({ role: 'student', classCode, name, icon });
  app.innerHTML = `<div class="center-msg">Joining ${esc(classCode)}…</div>`;

  if (state.unsub) state.unsub();
  state.unsub = cloud().subscribeClass(classCode, groups => {
    state.config = groups.find(g => g.id === CONFIG_ID) || defaultConfig();
    state.classGroups = groups.filter(g => g.id !== CONFIG_ID);
    if (state.role === 'student') routeStudent();
  });

  // Register myself (name + icon) in the class roster so the teacher can see/assign me.
  ensureInRoster(name, icon).catch(() => {});
}

async function ensureInRoster(name, icon = '🪱') {
  const cfg = (await cloud().getGroup(state.classCode, CONFIG_ID).catch(() => null)) || defaultConfig();
  const roster = cfg.roster || [];
  const icons = { ...(cfg.icons || {}) };
  const known = roster.some(r => normName(r) === normName(name));
  if (known && icons[normName(name)] === icon) return;     // nothing to update
  icons[normName(name)] = icon;
  await cloud().writeGroup(state.classCode, CONFIG_ID, {
    ...cfg, isConfig: true, groupSize: cfg.groupSize || MAX_GROUP, joinMode: cfg.joinMode || 'self',
    roster: known ? roster : [...roster, name], icons,
  });
}

function myGroup() {
  const me = normName(state.profile?.name);
  return (state.classGroups || []).find(g => (g.members || []).some(m => normName(m) === me));
}

function routeStudent() {
  const g = myGroup();
  if (g) {
    state.group = { id: g.id, name: g.name, members: g.members || [], racks: g.racks || [] };
    state.plates = g.plates || []; state.bin = g.bin || [];
    if (state._screen !== 'group') { state._screen = 'group'; renderStudent(); }
    else refreshStudentBody();
  } else {
    state.group = null;
    const mode = state.config?.joinMode || 'self';
    state._screen = mode === 'assigned' ? 'wait' : 'choose';
    renderStudentChooser();
  }
}

function renderStudentChooser() {
  const mode = state.config?.joinMode || 'self';
  const size = groupSizeLimit();
  const groups = state.classGroups || [];
  if (mode === 'assigned') {
    app.innerHTML = `
      <header class="top"><div class="top-l"><b>🧫 WormLab</b><span class="chip">${esc(state.classCode)}</span></div>
        <button class="lnk" id="btnOut">Sign out</button></header>
      <main class="body"><div class="card">
        <div class="card-h">⏳ Waiting for your teacher</div>
        <div class="sm">Hi <b>${esc(state.profile.name)}</b> — your instructor assigns groups for this class. You'll drop into your group automatically as soon as they add you.</div>
        <div class="muted sm" style="margin-top:8px">${groups.length} group${groups.length !== 1 ? 's' : ''} so far. This updates live.</div>
      </div></main>`;
    $('btnOut').onclick = signOut;
    return;
  }
  // self-serve: pick or create a group
  const rows = groups.map(g => {
    const n = (g.members || []).length, full = n >= size;
    return `<div class="binrow"><div><b>${esc(g.name)}</b><div class="muted sm">${n}/${size} member${n !== 1 ? 's' : ''}${n ? ' · ' + g.members.map(withIcon).join(', ') : ''}</div></div>
      <div class="binrow-act"><button class="btn-secondary" data-join="${g.id}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Join'}</button></div></div>`;
  }).join('');
  app.innerHTML = `
    <header class="top"><div class="top-l"><b>🧫 WormLab</b><span class="chip">${esc(state.classCode)}</span></div>
      <button class="lnk" id="btnOut">Sign out</button></header>
    <main class="body">
      <div class="card"><div class="card-h">Pick your group</div>
        <div class="muted sm">Hi <b>${esc(state.profile.name)}</b> — join a group below, or start a new one. Max ${size} per group.</div>
        ${groups.length ? rows : '<div class="muted sm" style="margin-top:8px">No groups yet — start the first one.</div>'}
      </div>
      <div class="card"><div class="card-h">➕ Start a new group</div>
        <label class="fld">Group / bench name <input id="newGroupName" placeholder="e.g. Bench 3 — The Dauers" maxlength="60"></label>
        <button class="btn-primary" id="btnNewGroup">Create & join</button>
      </div></main>`;
  $('btnOut').onclick = signOut;
  app.querySelectorAll('[data-join]').forEach(b => b.onclick = () => joinGroupById(b.dataset.join));
  $('btnNewGroup').onclick = () => {
    const name = $('newGroupName').value.trim();
    if (!name) return showToast('Name your group.', 'warn');
    createAndJoinGroup(name);
  };
}

async function joinGroupById(groupId) {
  const g = await cloud().getGroup(state.classCode, groupId).catch(() => null);
  const members = g?.members || [];
  if (members.length >= groupSizeLimit() && !members.some(m => normName(m) === normName(state.profile.name)))
    return showToast(`That group is full (max ${groupSizeLimit()}).`, 'warn');
  const next = members.some(m => normName(m) === normName(state.profile.name)) ? members : [...members, state.profile.name];
  await cloud().writeGroup(state.classCode, groupId, { ...(g || {}), members: next });
  // routeStudent fires via the class subscription
}

async function createAndJoinGroup(name) {
  const id = groupIdFromName(name) + '-' + uid().slice(0, 4);
  await cloud().writeGroup(state.classCode, id, {
    name, members: [state.profile.name], racks: [], plates: [], bin: [],
  });
}

async function persistGroup() {
  await cloud().writeGroup(state.classCode, state.group.id, {
    name: state.group.name, members: state.group.members, racks: state.group.racks || [],
    plates: state.plates, bin: state.bin,
  }).catch(err => showToast('Save failed: ' + err.message, 'error'));
}

function renderStudent() {
  app.innerHTML = `
    <header class="top">
      <div class="top-l"><b>🧫 WormLab</b><span class="chip">${esc(state.classCode)}</span>
        <span class="chip alt">${esc(state.group.name)}</span></div>
      <div class="top-r"><button class="lnk" id="btnLife">🔄 Life cycle</button><button class="lnk" id="btnCross">🧬 Crosses</button><button class="lnk" id="btnOut">Sign out</button></div>
    </header>
    <nav class="tabs">
      <button class="tab active" data-v="plate">🧫 Plate Tracker</button>
      <button class="tab" data-v="count">🔢 Worm Counter</button>
    </nav>
    <main id="body" class="body"></main>`;
  $('btnOut').onclick = signOut;
  $('btnCross').onclick = openCrossGuide;
  $('btnLife').onclick = openLifeCycle;
  app.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    app.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); state.view = t.dataset.v; refreshStudentBody();
  });
  refreshStudentBody();
}

function refreshStudentBody() {
  if (state.role !== 'student') return;
  if (state.view === 'plate') renderPlateTab();
  else renderCountTab();
}

// ── Worm helpers (a plate can hold MANY worm types, each with a genotype) ──────
const PHENO_COLOR = ph => ({ 'wild-type': '#00d4aa', 'Dpy-11': '#f59e0b', 'Dpy-13': '#fbbf24' }[ph] || '#a855f7');
// phenotype "type" keys used to break the simulation down by strain/type
const TYPE_LABEL = { wild: 'N2', d11: 'dpy-11', d13: 'dpy-13', dbl: 'dpy-11;dpy-13' };
const TYPE_COLOR = { wild: '#00d4aa', d11: '#f59e0b', d13: '#fbbf24', dbl: '#a855f7' };
function phenoKeyOf(loci) { const a = loci['dpy-11'].mm > 0.5, b = loci['dpy-13'].mm > 0.5; return a && b ? 'dbl' : a ? 'd11' : b ? 'd13' : 'wild'; }
function plateWorms(p) {
  if (Array.isArray(p.worms) && p.worms.length) return p.worms;
  if (p.strainId) return [{ id: 'legacy', strainId: p.strainId, strainLabel: p.strainLabel || STRAINS[p.strainId]?.label || p.strainId, stageId: 'young_adult', count: 1 }];
  return [];
}
function entryGeno(e) { return e.geno || strainGeno(e.strainId || 'N2').loci; }
function entrySex(e)  { return e.sex || (e.strainId ? strainGeno(e.strainId).sex : 'hermaphrodite'); }
function entryPheno(e) { return phenoOfLoci(entryGeno(e)); }
function entryDpy(e)  { const g = entryGeno(e); return LOCI.some(L => g[L].mm > 0.5) || isDpyId(e.strainId || ''); }
function entryColor(e) { return e.strainId ? (STRAINS[e.strainId]?.color || '#94a3b8') : PHENO_COLOR(entryPheno(e)); }
function entryShort(e) {
  if (e.strainId) return shortStrain(e.strainId);
  return (e.label || entryPheno(e)) + (entrySex(e) === 'male' ? ' ♂' : ' ♀');
}
function primaryStrainId(p) { const w = plateWorms(p).filter(x => x.strainId); return w.length ? [...w].sort((a, b) => b.count - a.count)[0].strainId : 'N2'; }
const isMaleId = id => String(id).includes('male');
const isDpyId  = id => String(id).startsWith('dpy-');
function shortStrain(id) {
  const s = STRAINS[id]; if (!s) return id;
  const sex = s.sex === 'male' ? ' ♂' : s.sex === 'hermaphrodite' ? ' ♀' : '';
  return id.replace('-male', '') + sex;
}
function genLabel(p) { const g = p.genIndex || 0; return g === 0 ? 'P0' : 'F' + g; }

function wormPickerHTML(prefix) {
  const opts = strainOptions(false).map(o =>
    `<option value="${o.id}"${o.locked ? ' disabled' : ''}>${esc(shortStrain(o.id))}${o.locked ? ' 🔒' : ''}</option>`).join('');
  const stages = [['egg', '🥚 Egg'], ['l1', '🌱 L1'], ['l2', '🐣 L2'], ['l3', '🐛 L3'], ['l4', '🪲 L4'], ['young_adult', '🪱 Young adult'], ['adult', '🧬 Adult']]
    .map(([v, l]) => `<option value="${v}"${v === 'young_adult' ? ' selected' : ''}>${l}</option>`).join('');
  return `<div class="wpick">
    <select id="${prefix}StrainSel" class="sel">${opts}</select>
    <select id="${prefix}StageSel" class="sel">${stages}</select>
    <input id="${prefix}Count" class="sel wp-count" type="number" min="1" value="5">
    <button class="btn-secondary wp-add" id="${prefix}AddWorm">＋ Add</button>
  </div>`;
}
function wireWormPicker(prefix, onAdd) {
  $(`${prefix}AddWorm`).onclick = () => {
    const strainId = $(`${prefix}StrainSel`).value;
    if (!isUnlockedForStudent(strainId)) return showToast('That strain is locked for students.', 'warn');
    const stageId = $(`${prefix}StageSel`).value;
    const count = Math.max(1, parseInt($(`${prefix}Count`).value) || 1);
    const g = strainGeno(strainId);
    onAdd({ id: uid(), strainId, strainLabel: STRAINS[strainId]?.label || strainId, stageId, count, sex: g.sex, geno: g.loci });
  };
}
function wormRowHTML(w, rmId) {
  return `<div class="wrow"><span class="sw" style="background:${entryColor(w)}"></span>
    <span class="wrow-t">${esc(entryShort(w))} · ${stageLabel(w.stageId)} · ×${w.count}</span>
    <button class="x" id="${rmId}">✕</button></div>`;
}
function wormMixHTML(p) {
  const w = plateWorms(p);
  if (!w.length) return '<div class="muted sm">No worms added yet — tap ＋ Worms.</div>';
  const total = w.reduce((s, x) => s + x.count, 0);
  return `<div class="wmix">${w.map(x =>
    `<span class="wtag"><span class="sw" style="background:${entryColor(x)}"></span>${esc(entryShort(x))} ${stageLabel(x.stageId)} ×${x.count}</span>`
  ).join('')}<span class="wtag total">Σ ${total} worms · ${w.length} type${w.length !== 1 ? 's' : ''}</span></div>`;
}

// ── Predicted offspring (genotype-aware, multi-generation) ────────────────────
function parentsOf(p) {
  return plateWorms(p).filter(x => x.count > 0).map(e => ({ loci: entryGeno(e), sex: entrySex(e), count: e.count }));
}
function progenyOf(p) { const ps = parentsOf(p); return { cross: crossProgeny(ps), self: selfProgeny(ps) }; }

function offspringPanelHTML(p, canPick = false) {
  const { cross, self } = progenyOf(p);
  if (!cross && !self) return '';
  const nextGen = 'F' + ((p.genIndex || 0) + 1);
  const block = (title, r, note) => {
    if (!r) return '';
    const bars = r.phenos.map(c =>
      `<div class="bar-row"><span class="bar-lbl">${esc(c.label)}</span>
        <div class="bar"><div style="width:${Math.round(c.pct * 100)}%;background:#00d4aa"></div></div>
        <span class="bar-n">${Math.round(c.pct * 100)}%</span></div>`).join('');
    const sexNote = r.maleFrac ? `, ~${Math.round(r.maleFrac * 100)}% male` : ', ~0% male (all ♀)';
    return `<div class="sm" style="margin-top:6px"><b>${title} → ${nextGen}</b> — ratio ${ratioOf(r.phenos)}${sexNote}</div>
      <div class="sim-bars">${bars}</div>${note ? `<div class="muted sm">${note}</div>` : ''}`;
  };
  return `<details class="cross"><summary>🧬 Predicted offspring (${genLabel(p)} → ${nextGen})</summary>
    ${cross ? block('Cross-progeny (♂ × ♀)', cross, 'Males in the progeny = the cross worked (self-progeny are ~all ♀).') : ''}
    ${block(cross ? 'Self-progeny (♀ self)' : 'Self-progeny (hermaphrodite selfs)', self, '')}
    ${canPick ? `<div class="sm" style="margin-top:8px"><button class="btn-secondary" data-pick="${p.id}">🔬 Pick worms → next plate (${nextGen})</button></div>` : ''}
  </details>`;
}

// ── Student · Plate Tracker ───────────────────────────────────────────────────
function renderPlateTab() {
  const body = $('body'); if (!body) return;
  const memberLine = `<div class="muted sm">You: <b>${esc(state.profile?.icon || '🪱')} ${esc(state.profile?.name || '')}</b> · 👥 ${esc(state.group.name)} (${state.group.members.length}/${groupSizeLimit()}): ${state.group.members.map(withIcon).join(', ')}</div>`;

  body.innerHTML = `
    ${memberLine}
    <div class="row"><button class="btn-secondary binbtn" id="btnBin">☣ Biohazard Bin${state.bin.length ? ` (${state.bin.length})` : ''}</button></div>
    <div id="binBar"></div>
    <div class="card add-card">
      <div class="card-h">➕ New plate</div>
      <label class="fld">Plate label <input id="npName" placeholder="e.g. Plate A — cross P0"></label>
      <div class="row">
        <label class="fld half">Temp (°C) <select id="npTemp" class="sel"><option>15</option><option selected>20</option><option>25</option></select></label>
        <label class="fld half">Inoculate <select id="npInoc" class="sel"><option value="now" selected>Now (start timer)</option><option value="later">Not yet</option></select></label>
      </div>
      <div class="card-sub">🐛 Worms on this plate <span class="muted sm">(add as many types & numbers as you want)</span></div>
      ${wormPickerHTML('np')}
      <div id="npWormList" class="wlist"></div>
      <div class="row">
        <button class="btn-secondary" id="btnNpInfo">ℹ Strain info</button>
        <button class="btn-primary" id="btnAddPlate">Create plate</button>
      </div>
    </div>
    <div id="plateList"></div>`;

  $('editMembers')?.addEventListener('click', editMembers);
  $('btnBin').onclick = openBin;
  $('btnNpInfo').onclick = () => showStrainInfo($('npStrainSel').value);
  wireWormPicker('np', w => { state.newWorms.push(w); renderNewWorms(); });
  $('btnAddPlate').onclick = createPlate;
  renderNewWorms();
  renderBinBar();
  renderPlateList();
}

function renderBinBar() {
  const el = $('binBar'); if (!el) return;
  const racks = state.group.racks || [];
  const counts = {}; for (const p of state.plates) { const k = p.binId || '__unfiled__'; counts[k] = (counts[k] || 0) + 1; }
  const chip = (key, label, n) => `<button class="binchip${state.binFilter === key ? ' on' : ''}" data-bf="${key}">${esc(label)}${n != null ? ` (${n})` : ''}</button>`;
  el.innerHTML = `<div class="muted sm" style="margin:2px 0 4px">📦 Bins — file your plates</div>
    <div class="binbar">${chip('all', 'All', state.plates.length)}${chip('__unfiled__', 'Unfiled', counts['__unfiled__'] || 0)}
    ${racks.map(r => chip(r.id, r.name, counts[r.id] || 0)).join('')}
    <button class="binchip add" id="addBin">＋ Bin</button>
    ${racks.length ? '<button class="binchip" id="editBins">✎</button>' : ''}</div>`;
  el.querySelectorAll('[data-bf]').forEach(b => b.onclick = () => { state.binFilter = b.dataset.bf; renderBinBar(); renderPlateList(); });
  $('addBin').onclick = () => {
    const name = prompt('New bin name (e.g. Rack A, Crosses, Week 2):'); if (!name || !name.trim()) return;
    state.group.racks = [...racks, { id: uid(), name: name.trim() }]; persistGroup(); renderBinBar();
  };
  $('editBins')?.addEventListener('click', () => {
    const r = prompt('Delete which bin? Type its exact name (plates inside become Unfiled):');
    if (!r) return; const rk = racks.find(x => x.name.toLowerCase() === r.trim().toLowerCase());
    if (!rk) return showToast('No bin by that name.', 'warn');
    state.group.racks = racks.filter(x => x.id !== rk.id);
    state.plates.forEach(p => { if (p.binId === rk.id) p.binId = null; });
    if (state.binFilter === rk.id) state.binFilter = 'all';
    persistGroup(); renderBinBar(); renderPlateList();
  });
}

function renderNewWorms() {
  const el = $('npWormList'); if (!el) return;
  el.innerHTML = state.newWorms.length
    ? state.newWorms.map((w, i) => wormRowHTML(w, `npRm${i}`)).join('')
    : '<div class="muted sm">No worms yet — pick a strain, stage & number, then ＋ Add.</div>';
  state.newWorms.forEach((w, i) => { const b = $(`npRm${i}`); if (b) b.onclick = () => { state.newWorms.splice(i, 1); renderNewWorms(); }; });
}

function createPlate() {
  if (!state.newWorms.length) return showToast('Add at least one worm type to the plate first.', 'warn');
  const name = $('npName').value.trim() || `Plate ${state.plates.length + 1}`;
  const worms = state.newWorms.map(w => ({ ...w }));
  const prim = [...worms].sort((a, b) => b.count - a.count)[0];
  const p = {
    id: uid(), name, worms, genIndex: 0,
    strainId: prim.strainId, strainLabel: STRAINS[prim.strainId]?.label || prim.strainId,
    tempC: +$('npTemp').value, inoculatedAt: $('npInoc').value === 'now' ? Date.now() : null,
    createdAt: Date.now(), note: '', counts: {}, observations: [],
  };
  state.plates.unshift(p); state.newWorms = []; persistGroup(); renderPlateTab();
  showToast(`Created “${name}” with ${worms.length} worm type${worms.length !== 1 ? 's' : ''}.`, 'success');
}

function renderPlateList() {
  const el = $('plateList'); if (!el) return;
  let list = state.plates;
  if (state.binFilter && state.binFilter !== 'all')
    list = list.filter(p => (p.binId || '__unfiled__') === state.binFilter);
  if (!state.plates.length) { el.innerHTML = `<div class="empty">No plates yet. Add one above to start tracking.</div>`; return; }
  if (!list.length) { el.innerHTML = `<div class="empty">No plates in this bin yet.</div>`; return; }
  el.innerHTML = list.map(plateCardHTML).join('');
  list.forEach(p => wirePlateCard(p));
}

function binSelectHTML(p) {
  const racks = state.group.racks || [];
  if (!racks.length) return '';
  const opts = `<option value="">📦 Unfiled</option>` +
    racks.map(r => `<option value="${r.id}"${p.binId === r.id ? ' selected' : ''}>📦 ${esc(r.name)}</option>`).join('');
  return `<select class="sel binsel" data-binsel="${p.id}">${opts}</select>`;
}

function plateCardHTML(p) {
  const inoc = p.inoculatedAt ? `${fmtHours(elapsedHrs(p))} since inoculation` : `<span class="warn-t">not inoculated</span>`;
  const obs = (p.observations || []).length;
  const last = (p.observations || [])[0];
  const lastLine = last
    ? `Last log${last.by ? ' by ' + iconFor(last.by) + ' ' + esc(last.by) : ''}: ${obsSummary(last)}`
    : 'No observations logged yet';
  return `
    <div class="card plate" data-pid="${p.id}">
      <div class="plate-top">
        <div><div class="plate-name">${esc(p.name)}</div><div class="muted sm"><span class="genchip">${genLabel(p)}</span> · ${p.tempC}°C</div></div>
        <button class="x bin-x" data-bin="${p.id}" title="Discard to biohazard bin">☣</button>
      </div>
      ${wormMixHTML(p)}
      ${offspringPanelHTML(p, true)}
      <div class="muted sm">${inoc} · ${obs} observation${obs !== 1 ? 's' : ''}</div>
      <div class="sm">${esc(lastLine)}</div>
      ${p.photo ? `<img class="plate-thumb" src="${p.photo}">` : ''}
      <div class="row">
        ${p.inoculatedAt ? '' : `<button class="btn-secondary" data-inoc="${p.id}">Inoculate now</button>`}
        <button class="btn-secondary" data-view="${p.id}">👁 View plate</button>
        <button class="btn-secondary" data-addw="${p.id}">＋ Worms</button>
        <button class="btn-secondary" data-log="${p.id}">＋ Log</button>
      </div>
      ${binSelectHTML(p)}
      <div class="worm-form hidden" id="wf-${p.id}"></div>
      <div class="log-form hidden" id="lf-${p.id}"></div>
      ${obs ? `<details class="obs"><summary>${obs} observation${obs !== 1 ? 's' : ''}</summary>
        ${(p.observations).map(obsRowHTML).join('')}</details>` : ''}
    </div>`;
}

function obsRowHTML(o) {
  const when = new Date(o.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<div class="obs-row">
    <div class="sm"><b>${esc(obsSummary(o))}</b>${o.foodPct != null ? ` · food ${o.foodPct}%` : ''}</div>
    <div class="muted sm">${when}${o.by ? ' · ' + iconFor(o.by) + ' ' + esc(o.by) : ''}${o.note ? ' · ' + esc(o.note) : ''}</div>
    ${o.photo ? `<img class="obs-thumb" src="${o.photo}">` : ''}
  </div>`;
}

function wirePlateCard(p) {
  const card = app.querySelector(`.plate[data-pid="${p.id}"]`); if (!card) return;
  card.querySelector(`[data-bin="${p.id}"]`).onclick = () => discardPlate(p);
  card.querySelector(`[data-inoc="${p.id}"]`)?.addEventListener('click', () => {
    p.inoculatedAt = Date.now(); persistGroup(); renderPlateList(); showToast('Timer started.', 'success');
  });
  card.querySelector(`[data-log="${p.id}"]`).onclick = () => openLogForm(p);
  card.querySelector(`[data-view="${p.id}"]`).onclick = () => openPlateView(p);
  card.querySelector(`[data-addw="${p.id}"]`).onclick = () => openWormForm(p);
  card.querySelector(`[data-pick="${p.id}"]`)?.addEventListener('click', () => openPickModal(p));
  card.querySelector(`[data-binsel="${p.id}"]`)?.addEventListener('change', e => {
    p.binId = e.target.value || null; persistGroup(); renderBinBar(); renderPlateList();
  });
}

function openWormForm(p) {
  const wf = $(`wf-${p.id}`); if (!wf) return;
  if (!wf.classList.contains('hidden')) { wf.classList.add('hidden'); wf.innerHTML = ''; return; }
  app.querySelectorAll('.worm-form').forEach(f => { f.classList.add('hidden'); f.innerHTML = ''; });
  wf.classList.remove('hidden');
  const pre = 'wf' + p.id;
  wf.innerHTML = `<div class="card-sub">Add worms to this plate</div>${wormPickerHTML(pre)}`;
  wireWormPicker(pre, w => {
    const worms = plateWorms(p).map(x => ({ ...x }));
    const ex = worms.find(x => x.strainId === w.strainId && x.stageId === w.stageId);
    if (ex) ex.count += w.count; else worms.push(w);
    p.worms = worms;
    const prim = [...worms].sort((a, b) => b.count - a.count)[0];
    p.strainId = prim.strainId; p.strainLabel = STRAINS[prim.strainId]?.label || prim.strainId;
    persistGroup(); renderPlateList(); showToast(`Added ${w.count} ${shortStrain(w.strainId)}.`, 'success');
  });
}

// ── Biohazard bin ─────────────────────────────────────────────────────────────
async function discardPlate(p) {
  const ok = await showConfirm(
    `☣ <b>Biohazard disposal</b><br><br>Move “${esc(p.name)}” to the biohazard bin?<br><br>` +
    `⚠ Real C. elegans plates are <b>biohazard waste</b> — discard them in the biohazard ` +
    `container, never the regular trash or sink. You can Restore it from the bin if this was a mistake.`,
    'Discard ☣', 'Cancel');
  if (!ok) return;
  state.plates = state.plates.filter(x => x.id !== p.id);
  state.bin.unshift({ ...p, discardedAt: Date.now() });
  if (state.bin.length > 50) state.bin = state.bin.slice(0, 50);
  persistGroup(); renderPlateTab();
  showToast(`Moved “${p.name}” to the biohazard bin.`, 'info');
}

// ── Pick worms → next-generation plate (drives F1 → F2 → F3 …) ─────────────────
function openPickModal(p) {
  const prog = progenyOf(p);
  const sources = [];
  if (prog.cross) sources.push({ key: 'cross', label: 'Cross-progeny (♂ × ♀)', r: prog.cross });
  if (prog.self) sources.push({ key: 'self', label: 'Self-progeny (♀ selfs)', r: prog.self });
  if (!sources.length) return showToast('No progeny to pick from on this plate.', 'warn');
  const nextIdx = (p.genIndex || 0) + 1;
  let srcKey = sources[0].key;

  const ov = document.createElement('div'); ov.className = 'sim-ov'; ov.id = 'pickOv';
  document.body.appendChild(ov);
  const render = () => {
    const src = sources.find(s => s.key === srcKey);
    const phenoOpts = src.r.phenos.map(c => `<option value="${c.key}">${esc(c.label)} (${Math.round(c.pct * 100)}%)</option>`).join('');
    const sexOpts = src.r.maleFrac
      ? `<option value="hermaphrodite">♀ Hermaphrodite</option><option value="male">♂ Male</option>`
      : `<option value="hermaphrodite">♀ Hermaphrodite</option>`;
    const targetOpts = `<option value="__new__">➕ New plate (F${nextIdx})</option>` +
      state.plates.filter(x => x.id !== p.id).map(x => `<option value="${x.id}">${esc(x.name)} (${genLabel(x)})</option>`).join('');
    ov.innerHTML = `<div class="sim-card">
      <div class="sim-head"><div><b>🔬 Pick worms from ${esc(p.name)}</b>
        <div class="muted sm">${genLabel(p)} plate → picking ${'F' + nextIdx} worms</div></div>
        <button class="x" id="pkClose">✕</button></div>
      <label class="fld">Pick from <select id="pkSrc" class="sel">${sources.map(s => `<option value="${s.key}"${s.key === srcKey ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
      <label class="fld">Phenotype to pick <select id="pkPheno" class="sel">${phenoOpts}</select></label>
      <div class="row">
        <label class="fld half">Sex <select id="pkSex" class="sel">${sexOpts}</select></label>
        <label class="fld half">How many <input id="pkCount" class="sel" type="number" min="1" value="6"></label>
      </div>
      <label class="fld">Stage <select id="pkStage" class="sel">
        <option value="l4">🪲 L4</option><option value="young_adult" selected>🪱 Young adult</option><option value="adult">🧬 Adult</option></select></label>
      <label class="fld">Put on <select id="pkTarget" class="sel">${targetOpts}</select></label>
      <div class="muted sm">Tip: to set up a NEW cross, pick a ♂ male onto a plate, then pick a ♀ of a tester strain onto the <b>same</b> plate.</div>
      <button class="btn-primary" id="pkGo" style="margin-top:10px">Pick & place</button>
    </div>`;
    $('pkClose').onclick = () => ov.remove();
    $('pkSrc').onchange = e => { srcKey = e.target.value; render(); };
    $('pkGo').onclick = () => {
      const src2 = sources.find(s => s.key === srcKey);
      const phenoKey = $('pkPheno').value;
      const phenoLabel = src2.r.phenos.find(c => c.key === phenoKey)?.label || 'worm';
      const sex = $('pkSex').value;
      const count = Math.max(1, parseInt($('pkCount').value) || 1);
      const stageId = $('pkStage').value;
      const geno = conditionOnPheno(src2.r.loci, phenoKey);
      const entry = { id: uid(), count, stageId, sex, geno, picked: true, label: `${'F' + nextIdx} ${phenoLabel}` };
      const tgt = $('pkTarget').value;
      if (tgt === '__new__') {
        const np = {
          id: uid(), name: `F${nextIdx} — ${phenoLabel} (from ${p.name})`, worms: [entry], genIndex: nextIdx,
          strainId: null, strainLabel: `${'F' + nextIdx} ${phenoLabel}`, tempC: p.tempC,
          inoculatedAt: Date.now(), createdAt: Date.now(), note: '', counts: {}, observations: [],
        };
        state.plates.unshift(np);
        showToast(`Picked ${count} ${phenoLabel} ${sex === 'male' ? '♂' : '♀'} → new ${'F' + nextIdx} plate.`, 'success');
      } else {
        const q = state.plates.find(x => x.id === tgt); if (!q) return;
        q.worms = [...plateWorms(q).map(x => ({ ...x })), entry];
        showToast(`Picked ${count} ${phenoLabel} ${sex === 'male' ? '♂' : '♀'} → “${q.name}”.`, 'success');
      }
      ov.remove(); persistGroup(); renderPlateTab();
    };
  };
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  render();
}
function openBin() {
  const ov = document.createElement('div'); ov.className = 'sim-ov'; ov.id = 'binOv';
  const rows = state.bin.map(p => `<div class="binrow">
    <div><b>${esc(p.name)}</b><div class="muted sm">${plateWorms(p).map(w => esc(shortStrain(w.strainId))).join(', ') || '—'} · discarded ${new Date(p.discardedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div></div>
    <div class="binrow-act"><button class="btn-secondary" data-restore="${p.id}">Restore</button><button class="btn-danger" data-del="${p.id}">Delete</button></div>
  </div>`).join('');
  ov.innerHTML = `<div class="sim-card">
    <div class="sim-head"><div><b>☣ Biohazard Bin</b><div class="muted sm">${state.bin.length} discarded plate${state.bin.length !== 1 ? 's' : ''}</div></div><button class="x" id="binClose">✕</button></div>
    ${state.bin.length ? rows : '<div class="empty">Bin is empty.</div>'}
    ${state.bin.length ? '<button class="btn-danger" id="emptyBin" style="margin-top:10px;width:100%">Empty bin (delete all permanently)</button>' : ''}
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  $('binClose').onclick = () => ov.remove();
  ov.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => {
    const p = state.bin.find(x => x.id === b.dataset.restore); if (!p) return;
    state.bin = state.bin.filter(x => x.id !== b.dataset.restore); delete p.discardedAt;
    state.plates.unshift(p); persistGroup(); ov.remove(); renderPlateTab(); showToast('Plate restored.', 'success');
  });
  ov.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!confirm('Permanently delete this plate?')) return;
    state.bin = state.bin.filter(x => x.id !== b.dataset.del); persistGroup(); ov.remove(); openBin();
  });
  $('emptyBin')?.addEventListener('click', () => {
    if (!confirm('Permanently delete ALL plates in the bin?')) return;
    state.bin = []; persistGroup(); ov.remove(); renderPlateTab();
  });
}

// ── Life-cycle reference (educational; not a plate simulation) ─────────────────
function openLifeCycle() {
  let sid = 'N2', temp = 20;
  const ov = document.createElement('div'); ov.className = 'sim-ov'; ov.id = 'lifeOv';
  const strainOpts = strainOptions(state.role === 'teacher').filter(o => !o.locked)
    .map(o => `<option value="${o.id}">${esc(shortStrain(o.id))}</option>`).join('');
  ov.innerHTML = `<div class="sim-card info">
    <div class="sim-head"><b>🔄 C. elegans Life Cycle</b><button class="x" id="lcClose">✕</button></div>
    <div class="row"><select id="lcStrain" class="sel" style="flex:1">${strainOpts}</select>
      <select id="lcTemp" class="sel" style="width:96px"><option>15</option><option selected>20</option><option>25</option></select></div>
    <div id="lcBody"></div></div>`;
  document.body.appendChild(ov);
  const render = () => {
    const stages = getStages(sid, temp);
    $('lcBody').innerHTML = stages.map(s =>
      `<div class="info-row"><b style="color:${s.color}">${s.icon} ${s.name}</b>
        <div class="sm">${fmtHours(s.start)} – ${fmtHours(s.end)} (${fmtHours(s.duration)})<br>${esc(s.description || '')}</div></div>`).join('') +
      `<div class="muted sm" style="margin-top:6px">Egg → reproductive adult ≈ <b>${fmtHours(getTotalHours(sid, temp))}</b> at ${temp}°C. Lifespan: ${esc(STRAINS[sid]?.lifespan20C || '—')}.</div>`;
  };
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  $('lcClose').onclick = () => ov.remove();
  $('lcStrain').onchange = e => { sid = e.target.value; render(); };
  $('lcTemp').onchange = e => { temp = +e.target.value; render(); };
  render();
}

// Base strains (sex-free) students can record in an observation.
function baseStrainOptions() {
  const bases = [];
  for (const id of ['N2', 'dpy-11', 'dpy-13']) if (!bases.includes(id)) bases.push(id);
  return bases;
}
const baseLabel = b => b;
function entryStrainId(e) { return e.sex === 'male' && STRAINS[e.base + '-male'] ? e.base + '-male' : e.base; }
function obsSummary(o) {
  if (Array.isArray(o.entries) && o.entries.length)
    return o.entries.map(e => `${e.count} ${e.sex === 'male' ? '♂' : '♀'} ${stageLabel(e.stageId)} ${baseLabel(e.base)}`).join(', ') + (o.eggs ? ` · ${o.eggs} eggs` : '');
  return `${stageLabel(o.stageObserved)} · ${o.wormCount ?? '—'} worms${o.eggs != null ? ` · ${o.eggs} eggs` : ''}`;
}

let logDraft = { pid: null, entries: [] };
function openLogForm(p) {
  const lf = $(`lf-${p.id}`); if (!lf) return;
  if (!lf.classList.contains('hidden')) { lf.classList.add('hidden'); lf.innerHTML = ''; return; }
  app.querySelectorAll('.log-form').forEach(f => { f.classList.add('hidden'); f.innerHTML = ''; });
  lf.classList.remove('hidden');
  logDraft = { pid: p.id, entries: [] };
  const stageOpts = [['egg', '🥚 Egg'], ['l1', '🌱 L1'], ['l2', '🐣 L2'], ['l3', '🐛 L3'], ['l4', '🪲 L4'],
    ['young_adult', '🪱 Young adult'], ['adult', '🧬 Adult'], ['dauer', '💤 Dauer'], ['dead', '☠ Dead']]
    .map(([v, l]) => `<option value="${v}"${v === 'adult' ? ' selected' : ''}>${l}</option>`).join('');
  const strainOpts = baseStrainOptions().map(b => `<option value="${b}">${esc(baseLabel(b))}</option>`).join('');
  const sexOpts = `<option value="hermaphrodite">♀ Hermaphrodite</option><option value="male">♂ Male</option>`;
  const defBy = state.lastBy || state.profile?.name || '';
  const byOpts = ['<option value="">— logged by (optional) —</option>',
    ...state.group.members.map(m => `<option value="${esc(m)}"${m === defBy ? ' selected' : ''}>${iconFor(m)} ${esc(m)}</option>`)].join('');
  lf.innerHTML = `
    <label class="fld">Logged by <select id="lby-${p.id}" class="sel">${byOpts}</select></label>
    <div class="card-sub">🔬 Worms observed <span class="muted sm">(add each type / stage / sex you see)</span></div>
    <div class="wpick">
      <select id="leStrain-${p.id}" class="sel">${strainOpts}</select>
      <select id="leStage-${p.id}" class="sel">${stageOpts}</select>
      <select id="leSex-${p.id}" class="sel">${sexOpts}</select>
      <input id="leCount-${p.id}" class="sel wp-count" type="number" min="1" value="1">
      <button class="btn-secondary wp-add" id="leAdd-${p.id}">＋ Add</button>
    </div>
    <div id="leList-${p.id}" class="wlist"></div>
    <div class="row">
      <label class="fld half"># Eggs <input type="number" min="0" id="le-${p.id}" placeholder="optional"></label>
      <label class="fld half">Photo <input type="file" accept="image/*" id="lp-${p.id}"></label>
    </div>
    <label class="fld">Note <input id="ln-${p.id}" placeholder="anything notable"></label>
    <button class="btn-primary" id="lb-${p.id}">Save observation</button>`;

  $(`leAdd-${p.id}`).onclick = () => {
    logDraft.entries.push({
      base: $(`leStrain-${p.id}`).value,
      stageId: $(`leStage-${p.id}`).value,
      sex: $(`leSex-${p.id}`).value,
      count: Math.max(1, parseInt($(`leCount-${p.id}`).value) || 1),
    });
    renderLogEntries(p);
  };
  renderLogEntries(p);

  let photoData = null;
  $(`lp-${p.id}`).onchange = async e => { const f = e.target.files[0]; if (f) photoData = await downscale(f, 200); };
  $(`lb-${p.id}`).onclick = () => {
    const entries = logDraft.entries.slice();
    const eggs = numOrNull($(`le-${p.id}`).value);
    if (!entries.length && !eggs) return showToast('Add at least one worm type (or an egg count) first.', 'warn');
    const by = $(`lby-${p.id}`).value; state.lastBy = by;
    const wormCount = entries.reduce((s, e) => s + e.count, 0);
    const sc = {}; entries.forEach(e => sc[e.stageId] = (sc[e.stageId] || 0) + e.count);
    let stageObserved = entries[0]?.stageId || '', mx = -1;
    for (const k in sc) if (sc[k] > mx) { mx = sc[k]; stageObserved = k; }
    const o = {
      id: uid(), at: Date.now(), by, entries, eggs,
      note: $(`ln-${p.id}`).value.trim(), photo: photoData, wormCount, stageObserved,
    };
    p.observations = [o, ...(p.observations || [])];
    if (o.photo) p.photo = o.photo;
    logDraft = { pid: null, entries: [] };
    persistGroup(); renderPlateList(); showToast('Observation saved & synced.', 'success');
  };
}

function renderLogEntries(p) {
  const el = $(`leList-${p.id}`); if (!el) return;
  el.innerHTML = logDraft.entries.length
    ? logDraft.entries.map((e, i) => {
        const c = STRAINS[entryStrainId(e)]?.color || '#94a3b8';
        return `<div class="wrow"><span class="sw" style="background:${c}"></span>
          <span class="wrow-t">${esc(baseLabel(e.base))} ${e.sex === 'male' ? '♂' : '♀'} · ${stageLabel(e.stageId)} · ×${e.count}</span>
          <button class="x" id="leRm-${p.id}-${i}">✕</button></div>`;
      }).join('')
    : '<div class="muted sm">No worms added yet — pick type, stage, sex & count, then ＋ Add.</div>';
  logDraft.entries.forEach((e, i) => { const b = $(`leRm-${p.id}-${i}`); if (b) b.onclick = () => { logDraft.entries.splice(i, 1); renderLogEntries(p); }; });
}

function editMembers() {
  const cur = state.group.members.join(', ');
  const v = prompt(`Member names (comma separated, up to ${MAX_GROUP}):`, cur);
  if (v == null) return;
  let m = v.split(',').map(s => s.trim()).filter(Boolean);
  if (m.length > MAX_GROUP) { m = m.slice(0, MAX_GROUP); showToast(`Capped at ${MAX_GROUP} members per group.`, 'warn'); }
  state.group.members = m;
  persistGroup(); renderPlateTab();
}

// ── Student · Worm Counter ────────────────────────────────────────────────────
let counter = null, learner = null, labeler = null;
let cImages = [], cSel = -1;
const TRAIN_OPTS = { sensitivity: 16, minArea: 12, maxArea: 12000, minAspect: 1.0, blurRadius: 16 };

function renderCountTab() {
  const body = $('body'); if (!body) return;
  body.innerHTML = `
    <div class="card">
      <div class="card-h">🔢 Count worms in a photo</div>
      <div class="muted sm">Upload a plate photo, tap ✨ to auto-mark, then tap to add/remove. Save the count to one of your plates.</div>
      <div class="row" style="margin-top:8px">
        <button class="btn-primary" id="cUp">📷 Upload photo</button>
        <input type="file" id="cFile" accept="image/*" multiple class="hidden">
      </div>
      <div id="cThumbs" class="thumbs"></div>
    </div>
    <div id="cEmpty" class="empty">No photo yet — upload one to start.</div>
    <div id="cWork" class="hidden">
      <div class="palette" id="cPal"></div>
      <div class="row tools">
        <button class="btn-secondary" id="cPrefill">✨ Auto-mark</button>
        <button class="btn-secondary" id="cAdd">＋ Add</button>
        <button class="btn-secondary" id="cErase">⌫ Erase</button>
        <button class="btn-secondary" id="cZin">＋🔍</button>
        <button class="btn-secondary" id="cZout">－🔍</button>
        <button class="btn-secondary" id="cFit">Fit</button>
        <button class="btn-secondary" id="cClr">Clear</button>
      </div>
      <div class="canvas-wrap"><canvas id="cCanvas"></canvas></div>
      <div id="cCounts" class="counts"></div>
      <div class="card">
        <div class="card-h">Save this count</div>
        <label class="fld">Attach to plate
          <select id="cPlate"></select></label>
        <button class="btn-primary" id="cSave">Save count to plate</button>
      </div>
    </div>`;
  initCounter();
}

async function initCounter() {
  counter = counter || new WormCounter();
  if (!learner) { learner = new WormLearner(); await seedModel(learner); }
  labeler = new WormLabeler($('cCanvas'));
  labeler.onChange = renderCCounts;

  // palette
  const pal = $('cPal');
  pal.innerHTML = Object.entries(LABEL_CATS).map(([k, v]) =>
    `<button class="chip-cat${k === labeler.cat ? ' active' : ''}" data-cat="${k}">
      <span class="sw" style="background:${v.color}"></span>${v.label}</button>`).join('');
  pal.querySelectorAll('.chip-cat').forEach(b => b.onclick = () => {
    pal.querySelectorAll('.chip-cat').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); labeler.setCategory(b.dataset.cat); setCMode('add');
  });

  $('cUp').onclick = () => $('cFile').click();
  $('cFile').onchange = onCUpload;
  $('cPrefill').onclick = cPrefill;
  $('cAdd').onclick = () => setCMode('add');
  $('cErase').onclick = () => setCMode('erase');
  $('cZin').onclick = () => labeler.zoomBy(1.4);
  $('cZout').onclick = () => labeler.zoomBy(1 / 1.4);
  $('cFit').onclick = () => labeler.resetView();
  $('cClr').onclick = () => { if (confirm('Clear marks on this photo?')) labeler.clear(); };
  $('cSave').onclick = cSaveToPlate;

  // restore previously uploaded images this session
  if (cImages.length && cSel >= 0) selectCImage(cSel); else showCEmpty();
  fillPlateSelect();
}

function fillPlateSelect() {
  const sel = $('cPlate'); if (!sel) return;
  sel.innerHTML = (state.plates.length
    ? state.plates.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.strainLabel)})</option>`).join('')
    : '<option value="">— no plates yet, create one in Plate Tracker —</option>');
}

function setCMode(m) {
  labeler.setMode(m);
  $('cAdd').classList.toggle('active', m === 'add');
  $('cErase').classList.toggle('active', m === 'erase');
}

function onCUpload(e) {
  const files = [...e.target.files]; e.target.value = '';
  let pending = files.length;
  files.forEach(f => {
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image();
      img.onload = () => { cImages.push({ name: f.name, imgEl: img, thumbUrl: ev.target.result, points: [] }); if (--pending === 0) selectCImage(cImages.length - 1); };
      img.src = ev.target.result;
    };
    r.readAsDataURL(f);
  });
}

function renderCThumbs() {
  const w = $('cThumbs'); if (!w) return;
  w.innerHTML = cImages.map((im, i) =>
    `<div class="thumb${i === cSel ? ' on' : ''}" data-i="${i}"><img src="${im.thumbUrl}">
      ${im.points.length ? `<span class="badge">${im.points.length}</span>` : ''}
      <button class="thumb-x" data-del="${i}">✕</button></div>`).join('');
  w.querySelectorAll('.thumb').forEach(el => el.onclick = e => {
    if (e.target.dataset.del != null) { cImages.splice(+e.target.dataset.del, 1); cSel = Math.min(cSel, cImages.length - 1); cSel >= 0 ? selectCImage(cSel) : showCEmpty(); return; }
    selectCImage(+el.dataset.i);
  });
}

function selectCImage(i) {
  cSel = i; const im = cImages[i];
  $('cEmpty').classList.add('hidden'); $('cWork').classList.remove('hidden');
  labeler.setImage(im.imgEl, im.name); labeler.points = im.points; labeler.render();
  renderCCounts(); renderCThumbs();
}
function showCEmpty() { $('cWork')?.classList.add('hidden'); $('cEmpty')?.classList.remove('hidden'); renderCThumbs(); }

function renderCCounts() {
  if (cSel >= 0) renderCThumbs();
  const c = labeler.counts();
  const order = ['egg', 'l1', 'l2', 'l3', 'l4', 'adult', 'dead'];
  const rows = order.filter(k => c[k] > 0).map(k => `<span style="color:${LABEL_CATS[k].color}">●</span> ${LABEL_CATS[k].label}: <b>${c[k]}</b>`);
  const total = WORM_CATS.reduce((s, k) => s + (c[k] || 0), 0);
  $('cCounts').innerHTML = `<div class="big">${total} worms</div>${rows.length ? rows.join(' · ') : '<span class="muted">tap to mark</span>'}`;
}

function cPrefill() {
  if (cSel < 0) return;
  const im = cImages[cSel];
  const smart = learner.ready();
  const res = counter.count(im.imgEl, smart ? TRAIN_OPTS : { sensitivity: 20, minArea: 30, maxArea: 4000 });
  const matchR = 12 / res.scale; let added = 0, rej = 0;
  for (const b of res.blobs) {
    const x = b.cx / res.scale, y = b.cy / res.scale;
    if (labeler.points.some(q => Math.hypot(q.x - x, q.y - y) < matchR)) continue;
    if (smart && !WORM_CATS.includes(learner.predict(learner.featureVec(b, res)).cat)) { rej++; continue; }
    labeler.points.push({ x, y, cat: 'l4' }); added++;
  }
  labeler.render(); renderCCounts();
  showToast(`Auto-marked ${added} worms${rej ? ` (skipped ${rej} eggs/debris)` : ''}. Re-tag by stage if needed.`, 'info', 5000);
}

async function cSaveToPlate() {
  if (cSel < 0) return showToast('Upload a photo first.', 'warn');
  const c = labeler.counts();
  const total = WORM_CATS.reduce((s, k) => s + (c[k] || 0), 0);
  const pid = $('cPlate').value;
  if (!pid) return showToast('Create a plate in the Plate Tracker first.', 'warn');
  const p = state.plates.find(x => x.id === pid); if (!p) return;
  const dominant = STAGE_ORDER.filter(s => s !== 'young_adult').reduce((a, k) => (c[k] || 0) > (c[a] || 0) ? k : a, 'l4');
  const photo = await downscale(cImages[cSel].thumbUrl, 200);
  const o = { id: uid(), at: Date.now(), by: state.lastBy || '', stageObserved: dominant, wormCount: total, eggs: c.egg || 0, foodPct: null, note: 'From Worm Counter', photo, counts: c };
  p.observations = [o, ...(p.observations || [])]; p.counts = c; p.photo = photo;
  await persistGroup();
  showToast(`Saved ${total} worms to “${p.name}”.`, 'success');
}

async function seedModel(lrn) {
  if (lrn.stats().examples > 0) return;        // already has local training
  try {
    const r = await fetch('./wormtrace-model.json?v=9');
    if (r.ok) { lrn.importMerge(await r.json()); }
  } catch {}
}

// ── TEACHER ───────────────────────────────────────────────────────────────────
function enterTeacher(classCode) {
  state.role = 'teacher'; state.classCode = classCode; state.teacherClass = classCode;
  saveSession({ role: 'teacher', classCode });
  if (state.unsub) state.unsub();
  state.unsub = cloud().subscribeClass(classCode, groups => {
    state.config = groups.find(g => g.id === CONFIG_ID) || defaultConfig();
    state.teacherGroups = groups.filter(g => g.id !== CONFIG_ID).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (state.role === 'teacher') renderTeacherBody();
  });
  renderTeacher();
}

async function writeConfig(patch) {
  const cfg = state.config || defaultConfig();
  state.config = { ...cfg, ...patch };
  await cloud().writeGroup(state.classCode, CONFIG_ID, {
    isConfig: true, groupSize: state.config.groupSize || MAX_GROUP,
    joinMode: state.config.joinMode || 'self', roster: state.config.roster || [],
    icons: state.config.icons || {},
  });
}
async function createTeacherGroup(name) {
  const id = groupIdFromName(name) + '-' + uid().slice(0, 4);
  await cloud().writeGroup(state.classCode, id, { name, members: [], racks: [], plates: [], bin: [] });
}
async function assignStudent(name, groupId) {
  for (const g of state.teacherGroups) {
    const has = (g.members || []).some(m => normName(m) === normName(name));
    if (g.id === groupId && !has)
      await cloud().writeGroup(state.classCode, g.id, { members: [...(g.members || []), name] });
    else if (g.id !== groupId && has)
      await cloud().writeGroup(state.classCode, g.id, { members: (g.members || []).filter(m => normName(m) !== normName(name)) });
  }
}

function renderTeacher() {
  app.innerHTML = `
    <header class="top">
      <div class="top-l"><b>👨‍🏫 WormLab — Teacher</b><span class="chip">${esc(state.classCode)}</span></div>
      <div class="top-r"><button class="lnk" id="btnLife">🔄 Life cycle</button><button class="lnk" id="btnCross">🧬 Crosses</button><button class="lnk" id="btnOut">Sign out</button></div>
    </header>
    <main id="tbody" class="body"></main>`;
  $('btnOut').onclick = signOut;
  $('btnCross').onclick = openCrossGuide;
  $('btnLife').onclick = openLifeCycle;
  renderTeacherBody();
}

function renderTeacherBody() {
  const el = $('tbody'); if (!el) return;
  const groups = state.teacherGroups;
  const totalPlates = groups.reduce((s, g) => s + (g.plates || []).length, 0);
  el.innerHTML = `
    <div class="muted sm">Class <b>${esc(state.classCode)}</b> · ${groups.length} group${groups.length !== 1 ? 's' : ''} · ${totalPlates} plate${totalPlates !== 1 ? 's' : ''} · live ${cloudMode() === 'cloud' ? '☁' : '(local)'}</div>
    ${teacherSetupHTML()}
    ${groups.length ? groups.map(teacherGroupHTML).join('') : `<div class="empty">No groups yet. Students appear here as soon as they join class <b>${esc(state.classCode)}</b>.</div>`}`;
  wireTeacherSetup();
  groups.forEach(g => (g.plates || []).forEach(p => {
    const btn = el.querySelector(`[data-sim="${g.id}__${p.id}"]`);
    if (btn) btn.onclick = () => openSimulator(p, g);
  }));
}

function teacherSetupHTML() {
  const cfg = state.config || defaultConfig();
  const groups = state.teacherGroups;
  const assigned = new Set(groups.flatMap(g => (g.members || []).map(normName)));
  const roster = (cfg.roster || []);
  const groupOpts = (cur) => `<option value="">— unassigned —</option>` +
    groups.map(g => `<option value="${g.id}"${cur === g.id ? ' selected' : ''}>${esc(g.name)} (${(g.members || []).length}/${cfg.groupSize})</option>`).join('');
  const groupOf = name => groups.find(g => (g.members || []).some(m => normName(m) === normName(name)))?.id || '';
  const rosterRows = roster.length ? roster.map(n =>
    `<div class="binrow"><div><b>${iconFor(n)} ${esc(n)}</b>${assigned.has(normName(n)) ? '' : ' <span class="warn-t sm">unassigned</span>'}</div>
      <div class="binrow-act"><select class="sel" data-assign="${esc(n)}">${groupOpts(groupOf(n))}</select></div></div>`).join('')
    : '<div class="muted sm">No students yet — they appear here when they enter the class with their name.</div>';
  return `<details class="card group" id="setupCard" open>
    <summary class="card-h" style="cursor:pointer">⚙ Class setup &amp; roster</summary>
    <div class="row" style="margin-top:8px">
      <label class="fld half">Max group size <input id="cfgSize" class="sel" type="number" min="1" max="12" value="${cfg.groupSize}"></label>
      <label class="fld half">Joining <select id="cfgMode" class="sel">
        <option value="self"${cfg.joinMode === 'self' ? ' selected' : ''}>Students pick their own group</option>
        <option value="assigned"${cfg.joinMode === 'assigned' ? ' selected' : ''}>Teacher assigns groups</option></select></label>
    </div>
    <div class="card-sub">Groups</div>
    <div class="row"><input id="newTGroup" class="sel" style="flex:1" placeholder="New group name (e.g. Bench 4)"><button class="btn-secondary" id="btnNewTGroup" style="flex:0 0 auto">＋ Group</button></div>
    <div class="card-sub">Students (${roster.length})</div>
    ${rosterRows}
  </details>`;
}

function wireTeacherSetup() {
  $('cfgSize')?.addEventListener('change', e => {
    const v = Math.max(1, Math.min(12, parseInt(e.target.value) || MAX_GROUP));
    writeConfig({ groupSize: v });
  });
  $('cfgMode')?.addEventListener('change', e => writeConfig({ joinMode: e.target.value }));
  $('btnNewTGroup')?.addEventListener('click', () => {
    const n = $('newTGroup').value.trim(); if (!n) return showToast('Name the group.', 'warn');
    createTeacherGroup(n); $('newTGroup').value = '';
  });
  document.querySelectorAll('[data-assign]').forEach(sel =>
    sel.addEventListener('change', e => assignStudent(e.target.dataset.assign, e.target.value)));
}

function teacherGroupHTML(g) {
  const plates = g.plates || [];
  const upd = g.updatedAt ? new Date(g.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <div class="card group">
      <div class="group-h">
        <div><div class="plate-name">${esc(g.name)}</div>
          <div class="muted sm">${g.members?.length ? g.members.map(withIcon).join(', ') : 'no members yet'} ${upd ? '· updated ' + upd : ''}</div></div>
        <span class="chip alt">${plates.length} plate${plates.length !== 1 ? 's' : ''}</span>
      </div>
      ${plates.length ? plates.map(p => teacherPlateHTML(g, p)).join('') : '<div class="muted sm">No plates yet.</div>'}
    </div>`;
}

function teacherPlateHTML(g, p) {
  const inoc = p.inoculatedAt ? `${fmtHours(elapsedHrs(p))} elapsed` : 'not inoculated';
  let expected = '—';
  if (p.inoculatedAt) {
    try { expected = getCurrentStage(elapsedHrs(p), validStrain(p.strainId), p.tempC).stage.name; } catch {}
  }
  const obs = p.observations || [];
  const last = obs[0];
  return `
    <div class="tplate">
      <div class="tplate-h">
        <div><b>${esc(p.name)}</b> <span class="muted sm"><span class="genchip">${genLabel(p)}</span> · ${p.tempC}°C</span></div>
        <button class="btn-secondary sim-btn" data-sim="${g.id}__${p.id}">▶ Simulate</button>
      </div>
      ${wormMixHTML(p)}
      ${offspringPanelHTML(p, false)}
      <div class="sm">${inoc} · expected stage now: <b>${esc(expected)}</b> · ${obs.length} obs</div>
      ${last ? `<div class="muted sm">Last log${last.by ? ' by ' + iconFor(last.by) + ' ' + esc(last.by) : ''}: ${esc(obsSummary(last))}</div>` : ''}
      ${last?.photo ? `<img class="obs-thumb" src="${last.photo}">` : ''}
      ${obs.length ? `<details class="obs"><summary>all ${obs.length} observations</summary>${obs.map(obsRowHTML).join('')}</details>` : ''}
    </div>`;
}

// Breakdown of a plate's worms by type + sex (shown in the simulator).
function simCompositionHTML(p) {
  const w = plateWorms(p).filter(x => x.count > 0);
  if (!w.length) return '';
  const map = {}; let herm = 0, male = 0;
  for (const e of w) {
    const sex = entrySex(e), sym = sex === 'male' ? '♂' : '♀';
    if (sex === 'male') male += e.count; else herm += e.count;
    const type = e.strainId ? e.strainId.replace('-male', '') : (e.label || entryPheno(e));
    const key = `${type} ${sym}`;
    map[key] = (map[key] || 0) + e.count;
  }
  const chips = Object.entries(map).map(([k, n]) =>
    `<span class="wtag">${esc(k)} ×${n}</span>`).join('');
  return `<div class="card-sub" style="margin-top:4px">On this plate — ♀ ${herm} hermaphrodite${herm !== 1 ? 's' : ''} · ♂ ${male} male${male !== 1 ? 's' : ''}</div>
    <div class="wmix">${chips}</div>`;
}

// ── Teacher · Growth Simulator (the "simulated data" students don't get) ───────
let simPC = null, simRaf = null, simSnaps = [], simIdx = 0, simPlaying = false;

function openSimulator(p, g) {
  stopSim();
  simSnaps = buildSim(p);
  const sid = validStrain(p.strainId);
  const strain = STRAINS[sid] || STRAINS.N2;
  const ov = document.createElement('div');
  ov.className = 'sim-ov'; ov.id = 'simOv';
  ov.innerHTML = `
    <div class="sim-card">
      <div class="sim-head">
        <div><b>🔬 Simulation — ${esc(p.name)}</b>
          <div class="muted sm">${esc(g.name)} · ${esc(strain.label)} · ${p.tempC}°C</div></div>
        <button class="x" id="simClose">✕</button>
      </div>
      ${simCompositionHTML(p)}
      <div class="sim-canvas-wrap"><canvas id="simCanvas" width="300" height="300"></canvas></div>
      <div class="sim-stat" id="simStat"></div>
      <input type="range" id="simScrub" min="0" max="${simSnaps.length - 1}" value="0" step="1">
      <div class="row">
        <button class="btn-secondary" id="simPlay">▶ Play</button>
        <button class="btn-secondary" id="simReset">⟲ Reset</button>
      </div>
      <div class="card-sub">Living worms — strain · stage · sex</div>
      <div id="simBars"></div>
      <div id="simBreak"></div>
      <div class="muted sm" style="margin-top:8px">Teaching projection from the C. elegans life-cycle model (strain timing, reproduction, food depletion, lifespan). Compare it with the group's logged observations above.</div>
    </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeSim(); };
  $('simClose').onclick = closeSim;

  simPC = new PlateCanvas($('simCanvas'));
  simPC._noAutoSize = true;
  simPC.start();
  simPC.enableZoom($('simCanvas').parentElement);

  $('simScrub').oninput = e => { simIdx = +e.target.value; paintSim(p); };
  $('simReset').onclick = () => { simIdx = 0; $('simScrub').value = 0; paintSim(p); };
  $('simPlay').onclick = togglePlay;
  simIdx = 0; paintSim(p);
}

function togglePlay() {
  simPlaying = !simPlaying;
  $('simPlay').textContent = simPlaying ? '⏸ Pause' : '▶ Play';
  if (simPlaying) {
    const step = () => {
      if (!simPlaying) return;
      simIdx = (simIdx + 1) % simSnaps.length;
      $('simScrub').value = simIdx; paintSimCurrent();
      simRaf = setTimeout(step, 220);
    };
    step();
  } else if (simRaf) { clearTimeout(simRaf); simRaf = null; }
}

let _simPlate = null;
function paintSim(p) { _simPlate = p; paintSimCurrent(); }
function paintSimCurrent() {
  const p = _simPlate; if (!p || !simPC) return;
  const s = simSnaps[simIdx]; if (!s) return;
  const sid = validStrain(p.strainId);
  const stage = stageObjFor(sid, p.tempC, s.stageId);
  simPC.setState({
    plate: { id: p.id, inoculatedAt: 1, strainId: sid },
    hrsElapsed: s.t, stage, foodPct: s.foodPct,
    wormCount: s.wormCount, totalEggs: s.totalEggs, population: s.population,
  });
  $('simStat').innerHTML =
    `<b>${fmtHours(s.t)}</b> · ${s.wormCount} alive · ${s.totalEggs} eggs · food ${Math.round(s.foodPct)}% · 💀 ${s.dead?.total || 0} dead`;
  const sexSym = x => x === 'male' ? '♂' : '♀';
  const bars = $('simBars');
  if (bars) {
    const live = (s.combo || []);
    bars.innerHTML = live.length
      ? `<div class="wmix">${live.map(x =>
          `<span class="wtag"><span class="sw" style="background:${TYPE_COLOR[x.typeKey] || '#94a3b8'}"></span>${TYPE_LABEL[x.typeKey] || x.typeKey} · ${stageLabel(x.stageId)} · ${sexSym(x.sex)} ×${x.count}</span>`).join('')}</div>`
      : '<span class="muted sm">no living worms</span>';
  }
  const brk = $('simBreak');
  if (brk) {
    const d = s.dead || { total: 0, combo: [] };
    const deadChips = (d.combo || []).map(x =>
      `<span class="wtag"><span class="sw" style="background:${TYPE_COLOR[x.typeKey] || '#94a3b8'}"></span>${TYPE_LABEL[x.typeKey] || x.typeKey} · ${sexSym(x.sex)} ×${x.count}</span>`).join('');
    brk.innerHTML = `<div class="card-sub">💀 Dead — cumulative: ${d.total}</div>${deadChips ? `<div class="wmix">${deadChips}</div>` : ''}`;
  }
}

function stopSim() { simPlaying = false; if (simRaf) { clearTimeout(simRaf); simRaf = null; } if (simPC) { simPC.stop(); simPC = null; } }
function closeSim() { stopSim(); $('simOv')?.remove(); }

/** Lightweight teaching simulation of a plate's life over ~5 weeks. Founders +
 *  progeny move through the life cycle with logistic reproduction (carrying
 *  capacity), food depletion, and — once food runs out — dauer formation and
 *  gradual starvation/old-age death, so the late timeline shows the plate crash
 *  rather than freezing. Returns time snapshots for the scrubber/animation.
 *
 *  Tuned for qualitative realism (a few founders → a packed plate that starves
 *  out and goes dauer in ~1–2 weeks), not exact counts. */
const DAUER_COLOR = '#a855f7';
function buildSim(plate) {
  const sid = primaryStrainId(plate);                        // timing from the dominant strain
  const tempC = plate.tempC || 20;
  const stages = getStages(sid, tempC);
  const byId = {}; stages.forEach(s => byId[s.id] = s);
  const order = STAGE_ORDER.filter(id => byId[id]);          // egg..adult that exist
  const strain = STRAINS[sid] || STRAINS.N2;
  const lifespanH = adultLifespanHours(sid, tempC);
  // Adult survival WINDOW from the mean: first deaths ≈0.6× mean, none left by ≈1.5× mean
  // (N2 dies ~12–34 d around a ~17–23 d mean; Gems & Riddle 2000; Johnson 1987; CGC N2).
  // `survFrac` is the fraction still alive at a given adult age: 1 before min, ~50% at the
  // mean, 0 at max — used to kill ALL adults (hermaphrodites AND males) the same way.
  const lifeMinH = lifespanH * 0.6, lifeMaxH = lifespanH * 1.5;
  const survFrac = age => age <= lifeMinH ? 1 : age >= lifeMaxH ? 0
    : Math.pow((lifeMaxH - age) / (lifeMaxH - lifeMinH), 1.18);
  // Brood size = the laying potential on the plate (a hermaphrodite present → ~300;
  // a male-only plate → 0, so no progeny appear — correct biology).
  // Laying potential: hermaphrodites lay (~300), males lay none. Picked worms have
  // no strainId → infer from sex.
  const wEggs = plateWorms(plate).map(w =>
    entrySex(w) === 'male' ? 0 : (STRAINS[w.strainId]?.maxEggs ?? 300));
  const maxEggs = wEggs.length ? Math.max(...wEggs) : (strain.maxEggs ?? 300);
  const reproSpan = byId.adult?.duration || 120;
  const eggRate = maxEggs / Math.max(1, reproSpan);          // eggs / adult / hour at full food
  const canDauer = strain.dafClass !== 'daf-d';              // daf-defective cannot form dauer

  // Progeny composition from the founders (sex split + phenotype mix) so worms BORN
  // during the sim are labelled by sex + strain/type for the stats.
  const fParents = parentsOf(plate);
  const progeny = crossProgeny(fParents) || selfProgeny(fParents) || { phenos: [{ key: 'wild', pct: 1 }], maleFrac: 0 };
  const progMale = progeny.maleFrac || 0;
  const progTypes = progeny.phenos.map(p => ({ key: p.key, pct: p.pct }));

  // Seed cohorts — each carries sex + phenotype-key so the stats can break them down.
  let cohorts = [];
  const ws = plateWorms(plate).filter(w => w.count > 0);
  const seed = plate.counts || (plate.observations?.[0]?.counts) || {};
  const seedTot = ['egg', 'l1', 'l2', 'l3', 'l4', 'adult'].reduce((s, k) => s + (seed[k] || 0), 0);
  const mk = (stageId, count, sex, typeKey) => ({ stageId, age: 0, count, adultAge: 0, sex, typeKey });
  if (ws.length) {
    for (const w of ws) {
      const k = order.includes(w.stageId) ? w.stageId : (w.stageId === 'dauer' ? 'dauer' : 'adult');
      cohorts.push(mk(k, w.count, entrySex(w), phenoKeyOf(entryGeno(w))));
    }
  } else if (seedTot > 0) {
    for (const k of ['egg', 'l1', 'l2', 'l3', 'l4', 'adult'])
      if (seed[k] > 0) cohorts.push(mk(k, seed[k], 'hermaphrodite', 'wild'));
  } else {
    cohorts.push(mk('adult', 3, 'hermaphrodite', 'wild'));
  }

  let food = 100;
  const dt = 6;
  const maxT = Math.min(46 * 24, getTotalHours(sid, tempC) + lifeMaxH + 4 * 24);
  const STARVE = 4;                                          // food % below which worms starve
  const snaps = [];
  const colorFor = id => id === 'dauer' ? DAUER_COLOR : (byId[id]?.color || '#94a3b8');
  const dead = { total: 0, combo: {} };                     // combo key = `${typeKey}|${sex}`
  const recordDeath = (c, removed) => {
    if (removed <= 0) return;
    dead.total += removed;
    const k = `${c.typeKey}|${c.sex}`;
    dead.combo[k] = (dead.combo[k] || 0) + removed;
  };

  const stageRank = id => { const i = order.indexOf(id); return i < 0 ? 99 : i; };
  for (let t = 0; t <= maxT; t += dt) {
    // ── snapshot: living worms grouped by strain · stage · sex (one combined list) ──
    const pop = {}, combo = {};
    let alive = 0, eggCount = 0;
    for (const c of cohorts) {
      if (c.count <= 0.4) continue;
      if (c.stageId === 'egg') { eggCount += c.count; continue; }
      alive += c.count;
      pop[c.stageId] = (pop[c.stageId] || 0) + c.count;
      const ck = `${c.typeKey}|${c.stageId}|${c.sex}`;
      combo[ck] = (combo[ck] || 0) + c.count;
    }
    let dom = 'l1', dn = -1; for (const id in pop) if (id !== 'egg' && pop[id] > dn) { dn = pop[id]; dom = id; }
    const comboArr = Object.entries(combo).map(([k, n]) => {
      const [typeKey, stageId, sex] = k.split('|'); return { typeKey, stageId, sex, count: Math.round(n) };
    }).filter(x => x.count > 0).sort((a, b) =>
      a.typeKey.localeCompare(b.typeKey) || stageRank(a.stageId) - stageRank(b.stageId) || a.sex.localeCompare(b.sex));
    const deadArr = Object.entries(dead.combo).map(([k, n]) => {
      const [typeKey, sex] = k.split('|'); return { typeKey, sex, count: Math.round(n) };
    }).filter(x => x.count > 0).sort((a, b) => a.typeKey.localeCompare(b.typeKey) || a.sex.localeCompare(b.sex));
    // population for the animated plate canvas — each group keeps its sex + type so
    // males get the head dot and dumpy worms get the short body.
    const population = comboArr.map(x => ({
      stageId: x.stageId, count: x.count,
      color: TYPE_COLOR[x.typeKey] || colorFor(x.stageId),
      male: x.sex === 'male', dpy: x.typeKey !== 'wild',
    }));
    snaps.push({
      t, foodPct: food, wormCount: Math.round(alive), totalEggs: Math.round(eggCount), stageId: dom,
      population, combo: comboArr, dead: { total: Math.round(dead.total), combo: deadArr },
    });

    const starving = food <= STARVE;

    // ── reproduction — only hermaphrodites lay; eggs split by sex × phenotype ──
    if (!starving) {
      let layers = 0; for (const c of cohorts) if (c.stageId === 'adult' && c.sex !== 'male') layers += c.count;
      const ne = layers * eggRate * dt * Math.pow(food / 100, 1.3);
      if (ne > 0.5) for (const ty of progTypes) {
        const m = ne * ty.pct * progMale, h = ne * ty.pct * (1 - progMale);
        if (m > 0.3) cohorts.push(mk('egg', m, 'male', ty.key));
        if (h > 0.3) cohorts.push(mk('egg', h, 'hermaphrodite', ty.key));
      }
    }

    // ── aging / stage advancement (eggs always hatch; larvae arrest when starving) ──
    for (const c of cohorts) {
      if (c.count <= 0) continue;
      c.age += dt;
      if (c.stageId === 'dauer') continue;
      if (c.stageId === 'adult') { c.adultAge += dt; continue; }
      if (starving && c.stageId !== 'egg') continue;
      let sd = byId[c.stageId]?.duration || 12;
      while (c.age >= sd) {
        const idx = order.indexOf(c.stageId);
        if (idx < order.length - 1) { c.age -= sd; c.stageId = order[idx + 1]; if (c.stageId === 'adult') c.adultAge = 0; sd = byId[c.stageId]?.duration || 12; }
        else break;
      }
    }

    // ── starvation: L1/L2 → dauer (if competent); others starve to death ──
    if (starving) {
      const dauerAdd = [];
      for (const c of cohorts) {
        if (c.count <= 0) continue;
        if (canDauer && (c.stageId === 'l1' || c.stageId === 'l2')) {
          const conv = c.count * 0.30; c.count -= conv; dauerAdd.push(mk('dauer', conv, c.sex, c.typeKey));
        } else if (c.stageId !== 'dauer') {
          const before = c.count; c.count *= Math.exp(-dt / (10 * 24)); recordDeath(c, before - c.count);
        }
      }
      cohorts.push(...dauerAdd.filter(d => d.count > 0.4));
    }

    // ── adult old-age mortality: gradual die-off, ALL gone by max lifespan (incl. males) ──
    for (const c of cohorts) if (c.stageId === 'adult' && c.adultAge > lifeMinH) {
      const s0 = survFrac(c.adultAge - dt), s1 = survFrac(c.adultAge), before = c.count;
      c.count = s1 <= 0 ? 0 : (s0 > 0 ? c.count * (s1 / s0) : c.count);
      recordDeath(c, before - c.count);
    }
    // dauer survives for months → slow decline
    for (const c of cohorts) if (c.stageId === 'dauer') { const before = c.count; c.count *= Math.exp(-dt / (90 * 24)); recordDeath(c, before - c.count); }

    // ── food depletion ∝ feeding population (eggs & dauer don't eat) ──
    let consumers = 0; for (const c of cohorts) if (c.stageId !== 'egg' && c.stageId !== 'dauer') consumers += c.count;
    food = Math.max(0, food - consumers * 0.0024 * dt);

    cohorts = mergeCohorts(cohorts);
  }
  return snaps;
}

function mergeCohorts(cohorts) {
  const out = {};
  for (const c of cohorts) {
    if (c.count <= 0.4) continue;
    const base = c.stageId === 'adult' ? `adult|${Math.round(c.adultAge / 24)}` : `${c.stageId}|${Math.round(c.age / 6)}`;
    const bucket = `${base}|${c.sex}|${c.typeKey}`;
    if (out[bucket]) {
      const o = out[bucket], tot = o.count + c.count;
      o.age = (o.age * o.count + c.age * c.count) / tot;
      o.adultAge = (o.adultAge * o.count + c.adultAge * c.count) / tot;
      o.count = tot;
    } else out[bucket] = { ...c };
  }
  return Object.values(out);
}

// ── Student · live plate view (current state from their logs, NO simulation) ───
let viewPC = null;
function plateNowState(p) {
  // The student's live plate view = the worms they actually put on it (each strain
  // its own colour, males striped, dumpy shorter). Food comes from their latest log.
  const sid = primaryStrainId(p), tempC = p.tempC || 20;
  const ws = plateWorms(p).filter(w => w.count > 0);
  let population = [], wormCount = 0, eggs = 0, food = p.inoculatedAt ? 100 : 100, stageId = 'l4';
  if (ws.length) {
    const live = ws.filter(w => w.stageId !== 'egg');
    population = live.map(w => ({
      stageId: ['l1', 'l2', 'l3', 'l4', 'young_adult', 'adult', 'dauer'].includes(w.stageId) ? w.stageId : 'adult',
      color: entryColor(w), count: w.count,
      male: entrySex(w) === 'male', dpy: entryDpy(w),
    }));
    wormCount = live.reduce((s, w) => s + w.count, 0);
    eggs = ws.filter(w => w.stageId === 'egg').reduce((s, w) => s + w.count, 0);
    stageId = (population[0]?.stageId) || 'adult';
  }
  return { sid, tempC, population, wormCount, eggs, food, stageId, hasData: ws.length > 0 };
}

function openPlateView(p) {
  closeView();
  const st = plateNowState(p);
  const ov = document.createElement('div'); ov.className = 'sim-ov'; ov.id = 'viewOv';
  ov.innerHTML = `<div class="sim-card">
    <div class="sim-head"><div><b>👁 ${esc(p.name)}</b>
      <div class="muted sm">${esc(p.strainLabel)} · ${p.tempC}°C${p.inoculatedAt ? ' · ' + fmtHours(elapsedHrs(p)) + ' elapsed' : ' · not inoculated'}</div></div>
      <button class="x" id="vClose">✕</button></div>
    <div class="sim-canvas-wrap"><canvas id="viewCanvas" width="300" height="300"></canvas></div>
    <div class="sim-stat">${st.hasData
      ? `${st.wormCount} worms · ${st.eggs} eggs`
      : 'No worms on this plate yet — add some with ＋ Worms.'}</div>
    <div class="muted sm" style="margin-top:8px">Live view of your plate, built from your latest logged observation. Tap the plate to zoom. (Students don't get the time simulation — that's a teacher tool.)</div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeView(); };
  $('vClose').onclick = closeView;
  viewPC = new PlateCanvas($('viewCanvas')); viewPC._noAutoSize = true; viewPC.start();
  viewPC.enableZoom($('viewCanvas').parentElement);
  viewPC.setState({
    plate: { id: p.id, inoculatedAt: p.inoculatedAt ? 1 : 0, strainId: st.sid },
    hrsElapsed: elapsedHrs(p), stage: stageObjFor(st.sid, p.tempC, st.stageId),
    foodPct: st.food, wormCount: st.wormCount, totalEggs: st.eggs, population: st.population,
  });
}
function closeView() { if (viewPC) { viewPC.stop(); viewPC = null; } $('viewOv')?.remove(); }

// ── Genetic crossing guide (dpy strains & N2) — shown to both roles ────────────
function openCrossGuide() {
  const ov = document.createElement('div'); ov.className = 'sim-ov';
  ov.innerHTML = `<div class="sim-card info">
    <div class="sim-head"><b>🧬 Genetic Crossing Guide</b><button class="x" id="xg">✕</button></div>
    <div class="muted sm">dpy-11 (e224, chr <b>V</b>) · dpy-13 (e184, chr <b>IV</b>) · N2 wild-type. Both Dpy mutations are <b>recessive</b>.</div>

    <div class="info-row"><b>0 · Why you need males</b><div>Hermaphrodites self-fertilize, so to combine two strains you must mate <b>♂ males of one strain × ♀ hermaphrodites of the other</b>. If the cross works, ~50% of the progeny are male (and for recessive markers the F1 are wild-type). All-hermaphrodite, all-Dumpy progeny = only selfing happened. <i>(This is why the app gives you a striped ♂ male of every strain.)</i></div></div>

    <div class="info-row"><b>1 · dpy × N2 — monohybrid (3:1)</b><div>
      P: <b>dpy/dpy ♀ × N2 (+/+) ♂</b><br>
      F1 cross-progeny: <b>dpy/+ → wild-type</b> (non-Dumpy) — shows dpy is recessive.<br>
      F1 self → F2: <b>3 wild-type : 1 Dumpy</b>. Pick a Dumpy F2 to recover a pure dpy line.</div></div>

    <div class="info-row"><b>2 · dpy-11 × dpy-13 — complementation + independent assortment (9:3:3:1)</b><div>
      They are <b>different genes on different chromosomes</b> (V vs IV).<br>
      P: <b>dpy-13/dpy-13 ♀ × dpy-11/dpy-11 ♂</b> (or the reciprocal).<br>
      F1: <b>dpy-11/+ ; dpy-13/+ → wild-type</b>. Two Dumpy parents → a non-Dumpy F1 = <b>COMPLEMENTATION</b> (proof they're separate genes; same-gene mutations would give a Dumpy F1).<br>
      F1 self → F2 (unlinked → independent assortment): <b>9 wild-type : 3 Dpy-11 : 3 Dpy-13 : 1 double mutant</b>. The 1/16 <b>dpy-11; dpy-13</b> double is extra-short/severe.</div></div>

    <div class="info-row"><b>3 · dpy as a mapping marker (two-factor)</b><div>A dpy with a known position is used as a <b>linked marker</b>: cross, self, then score the % of recombinant F2 → that percentage is the genetic distance in <b>cM</b>. dpy-11 (V) is a classic marker (e.g. strain MT464 = unc-5 IV, dpy-11 V, lon-2 X maps three chromosomes at once).</div></div>

    <div class="lockbox" style="border-color:#38bdf8;color:#7dd3fc;background:#0c2233">⚠ dpy-11 and dpy-13 are on <b>different chromosomes</b>, so they assort <b>independently</b> — you cannot map one relative to the other (no linkage between them).</div>

    <div class="info-row"><b>4 · Recessive vs dominant</b><div>
      dpy-11 and dpy-13 are <b>recessive, loss-of-function</b> mutations (they reduce a cuticle-collagen gene's function). A worm is Dumpy <b>only when homozygous</b> (m/m); a heterozygote (m/+) looks <b>wild-type</b> — the wild-type allele covers for the broken one. That's why a recessive mutation can hide for a generation and reappear at ¼ in the F2. (A <i>dominant</i> mutation would already show in the m/+ F1.)</div></div>

    <div class="info-row"><b>5 · Germline (heritable) vs somatic</b><div>
      These are <b>germline</b> mutations — changes in the genome carried in eggs and sperm, so they are passed to progeny (heritable). A <b>somatic</b> change (only in body cells, not the germ cells) would affect that one worm but <b>not</b> its offspring. Sex is set by the <b>X chromosome</b>: <b>XX → hermaphrodite</b>, <b>X0 → male</b>. A hermaphrodite makes its own sperm then oocytes, so it can self-fertilize; males make only sperm.</div></div>

    <div class="info-row"><b>6 · Reading the cross — F1 → F2 → F3, and the stats</b><div>
      <b>Self-progeny ≈ 100% hermaphrodite</b> (≈0% male); <b>cross-progeny ≈ 50% male</b>. So <b>seeing males in the progeny tells you the cross actually worked</b> (selfing alone gives almost no males). Generations: <b>P0</b> = the parents you put on; <b>F1</b> = their progeny; pick F1 onto a fresh plate to let them self → <b>F2</b> (the 3:1 / 9:3:3:1 ratios appear here); pick a chosen F2 → <b>F3</b>, and so on. Picking a <i>wild-type</i> F2 is uncertain — it may be homozygous +/+ <b>or</b> a m/+ carrier; its self-progeny (F3) reveal which. <i>(Use “🔬 Pick worms → next plate” to build each generation in the app.)</i></div></div>

    <div class="info-row"><b>Sources</b><div class="muted sm">
      Brenner S. 1974, <i>Genetics</i> 77:71–94 ·
      <a class="lnk" href="https://www.ncbi.nlm.nih.gov/books/NBK179229/" target="_blank" rel="noopener">WormBook — Classical genetic methods (Fay)</a> ·
      <a class="lnk" href="https://www.wormbook.org/chapters/www_introandbasics/introandbasics.html" target="_blank" rel="noopener">WormBook — Genetic mapping &amp; manipulation</a> ·
      <a class="lnk" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC556895/" target="_blank" rel="noopener">Johnstone — dpy-7 collagen mutations are recessive (PMC556895)</a> ·
      <a class="lnk" href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2859890/" target="_blank" rel="noopener">Outcrossing &amp; males in C. elegans (PMC2859890)</a> ·
      <a class="lnk" href="https://www.alliancegenome.org/gene/WB:WBGene00001073" target="_blank" rel="noopener">WormBase — dpy-11 (LG V)</a> · dpy-13 (LG IV, e184).
    </div></div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#xg').onclick = () => ov.remove();
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function stageObjFor(sid, tempC, stageId) {
  if (stageId === 'dauer') return { id: 'dauer', name: 'Dauer', icon: '💤', color: DAUER_COLOR };
  const so = getStages(sid, tempC).find(x => x.id === stageId);
  return so
    ? { id: so.id, name: so.name, icon: so.icon, color: so.color }
    : { id: stageId, name: stageLabel(stageId), icon: '🧬', color: (STRAINS[sid]?.color) || '#00d4aa' };
}
function elapsedHrs(p) { return p.inoculatedAt ? (Date.now() - p.inoculatedAt) / 3600000 : 0; }
function validStrain(id) { return STRAINS[id] ? id : 'N2'; }
function numOrNull(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function stageLabel(id) {
  const m = { egg: '🥚 Egg', l1: 'L1', l2: 'L2', l3: 'L3', l4: 'L4', young_adult: 'Young adult', adult: '🧬 Adult', dauer: '💤 Dauer', dead: '☠ Dead', '': '—' };
  return m[id] ?? (id || '—');
}

function showStrainInfo(strainId) {
  const s = STRAINS[strainId]; if (!s) return;
  const locked = state.role === 'student' && !isUnlockedForStudent(strainId);
  const ov = document.createElement('div');
  ov.className = 'sim-ov';
  ov.innerHTML = `<div class="sim-card info">
    <div class="sim-head"><b>${esc(s.label)}</b><button class="x" id="iClose">✕</button></div>
    ${locked ? '<div class="lockbox">🔒 Locked for students — reference only. You can read about it but can’t put it on a plate.</div>' : ''}
    <div class="info-row"><b>Phenotype</b><div>${esc(s.phenotype || '—')}</div></div>
    <div class="info-row"><b>Lifespan @20°C</b><div>${esc(s.lifespan20C || '—')}</div></div>
    <div class="info-row"><b>Dauer</b><div>${esc(s.dauerNotes || '—')}</div></div>
    <div class="info-row"><b>Notes</b><div>${esc(s.notes || '—')}</div></div>
    ${s.refs ? `<div class="info-row"><b>Sources</b><div class="muted sm">${esc(s.refs)}</div></div>` : ''}
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#iClose').onclick = () => ov.remove();
}

/** Downscale an image (File or dataURL) to a small JPEG dataURL for cloud storage. */
function downscale(src, maxDim = 200) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try { resolve(c.toDataURL('image/jpeg', 0.7)); } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    if (src instanceof Blob) { const r = new FileReader(); r.onload = e => img.src = e.target.result; r.readAsDataURL(src); }
    else img.src = src;
  });
}
