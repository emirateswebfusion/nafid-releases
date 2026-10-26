import { useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Modal } from '../ui/Modal';
import { useDataUploadState } from './hooks/useDataUploadState';
import { useDataUploadEffects } from './hooks/useDataUploadEffects';
import { useDataUploadFileActions } from './hooks/useDataUploadFileActions';
import { useDataUploadDemoActions } from './hooks/useDataUploadDemoActions';
import { useDataUploadImportActions } from './hooks/useDataUploadImportActions';
import { DataUploadHeader } from './views/DataUploadHeader';
import { DataUploadMessageBanner } from './views/DataUploadMessageBanner';
import { DataUploadColumnGuide } from './views/DataUploadColumnGuide';
import { DataUploadStepsGrid } from './views/DataUploadStepsGrid';
import { DataUploadPreview } from './views/DataUploadPreview';
import { DataUploadFooter } from './views/DataUploadFooter';
import { CUSTOMER_COLUMN_SPECS, PRODUCT_COLUMN_SPECS, STAFF_COLUMN_SPECS, SUPPLIER_COLUMN_SPECS } from './dataUploadTypes';
import type { ColumnSpec, DataUploadModalProps, UploadEntityType } from './dataUploadTypes';

export function DataUploadModal({ 
  isOpen, 
  onClose, 
  defaultEntity = 'products',
  allowedEntities = ['products', 'suppliers', 'customers', 'staff'],
  hideEntityTabs = false,
  onImportSuccess 
}: DataUploadModalProps) {
  const { tenantId, userId, userName } = useAuthStore();
  const [entityType, setEntityType] = useState<UploadEntityType>(defaultEntity);
  const du = useDataUploadState();
  const {
    parsedRows, fileName, dragActive, importing, message, setMessage, showOrderGuide, setShowOrderGuide,
    availableTiers, setParsedRows, setFileName, setDragActive,
  } = du;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useDataUploadEffects({ du, isOpen, defaultEntity, tenantId, setEntityType });

  const { handleEntityChange, handleFileUpload } = useDataUploadFileActions({ du, entityType, setEntityType });
  const { downloadDemoFile } = useDataUploadDemoActions({ du, entityType });
  const { handleImport } = useDataUploadImportActions({
    du, entityType, tenantId, userId, userName, onImportSuccess, onClose,
  });

  if (!isOpen) return null;

  const getSpecs = (): ColumnSpec[] => {
    switch (entityType) {
      case 'products': {
        const specs = [...PRODUCT_COLUMN_SPECS];
        if (availableTiers.length > 0) {
          availableTiers.forEach(t => {
            specs.push({ name: `${t.name} (Tier Price)`, required: false, example: '400' });
          });
        }
        return specs;
      }
      case 'suppliers': return SUPPLIER_COLUMN_SPECS;
      case 'customers': return CUSTOMER_COLUMN_SPECS;
      case 'staff': return STAFF_COLUMN_SPECS;
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;
  const columnSpecs = getSpecs();
  const showTabs = !hideEntityTabs && allowedEntities.length > 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" title="DATA IMPORT CENTER">
      <div className="space-y-5 p-1 text-slate-900 dark:text-slate-100 font-sans">

        {/* ── Top Bar Header & Entity Switcher ── */}
        <DataUploadHeader
          allowedEntities={allowedEntities}
          entityType={entityType}
          handleEntityChange={handleEntityChange}
          showTabs={showTabs}
        />

        {/* ── Status Message Banner ── */}
        {message && (
          <DataUploadMessageBanner message={message} onDismiss={() => setMessage(null)} />
        )}

        {/* ── STEP 1: EXPECTED COLUMN ORDER & FORMAT GUIDE ── */}
        <DataUploadColumnGuide
          columnSpecs={columnSpecs}
          entityType={entityType}
          onToggleGuide={() => setShowOrderGuide(!showOrderGuide)}
          showOrderGuide={showOrderGuide}
        />

        {/* ── EQUAL 50/50 GRID FOR STEP 2 (DEMO DOWNLOAD) & STEP 3 (UPLOAD FILE) ── */}
        <DataUploadStepsGrid
          dragActive={dragActive}
          entityType={entityType}
          fileName={fileName}
          fileInputRef={fileInputRef}
          handleFileUpload={handleFileUpload}
          onDownloadDemo={downloadDemoFile}
          setDragActive={setDragActive}
        />

        {/* ── STEP 4: PREVIEW TABLE & LIVE VALIDATION ── */}
        {parsedRows.length > 0 && (
          <DataUploadPreview
            entityType={entityType}
            invalidCount={invalidCount}
            onClear={() => { setParsedRows([]); setFileName(''); setMessage(null); }}
            parsedRows={parsedRows}
            validCount={validCount}
          />
        )}

        {/* ── Footer Actions ── */}
        <DataUploadFooter
          importing={importing}
          onCancel={onClose}
          onImport={handleImport}
          validCount={validCount}
        />

      </div>
    </Modal>
  );
}
