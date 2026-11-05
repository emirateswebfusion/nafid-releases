import { describe, it, expect } from 'vitest';
import { formatWhatsAppBillMessage } from '../../src/utils/print/whatsappBillHelper';

describe('formatWhatsAppBillMessage tax breakdown', () => {
  it('includes separate tax breakdown (CGST and SGST) when tax is present', () => {
    const msg = formatWhatsAppBillMessage({
      shopName: 'Test Store',
      invoiceNumber: 'INV-100',
      date: '04/11/2026',
      items: [{ name: 'Item 1', quantity: 1, unit_price: 100, total: 100 }],
      subtotal: 100,
      tax: 18,
      cgst: 9,
      sgst: 9,
      discount: 5,
      grandTotal: 113,
      receivedAmount: 113,
      balanceAmount: 0,
      paymentMethod: 'CASH',
    });

    expect(msg).toContain('📋 *Subtotal:* ₹100.00');
    expect(msg).toContain('🏛️ *CGST:* ₹9.00');
    expect(msg).toContain('🏛️ *SGST:* ₹9.00');
    expect(msg).toContain('🏷️ *Discount:* -₹5.00');
    expect(msg).toContain('💵 *Total Amount:* ₹113.00');
  });

  it('includes IGST when only IGST is present', () => {
    const msg = formatWhatsAppBillMessage({
      shopName: 'Test Store',
      invoiceNumber: 'INV-101',
      date: '04/11/2026',
      items: [{ name: 'Item 1', quantity: 2, unit_price: 100, total: 200 }],
      subtotal: 200,
      tax: 36,
      igst: 36,
      grandTotal: 236,
      paymentMethod: 'UPI',
    });

    expect(msg).toContain('📋 *Subtotal:* ₹200.00');
    expect(msg).toContain('🏛️ *IGST:* ₹36.00');
    expect(msg).not.toContain('CGST');
    expect(msg).toContain('💵 *Total Amount:* ₹236.00');
  });

  it('does not display tax lines when tax is 0 (e.g. Bill of Supply)', () => {
    const msg = formatWhatsAppBillMessage({
      shopName: 'Test Store',
      invoiceNumber: 'BOS-001',
      date: '04/11/2026',
      items: [{ name: 'Exempt Item', quantity: 1, unit_price: 50, total: 50 }],
      subtotal: 50,
      tax: 0,
      grandTotal: 50,
      paymentMethod: 'CASH',
    });

    expect(msg).toContain('Subtotal');
    expect(msg).not.toContain('CGST');
    expect(msg).not.toContain('SGST');
    expect(msg).not.toContain('Tax');
    expect(msg).toContain('💵 *Total Amount:* ₹50.00');
  });
});
