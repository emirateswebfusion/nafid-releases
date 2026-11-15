// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CoreSection } from '../../src/components/inventory/views/form/CoreSection';
import { DEFAULT_FORM } from '../../src/components/inventory/inventoryUtils';

afterEach(cleanup);

it('renders a product with no category instead of crashing while trimming it', () => {
  render(
    <CoreSection
      categoryContainerRef={{ current: null }}
      categoryGrades={[]}
      categorySuggestions={[]}
      firstInputRef={{ current: null }}
      formData={{ ...DEFAULT_FORM, category: undefined as unknown as string }}
      generateBarcode={vi.fn()}
      grades={[]}
      handleCategoryKeyDown={vi.fn()}
      handleInputChange={vi.fn()}
      handleNameKeyDown={vi.fn()}
      isAddingGrade={false}
      labelCodeType="barcode"
      nameContainerRef={{ current: null }}
      nameSuggestions={[]}
      qrPreviewUrl={null}
      selectCategorySuggestion={vi.fn()}
      selectedCategoryIndex={0}
      selectedNameIndex={0}
      selectNameSuggestion={vi.fn()}
      setIsAddingGrade={vi.fn()}
      setSelectedCategoryIndex={vi.fn()}
      setSelectedNameIndex={vi.fn()}
      setShowCategorySuggestions={vi.fn()}
      showCategorySuggestions={false}
    />
  );

  expect(screen.getByText('1. Basic Details')).toBeTruthy();
  expect(screen.queryByText('New Grade')).toBeNull();
});
