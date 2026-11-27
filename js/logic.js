// محاسبات خالص؛ رتبه‌بندی بر اساس بار امتیازی وزنی، نه درصد تعادل حضور.
export function normalizedWeights(group) {
  const ids = Array.isArray(group.prioritySections) ? group.prioritySections : group.active || [];
  const saved = group.priorityWeights && typeof group.priorityWeights === 'object' ? group.priorityWeights : {};
  const defaults = Object.fromEntries(ids.map((id, index) => [id, ids.length - index]));
  return Object.fromEntries(ids.map(id => {
    const value = Number(saved[id]);
    return [id, Number.isFinite(value) && value > 0 ? value : defaults[id]];
  }));
}
export function stats(group, sections) {
  const active = sections.filter(s => (group.active || []).includes(s.id));
  const activeById = new Map(active.map(section => [section.id, section]));
  const configured = Array.isArray(group.prioritySections) ? group.prioritySections : group.active || [];
  const priorityAct = configured.filter((id, index) => activeById.has(id) && configured.indexOf(id) === index).map(id => activeById.get(id));
  const weights = normalizedWeights({ ...group, prioritySections: priorityAct.map(s => s.id) });
  return group.members.map(member => {
    const counts = active.map(section => Math.max(0, Number(member.counts?.[section.id] || 0)));
    const total = counts.reduce((sum, value) => sum + value, 0);
    const pct = counts.map(value => total ? value / total * 100 : 0);
    const countById = Object.fromEntries(active.map((section, i) => [section.id, counts[i]]));
    const weightedLoad = priorityAct.reduce((sum, section) => sum + (countById[section.id] || 0) * weights[section.id], 0);
    const priority = priorityAct.map((section, rank) => ({
      id: section.id, name: section.name, count: countById[section.id] || 0,
      pct: pct[active.findIndex(item => item.id === section.id)] || 0, rank, weight: weights[section.id]
    }));
    return { member, act: active, counts, total, pct, weightedLoad, priority, priorityAct,
      priorityTotal: priorityAct.reduce((sum, s) => sum + (countById[s.id] || 0), 0), weights, countById };
  }).sort((a, b) => a.weightedLoad - b.weightedLoad || a.total - b.total ||
    a.priorityTotal - b.priorityTotal || a.member.name.localeCompare(b.member.name, 'fa'));
}
/** جایگاه‌های تخصیص با ظرفیت برابر ساخته می‌شوند. جایگاه‌های پر وزن ابتدا
 * به افراد با بار وزنی کمتر می‌رسند؛ پس از هر تخصیص بار پیش‌بینی‌شده به‌روز می‌شود. */
export function suggest(group, sections) {
  const rows = stats(group, sections);
  if (!rows.length || !rows[0].priorityAct.length) return {};
  const priority = rows[0].priorityAct, weights = rows[0].weights;
  const base = Math.floor(rows.length / priority.length);
  const remainder = rows.length % priority.length;
  const slots = priority.flatMap((section, rank) => Array.from({ length: base + (rank < remainder ? 1 : 0) }, (_, index) => ({
    sectionId: section.id, weight: weights[section.id], rank, slot: index
  }))).sort((a, b) => b.weight - a.weight || a.rank - b.rank || a.slot - b.slot);
  const loads = new Map(rows.map(row => [row.member.id, row.weightedLoad]));
  const assigned = new Set(), output = Object.create(null);
  for (const slot of slots) {
    const candidate = rows.filter(row => !assigned.has(row.member.id)).sort((a, b) =>
      loads.get(a.member.id) - loads.get(b.member.id) || a.total - b.total ||
      a.priorityTotal - b.priorityTotal || a.member.name.localeCompare(b.member.name, 'fa'))[0];
    if (!candidate) break;
    output[candidate.member.id] = slot.sectionId;
    assigned.add(candidate.member.id);
    loads.set(candidate.member.id, loads.get(candidate.member.id) + slot.weight);
  }
  return output;
}
