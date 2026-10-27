import { isMalayalam, pad } from './format';
import type { OfflineDateRange } from './types';

/**
 * Deterministic Date Range Resolver
 */
export function resolveDateRange(
  type: string,
  customFrom?: string,
  customTo?: string,
  isMal: boolean = false
): OfflineDateRange {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  const todayStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  if (type === 'today') {
    return { fromDate: todayStr, toDate: todayStr, label: isMal ? 'ഇന്ന് (Today)' : 'Today', daysCount: 1 };
  }

  if (type === 'yesterday') {
    const yDate = new Date(year, month, day - 1);
    const yStr = `${yDate.getFullYear()}-${pad(yDate.getMonth() + 1)}-${pad(yDate.getDate())}`;
    return { fromDate: yStr, toDate: yStr, label: isMal ? 'ഇന്നലെ (Yesterday)' : 'Yesterday', daysCount: 1 };
  }

  if (type === 'this_week') {
    const dayOfWeek = now.getDay(); // 0 = Sun
    const diffToMonday = day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const mon = new Date(year, month, diffToMonday);
    const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - mon.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: monStr, toDate: todayStr, label: isMal ? 'ഈ ആഴ്ച (This Week)' : 'This Week', daysCount: daysElapsed };
  }

  if (type === 'last_week') {
    const dayOfWeek = now.getDay();
    const diffToLastMonday = day - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
    const lastMon = new Date(year, month, diffToLastMonday);
    const lastSun = new Date(year, month, diffToLastMonday + 6);
    const monStr = `${lastMon.getFullYear()}-${pad(lastMon.getMonth() + 1)}-${pad(lastMon.getDate())}`;
    const sunStr = `${lastSun.getFullYear()}-${pad(lastSun.getMonth() + 1)}-${pad(lastSun.getDate())}`;
    return { fromDate: monStr, toDate: sunStr, label: isMal ? 'കഴിഞ്ഞ ആഴ്ച (Last Week)' : 'Last Week', daysCount: 7 };
  }

  if (type === 'this_month') {
    const startStr = `${year}-${pad(month + 1)}-01`;
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ മാസം (This Month)' : 'This Month', daysCount: day };
  }

  if (type === 'last_month') {
    const lmYear = month === 0 ? year - 1 : year;
    const lmMonth = month === 0 ? 11 : month - 1;
    const startStr = `${lmYear}-${pad(lmMonth + 1)}-01`;
    const lastDay = new Date(lmYear, lmMonth + 1, 0).getDate();
    const endStr = `${lmYear}-${pad(lmMonth + 1)}-${pad(lastDay)}`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? 'കഴിഞ്ഞ മാസം (Last Month)' : 'Last Month', daysCount: lastDay };
  }

  if (type === 'this_quarter') {
    const qStartMonth = Math.floor(month / 3) * 3;
    const startStr = `${year}-${pad(qStartMonth + 1)}-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ ക്വാർട്ടർ (This Quarter)' : 'This Quarter', daysCount: daysElapsed };
  }

  if (type === 'last_quarter') {
    let lqYear = year;
    let lqStartMonth = Math.floor(month / 3) * 3 - 3;
    if (lqStartMonth < 0) {
      lqYear -= 1;
      lqStartMonth = 9;
    }
    const startStr = `${lqYear}-${pad(lqStartMonth + 1)}-01`;
    const endMonth = lqStartMonth + 2;
    const lastDay = new Date(lqYear, endMonth + 1, 0).getDate();
    const endStr = `${lqYear}-${pad(endMonth + 1)}-${pad(lastDay)}`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? 'കഴിഞ്ഞ ക്വാർട്ടർ (Last Quarter)' : 'Last Quarter', daysCount: 90 };
  }

  if (type === 'this_year') {
    const startStr = `${year}-01-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ വർഷം (This Year)' : 'This Year', daysCount: daysElapsed };
  }

  if (type === 'last_year') {
    const ly = year - 1;
    return { fromDate: `${ly}-01-01`, toDate: `${ly}-12-31`, label: isMal ? 'കഴിഞ്ഞ വർഷം (Last Year)' : 'Last Year', daysCount: 365 };
  }

  if (type === 'last_7_days') {
    const p = new Date(year, month, day - 6);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? 'കഴിഞ്ഞ 7 ദിവസങ്ങൾ (Last 7 Days)' : 'Last 7 Days', daysCount: 7 };
  }

  if (type === 'last_30_days') {
    const p = new Date(year, month, day - 29);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? 'കഴിഞ്ഞ 30 ദിവസങ്ങൾ (Last 30 Days)' : 'Last 30 Days', daysCount: 30 };
  }

  if (type === 'financial_year') {
    const fyStartYear = month >= 3 ? year : year - 1;
    const startStr = `${fyStartYear}-04-01`;
    const endStr = `${fyStartYear + 1}-03-31`;
    const effectiveTo = todayStr < endStr ? todayStr : endStr;
    const daysElapsed = Math.max(1, Math.round((new Date(effectiveTo).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: effectiveTo, label: isMal ? `സാമ്പത്തിക വർഷം FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}` : `Financial Year FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`, daysCount: daysElapsed };
  }

  if (customFrom && customTo) {
    const diff = Math.max(1, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    let label = isMal ? `${customFrom} മുതൽ ${customTo} വരെ` : `${customFrom} to ${customTo}`;

    // Check if it spans a full calendar month
    if (customFrom.slice(0, 7) === customTo.slice(0, 7) && customFrom.endsWith('-01')) {
      const [yStr, mStr] = customFrom.slice(0, 7).split('-');
      const y = parseInt(yStr, 10);
      const mIdx = parseInt(mStr, 10) - 1;
      const lastDayOfM = new Date(y, mIdx + 1, 0).getDate();
      if (customTo === `${yStr}-${mStr}-${pad(lastDayOfM)}`) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const malMonthNames = ['ജനുവരി', 'ഫെബ്രുവരി', 'മാർച്ച്', 'ഏപ്രിൽ', 'മേയ്', 'ജൂൺ', 'ജൂലൈ', 'ഓഗസ്റ്റ്', 'സെപ്റ്റംബർ', 'ഒക്ടോബർ', 'നവംബർ', 'ഡിസംബർ'];
        label = isMal ? `${malMonthNames[mIdx]} ${y}` : `${monthNames[mIdx]} ${y}`;
      }
    } else if (customFrom === customTo) {
      label = customFrom;
    }

    return {
      fromDate: customFrom,
      toDate: customTo,
      label,
      daysCount: diff,
    };
  }

  return { fromDate: todayStr, toDate: todayStr, label: todayStr, daysCount: 1 };
}

/**
 * Natural Language Date Extractor
 */
export function extractDateFromText(text: string): { fromDate?: string; toDate?: string; specificDate?: string; label?: string } {
  if (!text) return {};
  const lower = text.toLowerCase();

  const isoMatches = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (isoMatches && isoMatches.length >= 2) {
    return { fromDate: isoMatches[0], toDate: isoMatches[1] };
  } else if (isoMatches && isoMatches.length === 1) {
    return { specificDate: isoMatches[0], fromDate: isoMatches[0], toDate: isoMatches[0] };
  }

  const dmyMatches = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g);
  if (dmyMatches && dmyMatches.length > 0) {
    const parsed = dmyMatches.map(m => {
      const parts = m.split(/[/-]/);
      return `${parts[2]}-${pad(Number(parts[1]))}-${pad(Number(parts[0]))}`;
    });
    if (parsed.length >= 2) return { fromDate: parsed[0], toDate: parsed[1] };
    return { specificDate: parsed[0], fromDate: parsed[0], toDate: parsed[0] };
  }

  const nDaysMatch = text.match(/(?:previous|last|past|കഴിഞ്ഞ)\s+(\d+)\s+(?:days?|ദിവസം|ദിവസത്തെ)/i);
  if (nDaysMatch && nDaysMatch[1]) {
    const n = parseInt(nDaysMatch[1], 10);
    if (n > 0 && n <= 365) {
      const now = new Date();
      const p = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
      const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
      const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { fromDate: fromStr, toDate: toStr };
    }
  }

  // Month Extraction (English & Malayalam)
  const monthMap: Record<string, { monthIndex: number; en: string; ml: string }> = {
    january: { monthIndex: 0, en: 'January', ml: 'ജനുവരി' },
    jan: { monthIndex: 0, en: 'January', ml: 'ജനുവരി' },
    february: { monthIndex: 1, en: 'February', ml: 'ഫെബ്രുവരി' },
    feb: { monthIndex: 1, en: 'February', ml: 'ഫെബ്രുവരി' },
    march: { monthIndex: 2, en: 'March', ml: 'മാർച്ച്' },
    mar: { monthIndex: 2, en: 'March', ml: 'മാർച്ച്' },
    april: { monthIndex: 3, en: 'April', ml: 'ഏപ്രിൽ' },
    apr: { monthIndex: 3, en: 'April', ml: 'ഏപ്രിൽ' },
    may: { monthIndex: 4, en: 'May', ml: 'മേയ്' },
    june: { monthIndex: 5, en: 'June', ml: 'ജൂൺ' },
    jun: { monthIndex: 5, en: 'June', ml: 'ജൂൺ' },
    july: { monthIndex: 6, en: 'July', ml: 'ജൂലൈ' },
    jul: { monthIndex: 6, en: 'July', ml: 'ജൂലൈ' },
    august: { monthIndex: 7, en: 'August', ml: 'ഓഗസ്റ്റ്' },
    aug: { monthIndex: 7, en: 'August', ml: 'ഓഗസ്റ്റ്' },
    september: { monthIndex: 8, en: 'September', ml: 'സെപ്റ്റംബർ' },
    sep: { monthIndex: 8, en: 'September', ml: 'സെപ്റ്റംബർ' },
    sept: { monthIndex: 8, en: 'September', ml: 'സെപ്റ്റംബർ' },
    october: { monthIndex: 9, en: 'October', ml: 'ഒക്ടോബർ' },
    oct: { monthIndex: 9, en: 'October', ml: 'ഒക്ടോബർ' },
    november: { monthIndex: 10, en: 'November', ml: 'നവംബർ' },
    nov: { monthIndex: 10, en: 'November', ml: 'നവംബർ' },
    december: { monthIndex: 11, en: 'December', ml: 'ഡിസംബർ' },
    dec: { monthIndex: 11, en: 'December', ml: 'ഡിസംബർ' },
  };

  const malRoots = [
    { root: 'ജനുവരി', idx: 0, en: 'January', ml: 'ജനുവരി' },
    { root: 'ഫെബ്രുവരി', idx: 1, en: 'February', ml: 'ഫെബ്രുവരി' },
    { root: 'മാർച്ച്', idx: 2, en: 'March', ml: 'മാർച്ച്' },
    { root: 'മാർച്ചി', idx: 2, en: 'March', ml: 'മാർച്ച്' },
    { root: 'ഏപ്രിൽ', idx: 3, en: 'April', ml: 'ഏപ്രിൽ' },
    { root: 'ഏപ്രി', idx: 3, en: 'April', ml: 'ഏപ്രിൽ' },
    { root: 'മേയ്', idx: 4, en: 'May', ml: 'മേയ്' },
    { root: 'ജൂൺ', idx: 5, en: 'June', ml: 'ജൂൺ' },
    { root: 'ജൂണി', idx: 5, en: 'June', ml: 'ജൂൺ' },
    { root: 'ജൂലൈ', idx: 6, en: 'July', ml: 'ജൂലൈ' },
    { root: 'ഓഗസ്റ്റ്', idx: 7, en: 'August', ml: 'ഓഗസ്റ്റ്' },
    { root: 'സെപ്റ്റംബർ', idx: 8, en: 'September', ml: 'സെപ്റ്റംബർ' },
    { root: 'സെപ്റ്റംബ', idx: 8, en: 'September', ml: 'സെപ്റ്റംബർ' },
    { root: 'ഒക്ടോബർ', idx: 9, en: 'October', ml: 'ഒക്ടോബർ' },
    { root: 'ഒക്ടോബ', idx: 9, en: 'October', ml: 'ഒക്ടോബർ' },
    { root: 'നവംബർ', idx: 10, en: 'November', ml: 'നവംബർ' },
    { root: 'നവംബ', idx: 10, en: 'November', ml: 'നവംബർ' },
    { root: 'ഡിസംബർ', idx: 11, en: 'December', ml: 'ഡിസംബർ' },
    { root: 'ഡിസംബ', idx: 11, en: 'December', ml: 'ഡിസംബർ' },
  ];

  let foundMonthInfo: { monthIndex: number; en: string; ml: string; matchedWord: string } | null = null;

  const malFound = malRoots.find(m => text.includes(m.root));
  if (malFound) {
    foundMonthInfo = { monthIndex: malFound.idx, en: malFound.en, ml: malFound.ml, matchedWord: malFound.root };
  } else {
    const enMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i);
    if (enMatch) {
      const word = enMatch[0].toLowerCase();
      if (word === 'may') {
        const isMayMonth = /(?:in|of|during|for|from|to|\b\d{1,2}(?:st|nd|rd|th)?|\b20\d\d)\s+may\b|\bmay\s+(?:month|\b\d{1,2}(?:st|nd|rd|th)?|\b20\d\d|sales|sale|revenue|expense|bills|invoices|products|product)/i.test(lower);
        if (isMayMonth) {
          foundMonthInfo = { monthIndex: monthMap[word].monthIndex, en: monthMap[word].en, ml: monthMap[word].ml, matchedWord: word };
        }
      } else if (monthMap[word]) {
        foundMonthInfo = { monthIndex: monthMap[word].monthIndex, en: monthMap[word].en, ml: monthMap[word].ml, matchedWord: word };
      }
    }
  }

  if (foundMonthInfo) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearMatch = text.match(/\b(20\d\d)\b/);
    const targetYear = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;

    const dayBeforeMatch = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${foundMonthInfo.matchedWord}\\b`, 'i'));
    const dayAfterMatch = text.match(new RegExp(`\\b${foundMonthInfo.matchedWord}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
    const dayNumStr = dayBeforeMatch?.[1] || dayAfterMatch?.[1];

    if (dayNumStr) {
      const dNum = parseInt(dayNumStr, 10);
      if (dNum >= 1 && dNum <= 31) {
        const specificDate = `${targetYear}-${pad(foundMonthInfo.monthIndex + 1)}-${pad(dNum)}`;
        return { specificDate, fromDate: specificDate, toDate: specificDate, label: `${dNum} ${foundMonthInfo.en} ${targetYear}` };
      }
    }

    const startStr = `${targetYear}-${pad(foundMonthInfo.monthIndex + 1)}-01`;
    const lastDay = new Date(targetYear, foundMonthInfo.monthIndex + 1, 0).getDate();
    const endStr = `${targetYear}-${pad(foundMonthInfo.monthIndex + 1)}-${pad(lastDay)}`;
    const isMalText = isMalayalam(text);
    const label = isMalText ? `${foundMonthInfo.ml} ${targetYear}` : `${foundMonthInfo.en} ${targetYear}`;
    return { fromDate: startStr, toDate: endStr, label };
  }

  return {};
}
