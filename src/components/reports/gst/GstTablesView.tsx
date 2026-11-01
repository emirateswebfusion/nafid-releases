import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import type { Gstr1Report } from '../../../../electron/services/gstReportService';
import type { GstTabType } from './useGstReport';

interface GstTablesViewProps {
  activeTab: GstTabType;
  report: Gstr1Report;
}

export function GstTablesView({ activeTab, report }: GstTablesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Table 4: B2B
  const filteredB2B = useMemo(() => {
    if (activeTab !== 'b2b') return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return report.b2b;
    return report.b2b.filter(
      r =>
        r.gstin.toLowerCase().includes(term) ||
        r.invoice_number.toLowerCase().includes(term) ||
        (r.customer_name && r.customer_name.toLowerCase().includes(term))
    );
  }, [activeTab, searchTerm, report.b2b]);

  // Table 5: B2CL
  const filteredB2CL = useMemo(() => {
    if (activeTab !== 'b2cl') return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return report.b2cl;
    return report.b2cl.filter(r => r.invoice_number.toLowerCase().includes(term) || r.pos.includes(term));
  }, [activeTab, searchTerm, report.b2cl]);

  // Table 7: B2CS
  const filteredB2CS = useMemo(() => {
    if (activeTab !== 'b2cs') return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return report.b2cs;
    return report.b2cs.filter(r => r.pos.includes(term) || r.supply_type.toLowerCase().includes(term));
  }, [activeTab, searchTerm, report.b2cs]);

  // Table 9B: CDNR + CDNUR
  const filteredNotes = useMemo(() => {
    if (activeTab !== 'cdnr') return [];
    const term = searchTerm.toLowerCase().trim();
    const combined = [
      ...report.cdnr.map(n => ({ ...n, category: 'CDNR (Registered)' })),
      ...report.cdnur.map(n => ({ ...n, gstin: 'Unregistered', customer_name: 'B2C Customer', category: 'CDNUR (Unregistered)' })),
    ];
    if (!term) return combined;
    return combined.filter(
      n =>
        n.note_number.toLowerCase().includes(term) ||
        (n.original_invoice_number && n.original_invoice_number.toLowerCase().includes(term)) ||
        (n.customer_name && n.customer_name.toLowerCase().includes(term)) ||
        n.gstin.toLowerCase().includes(term)
    );
  }, [activeTab, searchTerm, report.cdnr, report.cdnur]);

  // Table 12: HSN
  const filteredHsn = useMemo(() => {
    if (activeTab !== 'hsn') return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return report.hsn;
    return report.hsn.filter(
      h => h.hsn_sc.toLowerCase().includes(term) || h.description.toLowerCase().includes(term)
    );
  }, [activeTab, searchTerm, report.hsn]);

  // Table 13: Doc issue
  const docIssueRows = report.doc_issue;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs flex flex-col">
      {/* Table Header Filter Toolbar */}
      <div className="p-4 border-b border-border bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search records in table..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
          <span>Statutory GSTR-1 Structure</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="font-mono font-bold text-foreground">
            {activeTab === 'b2b' && `${filteredB2B.length} entries`}
            {activeTab === 'b2cl' && `${filteredB2CL.length} entries`}
            {activeTab === 'b2cs' && `${filteredB2CS.length} categories`}
            {activeTab === 'cdnr' && `${filteredNotes.length} notes`}
            {activeTab === 'hsn' && `${filteredHsn.length} HSN items`}
            {activeTab === 'doc_issue' && `${docIssueRows.length} doc series`}
          </span>
        </div>
      </div>

      {/* Table Render Container */}
      <div className="overflow-x-auto min-h-[350px]">
        {/* ================= TABLE 4: B2B ================= */}
        {activeTab === 'b2b' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-4 py-3">GSTIN / UIN</th>
                <th className="px-4 py-3">Recipient Name</th>
                <th className="px-4 py-3">Invoice No</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3 text-center">POS</th>
                <th className="px-4 py-3 text-right">Taxable Value</th>
                <th className="px-4 py-3 text-right">CGST</th>
                <th className="px-4 py-3 text-right">SGST</th>
                <th className="px-4 py-3 text-right">IGST</th>
                <th className="px-4 py-3 text-right">Invoice Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filteredB2B.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground font-sans">
                    No B2B invoices found. Invoices with valid customer GSTINs appear in this table.
                  </td>
                </tr>
              ) : (
                filteredB2B.map((inv, idx) => (
                  <tr key={`${inv.invoice_number}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-bold text-primary">{inv.gstin}</td>
                    <td className="px-4 py-3 font-sans font-medium text-foreground">{inv.customer_name || '—'}</td>
                    <td className="px-4 py-3 font-bold text-foreground">{inv.invoice_number}</td>
                    <td className="px-3 py-3 text-muted-foreground">{inv.invoice_date}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-bold border border-border">
                        {inv.pos}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.taxable_value)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(inv.cgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(inv.sgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(inv.igst)}</td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(inv.invoice_value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= TABLE 5: B2CL ================= */}
        {activeTab === 'b2cl' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-4 py-3">Invoice No</th>
                <th className="px-4 py-3">Invoice Date</th>
                <th className="px-4 py-3 text-center">Place of Supply (POS)</th>
                <th className="px-4 py-3 text-center">Applicable Rate</th>
                <th className="px-4 py-3 text-right">Taxable Value</th>
                <th className="px-4 py-3 text-right">IGST Amount</th>
                <th className="px-4 py-3 text-right">Invoice Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filteredB2CL.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground font-sans">
                    No Table 5 B2CL records. Unregistered inter-state invoices exceeding ₹1,00,000 appear here.
                  </td>
                </tr>
              ) : (
                filteredB2CL.map((inv, idx) => (
                  <tr key={`${inv.invoice_number}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-bold text-foreground">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.invoice_date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold border border-border">
                        {inv.pos}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-foreground">{inv.applicable_tax_rate}%</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.taxable_value)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(inv.igst)}</td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(inv.invoice_value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= TABLE 7: B2CS ================= */}
        {activeTab === 'b2cs' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-5 py-3">Supply Type</th>
                <th className="px-4 py-3 text-center">Place of Supply (POS)</th>
                <th className="px-4 py-3 text-center">Tax Rate</th>
                <th className="px-4 py-3 text-right">Taxable Value</th>
                <th className="px-4 py-3 text-right">CGST</th>
                <th className="px-4 py-3 text-right">SGST</th>
                <th className="px-4 py-3 text-right">IGST</th>
                <th className="px-5 py-3 text-right">Total GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filteredB2CS.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground font-sans">
                    No Table 7 B2CS retail records found for this period.
                  </td>
                </tr>
              ) : (
                filteredB2CS.map((row, idx) => (
                  <tr key={`${row.pos}-${row.applicable_tax_rate}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-sans font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${row.supply_type === 'INTRA' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                        {row.supply_type === 'INTRA' ? 'Intra-State Retail (Local)' : 'Inter-State Small (<₹1L)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold border border-border">
                        {row.pos}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-foreground">{row.applicable_tax_rate}%</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(row.taxable_value)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.cgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.sgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.igst)}</td>
                    <td className="px-5 py-3 text-right font-bold text-foreground">{formatCurrency(row.cgst + row.sgst + row.igst)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= TABLE 9B: CDNR / CDNUR ================= */}
        {activeTab === 'cdnr' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Note Number</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-4 py-3">Recipient / GSTIN</th>
                <th className="px-3 py-3">Original Invoice</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">CGST</th>
                <th className="px-4 py-3 text-right">SGST</th>
                <th className="px-4 py-3 text-right">IGST</th>
                <th className="px-4 py-3 text-right">Note Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground font-sans">
                    No Table 9B Credit or Debit notes recorded in this period.
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note, idx) => (
                  <tr key={`${note.note_number}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-sans font-semibold text-[11px]">
                      <span className="px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">
                        {note.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">{note.note_number}</td>
                    <td className="px-3 py-3 text-muted-foreground">{note.note_date}</td>
                    <td className="px-4 py-3 font-sans">
                      <div className="font-medium text-foreground">{note.customer_name || '—'}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{note.gstin}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {note.original_invoice_number ? (
                        <span>{note.original_invoice_number}</span>
                      ) : (
                        <span className="text-muted-foreground/50 font-sans text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(note.taxable_value)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(note.cgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(note.sgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(note.igst)}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">{formatCurrency(note.note_value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= TABLE 12: HSN ================= */}
        {activeTab === 'hsn' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-5 py-3">HSN / SAC</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-3 py-3 text-center">UQC</th>
                <th className="px-4 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3 text-right">Taxable Value</th>
                <th className="px-4 py-3 text-right">CGST</th>
                <th className="px-4 py-3 text-right">SGST</th>
                <th className="px-4 py-3 text-right">IGST</th>
                <th className="px-5 py-3 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filteredHsn.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-muted-foreground font-sans">
                    No HSN records aggregated. Ensure items have HSN/SAC codes set in inventory.
                  </td>
                </tr>
              ) : (
                filteredHsn.map((hsn, idx) => (
                  <tr key={`${hsn.hsn_sc}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-bold text-foreground">
                      <span className="px-2 py-0.5 rounded bg-muted text-[11px] border border-border">
                        {hsn.hsn_sc}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-sans font-medium text-foreground max-w-xs truncate">{hsn.description}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground">{hsn.uqc}</td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">{hsn.total_quantity}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(hsn.taxable_value)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(hsn.cgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(hsn.sgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(hsn.igst)}</td>
                    <td className="px-5 py-3 text-right font-bold text-foreground">{formatCurrency(hsn.total_value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ================= TABLE 13: DOCUMENTS ISSUED ================= */}
        {activeTab === 'doc_issue' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-5 py-3">Nature of Document</th>
                <th className="px-4 py-3">From Serial No</th>
                <th className="px-4 py-3">To Serial No</th>
                <th className="px-4 py-3 text-right">Total Number</th>
                <th className="px-4 py-3 text-right">Cancelled</th>
                <th className="px-5 py-3 text-right">Net Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {docIssueRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-muted-foreground font-sans">
                    No document series tracked for this period.
                  </td>
                </tr>
              ) : (
                docIssueRows.map((doc, idx) => (
                  <tr key={`${doc.nature_of_document}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-sans font-bold text-foreground">{doc.nature_of_document}</td>
                    <td className="px-4 py-3 text-primary font-bold">{doc.from_doc || '—'}</td>
                    <td className="px-4 py-3 text-primary font-bold">{doc.to_doc || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{doc.total_docs}</td>
                    <td className="px-4 py-3 text-right text-rose-500">{doc.cancelled_docs}</td>
                    <td className="px-5 py-3 text-right font-black text-foreground">{doc.net_docs}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
