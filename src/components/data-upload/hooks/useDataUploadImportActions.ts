import { v4 as uuidv4 } from 'uuid';
import { hasBridge } from '../../../data/client';
import { partiesApi } from '../../../data/parties';
import { productsApi } from '../../../data/products';
import { staffApi } from '../../../data/staff';
import type { UploadEntityType } from '../dataUploadTypes';
import type { DataUploadState } from './useDataUploadState';

export interface UseDataUploadImportActionsContext {
  du: DataUploadState;
  entityType: UploadEntityType;
  onClose: () => void;
  onImportSuccess?: (count: number, entity: UploadEntityType) => void;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
}

/** Imports the validated rows for the selected entity through the data APIs. */
export function useDataUploadImportActions(ctx: UseDataUploadImportActionsContext) {
  const { du, entityType, onClose, onImportSuccess, tenantId, userId, userName } = ctx;
  const { parsedRows, setImporting, setMessage, setParsedRows } = du;

  // ─── Execute Import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setMessage({ type: 'error', text: 'No valid rows found to import.' });
      return;
    }

    setImporting(true);
    setMessage(null);

    try {
      const tid = tenantId || 'global';

      if (entityType === 'opening_balances') {
        if (!du.openingAsOf) {
          setMessage({ type: 'error', text: 'Choose the as-of date of these balances first.' });
          return;
        }
        if (parsedRows.some(r => !r.isValid)) {
          setMessage({ type: 'error', text: 'Correct the marked rows in the file first. Nothing was imported.' });
          return;
        }
        const res = await partiesApi.importOpeningBalances({
          tenant_id: tid,
          party_type: du.openingPartyType,
          as_of: new Date(`${du.openingAsOf}T23:59:59`).toISOString(),
          apply: true,
          rows: validRows.map(r => ({ name: r.data.name, amount: r.data.balance })),
          created_by: userId || null,
          created_by_name: userName || null,
        });
        if (!res.success) {
          setMessage({ type: 'error', text: res.error || 'Failed to import opening balances.' });
        } else if (!res.applied) {
          const byRow = res.results || [];
          setParsedRows(validRows.map((r, i) => {
            const result = byRow[i];
            const failed = result && !['post', 'unchanged', 'skip'].includes(result.status);
            return failed ? { ...r, isValid: false, errors: [result.reason || result.status] } : r;
          }));
          const first = byRow.filter(r => !['post', 'unchanged', 'skip'].includes(r.status)).slice(0, 3).map(r => `${r.name}: ${r.reason}`).join('; ');
          setMessage({ type: 'error', text: `Nothing was imported. ${res.blocked} rows need attention. ${first}` });
        } else {
          setMessage({ type: 'success', text: `Posted ${res.posted} opening balances (${validRows.length - (res.posted || 0)} already in place). File total ${res.total}.` });
          if (onImportSuccess) onImportSuccess(res.posted || 0, 'opening_balances');
        }
        return;
      }

      if (entityType === 'products') {
        const payload = validRows.map(r => ({
          product_id: uuidv4(),
          tenant_id: tid,
          name: r.data.name,
          sku_barcode: r.data.sku_barcode || null,
          item_code: r.data.item_code || null,
          category: r.data.category || null,
          brand_manufacturer: r.data.brand_manufacturer || null,
          purchase_price: r.data.purchase_price || 0,
          base_price: r.data.base_price || 0,
          current_stock: r.data.current_stock || 0,
          reorder_level: r.data.reorder_level || 0,
          is_gst_applicable: r.data.is_gst_applicable ?? 1,
          tax_rate_percent: r.data.tax_rate_percent || 0,
          uom: r.data.uom || 'Pcs',
          hsn_sac_code: r.data.hsn_sac_code || null,
          domain_attributes: '{}',
          billing_type: ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(r.data.uom) ? 'WEIGHT' : 'PIECE',
          pricing_mode: 'FIXED_PRICE',
          discount_percent: r.data.discount_percent != null ? Number(r.data.discount_percent) : null,
          discount_flat: r.data.discount_flat != null ? Number(r.data.discount_flat) : null,
          offer_price: r.data.offer_price != null ? Number(r.data.offer_price) : null,
          tier_prices: r.data.tier_prices || {}
        }));

        if (hasBridge('dbBulkImportProducts')) {
          const res = await productsApi.bulkImportProducts(payload);
          if (res.success) {
            setMessage({ type: 'success', text: `Successfully imported ${payload.length} products!` });
            if (onImportSuccess) onImportSuccess(payload.length, 'products');
            setTimeout(() => { onClose(); }, 1200);
          } else {
            setMessage({ type: 'error', text: res.error || 'Failed to import products.' });
          }
        } else {
          setMessage({ type: 'error', text: 'Desktop database API is unavailable.' });
        }
      } else if (entityType === 'staff') {
        // Import Staff
        const partyPayload = validRows.map(r => ({
          party_id: uuidv4(),
          tenant_id: tid,
          name: r.data.name,
          phone: r.data.phone || null,
          address: r.data.address || null,
          gstin: null,
          balance: 0,
          balance_type: 'PAYABLE',
          credit_limit: 0,
          party_type: 'STAFF',
          custom_category: r.data.role_designation || 'Staff',
          notes: r.data.notes || null,
          created_by: userId || null,
          created_by_name: userName || null
        }));

        if (hasBridge('dbBulkImportParties')) {
          await partiesApi.bulkImportParties(partyPayload);
        }

        if (hasBridge('dbSaveStaff')) {
          for (const r of validRows) {
            try {
              await staffApi.saveStaff({
                tenant_id: tid,
                name: r.data.name,
                phone: r.data.phone || undefined,
                email: r.data.email || undefined,
                role_designation: r.data.role_designation || 'Staff',
                joining_date: r.data.joining_date || undefined,
                monthly_salary: r.data.monthly_salary || 0,
                status: 'ACTIVE'
              });
            } catch (e) {
              console.warn('Error saving staff:', e);
            }
          }
        }

        setMessage({ type: 'success', text: `Successfully imported ${validRows.length} staff members!` });
        if (onImportSuccess) onImportSuccess(validRows.length, 'staff');
        setTimeout(() => { onClose(); }, 1200);

      } else {
        // Suppliers or Customers
        const payload = validRows.map(r => ({
          party_id: uuidv4(),
          tenant_id: tid,
          name: r.data.name,
          phone: r.data.phone || null,
          address: r.data.address || null,
          gstin: r.data.gstin || null,
          balance: r.data.balance || 0,
          balance_type: r.data.balance_type || (entityType === 'suppliers' ? 'PAYABLE' : 'RECEIVABLE'),
          credit_limit: r.data.credit_limit || 0,
          party_type: entityType === 'suppliers' ? 'SUPPLIER' : 'CUSTOMER',
          custom_category: r.data.custom_category || null,
          notes: r.data.notes || null,
          created_by: userId || null,
          created_by_name: userName || null
        }));

        if (hasBridge('dbBulkImportParties')) {
          const res = await partiesApi.bulkImportParties(payload);
          if (res.success) {
            const ignored = res.ignored_balances || 0;
            if (ignored > 0) {
              setMessage({ type: 'info', text: `Imported ${payload.length} ${entityType}. ${ignored} already existed, so their balances in this file were NOT applied. Use the Opening Balances tab for those.` });
            } else {
              setMessage({ type: 'success', text: `Successfully imported ${payload.length} ${entityType}!` });
              setTimeout(() => { onClose(); }, 1200);
            }
            if (onImportSuccess) onImportSuccess(payload.length, entityType);
          } else {
            setMessage({ type: 'error', text: res.error || `Failed to import ${entityType}.` });
          }
        } else {
          setMessage({ type: 'error', text: 'Desktop database API is unavailable.' });
        }
      }
    } catch (err) {
      console.error('Import error:', err);
      setMessage({ type: 'error', text: (err as Error).message || 'An error occurred during import.' });
    } finally {
      setImporting(false);
    }
  };

  return { handleImport };
}
