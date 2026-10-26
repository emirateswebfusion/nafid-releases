import type React from 'react';
import { Receipt, Package, Users, Handshake } from 'lucide-react';
export type { DeletedInvoice, DeletedProduct, DeletedCustomer, DeletedParty } from '../../data/recycleBin';

/** Recycle bin screen: categories, deleted row shapes, toast / confirmation state, category config and date helpers. */

export type RecycleBinCategory = 'SALES_BILLS' | 'PRODUCTS' | 'CUSTOMERS' | 'PARTIES';

export interface RecycleBinProps {
  onClose: () => void;
  initialCategory?: RecycleBinCategory;
  onNavigateToSalesHistory?: () => void;
}







export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

export interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

/** A deleted invoice's line item row as the invoice-items IPC returns it. */
export type InvoiceItemRow = Awaited<ReturnType<typeof import('../../data/invoices').invoicesApi.getInvoiceItems>>[number] & { rate?: number };

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'unknown';
  try {
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMinutes < 5) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  } catch {
    return 'unknown';
  }
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export const CATEGORIES: { id: RecycleBinCategory; label: string; Icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: 'SALES_BILLS', label: 'Sales Bills', Icon: Receipt, desc: 'Invoices, Estimates & Bills of Supply' },
  { id: 'PRODUCTS', label: 'Products & Stock', Icon: Package, desc: 'Inventory catalog items' },
  { id: 'CUSTOMERS', label: 'Customers', Icon: Users, desc: 'Customer directories & loyalty records' },
  { id: 'PARTIES', label: 'Suppliers & Ledger', Icon: Handshake, desc: 'Credit accounts & vendor parties' },
];
