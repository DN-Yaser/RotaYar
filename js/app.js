import { load, save, uid, exportJSON, importJSON, emptyState } from './storage.js';
import { suggest } from './logic.js';
import { views } from './ui.js';
import { currentJalaliMonth, jalaliDate, periodKey, moveJalaliMonth, parseJalaliPeriod } from './calendar.js';

let state = load();
let tab = 'report';
let gid = state.groups[0]?.id;
let mid = '';
let q = '';
let proposal = null;
let installEvt = null;
let period = currentJalaliMonth();

// پیش‌نویس‌ها فقط در حافظه زنده صفحه نگهداری می‌شوند و هرگز در localStorage نیستند.
const drafts = Object.create(null);
const dirtyPeriods = new Set();
const $ = s => document.querySelector(s);
const group = id => state.groups.find(g => g.id === id);
const val = id => ($(id)?.value || '').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const currentPeriodKey = () => periodKey(period);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

function monthDraft(key = currentPeriodKey()) {
  if (!drafts[key]) drafts[key] = clone(state.records[key]?.groups || {});
  return drafts[key];
}

function monthlyGroup(sourceGroup, key = currentPeriodKey()) {
  if (!sourceGroup) return null;
  const all = monthDraft(key);
  const groupData = all[sourceGroup.id] || {};
  const meta = state.records[key]?.meta?.[sourceGroup.id];
  if (meta) {
    const memberMeta = [...(meta.members || [])];
    const knownMembers = new Set(memberMeta.map(member => member.id));
    sourceGroup.members.forEach(member => {
      if (!knownMembers.has(member.id)) memberMeta.push({ id: member.id, name: member.name });
    });
    const active = [...(meta.active || [])];
    sourceGroup.active.forEach(id => { if (!active.includes(id)) active.push(id); });
    const sections = [...(meta.sections || [])];
    const knownSections = new Set(sections.map(section => section.id));
    sourceGroup.active.forEach(id => {
      const section = state.sections.find(item => item.id === id);
      if (section && !knownSections.has(id)) sections.push({ id: section.id, name: section.name });
    });
    const members = memberMeta.map(member => ({
      ...member, counts: { ...(groupData[member.id] || {}) }
    }));
    return {
      group: { id: sourceGroup.id, name: meta.name || sourceGroup.name, active, members },
      sections: sections.length ? sections : state.sections.filter(s => active.includes(s.id))
    };
  }
  return {
    group: {
      ...sourceGroup,
      members: sourceGroup.members.map(member => ({
        ...member,
        counts: { ...(groupData[member.id] || {}) }
      }))
    },
    sections: state.sections
  };
}

function markDraftChanged(key = currentPeriodKey()) {
  dirtyPeriods.add(key);
}

