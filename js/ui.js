import { stats, suggest, normalizedWeights } from './logic.js';
import { JALALI_MONTHS, monthTitle, formatJalaliDate, formatJalaliDateTime } from './calendar.js';

export const esc = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
export const fa = number => Number(number).toLocaleString('fa-IR', { maximumFractionDigits: 1 });
const color = index => `hsl(${(index * 67 + 170) % 360} 62% 48%)`;
const empty = content => `<div class="empty">${content}</div>`;

const picker = ({ state, gid }) => state.groups.length
  ? `<div class="row"><select data-change="pick-group" aria-label="انتخاب گروه">${state.groups.map(item =>
    `<option value="${item.id}" ${item.id === gid ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div>` : '';

const level = row => row.priorityTotal ? ['good', `بار وزنی ${fa(row.weightedLoad)}`] : ['none', 'بدون سابقه در بخش‌های اولویت'];

function periodBar(ctx) {
  const status = ctx.dirty
    ? '<span class="period-status pending">دارای تغییرات ثبت‌نشده</span>'
    : ctx.state.records?.[ctx.periodKey]?.finalizedAt
      ? '<span class="period-status saved">ثبت نهایی شده</span>'
      : '<span class="period-status empty-status">هنوز ثبت نهایی نشده</span>';
  const months = JALALI_MONTHS.map((name, index) =>
    `<option value="${index + 1}" ${ctx.period.month === index + 1 ? 'selected' : ''}>${name}</option>`).join('');
  return `<article class="card calendar-card">
    <div class="calendar-head">
      <button class="nav month-nav" data-act="month-nav" data-d="-1" aria-label="ماه قبل">‹</button>
      <div class="period-heading"><strong>${monthTitle(ctx.period)}</strong><small>تقویم شمسی جلالی</small></div>
      <button class="nav month-nav" data-act="month-nav" data-d="1" aria-label="ماه بعد">›</button>
    </div>
    <div class="period-jump">
      <label for="jumpMonth">رفتن به ماه و سال دلخواه</label>
      <select id="jumpMonth" aria-label="ماه شمسی">${months}</select>
      <input id="jumpYear" type="text" inputmode="numeric" pattern="[0-9۰-۹٠-٩]{4}" maxlength="4" value="${ctx.period.year}" aria-label="سال شمسی">
      <button class="btn ghost" data-act="jump-period">رفتن</button>
    </div>
    <div class="period-info">
      <div><small>وضعیت این ماه</small>${status}</div>
      <div><small>امروز، براساس تاریخ دستگاه</small><b>${formatJalaliDate(new Date())}</b></div>
      <div class="last-saved"><small>آخرین ثبت نهایی برنامه</small><b>${ctx.lastFinalizedAt ? formatJalaliDateTime(ctx.lastFinalizedAt) : 'هنوز ثبت نهایی انجام نشده است'}</b></div>
    </div>
    <div class="finalize-row">
      <button class="btn finalize-btn" data-act="finalize-period" ${ctx.dirty ? '' : 'disabled'}>ثبت نهایی اطلاعات ${JALALI_MONTHS[ctx.period.month - 1]}</button>
      <small>آمار و تغییرات اولویت تا پیش از ثبت نهایی فقط در حافظه موقت صفحه هستند و در خروجی قرار نمی‌گیرند.</small>
    </div>
  </article>`;
}

function reorderItems(group, prioritySections) {
  if (!prioritySections.length) return '<p class="empty small">هنوز بخشی برای اولویت‌بندی انتخاب نشده است.</p>';
  return `<ol class="priority-order">${prioritySections.map((section, index) => `<li>
    <span class="priority-rank">${fa(index + 1)}</span>
    <strong>${esc(section.name)}</strong>
    <span class="priority-actions">
      <button type="button" class="order-btn" data-act="move-priority" data-g="${group.id}" data-s="${section.id}" data-d="-1" aria-label="بالاتر بردن ${esc(section.name)}" title="بالاتر" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="order-btn" data-act="move-priority" data-g="${group.id}" data-s="${section.id}" data-d="1" aria-label="پایین‌تر بردن ${esc(section.name)}" title="پایین‌تر" ${index === prioritySections.length - 1 ? 'disabled' : ''}>↓</button>
    </span>
  </li>`).join('')}</ol>`;
}

export const views = {
  report(ctx) {
    const group = ctx.monthlyGroup;
    const calendar = periodBar(ctx);
    if (!group) return calendar + empty('ابتدا از تب «گروه‌ها» یک گروه بسازید.');
    const rows = stats(group, ctx.monthSections);
    if (!rows.length || !rows[0].act.length) {
      return calendar + picker(ctx) + empty('برای این گروه عضو یا بخش فعال تعریف نشده است.<br>از تب «گروه‌ها» تکمیل کنید.');
    }

    const filteredMembers = group.members
      .filter(member => !ctx.q || member.name.includes(ctx.q) || member.id === ctx.mid)
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const selected = rows.find(row => row.member.id === ctx.mid) || null;
    const counterButton = (section, delta, label) =>
      `<button data-act="cnt" data-g="${group.id}" data-m="${selected.member.id}" data-s="${section.id}" data-d="${delta}" aria-label="${delta > 0 ? 'اضافه' : 'کم'} کردن">${label}</button>`;

    const entry = `<article class="card entry">
      <h4>ثبت اطلاعات فرد در ${monthTitle(ctx.period)}</h4>
      <input type="search" id="memFilter" class="filter" placeholder="جستجوی نام..." autocomplete="off" value="${esc(ctx.q || '')}">
      <div class="pickrow">
        <button class="nav" data-act="nav-member" data-d="1" aria-label="فرد بعدی">›</button>
        <select id="memSelect" data-change="pick-member">
          <option value="">— انتخاب فرد (${fa(filteredMembers.length)} نفر) —</option>
          ${filteredMembers.map(member => `<option value="${member.id}" ${member.id === ctx.mid ? 'selected' : ''}>${esc(member.name)}</option>`).join('')}
        </select>
        <button class="nav" data-act="nav-member" data-d="-1" aria-label="فرد قبلی">‹</button>
      </div>
      ${selected ? (() => {
        const [badgeClass, label] = level(selected);
        return `<div class="head selhead"><b>${esc(selected.member.name)}</b><span class="badge ${badgeClass}">${label}</span></div>
        ${selected.act.map((section, index) => `<div class="sec big">
          <span class="sname">${esc(section.name)}</span>
          <div class="track"><i style="width:${selected.pct[index]}%;background:${color(index)}"></i></div>
          <span class="pct">${fa(selected.pct[index])}٪</span>
          <span class="stepper">${counterButton(section, -1, '−')}<output>${fa(selected.counts[index])}</output>${counterButton(section, 1, '+')}</span>
        </div>`).join('')}
        <div class="prio"><b>اولویت حضور بعدی:</b> ${selected.priority.length
          ? selected.priority.map((item, index) => `<span class="chip">${fa(index + 1)}. ${esc(item.name)}</span>`).join('')
          : 'هیچ بخش اولویت‌داری انتخاب نشده است.'}
          <small class="priority-hint">بخش‌های خارج از اولویت همچنان در آمار ثبت می‌شوند.</small>
        </div>`;
      })() : '<p class="empty small">یک نام را از منوی بالا انتخاب کنید تا بخش‌هایش را ثبت کنید.</p>'}
    </article>`;

    const columns = rows[0].act;
    const recommendations = suggest(group, ctx.monthSections);
    const recommendationName = memberId => { const sectionId = recommendations[memberId]; return columns.find(section => section.id === sectionId)?.name || '—'; };
    const table = `<h4>رتبه‌بندی بر اساس بار امتیازی وزنی</h4>
      <p class="subtle">رتبه کمتر یعنی بار وزنی کمتری از بخش‌های اولویت‌دار دریافت کرده و برای بخش‌های پرامتیاز در اولویت تخصیص است. وزن بخش‌های خارج از اولویت صفر است.</p>
      <div class="twrap"><table class="rt">
        <thead><tr><th class="c-name">رتبه</th><th>نام</th><th>بار وزنی</th><th>کل حضور</th>${columns.map(section => `<th>${esc(section.name)}</th>`).join('')}<th>پیشنهاد تخصیص</th><th>ترتیب اولویت بخش‌ها</th></tr></thead>
        <tbody>${rows.map((row, index) => {
          const [badgeClass] = level(row);
          return `<tr data-act="select-member" data-m="${row.member.id}" class="${row.member.id === ctx.mid ? 'on' : ''}">
            <td><span class="rank sm">${fa(index + 1)}</span></td><td class="c-name">${esc(row.member.name)}</td>
            <td><span class="badge ${badgeClass}">${fa(row.weightedLoad)}</span></td><td>${fa(row.total)}</td>
            ${row.counts.map((count, cellIndex) => `<td><b>${fa(count)}</b><small>${fa(row.pct[cellIndex])}٪</small></td>`).join('')}
            <td><strong class="suggested-section">${esc(recommendationName(row.member.id))}</strong></td>
            <td class="c-next">${row.priority.length ? `<details class="priority-dropdown">
              <summary aria-label="نمایش همه اولویت‌های ${esc(row.member.name)}" title="برای مشاهده همه اولویت‌ها باز کنید">
                <span class="priority-dropdown-rank">${fa(1)}</span>
                <span class="priority-dropdown-first">${esc(row.priority[0].name)}</span>
                <span class="priority-dropdown-arrow" aria-hidden="true">⌄</span>
              </summary>
              <ol>${row.priority.map((item, priorityIndex) => `<li>
                <span class="priority-dropdown-number">${fa(priorityIndex + 1)}</span>
                <span class="priority-dropdown-name">${esc(item.name)}</span>
              </li>`).join('')}</ol>
            </details>` : '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    return calendar + picker(ctx) + entry + table;
  },

  rotate(ctx) {
    const group = ctx.monthlyGroup;
    const calendar = periodBar(ctx);
    if (!group) return calendar + empty('ابتدا یک گروه بسازید.');
    const active = ctx.monthSections.filter(section => group.active.includes(section.id));
    const priorityIds = group.prioritySections || group.active;
    const priority = priorityIds.map(id => active.find(section => section.id === id)).filter(Boolean);
    if (!group.members.length || !active.length) return calendar + picker(ctx) + empty('گروه عضو یا بخش فعال ندارد.');
    if (!priority.length) {
      return calendar + picker(ctx) + empty('برای این گروه بخشی در اولویت‌بندی انتخاب نشده است. از تب «گروه‌ها» حداقل یک بخش را انتخاب کنید.');
    }

    let output = calendar + picker(ctx) + `<article class="card rotation-note">
      <h4>مبنای پیشنهاد چرخش</h4>
      <p>ابتدا بخش‌های با وزن بالاتر به افرادی تخصیص داده می‌شوند که بار وزنی تجمعی کمتری دارند. پس از هر تخصیص، بار پیش‌بینی‌شده فرد محاسبه می‌شود تا توزیع نهایی متعادل‌تر باشد.</p>
      <div class="priority-chips">${priority.map((section, index) => `<span class="chip">${fa(index + 1)}. ${esc(section.name)}</span>`).join('')}</div>
      <button class="btn" data-act="make-proposal">پیشنهاد چرخش بعدی برای این ماه</button>
    </article>`;

    const proposal = ctx.proposal;
    if (proposal && proposal.gid === group.id) {
      output += `<article class="card"><h4>چیدمان پیشنهادی (قابل ویرایش)</h4>` + group.members.map(member =>
        `<div class="prop"><span>${esc(member.name)}</span><select data-change="set-prop" data-m="${member.id}">${priority.map(section =>
          `<option value="${section.id}" ${proposal.map[member.id] === section.id ? 'selected' : ''}>${esc(section.name)}</option>`).join('')}</select></div>`).join('') +
        `<div class="row"><button class="btn" data-act="apply-proposal">اعمال پیشنهاد در پیش‌نویس ماه</button></div></article>`;
    }
    return output;
  },

  groups(ctx) {
    const { state, period, periodKey, historicalMode } = ctx;
    const addGroup = `<article class="card"><div class="addrow">
      <input type="text" id="newGroup" placeholder="نام گروه جدید (مثلاً گروه الف)">
      <button class="btn" data-act="add-group">افزودن</button>
    </div></article>`;

    const intro = historicalMode
      ? `<article class="settings-context historical"><b>در حال تنظیم سوابق ${monthTitle(period)}</b><p>تنظیمات بخش‌ها و اولویت‌ها فقط برای همین ماه تغییر می‌کند. برای ذخیره آن‌ها، دکمه «ثبت نهایی اطلاعات ماه» را در بالای صفحه بزنید؛ ماه‌های دیگر دست‌نخورده می‌مانند.</p></article>`
      : `<article class="settings-context"><b>تنظیمات ماه‌های ثبت‌نشده</b><p>تنظیمات اولویت و وزن هر گروه به‌عنوان الگوی ماه‌های ثبت‌نشده ذخیره می‌شود. پس از نهایی کردن یک ماه، برای اصلاح تنظیمات همان ماه به آن ماه برگردید.</p></article>`;

    const cards = state.groups.map((sourceGroup, groupIndex) => {
      const config = ctx.groupConfigs[groupIndex] || { group: sourceGroup, sections: state.sections };
      const group = config.group;
      const sections = config.sections || state.sections;
      const activeIds = group.active || [];
      const priorityIds = (group.prioritySections || activeIds).filter(id => activeIds.includes(id));
      const activeSections = sections.filter(section => activeIds.includes(section.id));
      const optionSections = sections;
      const orderedSections = priorityIds.map(id => activeSections.find(section => section.id === id)).filter(Boolean);

      const activeBlock = optionSections.length
        ? `<div class="checks section-checks">${optionSections.map(section => `<label class="check">
            <input type="checkbox" data-change="toggle-sec" data-g="${sourceGroup.id}" data-s="${section.id}" ${activeIds.includes(section.id) ? 'checked' : ''}>
            ${esc(section.name)}
          </label>`).join('')}</div>`
        : '<p class="empty small">ابتدا از تب «بخش‌ها» بخش تعریف کنید.</p>';

      const priorityBlock = activeSections.length
        ? `<div class="checks priority-checks">${activeSections.map(section => `<label class="check priority-check">
            <input type="checkbox" data-change="toggle-priority" data-g="${sourceGroup.id}" data-s="${section.id}" ${priorityIds.includes(section.id) ? 'checked' : ''}>
            ${esc(section.name)}
          </label>`).join('')}</div>`
        : '<p class="empty small">ابتدا حداقل یک بخش را در مرحله قبل فعال کنید.</p>';

      return `<article class="card group-card">
        <div class="head group-title">
          <span class="rank">${fa(groupIndex + 1)}</span>
          <input class="inline" type="text" value="${esc(sourceGroup.name)}" data-change="rename-group" data-g="${sourceGroup.id}" aria-label="نام گروه">
          <button class="btn danger sm" data-act="del-group" data-g="${sourceGroup.id}">حذف گروه</button>
        </div>

        <section class="config-step">
          <div class="step-title"><span>۱</span><div><b>بخش‌های فعال این گروه</b><small>بخش‌هایی که آمارشان ثبت و در گزارش نمایش داده می‌شود.</small></div></div>
          ${activeBlock}
        </section>

        <section class="config-step">
          <div class="step-title"><span>۲</span><div><b>انتخاب بخش‌های مشمول اولویت‌بندی</b><small>از بین بخش‌های فعال، فقط موارد انتخاب‌شده در پیشنهاد خودکار چرخش شرکت می‌کنند.</small></div></div>
          ${priorityBlock}
        </section>

        <section class="config-step">
          <div class="step-title"><span>۳</span><div><b>ترتیب اولویت و وزن نسبی بخش‌ها</b><small>ترتیب اولیه وزن را تعیین می‌کند؛ وزن بالاتر یعنی هر حضور اثر بیشتری بر بار تجمعی دارد.</small></div></div>
          ${reorderItems(group, orderedSections)}
          <div class="weight-grid">${orderedSections.map((section, index) => { const defaults = orderedSections.length - index; const weight = normalizedWeights(group)[section.id] ?? defaults; return `<label class="weight-item"><span>${esc(section.name)}<small>وزن نسبی</small></span><input type="number" min="0.1" max="100" step="0.1" value="${weight}" data-change="set-priority-weight" data-g="${sourceGroup.id}" data-s="${section.id}" aria-label="وزن ${esc(section.name)}"></label>`; }).join('')}</div>
          <small class="subtle">وزن اولیه به‌صورت خودکار از ترتیب اولویت ساخته می‌شود؛ می‌توانی آن را دستی تغییر بدهی. وزن بالاتر یعنی اثر بیشتر هر حضور در بار وزنی.</small>
        </section>

        <div class="settings-rule">بخش‌های فعالِ انتخاب‌نشده در مرحله ۲ در آمار باقی می‌مانند، اما وزن آن‌ها در شاخص بار وزنی صفر است.</div>

        <div class="members-area">
          <h4>اعضا (${fa(sourceGroup.members.length)})</h4>
          <ul class="members">${sourceGroup.members.map(member => `<li>${esc(member.name)}<button class="x" data-act="del-member" data-g="${sourceGroup.id}" data-m="${member.id}" aria-label="حذف">✕</button></li>`).join('')}</ul>
          <div class="addrow"><textarea id="mem-${sourceGroup.id}" rows="2" placeholder="نام‌ها؛ هر نام در یک خط یا با ویرگول جدا"></textarea><button class="btn" data-act="add-members" data-g="${sourceGroup.id}">افزودن اعضا</button></div>
          <button class="btn ghost sm" data-act="reset-counts" data-g="${sourceGroup.id}">صفر کردن آمار پیش‌نویس این ماه</button>
        </div>
      </article>`;
    }).join('');

    return `<p class="subtle">تنظیمات گروه‌ها برای ماه انتخاب‌شده (${monthTitle(period)}) نمایش داده می‌شود.</p>${intro}${addGroup}${cards}`;
  },

  sections({ state }) {
    return `<article class="card"><div class="addrow">
      <input type="text" id="newSec" placeholder="نام بخش (مثلاً تریاژ)">
      <button class="btn" data-act="add-section">افزودن</button>
    </div>${state.sections.length ? '' : '<button class="btn ghost sm" data-act="seed-sections">افزودن بخش‌های پیشنهادی</button>'}</article>` +
      state.sections.map(section => `<article class="card head section-edit-row">
        <input class="inline" type="text" value="${esc(section.name)}" data-change="rename-section" data-s="${section.id}">
        <button class="btn danger sm" data-act="del-section" data-s="${section.id}">حذف</button>
      </article>`).join('');
  },

  data(ctx) {
    const records = Object.entries(ctx.state.records || {})
      .filter(([, record]) => record.finalizedAt)
      .sort((a, b) => b[0].localeCompare(a[0]));
    const history = records.length
      ? `<ul class="record-list">${records.map(([key, record]) => {
          const [year, month] = key.split('-').map(Number);
          return `<li>
            <div><b>${JALALI_MONTHS[month - 1]} ${year.toLocaleString('fa-IR', { useGrouping: false })}</b><span>${formatJalaliDateTime(record.finalizedAt)}</span></div>
            <button class="btn ghost sm" data-act="edit-record-priority" data-p="${key}">تنظیم اولویت این ماه</button>
          </li>`;
        }).join('')}</ul>`
      : '<p class="empty small">هنوز هیچ ماهی ثبت نهایی نشده است.</p>';
    const legacy = ctx.state.groups.some(group => group.members.some(member =>
      Object.values(member.legacyTotals || {}).some(count => count > 0)));

    return `<article class="card"><h4>وضعیت ثبت نهایی</h4>
      <p>تعداد ماه‌های ثبت نهایی‌شده: <b>${fa(records.length)}</b></p>
      <p>تاریخ و ساعت دقیق آخرین ثبت نهایی: <b>${ctx.lastFinalizedAt ? formatJalaliDateTime(ctx.lastFinalizedAt) : 'هنوز ثبت نهایی انجام نشده است'}</b></p>
      <h4>سوابق ثبت‌شده و تنظیم اولویت هر ماه</h4>${history}</article>
      <article class="card"><h4>خروجی و بازیابی اطلاعات</h4>
        <p>فایل JSON شامل تنظیمات گروه‌ها، ترتیب اولویت‌ها و سوابق ماه‌هایی است که ثبت نهایی شده‌اند. پیش‌نویس جاری در خروجی قرار نمی‌گیرد.</p>
        <div class="row"><button class="btn" data-act="export">خروجی JSON (سوابق نهایی)</button><button class="btn ghost" data-act="import">ورود از JSON</button></div>
      </article>
      ${legacy ? `<article class="card"><h4>آمار نسخه قبلی</h4><p class="subtle">آمار نسخه قبلی که ماه و سال مشخصی نداشته، حفظ شده است؛ برای جلوگیری از نسبت دادن اشتباه، در گزارش ماهانه محاسبه نمی‌شود.</p></article>` : ''}
      ${ctx.canInstall ? `<article class="card"><div class="row"><button class="btn" data-act="install">نصب برنامه روی دستگاه</button></div></article>` : ''}
      <article class="card"><div class="row"><button class="btn danger" data-act="reset-all">پاک کردن همه داده‌ها</button></div></article>`;
  }
};
