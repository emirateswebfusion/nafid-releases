import { useState } from 'react';

/**
 * State of the owner dashboard: menu, clock label, today's sales and invoice count, online / sync route, scrap flag,
 * grid mode, customize / restore dialogs and card drag state.
 */
export function useOwnerDashboardState() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [displayTime, setDisplayTime] = useState('...');
    const [totalSales, setTotalSales] = useState(0);
    const [totalSalesBeforeDeductions, setTotalSalesBeforeDeductions] = useState(0);
    const [dashboardSalesMetric, setDashboardSalesMetric] = useState<'GROSS_SALES' | 'NET_REVENUE'>('GROSS_SALES');
    const [invoiceCount, setInvoiceCount] = useState(0);
    const [isOnline, setIsOnline] = useState(true);
    const [activeRoute, setActiveRoute] = useState<'LAN' | 'CLOUD' | 'NONE' | null>(null);
    const [, setSyncMode] = useState<'CLOUD' | 'LAN' | 'HYBRID'>('CLOUD');
    const [enableScrap, setEnableScrap] = useState(false);
    const [gridMode, setGridMode] = useState<'2COL' | '3COL'>('2COL');
    const [showCustomizeModal, setShowCustomizeModal] = useState(false);
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);
    const [draggedDashboardCardId, setDraggedDashboardCardId] = useState<string | null>(null);
    const [dragOverDashboardCardId, setDragOverDashboardCardId] = useState<string | null>(null);

  return {
    menuOpen, setMenuOpen, displayTime, setDisplayTime, totalSales, setTotalSales, totalSalesBeforeDeductions, setTotalSalesBeforeDeductions, dashboardSalesMetric, setDashboardSalesMetric, invoiceCount, setInvoiceCount,
    isOnline, setIsOnline, activeRoute, setActiveRoute, setSyncMode, enableScrap, setEnableScrap, gridMode,
    setGridMode, showCustomizeModal, setShowCustomizeModal, showRestoreDialog, setShowRestoreDialog,
    draggedDashboardCardId, setDraggedDashboardCardId, dragOverDashboardCardId, setDragOverDashboardCardId,
  };
}

export type OwnerDashboardState = ReturnType<typeof useOwnerDashboardState>;
