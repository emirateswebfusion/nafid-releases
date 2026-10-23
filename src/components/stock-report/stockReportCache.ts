import { type Product, type StockGradeRow } from './stockReportTypes';

export const CACHE_TTL = 5 * 60 * 1000;
export const reportCache = new Map<string, { products: Product[]; grades: StockGradeRow[]; timestamp: number }>();
