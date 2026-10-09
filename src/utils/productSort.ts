export function cleanSearchText(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function getWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0);
}

function allWordsMatch(text: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const lowerText = text.toLowerCase();
  return words.every(word => lowerText.includes(word));
}

export function sortProductsBySearchPriority<T extends { sku_barcode?: string; item_code?: string; name?: string; brand_manufacturer?: string }>(products: T[], searchQuery: string): T[] {
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

    // Tier 4: Product Name or Brand starts with query (normalized, no-space, or clean)
    if (name.startsWith(q) || brand.startsWith(q) || (qNoSpace.length > 0 && (nameNoSpace.startsWith(qNoSpace) || brandNoSpace.startsWith(qNoSpace))) || (qClean.length > 0 && (nameClean.startsWith(qClean) || brandClean.startsWith(qClean)))) {
      return { tier: 4, numVal: 999999999, name };
    }

    // Tier 4.5: Word-based fuzzy match on Name/Brand (all words present, any order)
    if (qWords.length > 1 && (
      allWordsMatch(name, qWords) ||
      allWordsMatch(brand, qWords) ||
      (qNoSpace.length > 0 && (allWordsMatch(nameNoSpace, qWords) || allWordsMatch(brandNoSpace, qWords))) ||
      (qClean.length > 0 && (allWordsMatch(nameClean, qWords) || allWordsMatch(brandClean, qWords)))
    )) {
      return { tier: 4.5, numVal: 999999999, name };
    }

    // Tier 5: Product Name or Brand contains query
    if (name.includes(q) || brand.includes(q) || (qNoSpace.length > 0 && (nameNoSpace.includes(qNoSpace) || brandNoSpace.includes(qNoSpace))) || (qClean.length > 0 && (nameClean.includes(qClean) || brandClean.includes(qClean)))) {
      return { tier: 5, numVal: 999999999, name };
    }

    return { tier: 99, numVal: 999999999, name };
  };

  return [...products].sort((a, b) => {
    const scoreA = getProductScore(a);
    const scoreB = getProductScore(b);

    if (scoreA.tier !== scoreB.tier) {
      return scoreA.tier - scoreB.tier;
    }

    if (scoreA.numVal !== scoreB.numVal) {
      return scoreA.numVal - scoreB.numVal;
    }

    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
}
