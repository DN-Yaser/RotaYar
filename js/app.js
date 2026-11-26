import { load, save, uid, exportJSON, importJSON, emptyState } from './storage.js';
import { suggest } from './logic.js';
import { views } from './ui.js';

let state = load();
let tab = 'report';
let gid = state.groups[0]?.id;
let mid = '';
let q = '';
let proposal = null;
let installEvt = null;

const $ = s => document.querySelector(s);
const group = id => state.groups.find(g => g.id === id);
const val = id => ($(id)?.value || '').trim();

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
function commit() { save(state); render(); }
function render() {
  if (!group(gid)) gid = state.groups[0]?.id;
  if (!group(gid)?.members.some(m => m.id === mid)) mid = '';
  $('#view').innerHTML = views[tab]({ state, gid, mid, q, proposal, canInstall: !!installEvt });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

const actions = {
  'add-group'() {
    const name = val('#newGroup'); if (!name) return;
    const g = { id: uid(), name, active: state.sections.map(s => s.id), members: [] };
    state.groups.push(g); gid = g.id; commit();
  },
  'del-group'(d) { if (confirm('این گروه و آمارش حذف شود؟')) { state.groups = state.groups.filter(g => g.id !== d.g); commit(); } },
  'add-members'(d) {
    const g = group(d.g);
    val('#mem-' + d.g).split(/[\n,،]+/).map(x => x.trim()).filter(Boolean)
      .forEach(name => g.members.push({ id: uid(), name, counts: {} }));
    commit();
  },
  'del-member'(d) { const g = group(d.g); g.members = g.members.filter(m => m.id !== d.m); commit(); },
  'reset-counts'(d) { if (confirm('آمار چرخش همه اعضای این گروه صفر شود؟')) { group(d.g).members.forEach(m => m.counts = {}); commit(); } },
  'add-section'() {
    const name = val('#newSec'); if (!name) return;
    const s = { id: uid(), name }; state.sections.push(s);
    state.groups.forEach(g => g.active.push(s.id)); commit();
  },
  'seed-sections'() {
    ['تریاژ', 'احیا', 'بخش سرپایی', 'مشاهده'].forEach(name => {
      const s = { id: uid(), name }; state.sections.push(s); state.groups.forEach(g => g.active.push(s.id));
    }); commit();
  },
  'del-section'(d) {
    if (!confirm('این بخش از همه گروه‌ها حذف شود؟')) return;
    state.sections = state.sections.filter(s => s.id !== d.s);
    state.groups.forEach(g => { g.active = g.active.filter(id => id !== d.s); g.members.forEach(m => delete m.counts[d.s]); });
    commit();
  },
  cnt(d) {
    const m = group(d.g).members.find(x => x.id === d.m);
    m.counts[d.s] = Math.max(0, (m.counts[d.s] || 0) + Number(d.d)); commit();
  },
  'select-member'(d) { mid = d.m; render(); document.querySelector('.entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'nav-member'(d) {
    const list = [...group(gid).members].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    if (!list.length) return;
    const i = list.findIndex(m => m.id === mid);
    mid = list[(i + Number(d.d) + list.length) % list.length].id; render();
  },
  'make-proposal'() { proposal = { gid, map: suggest(group(gid), state.sections) }; render(); },
  'apply-proposal'() {
    group(gid).members.forEach(m => { const s = proposal.map[m.id]; if (s) m.counts[s] = (m.counts[s] || 0) + 1; });
    proposal = null; tab = 'report'; commit(); toast('چرخش ثبت شد');
  },
  export() { exportJSON(state); },
  import() { $('#file').click(); },
  'reset-all'() { if (confirm('همه داده‌ها پاک شود؟ (ابتدا خروجی JSON بگیرید)')) { state = emptyState(); gid = undefined; commit(); } },
  async install() { installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); }
};

const changes = {
  'pick-group'(d, el) { gid = el.value; mid = ''; q = ''; proposal = null; render(); },
  'pick-member'(d, el) { mid = el.value; render(); },
  'rename-group'(d, el) { const n = el.value.trim(); if (n) group(d.g).name = n; commit(); },
  'rename-section'(d, el) { const n = el.value.trim(); const s = state.sections.find(x => x.id === d.s); if (n) s.name = n; commit(); },
  'toggle-sec'(d, el) {
    const g = group(d.g); g.active = g.active.filter(id => id !== d.s);
    if (el.checked) g.active.push(d.s); commit();
  },
  'set-prop'(d, el) { proposal.map[d.m] = el.value; }
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (t) return actions[t.dataset.act]?.(t.dataset, t);
  const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); scrollTo(0, 0); }
});
document.addEventListener('change', e => {
  const t = e.target.closest('[data-change]'); if (t) changes[t.dataset.change]?.(t.dataset, t);
});
// جستجوی زنده‌ی نام: منوی کشویی فیلتر و اولین نتیجه انتخاب می‌شود
document.addEventListener('input', e => {
  if (e.target.id !== 'memFilter') return;
  q = e.target.value.trim();
  const hits = [...group(gid).members].filter(m => m.name.includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  if (q && hits.length) mid = hits[0].id;
  render();
  const f = $('#memFilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length);
});
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const s = await importJSON(f);
    if (!confirm('داده‌های فعلی با فایل جایگزین شوند؟')) return;
    state = s; gid = s.groups[0]?.id; commit(); toast('داده‌ها وارد شد');
  } catch { toast('فایل نامعتبر است'); }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
