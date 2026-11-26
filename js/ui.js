import { stats } from './logic.js';

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fa = n => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 0 });
const color = i => `hsl(${(i * 67 + 170) % 360} 62% 48%)`;
const empty = t => `<div class="empty">${t}</div>`;

const picker = ({ state, gid }) => state.groups.length
  ? `<div class="row"><select data-change="pick-group">${state.groups.map(g =>
      `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>` : '';

const level = r => {
  if (!r.total) return ['none', 'بدون داده'];
  const t = `تعادل ${fa(r.balance * 100)}٪`;
  return [r.balance >= .8 ? 'good' : r.balance >= .5 ? 'mid' : 'bad', t];
};

export const views = {
  report(ctx) {
    const g = ctx.state.groups.find(x => x.id === ctx.gid);
    if (!g) return empty('ابتدا از تب «گروه‌ها» یک گروه بسازید.');
    const rows = stats(g, ctx.state.sections);
    if (!rows.length || !rows[0].act.length)
      return picker(ctx) + empty('برای این گروه عضو یا بخش فعال تعریف نشده است.<br>از تب «گروه‌ها» تکمیل کنید.');
    return picker(ctx) + rows.map((r, i) => {
      const [cls, label] = level(r);
      const btn = (s, d, t) => `<button data-act="cnt" data-g="${g.id}" data-m="${r.member.id}" data-s="${s.id}" data-d="${d}" aria-label="${d > 0 ? 'اضافه' : 'کم'} کردن">${t}</button>`;
      return `<article class="card"><div class="head"><span class="rank">${fa(i + 1)}</span><b>${esc(r.member.name)}</b><span class="badge ${cls}">${label}</span></div>
      ${r.act.map((s, j) => `<div class="sec"><span class="sname">${esc(s.name)}</span>
        <div class="track"><i style="width:${r.pct[j]}%;background:${color(j)}"></i></div>
        <span class="pct">${fa(r.pct[j])}٪</span>
        <span class="stepper">${btn(s, -1, '−')}<output>${fa(r.counts[j])}</output>${btn(s, 1, '+')}</span></div>`).join('')}
      <div class="prio">اولویت قرارگیری بعدی: ${r.total ? r.priority.map((p, k) => `<span class="chip">${fa(k + 1)}. ${esc(p.name)}</span>`).join('') : 'بدون سابقه؛ همه بخش‌ها هم‌اولویت'}</div></article>`;
    }).join('');
  },

  rotate(ctx) {
    const g = ctx.state.groups.find(x => x.id === ctx.gid);
    if (!g) return empty('ابتدا یک گروه بسازید.');
    const act = ctx.state.sections.filter(s => g.active.includes(s.id));
    if (!g.members.length || !act.length) return picker(ctx) + empty('گروه عضو یا بخش فعال ندارد.');
    let out = picker(ctx) + `<div class="row"><button class="btn" data-act="make-proposal">پیشنهاد چرخش بعدی</button></div>`;
    const p = ctx.proposal;
    if (p && p.gid === g.id) {
      out += `<article class="card"><h4>چیدمان پیشنهادی (قابل ویرایش)</h4>` + g.members.map(m =>
        `<div class="prop"><span>${esc(m.name)}</span><select data-change="set-prop" data-m="${m.id}">${act.map(s =>
          `<option value="${s.id}" ${p.map[m.id] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`).join('') +
        `<div class="row"><button class="btn" data-act="apply-proposal">ثبت این چرخش در آمار</button></div></article>`;
    } else out += empty('پیشنهاد بر اساس کمترین درصد حضور هر فرد و ظرفیت برابر بخش‌ها ساخته می‌شود.');
    return out;
  },

  groups({ state }) {
    const add = `<article class="card"><div class="addrow"><input type="text" id="newGroup" placeholder="نام گروه جدید (مثلاً گروه الف)"><button class="btn" data-act="add-group">افزودن</button></div></article>`;
    return add + state.groups.map(g => `<article class="card">
      <div class="head"><input class="inline" type="text" value="${esc(g.name)}" data-change="rename-group" data-g="${g.id}"><button class="btn danger sm" data-act="del-group" data-g="${g.id}">حذف</button></div>
      <h4>بخش‌های فعال چرخش</h4>
      ${state.sections.length ? `<div class="checks">${state.sections.map(s => `<label class="check"><input type="checkbox" data-change="toggle-sec" data-g="${g.id}" data-s="${s.id}" ${g.active.includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}</div>` : '<p class="empty">ابتدا از تب «بخش‌ها» بخش تعریف کنید.</p>'}
      <h4>اعضا (${fa(g.members.length)})</h4>
      <ul class="members">${g.members.map(m => `<li>${esc(m.name)}<button class="x" data-act="del-member" data-g="${g.id}" data-m="${m.id}" aria-label="حذف">✕</button></li>`).join('')}</ul>
      <div class="addrow"><textarea id="mem-${g.id}" rows="2" placeholder="نام‌ها؛ هر نام در یک خط یا با ویرگول جدا"></textarea><button class="btn" data-act="add-members" data-g="${g.id}">افزودن</button></div>
      <button class="btn ghost sm" data-act="reset-counts" data-g="${g.id}">صفر کردن آمار این گروه</button></article>`).join('');
  },

  sections({ state }) {
    return `<article class="card"><div class="addrow"><input type="text" id="newSec" placeholder="نام بخش (مثلاً تریاژ)"><button class="btn" data-act="add-section">افزودن</button></div>
      ${state.sections.length ? '' : '<button class="btn ghost sm" data-act="seed-sections">افزودن بخش‌های پیشنهادی</button>'}</article>` +
      state.sections.map(s => `<article class="card head"><input class="inline" type="text" value="${esc(s.name)}" data-change="rename-section" data-s="${s.id}"><button class="btn danger sm" data-act="del-section" data-s="${s.id}">حذف</button></article>`).join('');
  },

  data({ canInstall }) {
    return `<article class="card"><h4>ذخیره و بازیابی</h4><p>داده‌ها فقط روی همین مرورگر ذخیره می‌شوند. برای پشتیبان‌گیری یا انتقال به دستگاه دیگر از فایل JSON استفاده کنید.</p>
      <div class="row"><button class="btn" data-act="export">خروجی JSON</button><button class="btn ghost" data-act="import">ورود از JSON</button></div></article>
      ${canInstall ? `<article class="card"><div class="row"><button class="btn" data-act="install">نصب برنامه روی دستگاه</button></div></article>` : ''}
      <article class="card"><div class="row"><button class="btn danger" data-act="reset-all">پاک کردن همه داده‌ها</button></div></article>`;
  }
};
