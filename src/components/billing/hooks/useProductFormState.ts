import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { gradesApi } from '../../../data/grades';
import { listProducts } from '../../../data/products';
import { getSetting } from '../../../data/settings';

/**
 * State of the billing "create / edit product" form (CreateProductModal): every field, grade picker, tier prices,
 * the dialog refs, plus the categories, grades and price-coding setting it needs (loaded for the tenant and again
 * whenever the form opens).
 */
export function useProductFormState(tenantId: string | null) {
  const productFormDialogRef = useRef<HTMLDivElement>(null);
  const gradeFormDialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [showProductCreateForm, setShowProductCreateForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [editingProductSnapshot, setEditingProductSnapshot] = useState<any | null>(null);
  const [productPriceCoding, setProductPriceCoding] = useState<Record<string, string> | null>(null);
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductUom, setNewProductUom] = useState('Pcs');
  const [newProductPcs, setNewProductPcs] = useState('');
  const [newProductPurchasePrice, setNewProductPurchasePrice] = useState('');
  const [newProductBasePrice, setNewProductBasePrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductTaxRate, setNewProductTaxRate] = useState(0);
  const [newProductDiscountPercent, setNewProductDiscountPercent] = useState('');
  const [newProductDiscountFlat, setNewProductDiscountFlat] = useState('');
  const [newProductOfferPrice, setNewProductOfferPrice] = useState('');
  const [newProductIsGstApplicable, setNewProductIsGstApplicable] = useState(false);
  const [newProductIsDummy, setNewProductIsDummy] = useState(false);
  const [newProductIsCustomCategory, setNewProductIsCustomCategory] = useState(false);
  const [productFormTierPrices, setProductFormTierPrices] = useState<Record<string, string>>({});
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [productFormView, setProductFormView] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('productFormView') as 'grid' | 'list') || 'grid';
  });
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [newProductGrades, setNewProductGrades] = useState<any[]>([]);
  const [newProductGradeId, setNewProductGradeId] = useState('');
  const [newProductIsAddingGrade, setNewProductIsAddingGrade] = useState(false);
  const [newProductSavingGrade, setNewProductSavingGrade] = useState(false);
  const [newProductGradeForm, setNewProductGradeForm] = useState({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });

  // Fetch categories & grades immediately so options are ready instantly when form opens
  const loadCategoriesAndGrades = useCallback(() => {
    if (!isDesktopRuntime() || !tenantId) return;
    listProducts({ tenant_id: tenantId, limit: 500 })
      .then((res: any[]) => {
        if (Array.isArray(res)) {
          const cats = [...new Set(res.map(p => p.category).filter(Boolean))] as string[];
          setConfiguredCategories(cats);
        }
      })
      .catch(console.error);
    gradesApi.getGrades(tenantId)
      .then((res: any[]) => {
        if (Array.isArray(res)) setNewProductGrades(res);
      })
      .catch(console.error);
  }, [tenantId]);

  useEffect(() => {
    loadCategoriesAndGrades();
  }, [loadCategoriesAndGrades]);

  useEffect(() => {
    if (showProductCreateForm) {
      loadCategoriesAndGrades();
    }
  }, [showProductCreateForm, loadCategoriesAndGrades]);

  useEffect(() => {
    if (!isDesktopRuntime() || !tenantId) {
      setProductPriceCoding(null);
      return;
    }
    getSetting({ tenant_id: tenantId, key: 'price_coding' })
      .then((value: any) => setProductPriceCoding(value && typeof value === 'object' ? value : null))
      .catch(() => setProductPriceCoding(null));
  }, [tenantId]);

  return {
    productFormDialogRef, gradeFormDialogRef, firstInputRef, showProductCreateForm, setShowProductCreateForm, editingProductId,
    setEditingProductId, newProductName, setNewProductName, newProductItemCode, setNewProductItemCode, newProductBarcode,
    setNewProductBarcode, editingProductSnapshot, setEditingProductSnapshot, productPriceCoding, setProductPriceCoding, newProductBrand,
    setNewProductBrand, newProductCategory, setNewProductCategory, newProductUom, setNewProductUom, newProductPcs,
    setNewProductPcs, newProductPurchasePrice, setNewProductPurchasePrice, newProductBasePrice, setNewProductBasePrice, newProductStock,
    setNewProductStock, newProductReorderLevel, setNewProductReorderLevel, newProductHsn, setNewProductHsn, newProductTaxRate,
    setNewProductTaxRate, newProductDiscountPercent, setNewProductDiscountPercent, newProductDiscountFlat, setNewProductDiscountFlat, newProductOfferPrice,
    setNewProductOfferPrice, newProductIsGstApplicable, setNewProductIsGstApplicable, newProductIsDummy, setNewProductIsDummy, newProductIsCustomCategory,
    setNewProductIsCustomCategory, productFormTierPrices, setProductFormTierPrices, autoPrintBarcode, setAutoPrintBarcode, productFormView,
    setProductFormView, configuredCategories, setConfiguredCategories, newProductGrades, setNewProductGrades, newProductGradeId,
    setNewProductGradeId, newProductIsAddingGrade, setNewProductIsAddingGrade, newProductSavingGrade, setNewProductSavingGrade, newProductGradeForm,
    setNewProductGradeForm, loadCategoriesAndGrades,
  };
}

export type ProductFormState = ReturnType<typeof useProductFormState>;
