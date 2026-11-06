// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DataUploadPreview } from '../../src/components/data-upload/views/DataUploadPreview';

it('shows errors beyond row 100 first and explains them without hovering', () => {
  const rows = Array.from({ length: 102 }, (_, i) => ({ id: String(i),
    data: { name: `Drill ${i}`, base_price: 100, tax_rate_percent: 0, uom: 'Pcs', hsn_sac_code: '' },
    isValid: i !== 101, errors: i === 101 ? ['Stock must be a valid number'] : [] }));
  render(<DataUploadPreview entityType="products" parsedRows={rows} validCount={101} invalidCount={1} onClear={() => {}} />);
  expect(screen.getByText('Drill 101')).toBeTruthy();
  expect(screen.getByText('Stock must be a valid number')).toBeTruthy();
  expect(screen.getByText(/rows needing correction first/)).toBeTruthy();
});
