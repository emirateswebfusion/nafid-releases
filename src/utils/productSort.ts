export function sortProductsBySearchPriority<T extends { sku_barcode?: string; item_code?: string; name?: string }>(products: T[], searchQuery: string): T[] {
  if (!searchQuery || !searchQuery.trim()) return products;
  const q = searchQuery.trim().toLowerCase();

  const getBarcodeScore = (p: T) => {
    const barcode = String(p.sku_barcode || '').trim().toLowerCase();
    const code = String(p.item_code || '').trim().toLowerCase();

    const isExact = barcode === q || code === q;
    const isPrefix = barcode.startsWith(q) || code.startsWith(q);
    const isIncludes = barcode.includes(q) || code.includes(q);

    let tier = 99;
    if (isExact) tier = 1;
    else if (isPrefix) tier = 2;
    else if (isIncludes) tier = 3;

    if (tier < 99) {
      const matchStr = barcode.includes(q) ? barcode : code;
      const numMatch = matchStr.match(/\d+/);
      const numVal = numMatch ? parseInt(numMatch[0], 10) : 999999999;
      return { isMatch: true, tier, numVal, matchStr };
    }
    return { isMatch: false, tier: 99, numVal: 999999999, matchStr: '' };
  };

  return [...products].sort((a, b) => {
    const scoreA = getBarcodeScore(a);
    const scoreB = getBarcodeScore(b);

    if (scoreA.isMatch && scoreB.isMatch) {
      if (scoreA.tier !== scoreB.tier) return scoreA.tier - scoreB.tier;
      if (scoreA.numVal !== scoreB.numVal) return scoreA.numVal - scoreB.numVal;
      if (scoreA.matchStr.length !== scoreB.matchStr.length) return scoreA.matchStr.length - scoreB.matchStr.length;
      return scoreA.matchStr.localeCompare(scoreB.matchStr, undefined, { numeric: true });
    }

    if (scoreA.isMatch && !scoreB.isMatch) return -1;
    if (!scoreA.isMatch && scoreB.isMatch) return 1;

    const nameA = String(a.name || '').trim().toLowerCase();
    const nameB = String(b.name || '').trim().toLowerCase();
    const nameAPrefix = nameA.startsWith(q);
    const nameBPrefix = nameB.startsWith(q);

    if (nameAPrefix && !nameBPrefix) return -1;
    if (!nameAPrefix && nameBPrefix) return 1;

    return nameA.localeCompare(nameB);
  });
}