function latestFinalizedAt() {
  return Object.values(state.records || {})
    .map(r => r.finalizedAt)
    .filter(value => value && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
}

function commit() {
  if (!save(state)) toast('ذخیره اطلاعات پایه انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.');
  render();
}

function render() {
  if (!group(gid)) gid = state.groups[0]?.id;
  const key = currentPeriodKey();
  const monthData = monthlyGroup(group(gid), key);
  if (!(monthData?.group?.members || []).some(m => m.id === mid)) mid = '';
  $('#view').innerHTML = views[tab]({
    state, gid, mid, q, proposal, period, periodKey: key,
    monthlyGroup: monthData?.group || null,
    monthSections: monthData?.sections || state.sections,
    dirty: dirtyPeriods.has(key),
    today: jalaliDate(new Date()),
    lastFinalizedAt: latestFinalizedAt(),
    canInstall: !!installEvt
  });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

function updateMonthlyCount(groupId, memberId, sectionId, delta) {
  const key = currentPeriodKey();
  const all = monthDraft(key);
  if (!all[groupId]) all[groupId] = {};
  if (!all[groupId][memberId]) all[groupId][memberId] = {};
  const oldValue = Number(all[groupId][memberId][sectionId] || 0);
  const nextValue = Math.max(0, oldValue + Number(delta));
  if (nextValue === oldValue) return;
  if (nextValue) all[groupId][memberId][sectionId] = nextValue;
  else delete all[groupId][memberId][sectionId];
  markDraftChanged(key);
  render();
}

const actions = {
  'add-group'() {
    const name = val('#newGroup'); if (!name) return;
    const g = { id: uid(), name, active: state.sections.map(s => s.id), members: [] };
    state.groups.push(g); gid = g.id; commit();
  },
  'del-group'(d) { if (confirm('این گروه از فهرست جاری حذف شود؟ سوابق ثبت نهایی‌شده ماه‌های قبل در خروجی باقی می‌مانند.')) { state.groups = state.groups.filter(g => g.id !== d.g); commit(); } },
  'add-members'(d) {
    const g = group(d.g);
    val('#mem-' + d.g).split(/[\n,،]+/).map(x => x.trim()).filter(Boolean)
      .forEach(name => g.members.push({ id: uid(), name, legacyTotals: {} }));
    commit();
  },
  'del-member'(d) { const g = group(d.g); g.members = g.members.filter(m => m.id !== d.m); commit(); },
  'reset-counts'(d) {
    if (!confirm('آمار ثبت‌نشده این گروه در ماه انتخاب‌شده صفر شود؟ برای اعمال در سوابق، ثبت نهایی ماه را بزنید.')) return;
    const key = currentPeriodKey();
    const all = monthDraft(key);
    all[d.g] = {};
    markDraftChanged(key);
    render();
  },
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
    if (!confirm('این بخش از تنظیمات جاری همه گروه‌ها حذف شود؟ سوابق ماه‌های ثبت نهایی‌شده در فایل خروجی حفظ می‌شوند.')) return;
    state.sections = state.sections.filter(s => s.id !== d.s);
    state.groups.forEach(g => { g.active = g.active.filter(id => id !== d.s); });
    commit();
  },
  cnt(d) { updateMonthlyCount(d.g, d.m, d.s, d.d); },
  'select-member'(d) { mid = d.m; render(); document.querySelector('.entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'nav-member'(d) {
    const list = [...(monthlyGroup(group(gid))?.group?.members || [])].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    if (!list.length) return;
    const i = list.findIndex(m => m.id === mid);
    mid = list[(i + Number(d.d) + list.length) % list.length].id; render();
  },
  'make-proposal'() {
    const monthData = monthlyGroup(group(gid));
    const g = monthData?.group;
    proposal = { gid, map: suggest(g, (monthData?.sections || []).filter(s => g?.active.includes(s.id))) };
    render();
  },
  'apply-proposal'() {
    if (!proposal || proposal.gid !== gid) return;
    const key = currentPeriodKey();
    const all = monthDraft(key);
    if (!all[gid]) all[gid] = {};
    Object.entries(proposal.map).forEach(([memberId, sectionId]) => {
      if (!all[gid][memberId]) all[gid][memberId] = {};
      all[gid][memberId][sectionId] = Number(all[gid][memberId][sectionId] || 0) + 1;
    });
    if (Object.keys(proposal.map).length) markDraftChanged(key);
    proposal = null; tab = 'report'; render();
    toast('چرخش به‌صورت پیش‌نویس ثبت شد؛ برای ذخیره در خروجی، ثبت نهایی ماه را بزنید.');
  },
  'month-nav'(d) {
    period = moveJalaliMonth(period, Number(d.d));
    proposal = null; mid = ''; render();
  },
  'jump-period'() {
    const selected = parseJalaliPeriod(val('#jumpYear'), val('#jumpMonth'));
    if (!selected) { toast('سال یا ماه شمسی معتبر نیست.'); return; }
    period = selected; proposal = null; mid = ''; render();
  },
  'finalize-period'() {
    const key = currentPeriodKey();
    if (!dirtyPeriods.has(key)) { toast('تغییر ثبت‌نشده‌ای برای ذخیره وجود ندارد.'); return; }
    if (!confirm(`اطلاعات ماه ${key.replace('-', '/') } به‌صورت نهایی ذخیره شود؟ پس از تأیید، در حافظه مرورگر و خروجی JSON قرار می‌گیرد.`)) return;
    const previous = state.records[key];
    const meta = clone(previous?.meta || {});
    for (const currentGroup of state.groups) {
      if (!meta[currentGroup.id]) {
        meta[currentGroup.id] = {
          name: currentGroup.name,
          active: [...currentGroup.active],
          sections: state.sections.filter(section => currentGroup.active.includes(section.id)).map(section => ({ id: section.id, name: section.name })),
          members: currentGroup.members.map(member => ({ id: member.id, name: member.name }))
        };
      } else {
        const knownMembers = new Set((meta[currentGroup.id].members || []).map(member => member.id));
        currentGroup.members.forEach(member => {
          if (!knownMembers.has(member.id)) meta[currentGroup.id].members.push({ id: member.id, name: member.name });
        });
        const knownSections = new Set((meta[currentGroup.id].sections || []).map(section => section.id));
        currentGroup.active.forEach(sectionId => {
          if (!meta[currentGroup.id].active.includes(sectionId)) meta[currentGroup.id].active.push(sectionId);
          const section = state.sections.find(item => item.id === sectionId);
          if (section && !knownSections.has(sectionId)) meta[currentGroup.id].sections.push({ id: section.id, name: section.name });
        });
      }
    }
    state.records[key] = { finalizedAt: new Date().toISOString(), groups: clone(monthDraft(key)), meta };
    if (!save(state)) {
      if (previous) state.records[key] = previous;
      else delete state.records[key];
      toast('ثبت نهایی انجام نشد؛ ذخیره‌سازی مرورگر در دسترس نیست.');
      return;
    }
    delete drafts[key];
    dirtyPeriods.delete(key);
    render();
    toast('اطلاعات این ماه با موفقیت ثبت نهایی شد.');
  },
  export() { exportJSON(state); },
  import() { $('#file').click(); },
  'reset-all'() {
    if (confirm('همه تنظیمات و سوابق ثبت نهایی‌شده پاک شود؟ ابتدا خروجی JSON بگیرید.')) {
      state = emptyState(); gid = undefined;
      Object.keys(drafts).forEach(k => delete drafts[k]); dirtyPeriods.clear(); commit();
    }
  },
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
  'set-prop'(d, el) { if (proposal) proposal.map[d.m] = el.value; }
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
  const hits = [...(monthlyGroup(group(gid))?.group?.members || [])].filter(m => m.name.includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  if (q && hits.length) mid = hits[0].id;
  render();
  const f = $('#memFilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length);
});
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const s = await importJSON(f);
    if (!confirm('تنظیمات و سوابق ثبت نهایی‌شده فعلی با فایل جایگزین شوند؟')) return;
    state = s; gid = s.groups[0]?.id; mid = ''; q = ''; proposal = null;
    Object.keys(drafts).forEach(k => delete drafts[k]); dirtyPeriods.clear();
    commit(); toast('داده‌های فایل وارد شد');
  } catch { toast('فایل نامعتبر است'); }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
