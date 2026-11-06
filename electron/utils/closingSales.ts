export function closingSalesAfterDiscounts(grossSales: number, totalDiscount: number): number {
  return Math.max(0, grossSales - totalDiscount);
}
