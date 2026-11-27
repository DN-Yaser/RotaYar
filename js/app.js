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

// پیش‌نویس آمار و فراداده هر ماه فقط در حافظه زنده صفحه نگهداری می‌شود.
const drafts = Object.create(null);
const metaDrafts = Object.create(null);
const dirtyPeriods = new Set();
const $ = selector => document.querySelector(selector);
const group = id => state.groups.find(item => item.id === id);
const val = id => ($(id)?.value || '').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const currentPeriodKey = () => periodKey(period);
const isFinalized = key => !!state.records[key]?.finalizedAt;

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 3000);
}

function normalizePriority(active, priority) {
  const allowed = new Set(active || []);
  const ordered = [...new Set((Array.isArray(priority) ? priority : []).map(String))]
    .filter(id => allowed.has(id));
  // اگر بخش فعالی وجود دارد، حداقل یک بخش باید در اولویت‌بندی حضور داشته باشد.
  return ordered.length || !active?.length ? ordered : [active[0]];
}

function monthDraft(key = currentPeriodKey()) {
  if (!drafts[key]) drafts[key] = clone(state.records[key]?.groups || {});
  return drafts[key];
}

function monthMetaDraft(key = currentPeriodKey()) {
  if (!metaDrafts[key]) metaDrafts[key] = clone(state.records[key]?.meta || {});
  return metaDrafts[key];
}

function markDraftChanged(key = currentPeriodKey()) {
  dirtyPeriods.add(key);
}

function buildGroupMeta(sourceGroup) {
  return {
    name: sourceGroup.name,
    active: [...sourceGroup.active],
    prioritySections: normalizePriority(sourceGroup.active, sourceGroup.prioritySections),
    priorityWeights: { ...(sourceGroup.priorityWeights || {}) },
    sections: state.sections
      .filter(section => sourceGroup.active.includes(section.id))
      .map(section => ({ id: section.id, name: section.name })),
    members: sourceGroup.members.map(member => ({ id: member.id, name: member.name }))
  };
}

function ensureMonthGroupMeta(sourceGroup, key = currentPeriodKey()) {
  const metadata = monthMetaDraft(key);
  if (!metadata[sourceGroup.id]) metadata[sourceGroup.id] = buildGroupMeta(sourceGroup);
  const item = metadata[sourceGroup.id];
  item.active = Array.isArray(item.active) ? [...item.active] : [...sourceGroup.active];
  item.prioritySections = normalizePriority(item.active, item.prioritySections ?? item.active);
  item.priorityWeights = item.priorityWeights && typeof item.priorityWeights === 'object' ? item.priorityWeights : {};
  item.sections = Array.isArray(item.sections) ? item.sections : [];
  item.members = Array.isArray(item.members) ? item.members : [];
  return item;
}

function monthlyGroup(sourceGroup, key = currentPeriodKey()) {
  if (!sourceGroup) return null;
  const groupData = monthDraft(key)[sourceGroup.id] || {};
  const metadata = monthMetaDraft(key)[sourceGroup.id];

  if (metadata) {
    const memberMeta = [...(metadata.members || [])];
    const knownMembers = new Set(memberMeta.map(member => member.id));
    sourceGroup.members.forEach(member => {
      if (!knownMembers.has(member.id)) memberMeta.push({ id: member.id, name: member.name });
    });

    const active = [...(metadata.active || [])];
    const historicalSections = [...(metadata.sections || [])];
    const sectionMap = new Map();
    historicalSections.forEach(section => sectionMap.set(section.id, section));
    state.sections.forEach(section => {
      if (!sectionMap.has(section.id)) sectionMap.set(section.id, { id: section.id, name: section.name });
    });

    const prioritySections = normalizePriority(active, metadata.prioritySections ?? active);
    const members = memberMeta.map(member => ({
      ...member,
      counts: { ...(groupData[member.id] || {}) }
    }));
    return {
      group: {
        id: sourceGroup.id,
        name: metadata.name || sourceGroup.name,
        active,
        prioritySections,
        priorityWeights: { ...(metadata.priorityWeights || {}) },
        members
      },
      sections: [...sectionMap.values()]
    };
  }

  return {
    group: {
      ...sourceGroup,
      prioritySections: normalizePriority(sourceGroup.active, sourceGroup.prioritySections),
      priorityWeights: { ...(sourceGroup.priorityWeights || {}) },
      members: sourceGroup.members.map(member => ({
        ...member,
        counts: { ...(groupData[member.id] || {}) }
      }))
    },
    sections: state.sections
  };
}

