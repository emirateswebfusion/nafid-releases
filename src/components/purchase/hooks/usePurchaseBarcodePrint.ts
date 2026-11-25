import { useState, useEffect, useCallback } from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { printingApi, type BulkPrintItem } from '../../../data/printing';
import { gradesApi, type Grade } from '../../../data/grades';
import { settingsApi } from '../../../data/settings';
import { productsApi, type Product } from '../../../data/products';
import { purchasesApi } from '../../../data/purchases';
import { type CodeType, DEFAULT_CODE_TYPE } from '../../../config/labelCodeTypes';
import type { PurchaseBill, PurchaseBillItem, PurchaseFormItem } from '../purchaseTypes';

export interface UsePurchaseBarcodePrintOptions {
  tenantId: string | null;
  setStatusMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export function usePurchaseBarcodePrint({
  tenantId,
  setStatusMessage,
}: UsePurchaseBarcodePrintOptions) {
  const [printModalProduct, setPrintModalProduct] = useState<Product | null>(null);
  const [printQuantity, setPrintQuantity] = useState<number | string>(1);
  const [printPrice, setPrintPrice] = useState(true);
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [bulkPrintModalOpen, setBulkPrintModalOpen] = useState(false);
  const [bulkPrintBill, setBulkPrintBill] = useState<PurchaseBill | null>(null);
  const [bulkPrintItems, setBulkPrintItems] = useState<PurchaseBillItem[]>([]);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);

  // Load printer barcode settings and grades
  useEffect(() => {
    if (!isDesktopRuntime() || !tenantId) return;

    if (hasBridge('settingsGet')) {
      settingsApi.get({ tenant_id: tenantId, key: 'label_code_type' })
        .then(val => {
          if (val) setLabelCodeType(val as CodeType);
        })
        .catch(() => {});
    }

    if (hasBridge('dbGetGrades')) {
      gradesApi.getGrades(tenantId)
        .then(res => {
          if (Array.isArray(res)) setGrades(res);
        })
        .catch(() => {});
    }
  }, [tenantId]);

  const openPrintModal = useCallback((product: Product, defaultQuantity?: number | string) => {
    setPrintModalProduct(product);
    setPrintQuantity(defaultQuantity !== undefined && Number(defaultQuantity) > 0 ? defaultQuantity : 1);
    setPrintPrice(true);
  }, []);

  const closePrintModal = useCallback(() => {
    setPrintModalProduct(null);
  }, []);

  const openBarcodeModalForFormItem = useCallback(async (item: PurchaseFormItem) => {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));

    if (hasBridge('dbGetProductsByIds') && tenantId && item.product_id) {
      try {
        const fetched = await productsApi.getProductsByIds({
          tenant_id: tenantId,
          product_ids: [item.product_id],
        });
        if (Array.isArray(fetched) && fetched.length > 0 && fetched[0].sku_barcode) {
          openPrintModal(fetched[0], qty);
          return;
        }
      } catch {
        // Fallback to in-memory item data below
      }
    }

