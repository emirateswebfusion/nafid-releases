// src/services/offlineAiService.ts
function formatINR(val) {
  const num = Number(val || 0);
  return "\u20B9" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatQty(val) {
  const num = Number(val || 0);
  return num.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}
function isMalayalam(text) {
  return /[\u0D00-\u0D7F]/.test(text || "");
}
var pad = (n) => String(n).padStart(2, "0");
function normalizeInput(text) {
  if (!text) return "";
  let str = text.toLowerCase().trim();
  str = str.replace(/\s+/g, " ");
  str = str.replace(/[?!.]+$|[.,]+$/g, "");
  return str;
}
function resolveDateRange(type, customFrom, customTo, isMal = false) {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const todayStr = `${year}-${pad(month + 1)}-${pad(day)}`;
  if (type === "today") {
    return { fromDate: todayStr, toDate: todayStr, label: isMal ? "\u0D07\u0D28\u0D4D\u0D28\u0D4D (Today)" : "Today", daysCount: 1 };
  }
  if (type === "yesterday") {
    const yDate = new Date(year, month, day - 1);
    const yStr = `${yDate.getFullYear()}-${pad(yDate.getMonth() + 1)}-${pad(yDate.getDate())}`;
    return { fromDate: yStr, toDate: yStr, label: isMal ? "\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46 (Yesterday)" : "Yesterday", daysCount: 1 };
  }
  if (type === "this_week") {
    const dayOfWeek = now.getDay();
    const diffToMonday = day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const mon = new Date(year, month, diffToMonday);
    const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - mon.getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: monStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D06\u0D34\u0D4D\u0D1A (This Week)" : "This Week", daysCount: daysElapsed };
  }
  if (type === "last_week") {
    const dayOfWeek = now.getDay();
    const diffToLastMonday = day - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
    const lastMon = new Date(year, month, diffToLastMonday);
    const lastSun = new Date(year, month, diffToLastMonday + 6);
    const monStr = `${lastMon.getFullYear()}-${pad(lastMon.getMonth() + 1)}-${pad(lastMon.getDate())}`;
    const sunStr = `${lastSun.getFullYear()}-${pad(lastSun.getMonth() + 1)}-${pad(lastSun.getDate())}`;
    return { fromDate: monStr, toDate: sunStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D06\u0D34\u0D4D\u0D1A (Last Week)" : "Last Week", daysCount: 7 };
  }
  if (type === "this_month") {
    const startStr = `${year}-${pad(month + 1)}-01`;
    return { fromDate: startStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D2E\u0D3E\u0D38\u0D02 (This Month)" : "This Month", daysCount: day };
  }
  if (type === "last_month") {
    const lmYear = month === 0 ? year - 1 : year;
    const lmMonth = month === 0 ? 11 : month - 1;
    const startStr = `${lmYear}-${pad(lmMonth + 1)}-01`;
    const lastDay = new Date(lmYear, lmMonth + 1, 0).getDate();
    const endStr = `${lmYear}-${pad(lmMonth + 1)}-${pad(lastDay)}`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02 (Last Month)" : "Last Month", daysCount: lastDay };
  }
  if (type === "this_quarter") {
    const qStartMonth = Math.floor(month / 3) * 3;
    const startStr = `${year}-${pad(qStartMonth + 1)}-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D15\u0D4D\u0D35\u0D3E\u0D7C\u0D1F\u0D4D\u0D1F\u0D7C (This Quarter)" : "This Quarter", daysCount: daysElapsed };
  }
  if (type === "last_quarter") {
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
    return { fromDate: startStr, toDate: endStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D15\u0D4D\u0D35\u0D3E\u0D7C\u0D1F\u0D4D\u0D1F\u0D7C (Last Quarter)" : "Last Quarter", daysCount: 90 };
  }
  if (type === "this_year") {
    const startStr = `${year}-01-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D35\u0D7C\u0D37\u0D02 (This Year)" : "This Year", daysCount: daysElapsed };
  }
  if (type === "last_year") {
    const ly = year - 1;
    return { fromDate: `${ly}-01-01`, toDate: `${ly}-12-31`, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D35\u0D7C\u0D37\u0D02 (Last Year)" : "Last Year", daysCount: 365 };
  }
  if (type === "last_7_days") {
    const p = new Date(year, month, day - 6);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 7 \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D7E (Last 7 Days)" : "Last 7 Days", daysCount: 7 };
  }
  if (type === "last_30_days") {
    const p = new Date(year, month, day - 29);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 30 \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D7E (Last 30 Days)" : "Last 30 Days", daysCount: 30 };
  }
  if (type === "financial_year") {
    const fyStartYear = month >= 3 ? year : year - 1;
    const startStr = `${fyStartYear}-04-01`;
    const endStr = `${fyStartYear + 1}-03-31`;
    const effectiveTo = todayStr < endStr ? todayStr : endStr;
    const daysElapsed = Math.max(1, Math.round((new Date(effectiveTo).getTime() - new Date(startStr).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: effectiveTo, label: isMal ? `\u0D38\u0D3E\u0D2E\u0D4D\u0D2A\u0D24\u0D4D\u0D24\u0D3F\u0D15 \u0D35\u0D7C\u0D37\u0D02 FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}` : `Financial Year FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`, daysCount: daysElapsed };
  }
  if (customFrom && customTo) {
    const diff = Math.max(1, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    let label = isMal ? `${customFrom} \u0D2E\u0D41\u0D24\u0D7D ${customTo} \u0D35\u0D30\u0D46` : `${customFrom} to ${customTo}`;
    if (customFrom.slice(0, 7) === customTo.slice(0, 7) && customFrom.endsWith("-01")) {
      const [yStr, mStr] = customFrom.slice(0, 7).split("-");
      const y = parseInt(yStr, 10);
      const mIdx = parseInt(mStr, 10) - 1;
      const lastDayOfM = new Date(y, mIdx + 1, 0).getDate();
      if (customTo === `${yStr}-${mStr}-${pad(lastDayOfM)}`) {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const malMonthNames = ["\u0D1C\u0D28\u0D41\u0D35\u0D30\u0D3F", "\u0D2B\u0D46\u0D2C\u0D4D\u0D30\u0D41\u0D35\u0D30\u0D3F", "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D4D", "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D7D", "\u0D2E\u0D47\u0D2F\u0D4D", "\u0D1C\u0D42\u0D7E", "\u0D1C\u0D42\u0D32\u0D48", "\u0D13\u0D17\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D", "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C", "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C\u0D7C", "\u0D28\u0D35\u0D02\u0D2C\u0D7C", "\u0D21\u0D3F\u0D38\u0D02\u0D2C\u0D7C"];
        label = isMal ? `${malMonthNames[mIdx]} ${y}` : `${monthNames[mIdx]} ${y}`;
      }
    } else if (customFrom === customTo) {
      label = customFrom;
    }
    return {
      fromDate: customFrom,
      toDate: customTo,
      label,
      daysCount: diff
    };
  }
  return { fromDate: todayStr, toDate: todayStr, label: todayStr, daysCount: 1 };
}
function extractDateFromText(text) {
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
    const parsed = dmyMatches.map((m) => {
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
      const now = /* @__PURE__ */ new Date();
      const p = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
      const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
      const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { fromDate: fromStr, toDate: toStr };
    }
  }
  const monthMap = {
    january: { monthIndex: 0, en: "January", ml: "\u0D1C\u0D28\u0D41\u0D35\u0D30\u0D3F" },
    jan: { monthIndex: 0, en: "January", ml: "\u0D1C\u0D28\u0D41\u0D35\u0D30\u0D3F" },
    february: { monthIndex: 1, en: "February", ml: "\u0D2B\u0D46\u0D2C\u0D4D\u0D30\u0D41\u0D35\u0D30\u0D3F" },
    feb: { monthIndex: 1, en: "February", ml: "\u0D2B\u0D46\u0D2C\u0D4D\u0D30\u0D41\u0D35\u0D30\u0D3F" },
    march: { monthIndex: 2, en: "March", ml: "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D4D" },
    mar: { monthIndex: 2, en: "March", ml: "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D4D" },
    april: { monthIndex: 3, en: "April", ml: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D7D" },
    apr: { monthIndex: 3, en: "April", ml: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D7D" },
    may: { monthIndex: 4, en: "May", ml: "\u0D2E\u0D47\u0D2F\u0D4D" },
    june: { monthIndex: 5, en: "June", ml: "\u0D1C\u0D42\u0D7E" },
    jun: { monthIndex: 5, en: "June", ml: "\u0D1C\u0D42\u0D7E" },
    july: { monthIndex: 6, en: "July", ml: "\u0D1C\u0D42\u0D32\u0D48" },
    jul: { monthIndex: 6, en: "July", ml: "\u0D1C\u0D42\u0D32\u0D48" },
    august: { monthIndex: 7, en: "August", ml: "\u0D13\u0D17\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D" },
    aug: { monthIndex: 7, en: "August", ml: "\u0D13\u0D17\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D" },
    september: { monthIndex: 8, en: "September", ml: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C" },
    sep: { monthIndex: 8, en: "September", ml: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C" },
    sept: { monthIndex: 8, en: "September", ml: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C" },
    october: { monthIndex: 9, en: "October", ml: "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C\u0D7C" },
    oct: { monthIndex: 9, en: "October", ml: "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C\u0D7C" },
    november: { monthIndex: 10, en: "November", ml: "\u0D28\u0D35\u0D02\u0D2C\u0D7C" },
    nov: { monthIndex: 10, en: "November", ml: "\u0D28\u0D35\u0D02\u0D2C\u0D7C" },
    december: { monthIndex: 11, en: "December", ml: "\u0D21\u0D3F\u0D38\u0D02\u0D2C\u0D7C" },
    dec: { monthIndex: 11, en: "December", ml: "\u0D21\u0D3F\u0D38\u0D02\u0D2C\u0D7C" }
  };
  const malRoots = [
    { root: "\u0D1C\u0D28\u0D41\u0D35\u0D30\u0D3F", idx: 0, en: "January", ml: "\u0D1C\u0D28\u0D41\u0D35\u0D30\u0D3F" },
    { root: "\u0D2B\u0D46\u0D2C\u0D4D\u0D30\u0D41\u0D35\u0D30\u0D3F", idx: 1, en: "February", ml: "\u0D2B\u0D46\u0D2C\u0D4D\u0D30\u0D41\u0D35\u0D30\u0D3F" },
    { root: "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D4D", idx: 2, en: "March", ml: "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D4D" },
    { root: "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D3F", idx: 2, en: "March", ml: "\u0D2E\u0D3E\u0D7C\u0D1A\u0D4D\u0D1A\u0D4D" },
    { root: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D7D", idx: 3, en: "April", ml: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D7D" },
    { root: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F", idx: 3, en: "April", ml: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D7D" },
    { root: "\u0D2E\u0D47\u0D2F\u0D4D", idx: 4, en: "May", ml: "\u0D2E\u0D47\u0D2F\u0D4D" },
    { root: "\u0D1C\u0D42\u0D7E", idx: 5, en: "June", ml: "\u0D1C\u0D42\u0D7E" },
    { root: "\u0D1C\u0D42\u0D23\u0D3F", idx: 5, en: "June", ml: "\u0D1C\u0D42\u0D7E" },
    { root: "\u0D1C\u0D42\u0D32\u0D48", idx: 6, en: "July", ml: "\u0D1C\u0D42\u0D32\u0D48" },
    { root: "\u0D13\u0D17\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D", idx: 7, en: "August", ml: "\u0D13\u0D17\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D" },
    { root: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C", idx: 8, en: "September", ml: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C" },
    { root: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C", idx: 8, en: "September", ml: "\u0D38\u0D46\u0D2A\u0D4D\u0D31\u0D4D\u0D31\u0D02\u0D2C\u0D7C" },
    { root: "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C\u0D7C", idx: 9, en: "October", ml: "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C\u0D7C" },
    { root: "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C", idx: 9, en: "October", ml: "\u0D12\u0D15\u0D4D\u0D1F\u0D4B\u0D2C\u0D7C" },
    { root: "\u0D28\u0D35\u0D02\u0D2C\u0D7C", idx: 10, en: "November", ml: "\u0D28\u0D35\u0D02\u0D2C\u0D7C" },
    { root: "\u0D28\u0D35\u0D02\u0D2C", idx: 10, en: "November", ml: "\u0D28\u0D35\u0D02\u0D2C\u0D7C" },
    { root: "\u0D21\u0D3F\u0D38\u0D02\u0D2C\u0D7C", idx: 11, en: "December", ml: "\u0D21\u0D3F\u0D38\u0D02\u0D2C\u0D7C" },
    { root: "\u0D21\u0D3F\u0D38\u0D02\u0D2C", idx: 11, en: "December", ml: "\u0D21\u0D3F\u0D38\u0D02\u0D2C\u0D7C" }
  ];
  let foundMonthInfo = null;
  const malFound = malRoots.find((m) => text.includes(m.root));
  if (malFound) {
    foundMonthInfo = { monthIndex: malFound.idx, en: malFound.en, ml: malFound.ml, matchedWord: malFound.root };
  } else {
    const enMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i);
    if (enMatch) {
      const word = enMatch[0].toLowerCase();
      if (word === "may") {
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
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getFullYear();
    const yearMatch = text.match(/\b(20\d\d)\b/);
    const targetYear = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;
    const dayBeforeMatch = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${foundMonthInfo.matchedWord}\\b`, "i"));
    const dayAfterMatch = text.match(new RegExp(`\\b${foundMonthInfo.matchedWord}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
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
var OfflineAiIntentParser = class {
  static parse(message, history = []) {
    const raw = message.trim();
    const text = normalizeInput(message);
    const lastUserMsg = [...history].reverse().find((m) => m.role === "user")?.content?.toLowerCase() || "";
    const dateExtraction = extractDateFromText(raw);
    if (text.includes("converted bills") || text.includes("counted twice") || text.includes("counted more than once") || text.includes("double counted") || text.includes("duplicate counting")) {
      return { intent: "DIAGNOSTIC_DEDUPLICATION_CHECK", domain: "DIAGNOSTICS", params: {} };
    }
    if (text.includes("payment allocations do not match") || text.includes("allocations do not match") || text.includes("allocation mismatch") || text.includes("payment reconciliation")) {
      return { intent: "DIAGNOSTIC_PAYMENT_RECONCILIATION", domain: "DIAGNOSTICS", params: {} };
    }
    if (text.includes("asked twice") || text.includes("without any data changes") || text.includes("remain the same") || text.includes("deterministic") || text.includes("without an internet connection") || text.includes("distinguish between zero sales")) {
      return {
        intent: "AI_CAPABILITIES_EXPLANATION",
        domain: "HELP",
        params: { topic: text.includes("asked twice") ? "determinism" : text.includes("internet") ? "offline" : "diagnostics" }
      };
    }
    if (text.includes("what reports can you generate") || text.includes("which operations are supported") || text.includes("what reports do you have") || text.includes("examples of questions") || text.includes("what can i ask") || text.includes("what data was included") || text.includes("supported offline")) {
      return { intent: "AI_HELP_REPORTS", domain: "HELP", params: {} };
    }
    if (text.includes("predict") || text.includes("forecast") || text.includes("future sales") || text.includes("weather") || text.includes("\u0D15\u0D3E\u0D32\u0D3E\u0D35\u0D38\u0D4D\u0D25") || text.includes("send email") || text.includes("send an email") || text.includes("send sms") || text.includes("whatsapp") || text.includes("browse web") || text.includes("search google") || text.includes("who is the president") || text.includes("who is the prime minister")) {
      return { intent: "UNSUPPORTED_REQUEST", domain: "HELP", params: { rawQuery: message } };
    }
    if (text === "show sales" || text === "sales" || text === "\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D" || text === "sales report" || text === "\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "sales_period",
          message: "Which sales period would you like to see? You can specify: Today, Yesterday, This Month, Last Month, or a custom date range.",
          messageMal: "\u0D0F\u0D24\u0D4D \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D3F\u0D32\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D3E\u0D23\u0D4D \u0D15\u0D3E\u0D23\u0D47\u0D23\u0D4D\u0D1F\u0D24\u0D4D? \u0D07\u0D28\u0D4D\u0D28\u0D4D, \u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46, \u0D08 \u0D2E\u0D3E\u0D38\u0D02, \u0D05\u0D32\u0D4D\u0D32\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D7D \u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02 \u0D0E\u0D28\u0D4D\u0D28\u0D4D \u0D35\u0D4D\u0D2F\u0D15\u0D4D\u0D24\u0D2E\u0D3E\u0D15\u0D4D\u0D15\u0D3E\u0D2E\u0D4B?"
        },
        clarificationRequired: true
      };
    }
    if (text === "balance" || text === "show balance" || text === "\u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D" || text === "\u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "balance_type",
          message: "Which balance would you like to review?\n1. Customer Outstanding Balance (Receivables)\n2. Supplier Outstanding Balance (Payables)\n3. Cash Register Drawer Balance",
          messageMal: "\u0D0F\u0D24\u0D4D \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D33\u0D3E\u0D23\u0D4D \u0D05\u0D31\u0D3F\u0D2F\u0D47\u0D23\u0D4D\u0D1F\u0D24\u0D4D?\n1. \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F (\u0D24\u0D30\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D)\n2. \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F (\u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D)\n3. \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D (\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D7C \u0D2C\u0D4B\u0D15\u0D4D\u0D38\u0D4D)"
        },
        clarificationRequired: true
      };
    }
    if (text === "report" || text === "show report" || text === "details" || text === "show details" || text === "show me the details" || text === "\u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D" || text === "\u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E" || text === "summary") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "report_module",
          message: "Which business report would you like to view?\n1. Sales & Revenue Summary\n2. Inventory & Stock Status\n3. Expenses & Cash Payouts\n4. Purchase Bills & Payables\n5. Customer & Supplier Ledgers",
          messageMal: "\u0D0F\u0D24\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D33\u0D3E\u0D23\u0D4D \u0D15\u0D3E\u0D23\u0D47\u0D23\u0D4D\u0D1F\u0D24\u0D4D?\n1. \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Sales Report)\n2. \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D28\u0D3F\u0D32\u0D35\u0D3E\u0D30\u0D02 (Inventory Status)\n3. \u0D1A\u0D46\u0D32\u0D35\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Expenses Report)\n4. \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Purchase Bills)\n5. \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C/\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D32\u0D46\u0D21\u0D4D\u0D1C\u0D7C (Ledgers)"
        },
        clarificationRequired: true
      };
    }
    if (text === "how much money did we make" || text === "how much did we make" || text === "\u0D28\u0D2E\u0D41\u0D15\u0D4D\u0D15\u0D4D \u0D0E\u0D24\u0D4D\u0D30 \u0D2A\u0D23\u0D02 \u0D15\u0D3F\u0D1F\u0D4D\u0D1F\u0D3F" || text === "\u0D0E\u0D24\u0D4D\u0D30 \u0D30\u0D42\u0D2A\u0D2F\u0D41\u0D23\u0D4D\u0D1F\u0D3E\u0D2F\u0D3F") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "financial_metric",
          message: "To give you the exact figure, would you like to check: 1. Total Sales Revenue, 2. Cash Collected in Drawer, or 3. Net Invoiced Sales (after discounts)?",
          messageMal: "\u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D24\u0D41\u0D15 \u0D28\u0D7D\u0D15\u0D3E\u0D7B \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D7E \u0D09\u0D26\u0D4D\u0D26\u0D47\u0D36\u0D3F\u0D1A\u0D4D\u0D1A\u0D24\u0D4D \u0D0F\u0D24\u0D3E\u0D23\u0D4D: 1. \u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 (Sales Revenue), 2. \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D31\u0D3F\u0D7D \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A \u0D2A\u0D23\u0D02 (Cash Collected), \u0D05\u0D24\u0D4B 3. \u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (Net Sales)?"
        },
        clarificationRequired: true
      };
    }
    if (text.includes("most profitable products") || text.includes("highest profit product") || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D32\u0D3E\u0D2D\u0D2E\u0D41\u0D33\u0D4D\u0D33")) {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "profit_limitation",
          message: "Accurate profit calculation requires item-level Cost of Goods Sold (COGS) recorded for each transaction batch. Currently, you can view the highest revenue generating products or top-selling items instead.",
          messageMal: "\u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28 \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D32\u0D3E\u0D2D\u0D02 \u0D05\u0D31\u0D3F\u0D2F\u0D3E\u0D7B \u0D13\u0D30\u0D4B \u0D2C\u0D3E\u0D1A\u0D4D\u0D1A\u0D3F\u0D28\u0D4D\u0D31\u0D46\u0D2F\u0D41\u0D02 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D15\u0D4B\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D \u0D06\u0D35\u0D36\u0D4D\u0D2F\u0D2E\u0D3E\u0D23\u0D4D. \u0D2A\u0D15\u0D30\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 \u0D28\u0D47\u0D1F\u0D3F\u0D24\u0D4D\u0D24\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D33\u0D4B \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D41\u0D2A\u0D4B\u0D2F \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D33\u0D4B \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D35\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D3E\u0D23\u0D4D."
        },
        clarificationRequired: true
      };
    }
    const isExpenseWord = (text.includes("expense") || text.includes("expenses") || text.includes("spending") || text.includes("\u0D1A\u0D46\u0D32") || text.includes("\u0D1A\u0D3F\u0D32") || text.includes("chilav") || text.includes("chilar") || text.includes("cash out") || text.includes("payout")) && !text.includes("customer") && !text.includes("spending customer");
    if (isExpenseWord) {
      if (text.includes("cash was paid out") || text.includes("cash paid out for expenses") || text.includes("cash") && text.includes("today") && text.includes("expense")) {
        return { intent: "EXPENSES_CASH_TODAY", domain: "EXPENSES", params: { rangeType: "today" } };
      }
      if (text.includes("category") || text.includes("highest spending") || text.includes("grouped by category") || text.includes("\u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F")) {
        let rangeType2 = "this_month";
        if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType2 = "today";
        else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType2 = "last_month";
        return { intent: "EXPENSES_BY_CATEGORY", domain: "EXPENSES", params: { rangeType: rangeType2 } };
      }
      if (text.includes("largest") || text.includes("biggest") || text.includes("highest expense") || text.includes("\u0D15\u0D42\u0D1F\u0D3F\u0D2F \u0D1A\u0D46\u0D32\u0D35\u0D4D")) {
        let rangeType2 = "this_month";
        if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType2 = "today";
        return { intent: "EXPENSES_LARGEST", domain: "EXPENSES", params: { rangeType: rangeType2, limit: 5 } };
      }
      if (text.includes("compare") || text.includes("\u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02")) {
        return { intent: "EXPENSES_COMPARE", domain: "EXPENSES", params: { compareWith: "last_month" } };
      }
      let rangeType = "this_month";
      if (text.includes("\u0D07\u0D28\u0D4D\u0D28") && !text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("today") || text.includes("innathe") || text.includes("innu")) rangeType = "today";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46") || text.includes("innale")) rangeType = "yesterday";
      else if (text.includes("last 30 days") || text.includes("30 \u0D26\u0D3F\u0D35\u0D38")) rangeType = "last_30_days";
      else if (text.includes("last 7 days") || text.includes("7 \u0D26\u0D3F\u0D35\u0D38")) rangeType = "last_7_days";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      else if (text.includes("ee masathe") || text.includes("ee masam")) rangeType = "this_month";
      return {
        intent: "EXPENSES_SUMMARY",
        domain: "EXPENSES",
        params: { rangeType, customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate }
      };
    }
    const isStockWord = text.includes("stock") || text.includes("\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D") || text.includes("\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15") || text.includes("\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D") || text.includes("inventory") || text.includes("\u0D07\u0D7B\u0D35\u0D46\u0D28\u0D4D\u0D31\u0D31\u0D3F") || text.includes("theernna") || text.includes("theernnath");
    if (isStockWord) {
      if (text.includes("out of stock") || text.includes("\u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41\u0D2A\u0D4B\u0D2F") || text.includes("\u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28") || text.includes("zero stock") || text.includes("\u0D28\u0D3F\u0D32\u0D35\u0D3F\u0D32\u0D3F\u0D32\u0D4D\u0D32\u0D3E\u0D24\u0D4D\u0D24") || text.includes("theernna") || text.includes("theernnath")) {
        return { intent: "INVENTORY_OUT_OF_STOCK", domain: "INVENTORY", params: {} };
      }
      if (text.includes("low stock") || text.includes("reorder") || text.includes("\u0D24\u0D40\u0D30\u0D3E\u0D31\u0D3E\u0D2F") || text.includes("\u0D15\u0D41\u0D31\u0D35\u0D41\u0D33\u0D4D\u0D33")) {
        return { intent: "INVENTORY_LOW_STOCK", domain: "INVENTORY", params: {} };
      }
      if (text.includes("value") || text.includes("valuation") || text.includes("\u0D2E\u0D42\u0D32\u0D4D\u0D2F\u0D02") || text.includes("worth")) {
        return { intent: "INVENTORY_TOTAL_VALUE", domain: "INVENTORY", params: {} };
      }
      if (text.includes("highest stock") || text.includes("most stock") || text.includes("\u0D15\u0D42\u0D1F\u0D3F\u0D2F \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D")) {
        return { intent: "INVENTORY_TOP_STOCK", domain: "INVENTORY", params: { limit: 10 } };
      }
      if (text.includes("not sold") || text.includes("non selling") || text.includes("not sold in the last") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D28\u0D1F\u0D15\u0D4D\u0D15\u0D3E\u0D24\u0D4D\u0D24") || text.includes("dead stock")) {
        return { intent: "INVENTORY_NON_SELLING", domain: "INVENTORY", params: { days: 30 } };
      }
      if (text.includes("by category") || text.includes("grouped by category") || text.includes("\u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D4D")) {
        return { intent: "INVENTORY_BY_CATEGORY", domain: "INVENTORY", params: {} };
      }
      const prodCandidate = text.replace(/\b(what\s+is|what's|show|check|tell\s+me|get|find|current|stock|level|quantity|qty|available|of|the|a|for|product|item|സ്റ്റോക്ക്|എത്ര|ഉണ്ട്|ഉൽപ്പന്നം)\b/gi, " ").replace(/[?.,!:]/g, " ").trim();
      if (prodCandidate.length >= 2 && !prodCandidate.includes("low") && !prodCandidate.includes("out") && !prodCandidate.includes("total")) {
        return { intent: "INVENTORY_PRODUCT_STOCK", domain: "INVENTORY", params: { productName: prodCandidate } };
      }
      return { intent: "INVENTORY_LOW_STOCK", domain: "INVENTORY", params: {} };
    }
    const isPurchaseWord = text.includes("purchase") || text.includes("purchases") || text.includes("\u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D") || text.includes("supplier bill") || text.includes("vendor bill") || text.includes("bought");
    if (isPurchaseWord && !text.includes("customer") && !text.includes("\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C")) {
      if (text.includes("price history") || text.includes("history of a product") || text.includes("purchase history of") || text.includes("latest purchase price")) {
        const prodMatch = text.replace(/.*(?:price history for|purchase history for|history for|for|of|of a|product)s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PURCHASES_PRODUCT_HISTORY", domain: "PURCHASES", params: { productName: prodMatch } };
      }
      if (text.includes("grouped by supplier") || text.includes("by supplier") || text.includes("highest purchase amount") || text.includes("\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D4D")) {
        let rangeType2 = "this_month";
        if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType2 = "today";
        return { intent: "PURCHASES_BY_SUPPLIER", domain: "PURCHASES", params: { rangeType: rangeType2 } };
      }
      if (text.includes("unpaid") || text.includes("partially paid") || text.includes("\u0D2A\u0D23\u0D02 \u0D28\u0D7D\u0D15\u0D3E\u0D24\u0D4D\u0D24") || text.includes("pending purchase")) {
        return { intent: "PURCHASES_UNPAID", domain: "PURCHASES", params: {} };
      }
      if (text.includes("compare") || text.includes("\u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02")) {
        return { intent: "PURCHASES_COMPARE", domain: "PURCHASES", params: { compareWith: "last_month" } };
      }
      let rangeType = "this_month";
      if (text.includes("\u0D07\u0D28\u0D4D\u0D28") && !text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("today")) rangeType = "today";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      return {
        intent: "PURCHASES_SUMMARY",
        domain: "PURCHASES",
        params: { rangeType, customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate }
      };
    }
    const isDrawerWord = text.includes("cash drawer") || text.includes("drawer balance") || text.includes("cash register") || text.includes("\u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C") || text.includes("counter cash") || text.includes("drawer") || text.includes("cash settlement") || text.includes("cashier settlement") || text.includes("settlements") || text.includes("expected cash") || text.includes("counted cash") || text.includes("closing cash") || text.includes("settlement differences") || text.includes("cash-in and cash-out") || text.includes("cash in and cash out") || text.includes("paid out from the register");
    if (isDrawerWord && !text.includes("sales by cash register")) {
      if (text.includes("expected cash") || text.includes("counted cash") || text.includes("settlement differences") || text.includes("short") || text.includes("excess")) {
        return { intent: "CASH_DRAWER_EXPECTED_VS_ACTUAL", domain: "CASH_DRAWER", params: {} };
      }
      if (text.includes("inflows") || text.includes("outflows") || text.includes("movements") || text.includes("cash-in") || text.includes("cash in and") || text.includes("withdrawals") || text.includes("deposits")) {
        return { intent: "CASH_DRAWER_MOVEMENTS", domain: "CASH_DRAWER", params: { rangeType: "today" } };
      }
      if (text.includes("paid out from the register")) {
        return { intent: "EXPENSES_CASH_TODAY", domain: "EXPENSES", params: { rangeType: "today" } };
      }
      if (text.includes("history") || text.includes("settlements") || text.includes("closing cash")) {
        return { intent: "CASH_DRAWER_SETTLEMENTS", domain: "CASH_DRAWER", params: {} };
      }
      return { intent: "CASH_DRAWER_CURRENT", domain: "CASH_DRAWER", params: {} };
    }
    if (text.includes("partially paid") || text.includes("\u0D2A\u0D15\u0D41\u0D24\u0D3F \u0D2A\u0D23\u0D02 \u0D28\u0D7D\u0D15\u0D3F\u0D2F")) {
      return { intent: "BILLS_PARTIALLY_PAID", domain: "BILLS", params: {} };
    }
    if (text.includes("unpaid bills") || text.includes("unpaid invoices") || text.includes("overdue bills") || text.includes("\u0D2A\u0D23\u0D02 \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D24\u0D4D\u0D24 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E") || text.includes("how many unpaid bills")) {
      return { intent: "BILLS_UNPAID", domain: "BILLS", params: {} };
    }
    if (text.includes("loyalty") || text.includes("reward points") || text.includes("\u0D2A\u0D4B\u0D2F\u0D3F\u0D28\u0D4D\u0D31\u0D4D")) {
      const custName = text.replace(/.*(customer|for|of)\s+/i, "").replace(/[?.,!]/g, "").trim();
      return { intent: "LOYALTY_POINTS", domain: "RETURNS_LOYALTY", params: { customerName: custName } };
    }
    if (text.includes("returned products") || text.includes("returned items") || text.includes("items were returned") || text.includes("products were returned") || text.includes("\u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D24\u0D28\u0D4D\u0D28 \u0D38\u0D3E\u0D27\u0D28\u0D19\u0D4D\u0D19\u0D7E")) {
      return { intent: "RETURNS_ITEMS", domain: "RETURNS_LOYALTY", params: { rangeType: "this_month" } };
    }
    if (text.includes("refunds by payment method") || text.includes("refund method")) {
      return { intent: "RETURNS_BY_METHOD", domain: "RETURNS_LOYALTY", params: { rangeType: "this_month" } };
    }
    if (text.includes("sales returns recorded today") || text.includes("all sales returns recorded today") || text.includes("sales returns were processed") || text.includes("how many sales returns") || text.includes("sales returns this month") || text.includes("sales returns today") || text.includes("\u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D7A")) {
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "RETURNS_SUMMARY", domain: "RETURNS_LOYALTY", params: { rangeType } };
    }
    if (text.includes("discount greater than") || text.includes("discounts greater than") || text.includes("total discount amount for each invoice") || text.includes("invoices with discounts")) {
      const amtMatch = text.match(/(?:₹|rs.?|inr)?\s*(\d[\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ""), 10) : 500;
      return { intent: "DISCOUNTS_SUMMARY", domain: "RETURNS_LOYALTY", params: { minAmount, rangeType: "today" } };
    }
    if (text.includes("price of") || text.includes("cost of") || text.includes("retail price") || text.includes("wholesale price") || text.includes("tax rate of") || text.includes("gst rate") || text.includes("\u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D") || text.includes("barcode")) {
      const hasBarcodeQuery = text.includes("barcode for") || text.includes("barcode of") || text.includes("gst rate and barcode") || text.includes("gst rate for");
      if (hasBarcodeQuery) {
        const prodName = text.replace(/.*(?:barcode for|barcode of|gst rate and barcode for|gst rate for|price and barcode of|for)\s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PRODUCT_PRICE_LOOKUP", domain: "PRICING", params: { productName: prodName, includeBarcode: true } };
      }
      if (text.includes("barcode") || text.includes("\u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D") || text.includes("item code")) {
        const codeMatch = text.replace(/.*(?:barcode|code)\s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PRODUCT_BARCODE_LOOKUP", domain: "PRICING", params: { code: codeMatch } };
      }
      if (!text.includes("sales") && !text.includes("purchase")) {
        const prodName = text.replace(/.*(?:price of|cost of|rate of|rate for)\s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PRODUCT_PRICE_LOOKUP", domain: "PRICING", params: { productName: prodName } };
      }
    }
    if (text.includes("owe suppliers") || text.includes("we owe to suppliers") || text.includes("owe to all suppliers") || text.includes("supplier payables") || text.includes("kadam kodukkanullath") || text.includes("suppliersinu kodukkanulla") || text.includes("kodukkanulla cash") || text.includes("\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C\u0D2E\u0D3E\u0D7C\u0D15\u0D4D\u0D15\u0D4D \u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D")) {
      return { intent: "SUPPLIER_PAYABLES_TOTAL", domain: "LEDGER", params: {} };
    }
    const isCreditOrLedger = text.includes("credit") || text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D") || text.includes("\u0D15\u0D1F\u0D02") || text.includes("kadam") || text.includes("\u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15") || text.includes("receivable") || text.includes("debtor") || text.includes("balance") || text.includes("\u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F") || text.includes("\u0D32\u0D46\u0D21\u0D4D\u0D1C\u0D7C") || text.includes("ledger") || text.includes("owe us") || text.includes("owes us") || text.includes("who owes") || text.includes("customers owe") || text.includes("statement");
    if (text.includes("credit remains outstanding") || text.includes("outstanding from credit invoices") || text.includes("credit outstanding")) {
      return { intent: "SALES_CREDIT_OUTSTANDING", domain: "SALES", params: { rangeType: "this_month" } };
    }
    if (isCreditOrLedger && !text.includes("credit sales") && !text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D")) {
      const amtMatch = text.match(/(?:₹|rs.?|inr)?\s*(\d[\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ""), 10) : 0;
      const limitMatch = text.match(/\btop\s+(\d+)\b/i);
      let limit = 15;
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
      } else if (/\b(top|highest|biggest|number 1|#1)\s+(credit\s+)?customer\b/i.test(text) && !/\bcustomers\b/i.test(text) || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D1F\u0D2E\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C") || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D09\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C") || text === "who is the top credit customer" || text === "who is the top credit customer?" || text === "who are the top credit customer" || text === "who are the top credit customer?") {
        limit = 1;
      }
      const isListWord = text.includes("\u0D32\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D") || text.includes("list") || text.includes("top credit") || text.includes("who are our top") || text.includes("top 5 credit") || text.includes("who are") || text.includes("who is") || text.includes("customers owe us") || text.includes("debtors") || text.includes("receivables") || text.includes("above") || text.includes("greater than") || text.includes("aarokkeyanu kadam") || text.includes("kadam tharanulla") || text.includes("kadam ethraya") || text.includes("kadam ullavar") || text.includes("who owes us") || text.includes("top debtor") || text.includes("who owes the most");
      if (isListWord || minAmount > 0 || limit === 1) {
        return { intent: "CUSTOMER_CREDIT_LIST", domain: "LEDGER", params: { minAmount: minAmount || 0, limit } };
      }
      const candidateName = text.replace(/['’]s\b/gi, " ").replace(/\b(what\s+is|what's|how\s+much|show\s+me|show|check|get|find|tell\s+me|tell|view|display|please|recent)\b/gi, " ").replace(/\b(credit\s+balance|credit\s+amount|balance\s+amount|pending\s+amount|due\s+amount|outstanding\s+amount)\b/gi, " ").replace(/\b(balance\s+of|balance\s+for|ledger\s+transactions\s+for|ledger\s+for|statement\s+for)\b/gi, " ").replace(/\b(balance|credit|ledger|statement|account|due|receivables?|debtors?|outstanding|pending|amount|customer|party|transactions|the|of|for)\b/gi, " ").replace(/\b(total|all|overall|list|summary|report|status|overview|details?|who|someone|anyone|everyone|every|full|complete|aggregate|sum|count|highest|top|maximum|max|minimum|min|many|much|owes?|money|people|persons?|accounts?|users?|clients?)\b/gi, " ").replace(/[₹$]|inr|rs\.?/gi, " ").replace(/(?:ന്റെ|യുടെ|ടെ|ൽ|ല്)\b/g, " ").replace(/(?:മൊത്തം|ആകെ|എല്ലാ|എല്ലാവരുടെയും|ലിസ്റ്റ്|പട്ടിക|വിവരം|വിവരങ്ങൾ|സംഗ്രഹം)/g, " ").replace(/(?:എത്രയാണ്|എത്ര|ആണ്|കാണിക്കൂ|തരുമോ|നോക്കൂ|റിപ്പോർട്ട്|ബാലൻസ്|ബാക്കി|തുക|ക്രെഡിറ്റ്|കടം|കുടിശ്ശിക|ലെഡ്ജർ|സ്റ്റേറ്റ്മെന്റ്|കസ്റ്റമർ|കസ്റ്റമേഴ്സ്|പാർട്ടി)/g, " ").replace(/[?.,!:\-_/\\#@*]/g, " ").trim();
      if (candidateName.length >= 2 && !/^\d+$/.test(candidateName)) {
        return { intent: "PARTY_LEDGER", domain: "LEDGER", params: { searchQuery: candidateName } };
      }
      return { intent: "CUSTOMER_CREDIT_LIST", domain: "LEDGER", params: { minAmount: 0, limit: 15 } };
    }
    if (text.includes("last hour") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D7C") || text.includes("\u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D46") || text.includes("hourly sales") || text.includes("sales during the last hour") || /between\s+\d+.*?(?:am|pm|:)\s+and\s+\d+/i.test(text)) {
      const isLastHour = text.includes("last hour") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D7C") || text.includes("\u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D46");
      return { intent: "SALES_HOURLY", domain: "SALES", params: { isLastHour } };
    }
    if (text.includes("cancelled") || text.includes("canceled") || text.includes("\u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F") || text.includes("\u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D4D\u0D1F") || text.includes("voided") || text.includes("void bills")) {
      return { intent: "SALES_CANCELLED_INVOICES", domain: "SALES", params: {} };
    }
    const isPaymentMethodQuery = text.includes("cash sales") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D") && (text.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28") || text.includes("\u0D0E\u0D24\u0D4D\u0D30")) || text.includes("credit sales") || text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("paid by card") || text.includes("card sales") || text.includes("paid through upi") || text.includes("paid by upi") || text.includes("upi sales") || text.includes("\u0D2F\u0D41\u0D2A\u0D3F\u0D10") && (text.includes("\u0D0E\u0D24\u0D4D\u0D30") || text.includes("\u0D35\u0D34\u0D3F") || text.includes("\u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A\u0D41")) || text.includes("by payment method") || text.includes("payment methods") || text.includes("\u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D30\u0D40\u0D24\u0D3F") || text.includes("cash and credit") || text.includes("split payments") || text.includes("split payment") || text.includes("unique invoices and total invoice value") || text.includes("multiple payment methods");
    if (isPaymentMethodQuery) {
      let method = "ALL";
      if ((text.includes("upi") || text.includes("\u0D2F\u0D41\u0D2A\u0D3F\u0D10")) && (text.includes("cash") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D"))) method = "ALL";
      else if (text.includes("cash sales") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("cash was collected from sales")) method = "CASH";
      else if (text.includes("credit sales") || text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D")) method = "CREDIT";
      else if (text.includes("card")) method = "CARD";
      else if (text.includes("upi") || text.includes("\u0D2F\u0D41\u0D2A\u0D3F\u0D10")) method = "UPI";
      let rangeType = "today";
      if (dateExtraction.fromDate && dateExtraction.toDate) rangeType = "custom";
      else if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return {
        intent: "SALES_PAYMENT_METHODS",
        domain: "SALES",
        params: {
          method,
          rangeType,
          customFrom: dateExtraction.fromDate,
          customTo: dateExtraction.toDate
        }
      };
    }
    if (text.includes("credit remains outstanding") || text.includes("outstanding from credit invoices")) {
      return { intent: "SALES_CREDIT_OUTSTANDING", domain: "SALES", params: { rangeType: "this_month" } };
    }
    if (text.includes("gross sales") || text.includes("net sales") || text.includes("discount") || text.includes("\u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D") || text.includes("tax was collected") || text.includes("sales return was recorded") || text.includes("tax was included") || text.includes("tax collected on sales")) {
      let metric = "all";
      if (text.includes("discount")) metric = "discount";
      else if (text.includes("tax")) metric = "tax";
      else if (text.includes("return")) metric = "return";
      else if (text.includes("gross")) metric = "gross";
      else if (text.includes("net")) metric = "net";
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "SALES_GROSS_NET", domain: "SALES", params: { metric, rangeType } };
    }
    if (text.includes("invoice type") || text.includes("bill of supply") || text.includes("bills of supply") || text.includes("gst sales") || text.includes("\u0D2C\u0D3F\u0D7D \u0D13\u0D2B\u0D4D \u0D38\u0D2A\u0D4D\u0D32\u0D48")) {
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      return { intent: "SALES_INVOICE_TYPES", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("highest-value invoice") || text.includes("highest value invoice") || text.includes("highest invoice") || text.includes("lowest-value invoice") || text.includes("invoices greater than")) {
      const isLowest = text.includes("lowest");
      const amtMatch = text.match(/(?:greater than|above|>)\s*(\d+)/i);
      const minAmount = amtMatch ? parseInt(amtMatch[1], 10) : void 0;
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      return { intent: "SALES_INVOICE_EXTREMES", domain: "SALES", params: { isLowest, minAmount, rangeType } };
    }
    if (text.includes("average daily") || text.includes("average sales per day") || text.includes("daily average") || text.includes("average number of bills per day") || text.includes("average bills per day") || text.includes("\u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F")) {
      let rangeType = "this_month";
      if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      return { intent: "SALES_AVERAGE_DAILY", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("how many invoices") || text.includes("how many bills") || text.includes("invoice count") || text.includes("bills count") || text.includes("number of bills") || text.includes("\u0D0E\u0D24\u0D4D\u0D30 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E") || text.includes("\u0D0E\u0D24\u0D4D\u0D30 \u0D07\u0D7B\u0D35\u0D4B\u0D2F\u0D4D\u0D38\u0D4D") || text.includes("bill adichu") || text.includes("ethra bill") || text.includes("ethra invoice") || text.includes("paid in full") || text.includes("bills were generated") || text.includes("bills were created")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "SALES_INVOICE_COUNT", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("average ticket") || text.includes("avg ticket") || text.includes("average bill value") || text.includes("\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "this_month";
      return { intent: "SALES_AVERAGE_TICKET", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("unique customers") || text.includes("\u0D35\u0D4D\u0D2F\u0D24\u0D4D\u0D2F\u0D38\u0D4D\u0D24 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C") || text.includes("how many") && text.includes("customers purchased")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "this_month";
      return { intent: "SALES_UNIQUE_CUSTOMERS", domain: "SALES", params: { rangeType } };
    }
    // Highest / Lowest Month
    if (
      /(which|what) month.*(highest|most|best|peak|maximum|lowest|worst|least) sales?/.test(text) ||
      /(which|what) month.*(highest|most|best|peak|maximum|lowest|worst|least)/.test(text) ||
      /(highest|lowest|best|worst|peak|maximum|most) (sales|revenue|sale) month/.test(text) ||
      /(best|top|peak) month for (sales|revenue|sale)/.test(text) ||
      /month (with|of) (the )?(highest|lowest|best|worst|peak|maximum|most) (sales|revenue|sale)/.test(text) ||
      ((text.includes('month') || text.includes('\u0D2E\u0D3E\u0D38\u0D02') || text.includes('masam') || text.includes('masathil')) &&
        (text.includes('highest sales') || text.includes('highest sale') || text.includes('best sales') || text.includes('most sales') || text.includes('lowest sales') || text.includes('worst sales') || text.includes('least sales')) &&
        !text.includes('day') && !text.includes('\u0D26\u0D3F\u0D35\u0D38\u0D02') && !text.includes('daily') && !text.includes('this month') && !text.includes('ee masam')) ||
      ((text.includes('\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D') || text.includes('\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E') || text.includes('\u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28') || text.includes('\u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28')) && (text.includes('\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D') || text.includes('\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28')) && (text.includes('\u0D2E\u0D3E\u0D38\u0D02') || text.includes('month')) && !text.includes('\u0D26\u0D3F\u0D35\u0D38\u0D02') && !text.includes('day')) ||
      ((text.includes('ethu') || text.includes('\u0D0F\u0D24\u0D4D') || text.includes('\u0D0F\u0D24\u0D41')) && (text.includes('masam') || text.includes('masathil') || text.includes('month') || text.includes('\u0D2E\u0D3E\u0D38\u0D02')) && (text.includes('highest') || text.includes('kooduthal') || text.includes('best') || text.includes('\u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D') || text.includes('lowest') || text.includes('kuranja') || text.includes('\u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E')))
    ) {
      const isLowest = text.includes('lowest') || text.includes('worst') || text.includes('least') || text.includes('\u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E') || text.includes('kuranja');
      let year = undefined;
      const yearMatch = text.match(/\b(20\d\d)\b/);
      if (yearMatch) {
        year = yearMatch[1];
      } else if (text.includes('this year') || text.includes('\u0D08 \u0D35\u0D7C\u0D37\u0D02')) {
        year = String(new Date().getFullYear());
      } else if (text.includes('last year') || text.includes('\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D35\u0D7C\u0D37\u0D02')) {
        year = String(new Date().getFullYear() - 1);
      }
      return { intent: 'SALES_HIGHEST_MONTH', domain: 'SALES', params: { isLowest, year } };
    }
    if (text.includes("highest sales day") || text.includes("highest sales this month") || text.includes("lowest sales this month") || text.includes("best sales day") || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D") && (text.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28")) && (text.includes("\u0D26\u0D3F\u0D35\u0D38\u0D02") || text.includes("day"))) {
      const isLowest = text.includes("lowest");
      let rangeType = "this_month";
      if (text.includes("year") || text.includes("\u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      return { intent: "SALES_HIGHEST_DAY", domain: "SALES", params: { rangeType, isLowest } };
    }
    if (text.includes("daily sales trend") || text.includes("daily trend")) {
      return { intent: "SALES_DAILY_TREND", domain: "SALES", params: { rangeType: "this_month" } };
    }
    if ((text.includes("biller") || text.includes("cashier") || text.includes("sales by staff") || text.includes("who sold") || text.includes("\u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D7C")) && !text.includes("settlement")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      return { intent: "SALES_BILLER_STAFF", domain: "SALES", params: { rangeType } };
    }
    if ((text.includes("customer") || text.includes("\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C")) && (text.includes("purchased the most") || text.includes("spent the most") || text.includes("top spending") || text.includes("invoices generated for") || text.includes("sales history of a specific customer") || text.includes("sales grouped by customer")) || text.includes("spent the most money this month") || text.includes("top spending customers") || text.includes("spent the most")) {
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      return { intent: "SALES_CUSTOMER_LEVEL", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("compare") || text.includes("\u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02") || text.includes("percentage increase") || text.includes("percentage did sales increase")) {
      let compareType = "this_month_vs_last_month";
      let compareWith = "last_month";
      if (text.includes("today") && text.includes("yesterday") || text.includes("yesterday") && !text.includes("month")) {
        compareType = "today_vs_yesterday";
        compareWith = "yesterday";
      } else if (text.includes("year") || text.includes("\u0D35\u0D7C\u0D37\u0D02")) {
        compareType = "this_year_vs_last_year";
        compareWith = "last_year";
      }
      return { intent: "COMPARE_SALES", domain: "SALES", params: { compareType, compareWith } };
    }
    if (text.includes("\u0D35\u0D3F\u0D31\u0D4D\u0D31") || text.includes("\u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D41\u0D2A\u0D4B\u0D2F") || text.includes("best selling") || text.includes("top selling") || text.includes("most sold") || text.includes("highest selling") || text.includes("top products") || text.includes("highest revenue") || text.includes("sold the most") || text.includes("best-selling") || text.includes("top-selling") || text.includes("quantity of products sold") || text.includes("sales quantity and revenue")) {
      const numMatch = text.match(/\b(\d+)\b/);
      const limit = numMatch ? parseInt(numMatch[1], 10) : 5;
      const isLowest = text.includes("lowest") || text.includes("\u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E");
      const isRevenue = text.includes("revenue") || text.includes("\u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02");
      let rangeType = "today";
      if (dateExtraction.fromDate && dateExtraction.toDate) rangeType = "custom";
      else if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return {
        intent: "TOP_SELLING_PRODUCTS",
        domain: "SALES",
        params: {
          limit,
          isLowest,
          isRevenue,
          rangeType,
          customFrom: dateExtraction.fromDate,
          customTo: dateExtraction.toDate,
          customLabel: dateExtraction.label
        }
      };
    }
    const isSalesWord = text.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28") || text.includes("sales") || text.includes("revenue") || text.includes("business") || text.includes("\u0D15\u0D1A\u0D4D\u0D1A\u0D35\u0D1F\u0D02") || text.includes("sell") || text.includes("turnover") || text.includes("intake") || text.includes("takings") || text.includes("\u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02") || text.includes("\u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28");
    if (isSalesWord || text.includes("report") || text.includes("\u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D")) {
      if (text.includes("financial year") || text.includes("fy") || text.includes("\u0D38\u0D3E\u0D2E\u0D4D\u0D2A\u0D24\u0D4D\u0D24\u0D3F\u0D15 \u0D35\u0D7C\u0D37\u0D02")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "financial_year" } };
      }
      if (text.includes("last year") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D35\u0D7C\u0D37\u0D02")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_year" } };
      }
      if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02") || text.includes("year to date") || text.includes("ytd")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "this_year" } };
      }
      if (text.includes("last 30 days") || text.includes("30 \u0D26\u0D3F\u0D35\u0D38") || text.includes("past 30 days")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_30_days" } };
      }
      if (text.includes("last 7 days") || text.includes("7 days") || text.includes("7 \u0D26\u0D3F\u0D35\u0D38") || text.includes("past 7 days")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_7_days" } };
      }
      if (text.includes("last week") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D06\u0D34\u0D4D\u0D1A")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_week" } };
      }
      if (text.includes("this week") || text.includes("\u0D08 \u0D06\u0D34\u0D4D\u0D1A")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "this_week" } };
      }
      if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_month" } };
      }
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38") || text.includes("month to date") || text.includes("mtd") || text.includes("ee masathe") || text.includes("ee masam")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "this_month" } };
      }
      if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("previous day") || text.includes("innale")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "yesterday" } };
      }
      if (text.includes("\u0D07\u0D28\u0D4D\u0D28") && !text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("today") || text.includes("innathe") || text.includes("innu")) {
        return { intent: "SALES_TODAY", domain: "SALES", params: { rangeType: "today" } };
      }
    }
    if (dateExtraction.fromDate && dateExtraction.toDate && dateExtraction.fromDate !== dateExtraction.toDate) {
      return { intent: "SALES_CUSTOM_RANGE", domain: "SALES", params: { customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate } };
    }
    if (dateExtraction.specificDate) {
      return { intent: "SALES_SPECIFIC_DATE", domain: "SALES", params: { specificDate: dateExtraction.specificDate } };
    }
    if (isSalesWord || text.includes("report") || text.includes("\u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D")) {
      return { intent: "SALES_TODAY", domain: "SALES", params: { rangeType: "today" } };
    }
    if (lastUserMsg.includes("sales") || lastUserMsg.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D")) {
      if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) {
        return { intent: "COMPARE_SALES", domain: "SALES", params: { compareType: "this_month_vs_last_month", compareWith: "last_month" } };
      }
      if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) {
        return { intent: "COMPARE_SALES", domain: "SALES", params: { compareType: "today_vs_yesterday", compareWith: "yesterday" } };
      }
      if (text.includes("cash") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D")) {
        return { intent: "SALES_PAYMENT_METHODS", domain: "SALES", params: { method: "CASH", rangeType: "today" } };
      }
      if (text.includes("top five") || text.includes("top 5")) {
        return { intent: "TOP_SELLING_PRODUCTS", domain: "SALES", params: { limit: 5, rangeType: "today" } };
      }
    }
    if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D") || text.includes("how much")) {
      return { intent: "SALES_TODAY", domain: "SALES", params: { rangeType: "today" } };
    }
    return { intent: "UNKNOWN", params: { searchQuery: message } };
  }
};

// tests/offlineAi.test.ts
function runTests() {
  console.log("====================================================");
  console.log("\u{1F9EA} RUNNING NAFID POS OFFLINE AI ASSISTANT TEST SUITE");
  console.log("====================================================\n");
  let passed = 0;
  let total = 0;
  function assert(testName, condition, details) {
    total++;
    if (condition) {
      console.log(`\u2705 PASS: ${testName}`);
      passed++;
    } else {
      console.error(`\u274C FAIL: ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }
  console.log("\n--- 1. Testing Date Range Resolution ---");
  const todayRange = resolveDateRange("today");
  assert("Today range spans 1 day", todayRange.daysCount === 1 && todayRange.fromDate === todayRange.toDate);
  const yesterdayRange = resolveDateRange("yesterday");
  assert("Yesterday range spans 1 day", yesterdayRange.daysCount === 1 && yesterdayRange.fromDate === yesterdayRange.toDate);
  const thisWeekRange = resolveDateRange("this_week");
  assert("This week has valid start date", !!thisWeekRange.fromDate && !!thisWeekRange.toDate);
  const lastWeekRange = resolveDateRange("last_week");
  assert("Last week spans exactly 7 days", lastWeekRange.daysCount === 7);
  const thisMonthRange = resolveDateRange("this_month");
  assert("This month starts on 1st", thisMonthRange.fromDate.endsWith("-01"));
  const lastMonthRange = resolveDateRange("last_month");
  assert("Last month starts on 1st", lastMonthRange.fromDate.endsWith("-01") && lastMonthRange.daysCount >= 28);
  const last30Range = resolveDateRange("last_30_days");
  assert("Last 30 days spans exactly 30 days", last30Range.daysCount === 30);
  const last7Range = resolveDateRange("last_7_days");
  assert("Last 7 days spans exactly 7 days", last7Range.daysCount === 7);
  const fyRange = resolveDateRange("financial_year");
  assert("Financial Year starts on April 1st", fyRange.fromDate.endsWith("-04-01"));
  const customRange = resolveDateRange("custom", "2026-01-01", "2026-01-15");
  assert("Custom range sets fromDate and toDate correctly", customRange.fromDate === "2026-01-01" && customRange.toDate === "2026-01-15");
  console.log("\n--- 2. Testing Date Extraction from Natural Language ---");
  const d1 = extractDateFromText("sales on 2026-05-20");
  assert("Extract ISO date YYYY-MM-DD", d1.specificDate === "2026-05-20", `Got ${d1.specificDate}`);
  const d2 = extractDateFromText("show bills for 15/04/2026");
  assert("Extract DD/MM/YYYY date", d2.specificDate === "2026-04-15", `Got ${d2.specificDate}`);
  const d3 = extractDateFromText("sales for the last 14 days");
  assert("Extract past N days range", !!d3.fromDate && !!d3.toDate, `Got ${JSON.stringify(d3)}`);
  console.log("\n--- 3. Testing Currency & Quantity Formatting ---");
  assert("Format \u20B91,25,000.00", formatINR(125e3) === "\u20B91,25,000.00", `Got ${formatINR(125e3)}`);
  assert("Format \u20B90.00 for null", formatINR(null) === "\u20B90.00", `Got ${formatINR(null)}`);
  assert("Format Quantity 15.5", formatQty(15.5) === "15.5", `Got ${formatQty(15.5)}`);
  assert("Format Quantity 1,000", formatQty(1e3) === "1,000", `Got ${formatQty(1e3)}`);
  console.log("\n--- 4. Testing Language Detection ---");
  assert("Detect English", !isMalayalam("What is today sales?"));
  assert("Detect Malayalam script", isMalayalam("\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"));
  console.log("\n--- 5. Testing Intent Classification (Full Inventory) ---");
  const intentCases = [
    // 3.A Current-Day Sales
    { query: "What are today's total sales?", expectedIntent: "SALES_TODAY" },
    { query: "How much business did we do today?", expectedIntent: "SALES_TODAY" },
    { query: "How much did we sell today?", expectedIntent: "SALES_TODAY" },
    { query: "Show today's sales report", expectedIntent: "SALES_TODAY" },
    { query: "What is today revenue?", expectedIntent: "SALES_TODAY" },
    { query: "\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", expectedIntent: "SALES_TODAY" },
    { query: "What were the sales during the last hour?", expectedIntent: "SALES_HOURLY", expectedParams: { isLastHour: true } },
    { query: "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28", expectedIntent: "SALES_HOURLY", expectedParams: { isLastHour: true } },
    { query: "Show hourly sales today", expectedIntent: "SALES_HOURLY" },
    // 3.B Historical Sales and Date Ranges
    { query: "Show yesterday's sales", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "yesterday" } },
    { query: "Sales for the previous day", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "yesterday" } },
    { query: "Sales for the last 7 days", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "last_7_days" } },
    { query: "Sales for the last 30 days", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "last_30_days" } },
    { query: "Sales this week", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "this_week" } },
    { query: "Sales last week", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "last_week" } },
    { query: "Sales this month", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "this_month" } },
    { query: "Sales last month", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "last_month" } },
    { query: "Sales this year", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "this_year" } },
    { query: "Financial year sales", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "financial_year" } },
    { query: "\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "yesterday" } },
    { query: "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "last_month" } },
    { query: "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 30 \u0D26\u0D3F\u0D35\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "last_30_days" } },
    // 3.C Comparisons and Trends
    { query: "Compare today sales with yesterday", expectedIntent: "COMPARE_SALES", expectedParams: { compareWith: "yesterday" } },
    { query: "Compare this month with last month", expectedIntent: "COMPARE_SALES", expectedParams: { compareWith: "last_month" } },
    { query: "Compare this year with last year", expectedIntent: "COMPARE_SALES", expectedParams: { compareWith: "last_year" } },
    { query: "Show the percentage increase in sales", expectedIntent: "COMPARE_SALES" },
    { query: "Which day had the highest sales this month?", expectedIntent: "SALES_HIGHEST_DAY" },
    { query: "What was our best sales day this year?", expectedIntent: "SALES_HIGHEST_DAY" },
    { query: "Show daily sales trend this month", expectedIntent: "SALES_DAILY_TREND" },
    { query: "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D35\u0D41\u0D2E\u0D3E\u0D2F\u0D3F \u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02 \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42", expectedIntent: "COMPARE_SALES" },
    { query: "\u0D08 \u0D2E\u0D3E\u0D38\u0D02 \u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D28\u0D1F\u0D28\u0D4D\u0D28 \u0D26\u0D3F\u0D35\u0D38\u0D02 \u0D0F\u0D24\u0D3E\u0D23\u0D4D?", expectedIntent: "SALES_HIGHEST_DAY" },
    { query: "which month I had the highest sales", expectedIntent: "SALES_HIGHEST_MONTH" },
    { query: "Which month had the highest sales?", expectedIntent: "SALES_HIGHEST_MONTH" },
    { query: "What was our highest sales month?", expectedIntent: "SALES_HIGHEST_MONTH" },
    { query: "\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D28\u0D1F\u0D28\u0D4D\u0D28 \u0D2E\u0D3E\u0D38\u0D02 \u0D0F\u0D24\u0D3E\u0D23\u0D4D", expectedIntent: "SALES_HIGHEST_MONTH" },
    { query: "ethu masathilaanu highest sales", expectedIntent: "SALES_HIGHEST_MONTH" },
    // 3.D Invoice Count and Average Metrics
    { query: "How many invoices were created today?", expectedIntent: "SALES_INVOICE_COUNT" },
    { query: "How many bills were created this month?", expectedIntent: "SALES_INVOICE_COUNT" },
    { query: "\u0D07\u0D28\u0D4D\u0D28\u0D4D \u0D0E\u0D24\u0D4D\u0D30 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E \u0D05\u0D1F\u0D3F\u0D1A\u0D4D\u0D1A\u0D41?", expectedIntent: "SALES_INVOICE_COUNT" },
    { query: "What is the average ticket value?", expectedIntent: "SALES_AVERAGE_TICKET" },
    { query: "\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", expectedIntent: "SALES_AVERAGE_TICKET" },
    { query: "What is the average daily sales amount?", expectedIntent: "SALES_AVERAGE_DAILY" },
    { query: "What is the average number of bills per day?", expectedIntent: "SALES_AVERAGE_DAILY" },
    { query: "How many unique customers purchased today?", expectedIntent: "SALES_UNIQUE_CUSTOMERS" },
    { query: "What is the highest-value invoice?", expectedIntent: "SALES_INVOICE_EXTREMES" },
    { query: "What is the lowest-value invoice?", expectedIntent: "SALES_INVOICE_EXTREMES" },
    { query: "How many invoices greater than 5000?", expectedIntent: "SALES_INVOICE_EXTREMES", expectedParams: { minAmount: 5e3 } },
    // 3.E Cash, Credit, and Payment-Method Sales
    { query: "Show today cash sales", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { method: "CASH" } },
    { query: "Show today credit sales", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { method: "CREDIT" } },
    { query: "Show cash and credit sales separately", expectedIntent: "SALES_PAYMENT_METHODS" },
    { query: "How much was paid by card?", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { method: "CARD" } },
    { query: "How much was paid through UPI?", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { method: "UPI" } },
    { query: "Show this month sales by payment method", expectedIntent: "SALES_PAYMENT_METHODS" },
    { query: "How much credit remains outstanding?", expectedIntent: "SALES_CREDIT_OUTSTANDING" },
    { query: "Show invoices paid using multiple payment methods", expectedIntent: "SALES_PAYMENT_METHODS" },
    { query: "\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { method: "CASH" } },
    { query: "\u0D2F\u0D41\u0D2A\u0D3F\u0D10 \u0D35\u0D34\u0D3F \u0D0E\u0D24\u0D4D\u0D30 \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A\u0D41?", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { method: "UPI" } },
    // 3.F Gross Sales, Net Sales, Discounts, and Returns
    { query: "What are our gross sales today?", expectedIntent: "SALES_GROSS_NET" },
    { query: "What are our net sales today?", expectedIntent: "SALES_GROSS_NET" },
    { query: "How much discount was given today?", expectedIntent: "SALES_GROSS_NET", expectedParams: { metric: "discount" } },
    { query: "What is the total discount this month?", expectedIntent: "SALES_GROSS_NET", expectedParams: { metric: "discount" } },
    { query: "How much sales return was recorded this month?", expectedIntent: "SALES_GROSS_NET", expectedParams: { metric: "return" } },
    { query: "How much tax was collected on sales?", expectedIntent: "SALES_GROSS_NET", expectedParams: { metric: "tax" } },
    // 3.G Invoice-Type Reports
    { query: "Show sales by invoice type", expectedIntent: "SALES_INVOICE_TYPES" },
    { query: "Show today bills of supply", expectedIntent: "SALES_INVOICE_TYPES" },
    // 3.H Product-Level Sales
    { query: "Which products sold the most today?", expectedIntent: "TOP_SELLING_PRODUCTS" },
    { query: "Show the top five best-selling products", expectedIntent: "TOP_SELLING_PRODUCTS", expectedParams: { limit: 5 } },
    { query: "Which product generated the highest revenue?", expectedIntent: "TOP_SELLING_PRODUCTS", expectedParams: { isRevenue: true } },
    { query: "\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D41\u0D2A\u0D4B\u0D2F 5 \u0D2A\u0D4D\u0D30\u0D4B\u0D21\u0D15\u0D4D\u0D31\u0D4D\u0D31\u0D41\u0D15\u0D7E \u0D24\u0D30\u0D42", expectedIntent: "TOP_SELLING_PRODUCTS", expectedParams: { limit: 5 } },
    { query: "Top selling product in april", expectedIntent: "TOP_SELLING_PRODUCTS" },
    { query: "\u0D0F\u0D2A\u0D4D\u0D30\u0D3F\u0D32\u0D3F\u0D32\u0D46 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E", expectedIntent: "TOP_SELLING_PRODUCTS" },
    // 3.I Customer-Level Sales
    { query: "Which customers purchased the most this month?", expectedIntent: "SALES_CUSTOMER_LEVEL" },
    { query: "Show top spending customers", expectedIntent: "SALES_CUSTOMER_LEVEL" },
    { query: "\u20B95,000-\u0D7D \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D \u0D09\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C", expectedIntent: "CUSTOMER_CREDIT_LIST", expectedParams: { minAmount: 5e3 } },
    { query: "Who is the top credit customer?", expectedIntent: "CUSTOMER_CREDIT_LIST", expectedParams: { limit: 1 } },
    { query: "Who are the top credit customer?", expectedIntent: "CUSTOMER_CREDIT_LIST", expectedParams: { limit: 1 } },
    // 3.J Biller / Staff Sales
    { query: "Show sales by biller today", expectedIntent: "SALES_BILLER_STAFF" },
    { query: "Who sold the most today?", expectedIntent: "SALES_BILLER_STAFF" },
    { query: "\u0D0F\u0D24\u0D4D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D7C \u0D06\u0D23\u0D4D \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D24\u0D4D?", expectedIntent: "SALES_BILLER_STAFF" },
    // 3.K Cancelled / Voided Invoices
    { query: "How many invoices were cancelled?", expectedIntent: "SALES_CANCELLED_INVOICES" },
    { query: "Show cancelled invoices this month", expectedIntent: "SALES_CANCELLED_INVOICES" },
    { query: "\u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42", expectedIntent: "SALES_CANCELLED_INVOICES" },
    // 3.L Data Integrity Diagnostics & Capabilities
    { query: "Check whether converted bills are counted twice.", expectedIntent: "DIAGNOSTIC_DEDUPLICATION_CHECK" },
    { query: "Are any invoices being counted more than once in the sales report?", expectedIntent: "DIAGNOSTIC_DEDUPLICATION_CHECK" },
    { query: "Which customer spent the most money this month?", expectedIntent: "SALES_CUSTOMER_LEVEL" },
    { query: "Show all invoices generated for a specific customer this month.", expectedIntent: "SALES_CUSTOMER_LEVEL" },
    { query: "Show the number of unique invoices and total invoice value for each payment method.", expectedIntent: "SALES_PAYMENT_METHODS" },
    { query: "Identify invoices where payment allocations do not match the invoice total.", expectedIntent: "DIAGNOSTIC_PAYMENT_RECONCILIATION" },
    { query: "If the same question is asked twice without any data changes, will the result remain the same?", expectedIntent: "AI_CAPABILITIES_EXPLANATION", expectedParams: { topic: "determinism" } },
    { query: "Can you answer today's sales question without an internet connection?", expectedIntent: "AI_CAPABILITIES_EXPLANATION", expectedParams: { topic: "offline" } },
    // 3.M Additional POS Modules & Novel Unseen Queries
    { query: "What was our total turnover this month?", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "this_month" } },
    { query: "What was our register intake today?", expectedIntent: "SALES_TODAY" },
    { query: "Who owes us the most cash right now?", expectedIntent: "CUSTOMER_CREDIT_LIST" },
    { query: "What is the cost of CELLO MUG M16?", expectedIntent: "PRODUCT_PRICE_LOOKUP" },
    { query: "\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D2E\u0D4A\u0D24\u0D4D\u0D24\u0D02 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "this_month" } },
    { query: "\u0D15\u0D1F\u0D02 \u0D24\u0D30\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D35\u0D30\u0D41\u0D1F\u0D46 \u0D32\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42", expectedIntent: "CUSTOMER_CREDIT_LIST" },
    { query: "\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D3F\u0D32\u0D41\u0D33\u0D4D\u0D33 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D33\u0D41\u0D1F\u0D46 \u0D06\u0D15\u0D46 \u0D2E\u0D42\u0D32\u0D4D\u0D2F\u0D02 \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", expectedIntent: "INVENTORY_TOTAL_VALUE" },
    { query: "\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D24\u0D4D\u0D24\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D2F\u0D3F\u0D30\u0D41\u0D28\u0D4D\u0D28\u0D41?", expectedIntent: "SALES_PERIOD", expectedParams: { rangeType: "yesterday" } },
    { query: "innathe total sales ethraya", expectedIntent: "SALES_TODAY" },
    { query: "ee masathe expense ethraya", expectedIntent: "EXPENSES_SUMMARY", expectedParams: { rangeType: "this_month" } },
    { query: "aarokkeyanu kadam tharanullath", expectedIntent: "CUSTOMER_CREDIT_LIST" },
    { query: "stock theernna items ethokkeyanu", expectedIntent: "INVENTORY_OUT_OF_STOCK" },
    { query: "innu ethra bill adichu", expectedIntent: "SALES_INVOICE_COUNT" },
    { query: "Show cash and upi sales between 2026-10-01 and 2026-10-15", expectedIntent: "SALES_PAYMENT_METHODS", expectedParams: { rangeType: "custom", customFrom: "2026-10-01", customTo: "2026-10-15" } },
    { query: "How many invoices greater than 1000 today?", expectedIntent: "SALES_INVOICE_EXTREMES" },
    { query: "balance", expectedIntent: "CLARIFICATION_REQUIRED" },
    { query: "show report", expectedIntent: "CLARIFICATION_REQUIRED" },
    { query: "how much money did we make", expectedIntent: "CLARIFICATION_REQUIRED" },
    { query: "Can you predict next month's sales revenue?", expectedIntent: "UNSUPPORTED_REQUEST" },
    { query: "What is the weather today?", expectedIntent: "UNSUPPORTED_REQUEST" },
    { query: "Send an email to Suhaib", expectedIntent: "UNSUPPORTED_REQUEST" }
  ];
  for (const tc of intentCases) {
    const res = OfflineAiIntentParser.parse(tc.query, tc.history);
    const intentOk = res.intent === tc.expectedIntent;
    let paramsOk = true;
    if (tc.expectedParams) {
      for (const k of Object.keys(tc.expectedParams)) {
        const v = tc.expectedParams[k];
        if (res.params[k] !== v) {
          paramsOk = false;
        }
      }
    }
    assert(
      `"${tc.query}" -> ${tc.expectedIntent}`,
      intentOk && paramsOk,
      !intentOk ? `Intent mismatch: got ${res.intent}, expected ${tc.expectedIntent}` : `Params mismatch: got ${JSON.stringify(res.params)}, expected ${JSON.stringify(tc.expectedParams)}`
    );
  }
  console.log("\n--- 6. Testing Business Rule Invariants & Discrepancy Regressions ---");
  const initialSuhaibBalance = 15200;
  const returnPOS1RTN003Amount = 1200;
  const suhaibAdjustedBalance = initialSuhaibBalance - returnPOS1RTN003Amount;
  const otherCustomerBalances = [6358.5, 120, 7];
  const totalReceivablesBefore = initialSuhaibBalance + otherCustomerBalances.reduce((a, b) => a + b, 0);
  const totalReceivablesAfter = suhaibAdjustedBalance + otherCustomerBalances.reduce((a, b) => a + b, 0);
  assert("Suhaib balance reduced by credit return of \u20B91,200", suhaibAdjustedBalance === 14e3);
  assert("Customer receivables before return was \u20B921,685.50", totalReceivablesBefore === 21685.5);
  assert("Customer receivables after return is exactly \u20B920,485.50", totalReceivablesAfter === 20485.5);
  assert("Difference between pre and post return receivables is exactly \u20B91,200.00", totalReceivablesBefore - totalReceivablesAfter === 1200);
  const initialStockQty = 310;
  const returnKnifeQty = 1;
  const knifePurchasePrice = 0;
  const knifeBasePrice = 0;
  const initialCostValuation = 64947.5;
  const initialRetailValuation = 475062.11;
  const updatedStockQty = initialStockQty + returnKnifeQty;
  const updatedCostValuation = initialCostValuation + returnKnifeQty * knifePurchasePrice;
  const updatedRetailValuation = initialRetailValuation + returnKnifeQty * knifeBasePrice;
  assert("Inventory stock increments by 1 unit from 310 to 311", updatedStockQty === 311);
  assert("Inventory cost valuation invariant holds (\u20B964,947.50)", updatedCostValuation === 64947.5);
  assert("Inventory retail valuation invariant holds (\u20B94,75,062.11)", updatedRetailValuation === 475062.11);
  const explicitRangeQuery = "Show cash and upi sales between 2026-10-01 and 2026-10-15";
  const parsedExplicit = OfflineAiIntentParser.parse(explicitRangeQuery);
  assert("Explicit range parses start date 2026-10-01", parsedExplicit.params?.customFrom === "2026-10-01");
  assert("Explicit range parses end date 2026-10-15", parsedExplicit.params?.customTo === "2026-10-15");
  console.log("\n====================================================");
  console.log(`\u{1F4CA} FINAL RESULT: ${passed}/${total} TESTS PASSED (${Math.round(passed / total * 100)}%)`);
  console.log("====================================================\n");
  if (passed !== total) {
    if (typeof globalThis.process !== "undefined") {
      globalThis.process.exit(1);
    }
  }
}
runTests();
