// محاسبات خالص (بدون وابستگی به DOM)

/**
 * آمار هر عضو یک گروه، مرتب‌شده از متعادل‌ترین به نامتعادل‌ترین.
 * شاخص تعادل = آنتروپی نرمال‌شده‌ی توزیع حضور روی بخش‌های فعال (۰ تا ۱):
 *   ۱ = حضور کاملاً یکسان در همه بخش‌ها ، ۰ = تمام حضور در یک بخش.
 * کسی که در هر ۴ بخش یکسان بوده ۱۰۰٪ و کسی که فقط در ۲ بخش (مساوی) بوده ۵۰٪ می‌گیرد.
 */
export function stats(group, sections) {
  const act = sections.filter(s => group.active.includes(s.id));
  return group.members.map(m => {
    const counts = act.map(s => m.counts[s.id] || 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const pct = counts.map(c => (total ? (c / total) * 100 : 0));
    let balance = 0;
    if (total && act.length === 1) balance = 1;
    else if (total) {
      const h = -pct.reduce((a, p) => (p > 0 ? a + (p / 100) * Math.log(p / 100) : a), 0);
      balance = h / Math.log(act.length);
    }
    const priority = act.map((s, i) => ({ id: s.id, name: s.name, pct: pct[i] })).sort((a, b) => a.pct - b.pct);
    return { member: m, act, counts, total, pct, balance, priority };
  }).sort((a, b) => b.balance - a.balance || b.total - a.total);
}

/**
 * پیشنهاد چرخش بعدی: هر عضو به بخشی می‌رود که کمترین درصد حضور را داشته،
 * با ظرفیت برابر بخش‌ها (ceil(تعداد اعضا / تعداد بخش‌ها)).
 * خروجی: { [memberId]: sectionId }
 */
export function suggest(group, sections) {
  const rows = stats(group, sections);
  if (!rows.length || !rows[0].act.length) return {};
  const cap = Math.ceil(rows.length / rows[0].act.length);
  const pairs = [];
  rows.forEach(r => r.act.forEach((s, j) => pairs.push({ m: r.member.id, s: s.id, p: r.pct[j], c: r.counts[j], t: r.total })));
  pairs.sort((a, b) => a.p - b.p || a.c - b.c || b.t - a.t);
  const load = {}, out = {};
  for (const x of pairs) {
    if (out[x.m] || (load[x.s] || 0) >= cap) continue;
    out[x.m] = x.s;
    load[x.s] = (load[x.s] || 0) + 1;
  }
  return out;
}
