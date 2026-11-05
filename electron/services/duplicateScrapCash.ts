/** Legacy invoice-item movements; named user entries and standalone scrap remain real cash. */
export function isDuplicateScrapCash(row: { category?: string | null; entered_by?: string | null; notes?: string | null }): boolean {
  const category = (row.category || '').trim().toUpperCase().replace(/ /g, '_');
  const actor = (row.entered_by || '').trim().toLowerCase();
  return category === 'SCRAP_PURCHASE' && ['', 'system', '-', '—'].includes(actor)
    && /^scrap purchase\s+\S/i.test((row.notes || '').trim());
}
