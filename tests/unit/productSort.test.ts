import { describe, expect, it } from 'vitest';
import { getProductsStatement } from '../../electron/db/statements/products';
import type { Db } from '../../electron/db/statements/types';

describe('product list sort precedence', () => {
  it.each([
    ['created_at', 'p.created_at DESC, p.product_id ASC'],
    ['updated_at', 'p.updated_at DESC, p.product_id ASC'],
    ['stock', 'p.current_stock ASC, p.product_id ASC'],
    [undefined, 'p.name COLLATE NOCASE ASC, p.product_id ASC'],
  ])('keeps %s sorting and pagination parameters', (sortBy, order) => {
    let sql = '';
    const db = { prepare: (query: string) => { sql = query; return {}; } } as unknown as Db;
    const { params } = getProductsStatement(db, {
      tenantId: 'tenant', sortBy, limit: 20, offset: 40,
    });
    expect(sql).toContain(`ORDER BY ${order} LIMIT ? OFFSET ?`);
    expect(params).toEqual(['tenant', 'tenant', 'tenant', 'tenant', 20, 40]);
  });

  it.each(['created_at', 'updated_at'])('keeps %s ahead of search relevance', sortBy => {
    let sql = '';
    const db = { prepare: (query: string) => { sql = query; return {}; } } as unknown as Db;
    getProductsStatement(db, { tenantId: 'tenant', sortBy, search: 'bolt' });
    expect(sql).toContain(`ORDER BY p.${sortBy} DESC, p.product_id ASC`);
    expect(sql).not.toContain('ORDER BY CASE');
  });
});
