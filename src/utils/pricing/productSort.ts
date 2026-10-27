export function cleanSearchText(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function getWords(query: string): string[] {
  return query.trim().toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 0);
}

function allWordsMatch(text: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const lowerText = text.toLowerCase();
  const textNoSpace = lowerText.replace(/\s+/g, '');
  const textClean = cleanSearchText(lowerText);
  return words.every(word => {
    const w = word.toLowerCase();
    const wNoSpace = w.replace(/\s+/g, '');
    const wClean = cleanSearchText(w);
    return lowerText.includes(w) ||
      (wNoSpace.length > 0 && textNoSpace.includes(wNoSpace)) ||
      (wClean.length > 0 && textClean.includes(wClean));
  });
}

export function sortProductsBySearchPriority<T extends { sku_barcode?: string | null; item_code?: string | null; name?: string | null; brand_manufacturer?: string | null }>(products: T[], searchQuery: string): T[] {
  if (!searchQuery || !searchQuery.trim()) return products;
  const q = searchQuery.trim().toLowerCase();
  const qNoSpace = q.replace(/\s+/g, '');
  const qClean = cleanSearchText(q);
  const qWords = getWords(q);

  const getProductScore = (p: T) => {
    const barcode = String(p.sku_barcode || '').trim().toLowerCase();
    const code = String(p.item_code || '').trim().toLowerCase();
    const name = String(p.name || '').trim().toLowerCase();
    const brand = String(p.brand_manufacturer || '').trim().toLowerCase();

    const barcodeNoSpace = barcode.replace(/\s+/g, '');
    const codeNoSpace = code.replace(/\s+/g, '');
    const nameNoSpace = name.replace(/\s+/g, '');
    const brandNoSpace = brand.replace(/\s+/g, '');

    const barcodeClean = cleanSearchText(barcode);
    const codeClean = cleanSearchText(code);
    const nameClean = cleanSearchText(name);
    const brandClean = cleanSearchText(brand);

    // Tier 1: Exact Barcode or Item Code match
    if (barcode === q || code === q || (qNoSpace.length > 0 && (barcodeNoSpace === qNoSpace || codeNoSpace === qNoSpace)) || (qClean.length > 0 && (barcodeClean === qClean || codeClean === qClean))) {
      const matchStr = barcode.includes(q) || (qClean.length > 0 && barcodeClean.includes(qClean)) ? barcode : code;
      const numMatch = matchStr.match(/\d+/);
      const numVal = numMatch ? parseInt(numMatch[0], 10) : 999999999;
      return { tier: 1, numVal, name };
    }

    // Tier 2: Barcode or Item Code starts with query
    if (barcode.startsWith(q) || code.startsWith(q) || (qNoSpace.length > 0 && (barcodeNoSpace.startsWith(qNoSpace) || codeNoSpace.startsWith(qNoSpace))) || (qClean.length > 0 && (barcodeClean.startsWith(qClean) || codeClean.startsWith(qClean)))) {
      const matchStr = barcode.startsWith(q) || (qClean.length > 0 && barcodeClean.startsWith(qClean)) ? barcode : code;
      const numMatch = matchStr.match(/\d+/);
      const numVal = numMatch ? parseInt(numMatch[0], 10) : 999999999;
      return { tier: 2, numVal, name };
    }

    // Tier 3: Barcode or Item Code contains query
    if (barcode.includes(q) || code.includes(q) || (qNoSpace.length > 0 && (barcodeNoSpace.includes(qNoSpace) || codeNoSpace.includes(qNoSpace))) || (qClean.length > 0 && (barcodeClean.includes(qClean) || codeClean.includes(qClean)))) {
      const matchStr = barcode.includes(q) || (qClean.length > 0 && barcodeClean.includes(qClean)) ? barcode : code;
      const numMatch = matchStr.match(/\d+/);
      const numVal = numMatch ? parseInt(numMatch[0], 10) : 999999999;
      return { tier: 3, numVal, name };
    }

    // Tier 3.5: Word-based fuzzy match on Barcode/Item Code (all words present, any order)
    if (qWords.length > 1 && (
      allWordsMatch(barcode, qWords) ||
      allWordsMatch(code, qWords) ||
      (qNoSpace.length > 0 && (allWordsMatch(barcodeNoSpace, qWords) || allWordsMatch(codeNoSpace, qWords))) ||
      (qClean.length > 0 && (allWordsMatch(barcodeClean, qWords) || allWordsMatch(codeClean, qWords)))
    )) {
      return { tier: 3.5, numVal: 999999999, name };
    }

    // Tier 3.8: Exact verbatim Product Name match
    if (name === q || (qNoSpace.length > 0 && nameNoSpace === qNoSpace)) {
      return { tier: 3.8, numVal: 999999999, name };
    }

    // Tier 3.9: Exact Product Name match (ignoring special chars and spaces)
    if (qClean.length > 0 && nameClean === qClean) {
      return { tier: 3.9, numVal: 999999999, name };
    }

    // Tier 4: Product Name starts with query (normalized, no-space, or clean)
    if (name.startsWith(q) || (qNoSpace.length > 0 && nameNoSpace.startsWith(qNoSpace)) || (qClean.length > 0 && nameClean.startsWith(qClean))) {
      return { tier: 4, numVal: 999999999, name };
    }

    // Tier 4.2: Product Name contains query
    if (name.includes(q) || (qNoSpace.length > 0 && nameNoSpace.includes(qNoSpace)) || (qClean.length > 0 && nameClean.includes(qClean))) {
      return { tier: 4.2, numVal: 999999999, name };
    }

    // Tier 4.4: Brand starts with query
    if (brand.startsWith(q) || (qNoSpace.length > 0 && brandNoSpace.startsWith(qNoSpace)) || (qClean.length > 0 && brandClean.startsWith(qClean))) {
      return { tier: 4.4, numVal: 999999999, name };
    }

    // Tier 4.6: Brand contains query
    if (brand.includes(q) || (qNoSpace.length > 0 && brandNoSpace.includes(qNoSpace)) || (qClean.length > 0 && brandClean.includes(qClean))) {
      return { tier: 4.6, numVal: 999999999, name };
    }

    // Tier 4.8: Word-based match on Product Name (all words present, any order)
    if (qWords.length > 1 && (
      allWordsMatch(name, qWords) ||
      (qNoSpace.length > 0 && allWordsMatch(nameNoSpace, qWords)) ||
      (qClean.length > 0 && allWordsMatch(nameClean, qWords))
    )) {
      return { tier: 4.8, numVal: 999999999, name };
    }

    // Tier 4.9: Word-based match across Product Name, Brand, and Codes
    if (qWords.length > 1) {
      const combined = `${name} ${brand} ${barcode} ${code}`;
      const combinedClean = `${nameClean} ${brandClean} ${barcodeClean} ${codeClean}`;
      if (allWordsMatch(combined, qWords) || allWordsMatch(combinedClean, qWords)) {
        return { tier: 4.9, numVal: 999999999, name };
      }
    }

    return { tier: 99, numVal: 999999999, name };
  };

  const scored = products.map(p => ({ p, score: getProductScore(p) }));
  scored.sort((a, b) => {
    if (a.score.tier !== b.score.tier) {
      return a.score.tier - b.score.tier;
    }

    if (a.score.numVal !== b.score.numVal) {
      return a.score.numVal - b.score.numVal;
    }

    return String(a.p.name || '').localeCompare(String(b.p.name || ''), undefined, { numeric: true, sensitivity: 'base' });
  });

  return scored.map(item => item.p);
}
