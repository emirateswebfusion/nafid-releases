import { useState } from 'react';
import type { ParsedRow } from '../dataUploadTypes';

/** State of the data upload modal: parsed rows, file name, flags, status message, guide toggle and available pricing tiers. */
export function useDataUploadState() {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [, setLoading] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showOrderGuide, setShowOrderGuide] = useState<boolean>(true);
  const [availableTiers, setAvailableTiers] = useState<Array<{ pricing_tier_id?: string; name: string }>>([]);
  const [openingAsOf, setOpeningAsOf] = useState<string>('');
  const [openingPartyType, setOpeningPartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');

  return {
    openingAsOf, setOpeningAsOf, openingPartyType, setOpeningPartyType,
    parsedRows, setParsedRows, fileName, setFileName, setLoading, importing, setImporting, dragActive, setDragActive,
    message, setMessage, showOrderGuide, setShowOrderGuide, availableTiers, setAvailableTiers,
  };
}

export type DataUploadState = ReturnType<typeof useDataUploadState>;
