const KEY = 'rotayar.v2';
const LEGACY_KEY = 'rotayar.v1';
export const uid = () => Math.random().toString(36).slice(2, 9);
export const emptyState = () => ({ version: 2, sections: [], groups: [], records: {} });

const cleanCounts = value => Object.fromEntries(Object.entries(value || {}).map(([k, v]) => [
  String(k), Math.max(0, Number.parseInt(v, 10) || 0)
]));

// پاک‌سازی و اعتبارسنجی داده‌های ورودی و حفظ ساختار نسخه قبلی
export function normalize(raw) {
  if (!raw || !Array.isArray(raw.groups) || !Array.isArray(raw.sections)) throw new Error('ساختار فایل معتبر نیست');
  const sections = raw.sections.map(s => ({ id: String(s.id || uid()), name: String(s.name || '').trim() })).filter(s => s.name);
  const ids = new Set(sections.map(s => s.id));
  const oldVersion = Number(raw.version || 1) < 2;
  const groups = raw.groups.map(g => ({
    id: String(g.id || uid()),
    name: String(g.name || 'گروه').trim(),
    active: (Array.isArray(g.active) ? g.active : []).map(String).filter(id => ids.has(id)),
    members: (Array.isArray(g.members) ? g.members : []).map(m => ({
      id: String(m.id || uid()),
      name: String(m.name || '').trim(),
      // آمار نسخه قبلی تاریخ ندارد؛ آن را جدا نگه می‌داریم تا به ماهی اشتباه نسبت داده نشود.
      legacyTotals: cleanCounts(m.legacyTotals || (oldVersion ? m.counts : {}))
    })).filter(m => m.name)
  }));

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
      meta[String(groupId)] = {
        name: String(item.name || 'گروه'),
        active: Array.isArray(item.active) ? item.active.map(String) : [],
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
  return { version: 2, sections, groups, records };
}

export function load() {
  try {
    const current = localStorage.getItem(KEY);
    if (current) return normalize(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normalize(JSON.parse(legacy));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* حافظه مسدود یا داده نامعتبر */ }
  return emptyState();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 2 }));
    return true;
  } catch {
    return false;
  }
}

// state فقط شامل داده‌های ثبت نهایی است؛ پیش‌نویس‌های موقت اصلاً به این تابع داده نمی‌شوند.
export function exportJSON(state) {
  const clean = normalize({ ...state, version: 2 });
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rotayar-final-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importJSON(file) {
  return normalize(JSON.parse(await file.text()));
}
