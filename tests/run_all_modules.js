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

const queries = [
  // 1. Sales & Revenue
  "What are today's total sales?",
  "What are the total sales for this month?",
  "How much sales did we make yesterday?",
  "Which day had the highest sales this month?",
  "Show today's cash sales and credit sales separately.",
  "Compare this month's sales with last month's sales.",
  "Show the top 5 best-selling products today.",
  "Which customer spent the most money this month?",
  "Check whether converted bills are counted twice.",
  "Can you answer today's sales question without an internet connection?",

  // 2. Expenses & Cash Payouts
  "What are today's expenses?",
  "How much did we spend on expenses this month?",
  "Show expense breakdown by category for this month.",
  "What was our single largest expense payout?",
  "How much cash was paid out from the register today?",

  // 3. Inventory & Stock
  "Which products are out of stock right now?",
  "Show low stock items.",
  "What is the total value of our current stock at cost and retail?",
  "What is the current stock of Sugar?",
  "Which products have the highest stock quantity?",
  "Which products have not sold in the last 30 days?",

  // 4. Purchases & Supplier Bills
  "What are our total purchases this month?",
  "Show purchases grouped by supplier for this month.",
  "How much money do we owe on unpaid purchase bills?",
  "Show purchase price history for Basmati Rice.",
  "Compare this month's purchases with last month's purchases.",

  // 5. Customer & Supplier Ledger
  "How much money do customers owe us in total?",
  "Who are our top 5 credit customers by outstanding balance?",
  "How much do we owe to all suppliers combined?",
  "What is the balance of Suhaib?",
  "Show recent ledger transactions for EWF.",

  // 6. Cash Register & Drawer
  "What is the current cash drawer balance?",
  "Show all cash-in and cash-out movements today.",
  "Compare expected cash with counted cash at closing.",
  "Show cashier settlements for today.",

  // 7. Bills, Payments & Receivables
  "Show all unpaid invoices this month.",
  "Show all partially paid bills.",
  "Show invoices with split payments today.",

  // 8. Returns, Discounts & Loyalty
  "How many sales returns were processed this month and what was the total refund amount?",
  "Which items were returned the most?",
  "Show breakdown of refunds by payment method.",
  "Show all invoices with discount greater than ₹500.",
  "How many loyalty points were earned and redeemed this month?",

  // 9. Product Pricing & Barcodes
  "What is the retail price, wholesale price, and cost price of Milk?",
  "What is the GST rate and barcode for coconut oil?",

  // 10. Malayalam & Cross-Language
  "ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?",
  "ഈ മാസം ഏറ്റവും കൂടുതൽ വിറ്റുപോയ ഉൽപ്പന്നങ്ങൾ ഏതെല്ലാമാണ്?",
  "സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ",
  "ഇന്നത്തെ ചിലവുകൾ എത്രയാണ്?"
];

async function run() {
  console.log('======================================================================');
  console.log('🤖 NAFID POS OFFLINE AI ASSISTANT — 10-MODULE LIVE DATABASE TEST');
  console.log('======================================================================\n');

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log('----------------------------------------------------------------------');
    console.log(`[Q ${i + 1}] User Question: "${q}"`);
    console.log('----------------------------------------------------------------------');
    try {
      const response = await processOfflineAiQuery(q, tenantId, []);
      console.log(`👉 Intent Detected: [${response.intent || 'RESOLVED'}]`);
      console.log('\n💬 System Actual Response:\n');
      console.log(response.content.trim());
      console.log('\n');
    } catch (err) {
      console.error('❌ System Error executing query:', err.message);
    }
  }

  console.log('======================================================================');
  console.log('🏁 ALL MODULES PROCESSED DIRECTLY BY NAFID POS OFFLINE AI ENGINE');
  console.log('======================================================================');
}

run();
