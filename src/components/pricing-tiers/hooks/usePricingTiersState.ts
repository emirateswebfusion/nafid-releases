import { useState } from 'react';
import { type PricingTier } from '../../../utils/pricing/pricingTierHelper';
import { type Product } from '../pricingTiersTypes';

/**
 * State of the pricing tiers screen: current view, tiers and products, pricing maps, rename / delete dialogs, matrix
 * search and tier filter, progressive scroll count and drag state, plus loading / message flags.
 */
export function usePricingTiersState() {
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Pricing Data Maps
  const [pricingMap, setPricingMap] = useState<Record<string, Record<string, string>>>({});
  const [initialPricingMap, setInitialPricingMap] = useState<Record<string, Record<string, string>>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [allowBillerOverride, setAllowBillerOverride] = useState(true);

  // Progressive loading for ultra-smooth matrix rendering
  const [visibleCount, setVisibleCount] = useState(50);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return {
    view, setView, tiers, setTiers, products, setProducts, loading, setLoading, operating, setOperating, error, setError,
    statusMessage, setStatusMessage, newName, setNewName, editingId, setEditingId, editName, setEditName,
    confirmDeleteId, setConfirmDeleteId, pricingMap, setPricingMap, initialPricingMap, setInitialPricingMap, searchQuery,
    setSearchQuery, tierFilter, setTierFilter, allowBillerOverride, setAllowBillerOverride, visibleCount, setVisibleCount,
    draggedIndex, setDraggedIndex, dragOverIndex, setDragOverIndex,
  };
}

export type PricingTiersState = ReturnType<typeof usePricingTiersState>;
