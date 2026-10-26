import { useState } from 'react';
import { type StaffDataMaskingConfig, DEFAULT_STAFF_DATA_MASKING_CONFIG } from '../../../utils/staffDataMasking';
import {
  type Product, type ProductBillQty, type StockGradeRow, type StockPartyRow, type StockSalesSummaryRow,
} from '../stockReportTypes';

/**
 * State of the stock report screen: masking config, products, grades, bill quantities, filters, view mode,
 * the product sales summary tab and the real paper stock setting.
 */
export function useStockReportState() {
  const [maskingConfig, setMaskingConfig] = useState<StaffDataMaskingConfig>(DEFAULT_STAFF_DATA_MASKING_CONFIG);
  const [products, setProducts] = useState<Product[]>([]);
  const [grades, setGrades] = useState<StockGradeRow[]>([]);
  const [billQuantities, setBillQuantities] = useState<ProductBillQty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'dummy_gst'>('all');
  const [partyFilter, setPartyFilter] = useState('');
  const [parties, setParties] = useState<StockPartyRow[]>([]);
  const [productSupplierMap, setProductSupplierMap] = useState<Map<string, Set<string>>>(new Map());
  const [viewMode, setViewMode] = useState<'estimate' | 'gst' | 'combined'>('combined');
  const [reportTab, setReportTab] = useState<'stock' | 'sales'>('stock');
  const [salesSummary, setSalesSummary] = useState<StockSalesSummaryRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesFilter, setSalesFilter] = useState<'all' | 'bos' | 'gst'>('all');
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);

  return {
    maskingConfig, setMaskingConfig, products, setProducts, grades, setGrades, billQuantities, setBillQuantities,
    loading, setLoading, refreshing, setRefreshing, lastUpdated, setLastUpdated, searchQuery, setSearchQuery,
    categoryFilter, setCategoryFilter, stockFilter, setStockFilter, partyFilter, setPartyFilter, parties, setParties,
    productSupplierMap, setProductSupplierMap, viewMode, setViewMode, reportTab, setReportTab, salesSummary,
    setSalesSummary, salesLoading, setSalesLoading, salesSearch, setSalesSearch, salesFilter, setSalesFilter,
    enableRealPaperStock, setEnableRealPaperStock,
  };
}

export type StockReportState = ReturnType<typeof useStockReportState>;
