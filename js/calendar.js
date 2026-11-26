// ابزارهای تقویم جلالی؛ تبدیل تاریخ با تقویم Persian داخلی مرورگر (Intl)
export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const partsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric'
});

export function jalaliDate(date = new Date()) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function currentJalaliMonth() {
  const { year, month } = jalaliDate(new Date());
  return { year, month };
}

export function periodKey(period) {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

export function moveJalaliMonth(period, offset) {
  let year = Number(period.year);
  let month = Number(period.month) + Number(offset);
  while (month < 1) { month += 12; year -= 1; }
  while (month > 12) { month -= 12; year += 1; }
  return { year, month };
}

export function monthTitle(period) {
  return `${JALALI_MONTHS[period.month - 1]} ${Number(period.year).toLocaleString('fa-IR', { useGrouping: false })}`;
}

export function formatJalaliDate(date = new Date()) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

export function formatJalaliDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const d = formatJalaliDate(date);
  const t = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(date);
  return `${d}، ساعت ${t}`;
}

export function parseJalaliPeriod(yearValue, monthValue) {
  const year = Number(String(yearValue).replace(/[۰-۹٠-٩]/g, c =>
    '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) >= 0 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c)
  ));
  const month = Number(String(monthValue).replace(/[۰-۹٠-٩]/g, c => {
    const fa = '۰۱۲۳۴۵۶۷۸۹'.indexOf(c);
    return String(fa >= 0 ? fa : '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  }));
  if (!Number.isInteger(year) || year < 1200 || year > 1600 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}