    if (item.sku_barcode) {
      const syntheticProduct = {
        product_id: item.product_id,
        tenant_id: tenantId || 'global',
        name: item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim(),
        sku_barcode: item.sku_barcode,
        item_code: '',
        category: '',
        brand_manufacturer: null,
        uom: 'Pcs',
        purchase_price: Number(item.purchase_price) || 0,
        base_price: Number(item.selling_price) || Number(item.purchase_price) || 0,
        current_stock: Number(item.stock) || 0,
        reorder_level: 0,
        is_gst_applicable: item.is_gst_applicable ?? 0,
        tax_rate_percent: item.tax_rate_percent ?? 0,
        hsn_sac_code: item.hsn_sac_code ?? null,
        discount_percent: item.discount_percent ?? null,
        discount_flat: item.discount_flat ?? null,
        offer_price: item.offer_price ? Number(item.offer_price) : null,
        billing_type: 'PIECE',
        domain_attributes: null,
        grade_id: item.grade_id ?? null,
        pricing_mode: (item.pricing_mode as Product['pricing_mode']) || 'FIXED_PRICE',
        is_deleted: 0,
        sync_status: 'SYNCED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as Product;
      openPrintModal(syntheticProduct, qty);
      return;
    }

    setStatusMessage({
      text: 'Product has no barcode. Please edit product to add or generate a barcode.',
      type: 'error',
    });
    setTimeout(() => setStatusMessage(null), 3000);
  }, [tenantId, openPrintModal, setStatusMessage]);

  const openBarcodeModalForBillItem = useCallback(async (item: PurchaseBillItem) => {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));

    if (hasBridge('dbGetProductsByIds') && tenantId && item.product_id) {
      try {
        const fetched = await productsApi.getProductsByIds({
          tenant_id: tenantId,
          product_ids: [item.product_id],
        });
        if (Array.isArray(fetched) && fetched.length > 0 && fetched[0].sku_barcode) {
          openPrintModal(fetched[0], qty);
          return;
        }
      } catch {
        // Fallback to in-memory item data below
      }
    }

    const barcode = item.sku_barcode;
    if (barcode) {
      const syntheticProduct = {
        product_id: item.product_id,
        tenant_id: tenantId || 'global',
        name: (item.product_name || item.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim(),
        sku_barcode: barcode,
        item_code: item.item_code || '',
        category: '',
        brand_manufacturer: null,
        uom: 'Pcs',
        purchase_price: Number(item.purchase_price) || 0,
        base_price: Number(item.product_base_price) || Number(item.selling_price) || Number(item.purchase_price) || 0,
        current_stock: Number(item.product_stock) || 0,
        reorder_level: 0,
        is_gst_applicable: item.is_gst_applicable ?? 0,
        tax_rate_percent: item.tax_rate_percent ?? 0,
        hsn_sac_code: item.hsn_sac_code ?? null,
        discount_percent: null,
        discount_flat: null,
        offer_price: item.product_offer_price ? Number(item.product_offer_price) : (item.offer_price ? Number(item.offer_price) : null),
        billing_type: 'PIECE',
        domain_attributes: null,
        grade_id: null,
        pricing_mode: 'FIXED_PRICE',
        is_deleted: 0,
        sync_status: 'SYNCED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as Product;
      openPrintModal(syntheticProduct, qty);
      return;
    }

    setStatusMessage({
      text: 'Product has no barcode. Please edit product in inventory to add a barcode.',
      type: 'error',
    });
    setTimeout(() => setStatusMessage(null), 3000);
  }, [tenantId, openPrintModal, setStatusMessage]);

  const printProductLabel = useCallback(async (p: Product) => {
    if (!p.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });

    if (hasBridge('printBarcode')) {
      const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE'
        ? gradeRate
        : Number(p.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (p.offer_price) {
        sp = Number(p.offer_price);
        spType = 'OFF';
      } else if (p.discount_flat) {
        sp = effectiveMrp - Number(p.discount_flat);
        spType = 'SP';
      } else if (p.discount_percent) {
        sp = effectiveMrp * (1 - Number(p.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
        sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      const cleanName = (p.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
      localStorage.setItem('printBarcodeName', cleanName);

      const qty = Math.max(1, Number(printQuantity) || 1);
      const res = await printingApi.printBarcode(
        tenantId || 'global',
        p.sku_barcode,
        printPrice ? effectiveMrp : undefined,
        cleanName,
        qty,
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({
          text: `Barcode printed successfully (${qty} label${qty > 1 ? 's' : ''})!`,
          type: 'success',
        });
        setTimeout(() => setPrintModalProduct(null), 2000);
      } else {
        setStatusMessage({
          text: `Print Failed: ${res.error || 'Printer not connected'}`,
          type: 'error',
        });
      }

      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Print command dispatched (mock)', type: 'success' });
      setTimeout(() => {
        setPrintModalProduct(null);
        setStatusMessage(null);
      }, 2000);
    }
  }, [tenantId, grades, printPrice, printQuantity, setStatusMessage]);

  const printBulkBarcodesForBill = useCallback(async (
    bill: PurchaseBill,
    providedItems?: PurchaseBillItem[]
  ) => {
    let items = providedItems;
    if (!items || items.length === 0) {
      if (hasBridge('dbGetPurchaseBillItems')) {
        const fetched = await purchasesApi.getPurchaseBillItems(bill.purchase_bill_id);
        if (Array.isArray(fetched)) items = fetched;
      }
    }

    if (!items || items.length === 0) {
      setStatusMessage({ text: 'No items in this purchase bill to print.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const itemsWithBarcode = items.filter(i => !!i.sku_barcode);
    if (itemsWithBarcode.length === 0) {
      setStatusMessage({
        text: 'None of the items in this purchase bill have a barcode.',
        type: 'error',
      });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setStatusMessage({
      text: `Sending barcode labels for ${itemsWithBarcode.length} product(s) to printer...`,
      type: 'success',
    });

    if (hasBridge('printBulkBarcodes')) {
      const printItems: BulkPrintItem[] = itemsWithBarcode.map(item => {
        const effectivePrice = Number(item.product_base_price) || Number(item.selling_price) || Number(item.purchase_price) || 0;
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const cleanName = (item.product_name || item.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
        const offer = item.product_offer_price ? Number(item.product_offer_price) : (item.offer_price ? Number(item.offer_price) : undefined);

        return {
          barcode: item.sku_barcode!,
          name: cleanName,
          price: effectivePrice,
          quantity: qty,
          sp: offer && offer > 0 && offer !== effectivePrice ? offer : undefined,
          spType: offer && offer > 0 && offer !== effectivePrice ? 'OFF' : undefined,
        };
      });

      const res = await printingApi.printBulkBarcodes(tenantId || 'global', printItems);
      if (res.success) {
        const totalLabels = printItems.reduce((acc, p) => acc + p.quantity, 0);
        setStatusMessage({
          text: `Successfully sent ${totalLabels} barcode label(s) for ${printItems.length} product(s) to printer!`,
          type: 'success',
        });
      } else {
        setStatusMessage({
          text: `Print Failed: ${res.error || 'Printer error'}`,
          type: 'error',
        });
      }
      setTimeout(() => setStatusMessage(null), 4000);
    } else {
      setStatusMessage({ text: 'Bulk print command dispatched (mock)', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [tenantId, setStatusMessage]);

  const openBulkBarcodeModal = useCallback(async (
    bill: PurchaseBill,
    providedItems?: PurchaseBillItem[]
  ) => {
    let items = providedItems;
    if (!items || items.length === 0) {
      if (hasBridge('dbGetPurchaseBillItems')) {
        try {
          const fetched = await purchasesApi.getPurchaseBillItems(bill.purchase_bill_id);
          if (Array.isArray(fetched)) items = fetched;
        } catch {
          // Fallback to empty list
        }
      }
    }

    if (!items || items.length === 0) {
      setStatusMessage({ text: 'No items in this purchase bill to print.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const itemsWithBarcode = items.filter(i => !!i.sku_barcode);
    if (itemsWithBarcode.length === 0) {
      setStatusMessage({
        text: 'None of the items in this purchase bill have a barcode.',
        type: 'error',
      });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setBulkPrintBill(bill);
    setBulkPrintItems(items);
    setBulkPrintModalOpen(true);
  }, [setStatusMessage]);

  const closeBulkBarcodeModal = useCallback(() => {
    setBulkPrintModalOpen(false);
    setBulkPrintBill(null);
    setBulkPrintItems([]);
    setIsBulkPrinting(false);
  }, []);

  const executeBulkBarcodePrint = useCallback(async (
    printItems: BulkPrintItem[],
    showPrice: boolean
  ) => {
    if (printItems.length === 0) return;
    setIsBulkPrinting(true);
    setStatusMessage({
      text: `Sending barcode labels for ${printItems.length} product(s) to printer...`,
      type: 'success',
    });

    const itemsToPrint: BulkPrintItem[] = showPrice
      ? printItems
      : printItems.map(item => ({
          ...item,
          price: undefined,
          sp: undefined,
          spType: undefined,
        }));

    if (hasBridge('printBulkBarcodes')) {
      const res = await printingApi.printBulkBarcodes(tenantId || 'global', itemsToPrint);
      if (res.success) {
        const totalLabels = itemsToPrint.reduce((acc, p) => acc + p.quantity, 0);
        setStatusMessage({
          text: `Successfully sent ${totalLabels} barcode label(s) for ${itemsToPrint.length} product(s) to printer!`,
          type: 'success',
        });
        closeBulkBarcodeModal();
      } else {
        setStatusMessage({
          text: `Print Failed: ${res.error || 'Printer error'}`,
          type: 'error',
        });
      }
      setTimeout(() => setStatusMessage(null), 4000);
    } else {
      setStatusMessage({ text: 'Bulk print command dispatched (mock)', type: 'success' });
      closeBulkBarcodeModal();
      setTimeout(() => setStatusMessage(null), 3000);
    }
    setIsBulkPrinting(false);
  }, [tenantId, setStatusMessage, closeBulkBarcodeModal]);

  return {
    printModalProduct,
    printQuantity,
    setPrintQuantity,
    printPrice,
    setPrintPrice,
    labelCodeType,
    grades,
    openPrintModal,
    closePrintModal,
    openBarcodeModalForFormItem,
    openBarcodeModalForBillItem,
    printProductLabel,
    printBulkBarcodesForBill,
    bulkPrintModalOpen,
    bulkPrintBill,
    bulkPrintItems,
    isBulkPrinting,
    openBulkBarcodeModal,
    closeBulkBarcodeModal,
    executeBulkBarcodePrint,
  };
}
