import type { Db } from '../types.js';
export const accountIssues = (db: Db) => db.prepare(`SELECT 'parties' entity,p.party_id entity_id,p.sync_status,p.row_version,p.updated_at,
  m.value reason,COALESCE(b.value,'') base FROM parties p
  LEFT JOIN sync_meta m ON m.key='account_conflict:'||p.tenant_id||':parties:'||p.party_id
  LEFT JOIN sync_meta b ON b.key='account_base:'||p.tenant_id||':parties:'||p.party_id
  WHERE p.tenant_id=? AND p.sync_status IN ('PENDING','FAILED')
  UNION ALL SELECT 'party_ledger',l.ledger_id,l.sync_status,l.row_version,l.updated_at,m.value,COALESCE(b.value,'') FROM party_ledger l
  LEFT JOIN sync_meta m ON m.key='account_conflict:'||l.tenant_id||':party_ledger:'||l.ledger_id
  LEFT JOIN sync_meta b ON b.key='account_base:'||l.tenant_id||':party_ledger:'||l.ledger_id
  WHERE l.tenant_id=? AND l.sync_status IN ('PENDING','FAILED') LIMIT 100`);
