import { useState } from 'react';
import type { Quotation, QuotationItem } from '../quotationTypes';

/**
 * State of the quotations screen: the quotation list and filters, the selected quotation and its items, shop and bank
 * settings loaded for the preview, GST toggles, the status toast and the confirmation dialog.
 */
export function useQuotationState() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CONVERTED'>('ALL');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  // Shop & Bank settings
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  const [shopState, setShopState] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [upiId, setUpiId] = useState('');
  const [quotationGstEnabledSetting, setQuotationGstEnabledSetting] = useState(true);

  // Active view GST toggle for preview
  const [previewGstEnabled, setPreviewGstEnabled] = useState(true);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'blue' | 'red' | 'emerald';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'blue',
    onConfirm: () => {},
  });

  return {
    quotations, setQuotations, loading, setLoading, search, setSearch, statusFilter, setStatusFilter,
    selectedQuotation, setSelectedQuotation, quotationItems, setQuotationItems, showDetail, setShowDetail,
    shopAddress, setShopAddress, shopPhone, setShopPhone, shopGstin, setShopGstin, shopState, setShopState,
    shopEmail, setShopEmail, bankName, setBankName, bankAccount, setBankAccount, bankIfsc, setBankIfsc,
    bankBranch, setBankBranch, upiId, setUpiId, quotationGstEnabledSetting, setQuotationGstEnabledSetting,
    previewGstEnabled, setPreviewGstEnabled, statusMessage, setStatusMessage, confirmDialog, setConfirmDialog,
  };
}

export type QuotationState = ReturnType<typeof useQuotationState>;
