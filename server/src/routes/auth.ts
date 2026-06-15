import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pg';
import { sendPasswordResetEmail } from '../services/emailService';

const router = Router();

// ── POST /auth/register ───────────────────────────────────────────────────────
// Registers a new Tenant (shop) and its first OWNER user.
router.post('/register', async (req: Request, res: Response) => {
  const { shop_name, domain_type, owner_email, owner_password, owner_name } = req.body;

  if (!shop_name || !owner_email || !owner_password) {
    return res.status(400).json({ error: 'shop_name, owner_email, and owner_password are required' });
  }

  try {
    // Check if email already exists
    const existing = await query('SELECT user_id FROM users WHERE email = $1', [owner_email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const tenant_id = uuidv4();
    const user_id = uuidv4();
    const passwordHash = await bcrypt.hash(owner_password, 12);

    // Create tenant
    await query(
      `INSERT INTO tenants (tenant_id, name, domain_type) VALUES ($1, $2, $3)`,
      [tenant_id, shop_name, domain_type || 'GENERAL']
    );

    // Create owner user (stored in a 'users' table — see migration notes)
    await query(
      `INSERT INTO users (user_id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'OWNER')`,
      [user_id, tenant_id, owner_name || owner_email, owner_email, passwordHash]
    );

    const token = jwt.sign(
      { tenant_id, user_id, role: 'OWNER' },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as any
    );

    return res.status(201).json({ token, tenant_id, user_id, role: 'OWNER' });
  } catch (err: any) {
    console.error('[Auth] Register error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const users = await query<any>(
      `SELECT user_id, tenant_id, name, role, password_hash FROM users WHERE email = $1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Fetch the shop name and domain for display
    const tenants = await query<any>(`SELECT name, domain_type FROM tenants WHERE tenant_id = $1`, [user.tenant_id]);
    const shopName = tenants.length > 0 ? tenants[0].name : user.name;
    const domainType = tenants.length > 0 ? tenants[0].domain_type : 'GENERAL';

    const token = jwt.sign(
      { tenant_id: user.tenant_id, user_id: user.user_id, role: user.role, domain_type: domainType },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as any
    );

    return res.json({
      token,
      tenant_id: user.tenant_id,
      user_id: user.user_id,
      role: user.role,
      shop_name: shopName,
      domain_type: domainType
    });
  } catch (err: any) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/staff ─────────────────────────────────────────────────────────
// Owner creates a Cashier (or another staff member) for their shop.
// Requires a valid Bearer token with role=OWNER.
router.post('/staff', async (req: Request, res: Response) => {
  // Manually verify auth since this route is not behind requireAuth middleware
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  let auth: any;
  try {
    auth = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (auth.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only shop owners can create staff accounts' });
  }

  const { name, email, password, role } = req.body;
  const staffRole = role === 'OWNER' ? 'OWNER' : 'CASHIER'; // Default to CASHIER

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user_id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    await query(
      `INSERT INTO users (user_id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user_id, auth.tenant_id, name || email, email, passwordHash, staffRole]
    );

    return res.status(201).json({ user_id, tenant_id: auth.tenant_id, role: staffRole, email });
  } catch (err: any) {
    console.error('[Auth] Staff creation error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /auth/staff ──────────────────────────────────────────────────────────
// List all users in this tenant.
router.get('/staff', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const auth: any = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    const users = await query(
      `SELECT user_id, name, email, role, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC, user_id ASC`,
      [auth.tenant_id]
    );
    return res.json(users);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ── DELETE /auth/staff/:id ───────────────────────────────────────────────────
// Remove a staff member. Only OWNERs can do this.
router.delete('/staff/:id', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const auth: any = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    if (auth.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only shop owners can delete staff accounts' });
    }

    const { id } = req.params;
    if (id === auth.user_id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await query(`DELETE FROM users WHERE user_id = $1 AND tenant_id = $2`, [id, auth.tenant_id]);
    
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Auth] Staff deletion error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/tenant/domain ────────────────────────────────────────────────
// Updates the domain_type for a tenant. Only OWNERs can do this.
router.post('/tenant/domain', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const auth: any = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    if (auth.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only shop owners can change the domain type' });
    }

    const { domain_type } = req.body;
    if (!domain_type) return res.status(400).json({ error: 'domain_type is required' });

    await query(`UPDATE tenants SET domain_type = $1 WHERE tenant_id = $2`, [domain_type, auth.tenant_id]);
    
    return res.json({ success: true, domain_type });
  } catch (err: any) {
    console.error('[Auth] Domain update error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/forgot-password ──────────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const users = await query<any>('SELECT user_id, name FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      // Don't leak user existence, but we can't send an email
      return res.json({ success: true, message: 'If an account exists with this email, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
      [token, expires, email]
    );

    // Link should point to the frontend reset page
    // For custom protocols like vendora://, we don't want a double slash before 'reset-password'
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const separator = baseUrl.endsWith('://') ? '' : '/';
    const resetLink = `${baseUrl}${separator}reset-password?token=${token}`;
    
    await sendPasswordResetEmail(email, resetLink);

    return res.json({ success: true, message: 'If an account exists with this email, a reset link has been sent.' });
  } catch (err: any) {
    console.error('[Auth] Forgot password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/reset-password ───────────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

  try {
    const users = await query<any>(
      'SELECT user_id FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE user_id = $2',
      [passwordHash, users[0].user_id]
    );

    return res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err: any) {
    console.error('[Auth] Reset password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/change-password ──────────────────────────────────────────────
router.post('/change-password', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const auth: any = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    const users = await query<any>('SELECT password_hash FROM users WHERE user_id = $1', [auth.user_id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(oldPassword, users[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect current password' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newHash, auth.user_id]);

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    console.error('[Auth] Change password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
