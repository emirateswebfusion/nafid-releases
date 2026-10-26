import { useCallback, useEffect } from 'react';
import { hasBridge } from '../../../data/client';
import { recycleBinApi } from '../../../data/recycleBin';
import { type RecycleBinCategory } from '../recycleBinTypes';
import type { RecycleBinState } from './useRecycleBinState';

export interface UseRecycleBinDataContext {
  activeCategory: RecycleBinCategory;
  rb: RecycleBinState;
  tid: string;
}

/** Deleted-row loaders for every category, the mount load of all four counts, and the active-category reload. */
export function useRecycleBinData(ctx: UseRecycleBinDataContext) {
  const { activeCategory, tid } = ctx;
  const {
    setCustomers, setInvoices, setLoaded, setLoadingCustomers, setLoadingInvoices, setLoadingParties,
    setLoadingProducts, setParties, setProducts,
  } = ctx.rb;

  const loadInvoices = useCallback(async () => {
    if (!hasBridge('dbGetDeletedInvoices')) return;
    setLoadingInvoices(true);
    try {
      const data = await recycleBinApi.getDeletedInvoices(tid);
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, [tid, setLoadingInvoices, setInvoices]);

  const loadProducts = useCallback(async () => {
    if (!hasBridge('dbGetDeletedProducts')) return;
    setLoadingProducts(true);
    try {
      const data = await recycleBinApi.getDeletedProducts(tid);
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [tid, setLoadingProducts, setProducts]);

  const loadCustomers = useCallback(async () => {
    if (!hasBridge('dbGetDeletedCustomers')) return;
    setLoadingCustomers(true);
    try {
      const data = await recycleBinApi.getDeletedCustomers(tid);
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [tid, setLoadingCustomers, setCustomers]);

  const loadParties = useCallback(async () => {
    if (!hasBridge('dbGetDeletedParties')) return;
    setLoadingParties(true);
    try {
      const data = await recycleBinApi.getDeletedParties(tid);
      setParties(Array.isArray(data) ? data : []);
    } catch {
      setParties([]);
    } finally {
      setLoadingParties(false);
    }
  }, [tid, setLoadingParties, setParties]);

  // Load all summary on mount
  useEffect(() => {
    loadInvoices();
    loadProducts();
    loadCustomers();
    loadParties();
    setLoaded(new Set(['SALES_BILLS', 'PRODUCTS', 'CUSTOMERS', 'PARTIES']));
  }, [loadInvoices, loadProducts, loadCustomers, loadParties, setLoaded]);

  // Reload current category
  const reloadActive = useCallback(() => {
    if (activeCategory === 'SALES_BILLS') loadInvoices();
    else if (activeCategory === 'PRODUCTS') loadProducts();
    else if (activeCategory === 'CUSTOMERS') loadCustomers();
    else if (activeCategory === 'PARTIES') loadParties();
  }, [activeCategory, loadInvoices, loadProducts, loadCustomers, loadParties]);

  return { loadInvoices, loadProducts, loadCustomers, loadParties, reloadActive };
}
