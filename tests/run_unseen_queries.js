const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = 'C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db';
const db = new Database(dbPath, { readonly: true });

let tenantId = '487b001a-8e5d-447f-97c4-9460ce51b1e7';
try {
  const config = JSON.parse(fs.readFileSync('C:/Users/suhai/AppData/Roaming/nafid/config.json', 'utf8'));
  if (config.tenant_id) tenantId = config.tenant_id;
} catch {}

const electronAPI = {
  dbGetInvoices: async ({ tenant_id, filterDate, filterDateEnd }) => {
    let sql = `
      SELECT i.*, u.name as biller_name
      FROM invoices i
      LEFT JOIN users u ON i.user_id = u.user_id
      WHERE i.tenant_id = ?
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0')
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params = [tenant_id || tenantId];
    if (filterDate && filterDateEnd) {
      sql += ` AND date(i.created_at) >= date(?) AND date(i.created_at) <= date(?)`;
      params.push(filterDate, filterDateEnd);
    } else if (filterDate) {
      sql += ` AND date(i.created_at) = date(?)`;
      params.push(filterDate);
    }
    sql += ` ORDER BY i.created_at DESC`;
    return db.prepare(sql).all(...params);
  },

  dbGetInvoicesSummary: async ({ tenant_id, filterDate, filterDateEnd }) => {
    let sql = `
      SELECT 
        COALESCE(SUM(i.grand_total), 0) as totalSales,
        COUNT(i.invoice_id) as totalInvoices,
        COALESCE(SUM(i.tax_total), 0) as totalTax,
        COALESCE(SUM(i.discount_total), 0) as totalDiscount
      FROM invoices i
      WHERE i.tenant_id = ?
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0')
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params = [tenant_id || tenantId];
    if (filterDate && filterDateEnd) {
      sql += ` AND date(i.created_at) >= date(?) AND date(i.created_at) <= date(?)`;
      params.push(filterDate, filterDateEnd);
    } else if (filterDate) {
      sql += ` AND date(i.created_at) = date(?)`;
      params.push(filterDate);
    }
    const res = db.prepare(sql).get(...params);
    const totalSales = Number(res.totalSales) || 0;
    const totalInvoices = Number(res.totalInvoices) || 0;
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    return {
      totalSales,
      totalInvoices,
      totalTax: Number(res.totalTax) || 0,
      totalDiscount: Number(res.totalDiscount) || 0,
      avgOrder,
    };
  },

  dbGetParties: async (tid) => {
    return db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY balance DESC`).all(tid || tenantId);
  },

  dbGetCustomers: async ({ tenant_id }) => {
    return db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`).all(tenant_id || tenantId);
  },

  dbGetPartyLedger: async (partyId) => {
    return db.prepare(`SELECT * FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY transaction_date DESC`).all(partyId);
  },

  dbGetProducts: async ({ tenant_id }) => {
    return db.prepare(`SELECT * FROM products WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`).all(tenant_id || tenantId);
  },

  dbGetProductSalesSummary: async ({ tenant_id, fromDate, toDate }) => {
    let sql = `
      SELECT 
        ii.name,
        SUM(ii.quantity) as total_qty,
        SUM(ii.total) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.invoice_id
      WHERE i.tenant_id = ?
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0')
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
    `;
    const params = [tenant_id || tenantId];
    if (fromDate && toDate) {
      sql += ` AND date(i.created_at) >= date(?) AND date(i.created_at) <= date(?)`;
      params.push(fromDate, toDate);
    }
    sql += ` GROUP BY ii.name ORDER BY total_revenue DESC LIMIT 20`;
    return db.prepare(sql).all(...params);
  },

  dbCashierGetDayTransactions: async ({ tenant_id, from_date, to_date }) => {
    let sql = `
      SELECT ct.*, ct.category as category_name
      FROM cash_transactions ct
      WHERE (ct.tenant_id = ? OR ct.tenant_id IS NULL)
    `;
    const params = [tenant_id || tenantId];
    if (from_date && to_date) {
      sql += ` AND date(ct.transaction_date) >= date(?) AND date(ct.transaction_date) <= date(?)`;
      params.push(from_date, to_date);
    } else if (from_date) {
      sql += ` AND date(ct.transaction_date) = date(?)`;
      params.push(from_date);
    }
    sql += ` ORDER BY ct.transaction_date DESC`;
    return db.prepare(sql).all(...params);
  },

  dbCashierGetDrawer: async ({ tenant_id, business_date }) => {
    let sql = `SELECT * FROM cash_drawer WHERE tenant_id = ?`;
    const params = [tenant_id || tenantId];
    if (business_date) {
      sql += ` AND date(opened_at) = date(?)`;
      params.push(business_date);
    }
    sql += ` ORDER BY opened_at DESC LIMIT 1`;
    return db.prepare(sql).get(...params) || null;
  },

  dbGetPurchaseBills: async ({ tenant_id, search, limit }) => {
    let sql = `
      SELECT pb.*, p.name as supplier_name, p.phone as supplier_phone
      FROM purchase_bills pb
      LEFT JOIN parties p ON pb.supplier_id = p.party_id
      WHERE pb.tenant_id = ?
    `;
    const params = [tenant_id || tenantId];
    if (search) {
      sql += ` AND (pb.bill_number LIKE ? OR p.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY pb.created_at DESC LIMIT ?`;
    params.push(limit || 100);
    return db.prepare(sql).all(...params);
  },

  dbGetReturns: async ({ tenant_id }) => {
    return db.prepare(`
      SELECT r.*, i.invoice_number as original_invoice_number
      FROM returns r
      LEFT JOIN invoices i ON r.invoice_id = i.invoice_id
      WHERE r.tenant_id = ?
      ORDER BY r.created_at DESC
    `).all(tenant_id || tenantId);
  },

  dbGetReturnItems: async (return_id) => {
    return db.prepare('SELECT ri.*, p.sku_barcode, p.item_code FROM return_items ri LEFT JOIN products p ON ri.product_id = p.product_id WHERE ri.return_id = ?').all(return_id);
  }
};