function latestFinalizedAt() {
  return Object.values(state.records || {})
    .map(record => record.finalizedAt)
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
  const selectedMonth = monthlyGroup(group(gid), key);
  if (!(selectedMonth?.group?.members || []).some(member => member.id === mid)) mid = '';
  const groupConfigs = state.groups.map(sourceGroup => monthlyGroup(sourceGroup, key));

  $('#view').innerHTML = views[tab]({
    state,
    gid,
    mid,
    q,
    proposal,
    period,
    periodKey: key,
    monthlyGroup: selectedMonth?.group || null,
    monthSections: selectedMonth?.sections || state.sections,
    groupConfigs,
    dirty: dirtyPeriods.has(key),
    historicalMode: isFinalized(key),
    today: jalaliDate(new Date()),
    lastFinalizedAt: latestFinalizedAt(),
    canInstall: !!installEvt
  });
  document.querySelectorAll('#tabs button').forEach(button => {
    button.classList.toggle('on', button.dataset.tab === tab);
  });
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

/**
 * تنظیمات ماه ثبت‌نشده، الگوی جاری گروه است و در تنظیمات پایه ذخیره می‌شود.
 * تنظیمات یک ماه ثبت‌شده فقط در فراداده همان ماه پیش‌نویس شده و با ثبت نهایی اعمال می‌شود.
 */
function editGroupConfig(groupId, updater) {
  const sourceGroup = group(groupId);
  if (!sourceGroup) return;
  const key = currentPeriodKey();

  if (isFinalized(key)) {
    const metadata = ensureMonthGroupMeta(sourceGroup, key);
    if (updater(metadata, true) === false) { render(); return; }
    metadata.active = [...new Set(metadata.active || [])];
    metadata.prioritySections = normalizePriority(metadata.active, metadata.prioritySections);
    markDraftChanged(key);
    proposal = null;
    render();
    return;
  }

  if (updater(sourceGroup, false) === false) { render(); return; }
  sourceGroup.active = [...new Set(sourceGroup.active || [])];
  sourceGroup.prioritySections = normalizePriority(sourceGroup.active, sourceGroup.prioritySections);
  markDraftChanged(key);
  proposal = null;
  commit();
}

function addSectionToMeta(meta, sectionId) {
  const existing = (meta.sections || []).some(section => section.id === sectionId);
  if (existing) return;
  const section = state.sections.find(item => item.id === sectionId);
  if (section) meta.sections.push({ id: section.id, name: section.name });
}

const actions = {
  'add-group'() {
    const name = val('#newGroup');
    if (!name) return;
    const active = state.sections.map(section => section.id);
    const newGroup = {
      id: uid(), name, active, prioritySections: [...active], priorityWeights: {}, members: []
    };
    state.groups.push(newGroup);
    gid = newGroup.id;
    commit();
  },
  'del-group'(data) {
    if (!confirm('این گروه از فهرست جاری حذف شود؟ سوابق ثبت نهایی‌شده ماه‌های قبل در خروجی باقی می‌مانند.')) return;
    state.groups = state.groups.filter(item => item.id !== data.g);
    commit();
  },
  'add-members'(data) {
    const selectedGroup = group(data.g);
    if (!selectedGroup) return;
    val('#mem-' + data.g).split(/[\n,،]+/).map(name => name.trim()).filter(Boolean)
      .forEach(name => selectedGroup.members.push({ id: uid(), name, legacyTotals: {} }));
    commit();
  },
  'del-member'(data) {
    const selectedGroup = group(data.g);
    if (!selectedGroup) return;
    selectedGroup.members = selectedGroup.members.filter(member => member.id !== data.m);
    commit();
  },
  'reset-counts'(data) {
    if (!confirm('آمار ثبت‌نشده این گروه در ماه انتخاب‌شده صفر شود؟ برای اعمال در سوابق، ثبت نهایی ماه را بزنید.')) return;
    const key = currentPeriodKey();
    monthDraft(key)[data.g] = {};
    markDraftChanged(key);
    render();
  },
  'add-section'() {
    const name = val('#newSec');
    if (!name) return;
    const section = { id: uid(), name };
    state.sections.push(section);
    state.groups.forEach(item => {
      item.active.push(section.id);
      item.prioritySections = normalizePriority(item.active, [...(item.prioritySections || []), section.id]);
    });
    commit();
  },
  'seed-sections'() {
    ['تریاژ', 'احیا', 'بخش سرپایی', 'مشاهده'].forEach(name => {
      const section = { id: uid(), name };
      state.sections.push(section);
      state.groups.forEach(item => {
        item.active.push(section.id);
        item.prioritySections = normalizePriority(item.active, [...(item.prioritySections || []), section.id]);
      });
    });
    commit();
  },
  'del-section'(data) {
    if (!confirm('این بخش از تنظیمات جاری همه گروه‌ها حذف شود؟ سوابق ثبت نهایی‌شده ماه‌های قبل حفظ می‌شوند.')) return;
    state.sections = state.sections.filter(section => section.id !== data.s);
    state.groups.forEach(item => {
      item.active = item.active.filter(id => id !== data.s);
      item.prioritySections = (item.prioritySections || []).filter(id => id !== data.s);
    });
    commit();
  },
  cnt(data) { updateMonthlyCount(data.g, data.m, data.s, data.d); },
  'select-member'(data) {
    mid = data.m;
    render();
    document.querySelector('.entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'nav-member'(data) {
    const members = [...(monthlyGroup(group(gid))?.group?.members || [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    if (!members.length) return;
    const index = members.findIndex(member => member.id === mid);
    mid = members[(index + Number(data.d) + members.length) % members.length].id;
    render();
  },
  'make-proposal'() {
    const monthData = monthlyGroup(group(gid));
    const selectedGroup = monthData?.group;
    proposal = {
      gid,
      map: suggest(selectedGroup, (monthData?.sections || []).filter(section => selectedGroup?.active.includes(section.id)))
    };
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
    proposal = null;
    tab = 'report';
    render();
    toast('چرخش به‌صورت پیش‌نویس ثبت شد؛ برای ذخیره در خروجی، ثبت نهایی ماه را بزنید.');
  },
  'month-nav'(data) {
    period = moveJalaliMonth(period, Number(data.d));
    proposal = null;
    mid = '';
    render();
  },
  'jump-period'() {
    const selected = parseJalaliPeriod(val('#jumpYear'), val('#jumpMonth'));
    if (!selected) { toast('سال یا ماه شمسی معتبر نیست.'); return; }
    period = selected;
    proposal = null;
    mid = '';
    render();
  },
  'finalize-period'() {
    const key = currentPeriodKey();
    if (!dirtyPeriods.has(key)) { toast('تغییر ثبت‌نشده‌ای برای ذخیره وجود ندارد.'); return; }
    const monthMeta = monthMetaDraft(key);
    if (!confirm(`اطلاعات و تنظیمات اولویت ماه ${key.replace('-', '/')} به‌صورت نهایی ذخیره شود؟`)) return;

    const previous = state.records[key];
    const meta = clone(monthMeta);
    for (const currentGroup of state.groups) {
      if (!meta[currentGroup.id]) meta[currentGroup.id] = buildGroupMeta(currentGroup);
      const item = meta[currentGroup.id];
      item.active = Array.isArray(item.active) ? [...item.active] : [...currentGroup.active];
      item.prioritySections = normalizePriority(item.active, item.prioritySections ?? currentGroup.prioritySections);
      item.priorityWeights = item.priorityWeights && typeof item.priorityWeights === 'object' ? item.priorityWeights : { ...(currentGroup.priorityWeights || {}) };
      item.sections = Array.isArray(item.sections) ? item.sections : [];
      item.members = Array.isArray(item.members) ? item.members : [];

      const knownMembers = new Set(item.members.map(member => member.id));
      currentGroup.members.forEach(member => {
        if (!knownMembers.has(member.id)) item.members.push({ id: member.id, name: member.name });
      });

      const knownSections = new Set(item.sections.map(section => section.id));
      item.active.forEach(sectionId => {
        if (knownSections.has(sectionId)) return;
        const section = state.sections.find(candidate => candidate.id === sectionId);
        if (section) item.sections.push({ id: section.id, name: section.name });
      });
    }

    state.records[key] = {
      finalizedAt: new Date().toISOString(),
      groups: clone(monthDraft(key)),
      meta
    };
    if (!save(state)) {
      if (previous) state.records[key] = previous;
      else delete state.records[key];
      toast('ثبت نهایی انجام نشد؛ ذخیره‌سازی مرورگر در دسترس نیست.');
      return;
    }

    delete drafts[key];
    delete metaDrafts[key];
    dirtyPeriods.delete(key);
    render();
    toast('اطلاعات و تنظیمات اولویت این ماه با موفقیت ثبت نهایی شد.');
  },
  export() { exportJSON(state); },
  import() { $('#file').click(); },
  'reset-all'() {
    if (!confirm('همه تنظیمات و سوابق ثبت نهایی‌شده پاک شود؟ ابتدا خروجی JSON بگیرید.')) return;
    state = emptyState();
    gid = undefined;
    Object.keys(drafts).forEach(key => delete drafts[key]);
    Object.keys(metaDrafts).forEach(key => delete metaDrafts[key]);
    dirtyPeriods.clear();
    commit();
  },
  async install() {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    render();
  },
  'edit-record-priority'(data) {
    const [year, month] = String(data.p || '').split('-').map(Number);
    const selected = parseJalaliPeriod(year, month);
    if (!selected) return;
    period = selected;
    tab = 'groups';
    proposal = null;
    render();
    scrollTo(0, 0);
  },
  'move-priority'(data) {
    const selectedGroup = group(data.g);
    if (!selectedGroup) return;
    editGroupConfig(data.g, (config, historical) => {
      const active = config.active || [];
      const order = normalizePriority(active, config.prioritySections ?? active);
      const from = order.indexOf(data.s);
      const to = from + Number(data.d);
      if (from < 0 || to < 0 || to >= order.length) return false;
      [order[from], order[to]] = [order[to], order[from]];
      config.prioritySections = order;
    });
  }
};

const changes = {
  'pick-group'(data, element) { gid = element.value; mid = ''; q = ''; proposal = null; render(); },
  'pick-member'(data, element) { mid = element.value; render(); },
  'rename-group'(data, element) {
    const name = element.value.trim();
    if (name) group(data.g).name = name;
    commit();
  },
  'rename-section'(data, element) {
    const name = element.value.trim();
    const section = state.sections.find(item => item.id === data.s);
    if (name && section) section.name = name;
    commit();
  },
  'toggle-sec'(data, element) {
    editGroupConfig(data.g, (config, historical) => {
      const active = [...(config.active || [])].filter(id => id !== data.s);
      if (element.checked) active.push(data.s);
      config.active = [...new Set(active)];
      if (historical) addSectionToMeta(config, data.s);

      let priority = [...(config.prioritySections || config.active.filter(id => id !== data.s))]
        .filter(id => config.active.includes(id));
      if (element.checked && !priority.includes(data.s)) priority.push(data.s);
      if (!element.checked && !priority.length && config.active.length) priority = [config.active[0]];
      config.prioritySections = priority;
    });
  },
  'toggle-priority'(data, element) {
    editGroupConfig(data.g, config => {
      const active = config.active || [];
      let order = normalizePriority(active, config.prioritySections ?? active);
      if (element.checked) {
        if (!order.includes(data.s)) order.push(data.s);
      } else {
        if (order.length <= 1) {
          toast('برای فعال ماندن پیشنهاد چرخش، حداقل یک بخش باید در اولویت‌بندی باشد.');
          return false;
        }
        order = order.filter(id => id !== data.s);
      }
      config.prioritySections = order;
    });
  },
  'set-priority-weight'(data, element) {
    const value = Number(element.value);
    if (!Number.isFinite(value) || value <= 0) { toast('وزن باید عددی بزرگ‌تر از صفر باشد.'); render(); return; }
    editGroupConfig(data.g, config => {
      config.priorityWeights = { ...(config.priorityWeights || {}), [data.s]: value };
    });
  },
  'set-prop'(data, element) { if (proposal) proposal.map[data.m] = element.value; }
};

document.addEventListener('click', event => {
  // باز و بسته کردن منوی اولویت نباید باعث انتخاب ردیف و بازترسیم کل گزارش شود.
  const priorityMenu = event.target.closest('.priority-dropdown');
  if (priorityMenu) {
    if (event.target.closest('summary') && !priorityMenu.open) {
      document.querySelectorAll('.priority-dropdown[open]').forEach(menu => {
        if (menu !== priorityMenu) menu.removeAttribute('open');
      });
    }
    return;
  }
  const actionElement = event.target.closest('[data-act]');
  if (actionElement) return actions[actionElement.dataset.act]?.(actionElement.dataset, actionElement);
  const tabElement = event.target.closest('[data-tab]');
  if (tabElement) {
    tab = tabElement.dataset.tab;
    render();
    scrollTo(0, 0);
  }
});

document.addEventListener('change', event => {
  const changeElement = event.target.closest('[data-change]');
  if (changeElement) changes[changeElement.dataset.change]?.(changeElement.dataset, changeElement);
});

// جستجوی زنده‌ی نام: منوی کشویی فیلتر و اولین نتیجه انتخاب می‌شود.
document.addEventListener('input', event => {
  if (event.target.id !== 'memFilter') return;
  q = event.target.value.trim();
  const hits = [...(monthlyGroup(group(gid))?.group?.members || [])]
    .filter(member => member.name.includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  if (q && hits.length) mid = hits[0].id;
  render();
  const filter = $('#memFilter');
  filter.focus();
  filter.setSelectionRange(filter.value.length, filter.value.length);
});

$('#file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const imported = await importJSON(file);
    if (!confirm('تنظیمات و سوابق ثبت نهایی‌شده فعلی با فایل جایگزین شوند؟')) return;
    state = imported;
    gid = imported.groups[0]?.id;
    mid = '';
    q = '';
    proposal = null;
    Object.keys(drafts).forEach(key => delete drafts[key]);
    Object.keys(metaDrafts).forEach(key => delete metaDrafts[key]);
    dirtyPeriods.clear();
    commit();
    toast('داده‌های فایل وارد شد.');
  } catch {
    toast('فایل نامعتبر است.');
  }
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installEvt = event;
  render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
