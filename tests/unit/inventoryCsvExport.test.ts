import { describe, expect, it } from 'vitest';
import { buildInventoryCsvRow } from '../../src/components/inventory/hooks/useInventoryExports';
import { resolveDynamicTierName } from '../../src/components/data-upload/dataUploadTypes';
import type { Product } from '../../src/components/inventory/inventoryUtils';

const mockProduct: Product = {
  product_id: 'p-1',
  tenant_id: 't-1',
  name: 'Rice 5kg',
  item_code: 'RICE-01',
  sku_barcode: '890123456789',
  hsn_sac_code: '10063010',
  category: 'Groceries',
  brand_manufacturer: 'Royal Harvest',
  uom: 'Kgs',
  purchase_price: 350,
  base_price: 450,
  is_gst_applicable: 1,
  tax_rate_percent: 5,
  current_stock: 50,
  reorder_level: 10,
  discount_percent: 5,
  discount_flat: 10,
  offer_price: 420,
  billing_type: 'WEIGHT',
  pricing_mode: 'FIXED_PRICE',
  grade_id: null,
  is_deleted: 0,
  deleted_at: null,
  average_weight_per_piece: null,
  weight_override_allowed: 0,
  is_service_item: 0,
  sync_status: 'synced',
  print_status: 'printed',
  created_at: '2026-11-01 10:00:00',
  domain_attributes: null,
};

describe('buildInventoryCsvRow', () => {
  it('correctly exports HSN Code and Item Code directly from product columns', () => {
    const row = buildInventoryCsvRow({
      product: mockProduct,
      grades: [],
      activeTiers: [],
      pricingMap: {},
    });

    expect(row['Item Code']).toBe('RICE-01');
    expect(row['HSN Code']).toBe('10063010');
    expect(row['Barcode']).toBe('890123456789');
    expect(row['Tax Rate %']).toBe(5);
    expect(row['Low Stock']).toBe(10);
    expect(row['Discount %']).toBe(5);
    expect(row['Discount Flat']).toBe(10);
    expect(row['Offer Price']).toBe(420);
    expect(row['Billing Type']).toBe('WEIGHT');
    expect(row['GST Applicable']).toBe('YES');
  });

  it('falls back to domain_attributes when item_code and hsn_sac_code are stored there', () => {
    const productWithDa: Product = {
      ...mockProduct,
      item_code: null,
      hsn_sac_code: null,
      tax_rate_percent: null,
      domain_attributes: JSON.stringify({
        item_code: 'DA-ITEM-99',
        hsn_sac_code: '21069099',
        tax_rate_percent: 18,
      }),
    };

    const row = buildInventoryCsvRow({
      product: productWithDa,
      grades: [],
      activeTiers: [],
      pricingMap: {},
    });

    expect(row['Item Code']).toBe('DA-ITEM-99');
    expect(row['HSN Code']).toBe('21069099');
    expect(row['Tax Rate %']).toBe(18);
    expect(row['GST Applicable']).toBe('YES');
  });

  it('includes active pricing tiers in dynamic columns', () => {
    const tiers = [
      { pricing_tier_id: 'tier-wholesale', name: 'Wholesale' },
      { pricing_tier_id: 'tier-vip', name: 'VIP' },
    ];
    const pricingMap = {
      'p-1': {
        'tier-wholesale': 400,
        'tier-vip': 390,
      },
    };

    const row = buildInventoryCsvRow({
      product: mockProduct,
      grades: [],
      activeTiers: tiers,
      pricingMap,
    });

    expect(row['Wholesale']).toBe(400);
    expect(row['VIP']).toBe(390);
  });
});

describe('PRODUCT_HEADER_MAP and dynamic tiers', () => {
  it('recognizes standard exported CSV headers so they are never mistakenly treated as pricing tiers', () => {
    const exportedHeaders = [
      'Name',
      'Item Code',
      'Barcode',
      'HSN Code',
      'Category',
      'Brand',
      'UOM',
      'Purchase Price',
      'Paper Purchase',
      'MRP',
      'Paper MRP',
      'Tax Rate %',
      'Discount %',
      'Discount Percentage',
      'Discount Flat',
      'Offer Price',
      'Real Stock',
      'Paper Stock',
      'Low Stock',
      'Billing Type',
      'GST Applicable',
      'Added Date',
    ];

    for (const header of exportedHeaders) {
      const tierName = resolveDynamicTierName(header, []);
      expect(tierName, `Header "${header}" should not be resolved as dynamic pricing tier`).toBeNull();
    }
  });
});
