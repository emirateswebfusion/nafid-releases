import { useState, useRef } from 'react';
import type { Grade } from '../../../data/grades';

/**
 * State of the create / edit product dialog in the purchase bill form: every field, grade picker and new-grade form,
 * tier prices, layout (grid / list), categories, the product being edited and the dialog refs.
 */
export function usePurchaseProductFormState() {
  const productFormDialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [showProductCreateForm, setShowProductCreateForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductUom, setNewProductUom] = useState('Pcs');
  const [newProductPurchasePrice, setNewProductPurchasePrice] = useState('');
  const [newProductBasePrice, setNewProductBasePrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductTaxRate, setNewProductTaxRate] = useState(18);
  const [newProductDiscountPercent, setNewProductDiscountPercent] = useState('');
  const [newProductDiscountFlat, setNewProductDiscountFlat] = useState('');
  const [newProductOfferPrice, setNewProductOfferPrice] = useState('');
  const [newProductIsGstApplicable, setNewProductIsGstApplicable] = useState(true);
  const [newProductIsDummy, setNewProductIsDummy] = useState(false);
  const [newProductIsCustomCategory, setNewProductIsCustomCategory] = useState(false);
  const [newProductGrades, setNewProductGrades] = useState<Grade[]>([]);
  const [newProductGradeId, setNewProductGradeId] = useState('');
  const [newProductIsAddingGrade, setNewProductIsAddingGrade] = useState(false);
  const [newProductSavingGrade, setNewProductSavingGrade] = useState(false);
  const [newProductGradeForm, setNewProductGradeForm] = useState({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [productFormView, setProductFormView] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('productFormView') as 'grid' | 'list') || 'grid';
  });
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [newProductPcs, setNewProductPcs] = useState('');
  const [editingProductItemId, setEditingProductItemId] = useState<string | null>(null);
  const [originalProductStock, setOriginalProductStock] = useState<number | null>(null);

  return {
    productFormDialogRef, firstInputRef, showProductCreateForm, setShowProductCreateForm, newProductName, setNewProductName,
    newProductItemCode, setNewProductItemCode, newProductBarcode, setNewProductBarcode, newProductBrand, setNewProductBrand,
    newProductCategory, setNewProductCategory, newProductUom, setNewProductUom, newProductPurchasePrice, setNewProductPurchasePrice,
    newProductBasePrice, setNewProductBasePrice, newProductStock, setNewProductStock, newProductReorderLevel, setNewProductReorderLevel,
    newProductHsn, setNewProductHsn, newProductTaxRate, setNewProductTaxRate, newProductDiscountPercent, setNewProductDiscountPercent,
    newProductDiscountFlat, setNewProductDiscountFlat, newProductOfferPrice, setNewProductOfferPrice, newProductIsGstApplicable, setNewProductIsGstApplicable,
    newProductIsDummy, setNewProductIsDummy, newProductIsCustomCategory, setNewProductIsCustomCategory, newProductGrades, setNewProductGrades,
    newProductGradeId, setNewProductGradeId, newProductIsAddingGrade, setNewProductIsAddingGrade, newProductSavingGrade, setNewProductSavingGrade,
    newProductGradeForm, setNewProductGradeForm, tierPrices, setTierPrices, productFormView, setProductFormView,
    configuredCategories, setConfiguredCategories, newProductPcs, setNewProductPcs, editingProductItemId, setEditingProductItemId,
    originalProductStock, setOriginalProductStock,
  };
}

export type PurchaseProductFormState = ReturnType<typeof usePurchaseProductFormState>;
