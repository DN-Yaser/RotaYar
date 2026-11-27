const KEY = 'rotayar.v2';
const LEGACY_KEY = 'rotayar.v1';
export const uid = () => Math.random().toString(36).slice(2, 9);
export const emptyState = () => ({ version: 3, sections: [], groups: [], records: {} });

const cleanCounts = value => Object.fromEntries(Object.entries(value || {}).map(([key, count]) => [
  String(key), Math.max(0, Number.parseInt(count, 10) || 0)
]));

const uniqueIds = values => [...new Set((Array.isArray(values) ? values : []).map(String))];

// پاک‌سازی و مهاجرت داده‌ها؛ داده‌های ماه‌های قبلی با اولویت پیش‌فرض همه بخش‌های فعال حفظ می‌شوند.
export function normalize(raw) {
  if (!raw || !Array.isArray(raw.groups) || !Array.isArray(raw.sections)) throw new Error('ساختار فایل معتبر نیست');
  const sections = raw.sections
    .map(section => ({ id: String(section.id || uid()), name: String(section.name || '').trim() }))
    .filter(section => section.name);
  const sectionIds = new Set(sections.map(section => section.id));
  const oldVersion = Number(raw.version || 1) < 2;

  const groups = raw.groups.map(group => {
    const active = uniqueIds(group.active).filter(id => sectionIds.has(id));
    const configuredPriority = Array.isArray(group.prioritySections)
      ? uniqueIds(group.prioritySections).filter(id => active.includes(id))
      : [...active];
    return {
      id: String(group.id || uid()),
      name: String(group.name || 'گروه').trim(),
      active,
      // اگر آرایه اولویت در نسخه قدیمی وجود نداشته، تمام بخش‌های فعال به ترتیب موجود اولویت می‌گیرند.
      prioritySections: configuredPriority.length || !active.length ? configuredPriority : [...active],
      priorityWeights: group.priorityWeights && typeof group.priorityWeights === 'object' ? group.priorityWeights : {},
      members: (Array.isArray(group.members) ? group.members : []).map(member => ({
        id: String(member.id || uid()),
        name: String(member.name || '').trim(),
        legacyTotals: cleanCounts(member.legacyTotals || (oldVersion ? member.counts : {}))
      })).filter(member => member.name)
    };
  });

  const records = {};
  for (const [key, value] of Object.entries(raw.records || {})) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key) || !value || typeof value !== 'object') continue;
    const groupsData = {};
    for (const [groupId, members] of Object.entries(value.groups || {})) {
      if (!members || typeof members !== 'object') continue;
      groupsData[String(groupId)] = {};
      for (const [memberId, counts] of Object.entries(members)) {
        groupsData[String(groupId)][String(memberId)] = cleanCounts(counts);
      }
    }

    const meta = {};
    for (const [groupId, item] of Object.entries(value.meta || {})) {
      if (!item || typeof item !== 'object') continue;
      const active = uniqueIds(item.active);
      const configuredPriority = Array.isArray(item.prioritySections)
        ? uniqueIds(item.prioritySections).filter(id => active.includes(id))
        : [...active];
      meta[String(groupId)] = {
        name: String(item.name || 'گروه'),
        active,
        prioritySections: configuredPriority.length || !active.length ? configuredPriority : [...active],
        priorityWeights: item.priorityWeights && typeof item.priorityWeights === 'object' ? item.priorityWeights : {},
        sections: (Array.isArray(item.sections) ? item.sections : []).map(section => ({
          id: String(section.id || ''), name: String(section.name || '').trim()
        })).filter(section => section.id && section.name),
        members: (Array.isArray(item.members) ? item.members : []).map(member => ({
          id: String(member.id || ''), name: String(member.name || '').trim()
        })).filter(member => member.id && member.name)
      };
    }

    records[key] = {
      finalizedAt: typeof value.finalizedAt === 'string' ? value.finalizedAt : '',
      groups: groupsData,
      meta
    };
  }
  return { version: 3, sections, groups, records };
}

export function load() {
  try {
    const current = localStorage.getItem(KEY);
    if (current) return normalize(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normalize(JSON.parse(legacy));
      try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch { /* مهاجرت در حافظه ادامه می‌یابد */ }
      return migrated;
    }
  } catch { /* حافظه مسدود یا داده نامعتبر */ }
  return emptyState();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 3 }));
    return true;
  } catch {
    return false;
  }
}

// state فقط شامل تنظیمات پایه و داده‌های ثبت نهایی است؛ پیش‌نویس‌های موقت صادر نمی‌شوند.
export function exportJSON(state) {
  const clean = normalize({ ...state, version: 3 });
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `rotayar-final-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

export async function importJSON(file) {
  return normalize(JSON.parse(await file.text()));
}
