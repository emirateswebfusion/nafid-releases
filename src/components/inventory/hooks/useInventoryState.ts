import { useState } from 'react';
import { type Product, DEFAULT_FORM } from '../inventoryHelpers';
import { type CodeType, DEFAULT_CODE_TYPE } from '../../../labelCodeTypes';

/**
 * State of the inventory screen: product list, filters and sort, selection, the add / edit product form, grades,
 * suppliers, tier prices, stock adjustment, barcode printing and dialog flags.
 */
export function useInventoryState() {
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at' | 'stock'>('created_at');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'no_barcode'>('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);
  const [, setShowZeroPaperStock] = useState(false);
  const [showPaperOnlyProducts, setShowPaperOnlyProducts] = useState(true);
  const [, setShowProductGstBadge] = useState(true);
  const [showPriceTiersInInventory, setShowPriceTiersInInventory] = useState(true);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [printQuantity, setPrintQuantity] = useState<number | string>(1);
  const [printPrice, setPrintPrice] = useState(true);
  const [printModalProduct, setPrintModalProduct] = useState<Product | null>(null);
  const [adjustingStockId, setAdjustingStockId] = useState<string | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ product: Product; mode: 'add' | 'reduce' } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustPcs, setAdjustPcs] = useState('');
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const [viewMode, setViewMode] = useState<'estimate' | 'gst' | 'combined'>('combined');
  const [showLowStockAlert, setShowLowStockAlert] = useState(true);
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [allProductPricingMap, setAllProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const [isAddingGrade, setIsAddingGrade] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const [newGradeForm, setNewGradeForm] = useState({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [selectedNameIndex, setSelectedNameIndex] = useState(0);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  return {
    view, setView, loading, setLoading, isFetching, setIsFetching, products, setProducts, searchQuery,
    setSearchQuery, debouncedSearchQuery, setDebouncedSearchQuery, isSearching, setIsSearching, sortBy, setSortBy,
    stockFilter, setStockFilter, filterDate, setFilterDate, filterDateEnd, setFilterDateEnd, editingProduct,
    setEditingProduct, formData, setFormData, statusMessage, setStatusMessage, showUploadModal, setShowUploadModal,
    enableRealPaperStock, setEnableRealPaperStock, setShowZeroPaperStock, showPaperOnlyProducts,
    setShowPaperOnlyProducts, setShowProductGstBadge, showPriceTiersInInventory, setShowPriceTiersInInventory,
    deleteConfirmProduct, setDeleteConfirmProduct, isDeleting, setIsDeleting, printQuantity, setPrintQuantity,
    printPrice, setPrintPrice, printModalProduct, setPrintModalProduct, adjustingStockId, setAdjustingStockId,
    adjustModal, setAdjustModal, adjustAmount, setAdjustAmount, adjustPcs, setAdjustPcs, priceCoding, setPriceCoding,
    viewMode, setViewMode, showLowStockAlert, setShowLowStockAlert, labelCodeType, setLabelCodeType, qrPreviewUrl,
    setQrPreviewUrl, grades, setGrades, pricingTiers, setPricingTiers, tierPrices, setTierPrices,
    allProductPricingMap, setAllProductPricingMap, showCategorySuggestions, setShowCategorySuggestions,
    selectedCategoryIndex, setSelectedCategoryIndex, isAddingGrade, setIsAddingGrade, savingGrade, setSavingGrade,
    newGradeForm, setNewGradeForm, nameSuggestions, setNameSuggestions, suppliers, setSuppliers, supplierSearch,
    setSupplierSearch, showSupplierCreate, setShowSupplierCreate, newSupplierName, setNewSupplierName,
    newSupplierPhone, setNewSupplierPhone, newSupplierAddress, setNewSupplierAddress, selectedNameIndex,
    setSelectedNameIndex, highlightedProductId, setHighlightedProductId, offset, setOffset, hasMore, setHasMore,
    totalCount, setTotalCount, selectedProductIds, setSelectedProductIds, showBulkDeleteConfirm,
    setShowBulkDeleteConfirm, isBulkDeleting, setIsBulkDeleting,
  };
}

export type InventoryState = ReturnType<typeof useInventoryState>;
