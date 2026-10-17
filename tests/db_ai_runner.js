/**
 * Direct Live DB & Offline AI Assistant Engine Executor.
 * Takes the queries, runs them through the REAL Nafid processOfflineAiQuery,
 * and prints the actual terminal output produced by the system.
 */

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
  }
};

global.window = { electronAPI };

// Load the actual bundled Offline AI service
const { processOfflineAiQuery, OfflineAiIntentParser } = require('./offlineAiBundle.cjs');

// Questions from user list
const queries = [
  "What are today's total sales?",
  "What are the total sales for this month?",
  "How much sales did we make yesterday?",
  "What are the total sales for this year?",
  "Which day had the highest sales this month?",
  "How many bills were generated today?",
  "What is the average daily sales for this month?",
  "Show today's cash sales and credit sales separately.",
  "Compare today's sales with yesterday's sales.",
  "Compare this month's sales with last month's sales.",
  "Show sales for the last 7 days.",
  "Show sales for the last 30 days.",
  "Show this year's sales so far.",
  "Show financial-year sales.",
  "Which day had the lowest sales this month?",
  "How many invoices were created today?",
  "What is the average ticket value today?",
  "What is the average number of bills per day this month?",
  "How many unique customers purchased today?",
  "What was the highest-value invoice this month?",
  "Show today's cash sales.",
  "How much was paid through UPI this month?",
  "Show invoices paid using multiple payment methods today.",
  "How much money is still outstanding from credit invoices?",
  "What are our gross sales today?",
  "What are our net sales today?",
  "How much discount was given this month?",
  "How much sales return was recorded this month?",
  "How much tax was collected on sales this month?",
  "Show sales by invoice type this month.",
  "How many invoices were cancelled this month?",
  "Show sales excluding cancelled invoices.",
  "Check whether converted bills are counted twice.",
  "Which products sold the most this month?",
  "Which product generated the highest sales revenue this month?",
  "Which customers purchased the most this month?",
  "Show sales by biller today.",
  "Compare this month's sales with last month.",
  "Show the daily sales trend for this month.",
  "Show the top 5 best-selling products today.",
  "Show the top 10 best-selling products this month.",
  "Which customer spent the most money this month?",
  "Show today's sales breakdown by cash, card, UPI, and other payment methods.",
  "How much credit sales were recorded today?",
  "Show all sales returns recorded today.",
  "Show all invoices with discounts greater than ₹500.",
  "Compare gross sales and net sales this month.",
  "Show sales by biller for this month.",
  "Which biller generated the highest sales today?",
  "Show all invoices generated for a specific customer this month.",
  "Show all cancelled invoices today.",
  "Show sales excluding draft, hold, and cancelled invoices.",
  "Are any invoices being counted more than once in the sales report?",
  "Show the number of unique invoices and total invoice value for each payment method.",
  "Identify invoices where payment allocations do not match the invoice total.",
  "Can you answer today's sales question without an internet connection?",
  "Can you distinguish between zero sales and a database query error?",
  "If the same question is asked twice without any data changes, will the result remain the same?",
  "Who are the top credit customers?",
  "Who is the top credit customer?"
];

async function run() {
  console.log('======================================================================');
  console.log('🤖 NAFID POS OFFLINE AI ASSISTANT — LIVE SYSTEM OUTPUT TEST');
  console.log('======================================================================\n');

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`----------------------------------------------------------------------`);
    console.log(`[Q ${i + 1}] User Question: "${q}"`);
    console.log(`----------------------------------------------------------------------`);
    try {
      const response = await processOfflineAiQuery(q, tenantId, []);
      console.log(`👉 Intent Detected: [${response.intent || 'RESOLVED'}]`);
      console.log(`\n💬 System Actual Response:\n`);
      console.log(response.content.trim());
      console.log('\n');
    } catch (err) {
      console.error(`❌ System Error executing query:`, err.message);
    }
  }

  console.log('======================================================================');
  console.log('🏁 ALL QUERIES PROCESSED DIRECTLY BY NAFID POS OFFLINE AI ENGINE');
  console.log('======================================================================');
}

run();
