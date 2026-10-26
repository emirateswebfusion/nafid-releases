/** Main-process equivalent of the renderer's checkout tax split. */
export function splitTaxAmount(tax: number): { cgst: number; sgst: number } {
  const cgst = Math.round((tax / 2) * 100) / 100;
  return { cgst, sgst: Math.round((tax - cgst) * 100) / 100 };
}
