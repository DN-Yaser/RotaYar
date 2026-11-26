const KEY = 'rotayar.v1';
export const uid = () => Math.random().toString(36).slice(2, 9);
export const emptyState = () => ({ version: 1, sections: [], groups: [] });

// پاک‌سازی و اعتبارسنجی داده (برای ورود فایل JSON و بارگذاری)
export function normalize(raw) {
  if (!raw || !Array.isArray(raw.groups) || !Array.isArray(raw.sections)) throw new Error('ساختار فایل معتبر نیست');
  const sections = raw.sections.map(s => ({ id: String(s.id || uid()), name: String(s.name || '').trim() })).filter(s => s.name);
  const ids = new Set(sections.map(s => s.id));
  const groups = raw.groups.map(g => ({
    id: String(g.id || uid()),
    name: String(g.name || 'گروه').trim(),
    active: (Array.isArray(g.active) ? g.active : []).map(String).filter(id => ids.has(id)),
    members: (Array.isArray(g.members) ? g.members : []).map(m => ({
      id: String(m.id || uid()),
      name: String(m.name || '').trim(),
      counts: Object.fromEntries(Object.entries(m.counts || {}).map(([k, v]) => [k, Math.max(0, parseInt(v) || 0)]))
    })).filter(m => m.name)
  }));
  return { version: 1, sections, groups };
}

export function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch { return emptyState(); }
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* حافظه پر یا مسدود */ }
}
export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rotayar-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function importJSON(file) {
  return normalize(JSON.parse(await file.text()));
}
