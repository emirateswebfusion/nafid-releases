import { useState } from 'react';
import type { ComboItem, ComboOffer, Product } from '../comboTypes';

/**
 * State of the combo offers screen: combos and filters, the create / edit form, product search, delete confirmation,
 * and loading / saving flags.
 */
export function useComboManagerState() {
  const [combos, setCombos] = useState<ComboOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [viewLayout, setViewLayout] = useState<'grid' | 'table'>('grid');
  
  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboOffer | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku_barcode: '',
    combo_price: '',
    description: '',
    is_active: 1,
  });
  const [selectedItems, setSelectedItems] = useState<ComboItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [comboToDelete, setComboToDelete] = useState<ComboOffer | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Product Search state inside modal
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [, setSearchingProducts] = useState(false);
  return {
    combos, setCombos, loading, setLoading, searchQuery, setSearchQuery, activeFilter, setActiveFilter, viewLayout,
    setViewLayout, showFormModal, setShowFormModal, editingCombo, setEditingCombo, formData, setFormData, selectedItems,
    setSelectedItems, saving, setSaving, statusMessage, setStatusMessage, copiedBarcode, setCopiedBarcode,
    deleteConfirmOpen, setDeleteConfirmOpen, comboToDelete, setComboToDelete, deleteSaving, setDeleteSaving,
    productSearch, setProductSearch, productResults, setProductResults, setSearchingProducts,
  };
}

export type ComboManagerState = ReturnType<typeof useComboManagerState>;
