import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db/pg';
import { runMigrations } from './db/migrate';
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import syncRouter from './routes/sync';
import notificationsRouter from './routes/notifications';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'app://'], // Allow Vite dev + Electron renderer
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // 10MB for large sync batches

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Vendora Cloud API', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/notifications', notificationsRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  // Verify DB connection and run migrations on startup
  try {
    await pool.query('SELECT 1');
    console.log('[DB] PostgreSQL connected successfully');
    
    // Run automated migrations
    await runMigrations();
    
  } catch (err: any) {
    console.error('[DB] Failed to initialize database:', err.message);
    console.warn('[DB] Server starting without fully initialized DB — some routes will fail.');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Vendora Cloud API running on http://localhost:${PORT}`);
    console.log(`   GET  /health`);
    console.log(`   POST /auth/register`);
    console.log(`   POST /auth/login`);
    console.log(`   GET  /api/products`);
    console.log(`   POST /api/sync/invoices`);
    console.log(`   POST /api/sync/products`);
    console.log(`   GET  /api/notifications\n`);
  });
}

start();
