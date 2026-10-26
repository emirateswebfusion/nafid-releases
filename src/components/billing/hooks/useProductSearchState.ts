import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '../../../data/invoices';
import type { ProductSearchResult, ScrapCategoryResult } from '../productSearch';

/**
 * The billing search box: what is typed, the result lists for each mode (products, past bills, returnable
 * invoices, scrap categories), the highlighted row and the dropdown containers. Results are filled by
 * `useSearchResultsLoader`.
 */
export function useProductSearchState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isProductSearching, setIsProductSearching] = useState(false);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPastBillMode, setIsPastBillMode] = useState(false);
  const [pastBillResults, setPastBillResults] = useState<Invoice[]>([]);
  const [returnSearchResults, setReturnSearchResults] = useState<Invoice[]>([]);
  const [scrapSearchResults, setScrapSearchResults] = useState<ScrapCategoryResult[]>([]);
  const searchResultListRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchResultListRef.current && selectedIndex >= 0) {
      const container = searchResultListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
  }, [selectedIndex]);

  return {
    searchQuery, setSearchQuery, isProductSearching, setIsProductSearching, results, setResults, selectedIndex, setSelectedIndex,
    isPastBillMode, setIsPastBillMode, pastBillResults, setPastBillResults, returnSearchResults, setReturnSearchResults, scrapSearchResults, setScrapSearchResults,
    searchResultListRef, searchContainerRef,
  };
}

export type ProductSearchState = ReturnType<typeof useProductSearchState>;
