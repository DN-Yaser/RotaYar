// محاسبات خالص (بدون وابستگی به DOM)

/**
 * محاسبه آمار هر عضو.
 * - آمار و درصد نمایش‌داده‌شده برای همه بخش‌های فعال محاسبه می‌شود.
 * - شاخص تعادل فقط با بخش‌های انتخاب‌شده در اولویت‌بندی محاسبه می‌شود.
 * - ترتیب prioritySections هنگام برابر بودن درصد حضور، معیار شکستن تساوی است.
 */
export function stats(group, sections) {
  const act = sections.filter(s => group.active.includes(s.id));
  const activeById = new Map(act.map(section => [section.id, section]));
  const configured = Array.isArray(group.prioritySections) ? group.prioritySections : group.active;
  const priorityAct = configured
    .filter((id, index) => activeById.has(id) && configured.indexOf(id) === index)
    .map(id => activeById.get(id));
  const rank = new Map(priorityAct.map((section, index) => [section.id, index]));

  return group.members.map(member => {
    const counts = act.map(section => Number(member.counts?.[section.id] || 0));
    const total = counts.reduce((sum, value) => sum + value, 0);
    const pct = counts.map(value => total ? (value / total) * 100 : 0);
    const priorityCounts = priorityAct.map(section => Number(member.counts?.[section.id] || 0));
    const priorityTotal = priorityCounts.reduce((sum, value) => sum + value, 0);
    let balance = 0;

    if (priorityTotal && priorityAct.length === 1) balance = 1;
    else if (priorityTotal && priorityAct.length > 1) {
      const entropy = -priorityCounts.reduce((sum, value) => {
        if (!value) return sum;
        const share = value / priorityTotal;
        return sum + share * Math.log(share);
      }, 0);
      balance = entropy / Math.log(priorityAct.length);
    }

    const priority = priorityAct.map(section => {
      const index = act.findIndex(item => item.id === section.id);
      return { id: section.id, name: section.name, pct: pct[index] || 0, count: counts[index] || 0, rank: rank.get(section.id) };
    }).sort((a, b) => a.pct - b.pct || a.rank - b.rank);

    return { member, act, counts, total, pct, balance, priority, priorityAct, priorityTotal };
  }).sort((a, b) => b.balance - a.balance || b.total - a.total);
}

/**
 * پیشنهاد چرخش بعدی.
 * فقط بخش‌های انتخاب‌شده در اولویت‌بندی وارد پیشنهاد خودکار می‌شوند.
 * درصد حضور کمتر مقدم است؛ در تساوی، ترتیب تعریف‌شده توسط مدیر ملاک است.
 */
export function suggest(group, sections) {
  const rows = stats(group, sections);
  if (!rows.length || !rows[0].priorityAct.length) return {};

  const prioritySections = rows[0].priorityAct;
  const cap = Math.ceil(rows.length / prioritySections.length);
  const priorityRank = new Map(prioritySections.map((section, index) => [section.id, index]));
  const pairs = [];

  rows.forEach(row => {
    row.priorityAct.forEach(section => {
      const sectionIndex = row.act.findIndex(item => item.id === section.id);
      pairs.push({
        memberId: row.member.id,
        sectionId: section.id,
        percent: row.pct[sectionIndex] || 0,
        count: row.counts[sectionIndex] || 0,
        total: row.total,
        rank: priorityRank.get(section.id)
      });
    });
  });

  pairs.sort((a, b) =>
    a.percent - b.percent ||
    a.rank - b.rank ||
    a.count - b.count ||
    b.total - a.total
  );

  const load = Object.create(null);
  const output = Object.create(null);
  for (const pair of pairs) {
    if (output[pair.memberId] || (load[pair.sectionId] || 0) >= cap) continue;
    output[pair.memberId] = pair.sectionId;
    load[pair.sectionId] = (load[pair.sectionId] || 0) + 1;
  }
  return output;
}