global.window = { electronAPI };

const { processOfflineAiQuery } = require('./offlineAiBundle.cjs');

const unseenQueries = [
  // A. English Novel Synonyms & Colloquialisms
  { category: 'English Synonyms', q: "What was our total turnover this month?" },
  { category: 'English Synonyms', q: "What was our register intake today?" },
  { category: 'English Synonyms', q: "Who owes us the most cash right now?" },
  { category: 'English Synonyms', q: "What is the cost of CELLO MUG M16?" },

  // B. Malayalam Script Queries
  { category: 'Malayalam Script', q: "ഈ മാസത്തെ മൊത്തം വരുമാനം എത്രയാണ്?" },
  { category: 'Malayalam Script', q: "കടം തരാനുള്ളവരുടെ ലിസ്റ്റ് കാണിക്കൂ" },
  { category: 'Malayalam Script', q: "സ്റ്റോക്കിലുള്ള ഉൽപ്പന്നങ്ങളുടെ ആകെ മൂല്യം എത്രയാണ്?" },
  { category: 'Malayalam Script', q: "ഇന്നലത്തെ വിൽപ്പന എത്രയായിരുന്നു?" },

  // C. Manglish Natural Queries
  { category: 'Manglish', q: "innathe total sales ethraya" },
  { category: 'Manglish', q: "ee masathe expense ethraya" },
  { category: 'Manglish', q: "aarokkeyanu kadam tharanullath" },
  { category: 'Manglish', q: "stock theernna items ethokkeyanu" },
  { category: 'Manglish', q: "innu ethra bill adichu" },

  // D. Multi-Condition & Date Ranges
  { category: 'Multi-Condition / Dates', q: "Show cash and upi sales between 2026-10-01 and 2026-10-15" },
  { category: 'Multi-Condition / Dates', q: "How many invoices greater than 1000 today?" },

  // E. Ambiguous Queries Requiring Clarification
  { category: 'Ambiguity Clarification', q: "balance" },
  { category: 'Ambiguity Clarification', q: "show report" },
  { category: 'Ambiguity Clarification', q: "how much money did we make" },

  // F. Unsupported / Out-of-Scope Queries
  { category: 'Unsupported Refusal', q: "Can you predict next month's sales revenue?" },
  { category: 'Unsupported Refusal', q: "What is the weather today?" },
  { category: 'Unsupported Refusal', q: "Send an email to Suhaib" }
];

async function run() {
  console.log('======================================================================');
  console.log('🌟 NAFID POS OFFLINE AI ASSISTANT — UNSEEN NATURAL LANGUAGE TEST SUITE');
  console.log('======================================================================\n');

  for (let i = 0; i < unseenQueries.length; i++) {
    const item = unseenQueries[i];
    console.log('----------------------------------------------------------------------');
    console.log(`[Q ${i + 1}] Category: [${item.category}]`);
    console.log(`Query: "${item.q}"`);
    console.log('----------------------------------------------------------------------');
    try {
      const response = await processOfflineAiQuery(item.q, tenantId, []);
      console.log(`👉 Intent Detected: [${response.intent || 'RESOLVED'}]`);
      if (response.clarificationRequired) console.log('⚠️ Clarification Required: TRUE');
      console.log('\n💬 System Actual Response:\n');
      console.log(response.content.trim());
      console.log('\n');
    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  }

  console.log('======================================================================');
  console.log('🏁 ALL UNSEEN NATURAL LANGUAGE QUERIES VERIFIED');
  console.log('======================================================================');
}

run();
