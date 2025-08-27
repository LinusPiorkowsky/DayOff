// server.js - Main Express Server for Vacay Hub
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set!');
  console.log('Available env vars:', Object.keys(process.env));
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
// MOVED express.static AFTER our routes to prevent conflicts!

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Initialize Database Tables
async function initDB() {
  try {
    // Create companies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        access_code VARCHAR(50) UNIQUE NOT NULL,
        plan VARCHAR(50) DEFAULT 'free',
        work_days INTEGER DEFAULT 5,
        vacation_days INTEGER DEFAULT 30,
        exclude_weekends BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Auto-migration: Add exclude_weekends column if it doesn't exist
    await pool.query(`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS exclude_weekends BOOLEAN DEFAULT true
    `).catch(() => {
      // Column already exists, ignore error
    });

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
        company_id INTEGER REFERENCES companies(id),
        vacation_days_total INTEGER DEFAULT 30,
        vacation_days_used INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create vacation_requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vacation_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days_count INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
        note TEXT,
        manager_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        type VARCHAR(50),
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Auth Middleware
function authMiddleware(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.companyId = decoded.companyId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Role Middleware
function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Helper function to calculate working days (excluding weekends if configured)
function calculateWorkingDays(startDate, endDate, excludeWeekends = true) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (!excludeWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

// ======================== AUTH ROUTES ========================

// Register new company admin
app.post('/api/auth/register-admin', async (req, res) => {
  const { name, email, password, companyName } = req.body;

  try {
    // Generate unique access code
    const accessCode = 'VC-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    // Create company
    const companyResult = await pool.query(
      'INSERT INTO companies (name, access_code) VALUES ($1, $2) RETURNING *',
      [companyName, accessCode]
    );
    const company = companyResult.rows[0];

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const userResult = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, company_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, company_id',
      [name, email, passwordHash, 'admin', company.id]
    );
    const user = userResult.rows[0];

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user,
      company: {
        name: company.name,
        accessCode: company.access_code
      }
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Registration failed' });
  }
});

// Register with access code
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, accessCode, role } = req.body;

  try {
    // Find company by access code
    const companyResult = await pool.query(
      'SELECT * FROM companies WHERE access_code = $1',
      [accessCode]
    );
    
    if (companyResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid access code' });
    }
    
    const company = companyResult.rows[0];

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, company_id, vacation_days_total) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, company_id',
      [name, email, passwordHash, role || 'employee', company.id, company.vacation_days]
    );
    const user = userResult.rows[0];

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND active = true',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
        vacationDaysTotal: user.vacation_days_total,
        vacationDaysUsed: user.vacation_days_used
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ======================== VACATION REQUESTS ========================

// Get all vacation requests for company (all employees can see all requests in calendar)
app.get('/api/requests', authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT 
        vr.*,
        u.name as user_name,
        u.email as user_email,
        m.name as manager_name
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      LEFT JOIN users m ON vr.manager_id = m.id
      WHERE u.company_id = $1
    `;
    
    const params = [req.companyId];
    
    // Everyone can see all requests for calendar view
    // But in the requests list, employees only see their own
    
    query += ' ORDER BY vr.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Create vacation request
app.post('/api/requests', authMiddleware, async (req, res) => {
  const { startDate, endDate, note } = req.body;

  try {
    // Admins don't have vacation days
    if (req.userRole === 'admin') {
      return res.status(400).json({ 
        error: 'Administratoren können keinen Urlaub beantragen.' 
      });
    }

    // Get company settings to check if weekends should be excluded
    const companyResult = await pool.query(
      'SELECT exclude_weekends FROM companies WHERE id = $1',
      [req.companyId]
    );
    
    const excludeWeekends = companyResult.rows[0]?.exclude_weekends ?? true;
    
    // Calculate days (excluding weekends if configured)
    const daysCount = calculateWorkingDays(startDate, endDate, excludeWeekends);

    // Check available vacation days
    const userResult = await pool.query(
      'SELECT vacation_days_total, vacation_days_used FROM users WHERE id = $1',
      [req.userId]
    );
    
    const user = userResult.rows[0];
    const availableDays = user.vacation_days_total - user.vacation_days_used;
    
    if (daysCount > availableDays) {
      return res.status(400).json({ 
        error: `Nicht genügend Urlaubstage. Verfügbar: ${availableDays}, Angefordert: ${daysCount} ${excludeWeekends ? '(ohne Wochenenden)' : ''}` 
      });
    }

    const result = await pool.query(
      'INSERT INTO vacation_requests (user_id, start_date, end_date, days_count, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, startDate, endDate, daysCount, note]
    );

    // Create notification for managers
    await pool.query(
      `INSERT INTO notifications (user_id, message, type)
       SELECT id, $1, 'new_request' FROM users 
       WHERE company_id = $2 AND role IN ('manager', 'admin')`,
      [`Neuer Urlaubsantrag eingegangen`, req.companyId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Approve/Deny request
app.put('/api/requests/:id/status', authMiddleware, requireRole(['manager', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // Get request details
    const requestResult = await pool.query(
      'SELECT * FROM vacation_requests WHERE id = $1',
      [id]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    const request = requestResult.rows[0];

    // Update request
    await pool.query(
      'UPDATE vacation_requests SET status = $1, manager_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [status, req.userId, id]
    );

    // If approved, update user's vacation days
    if (status === 'approved') {
      await pool.query(
        'UPDATE users SET vacation_days_used = vacation_days_used + $1 WHERE id = $2',
        [request.days_count, request.user_id]
      );
    }

    // Create notification for employee
    await pool.query(
      'INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)',
      [request.user_id, `Ihr Urlaubsantrag wurde ${status === 'approved' ? 'genehmigt' : 'abgelehnt'}`, 'request_update']
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// ======================== USER MANAGEMENT ========================

// Get all users in company
app.get('/api/users', authMiddleware, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, vacation_days_total, vacation_days_used, active FROM users WHERE company_id = $1',
      [req.companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user vacation days (Manager/Admin only, but not for admin users)
app.put('/api/users/:id/vacation-days', authMiddleware, requireRole(['manager', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { vacationDaysTotal } = req.body;

  try {
    // Check if target user is admin
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1 AND company_id = $2',
      [id, req.companyId]
    );
    
    if (userResult.rows.length > 0 && userResult.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Administratoren haben keine Urlaubstage' });
    }
    
    await pool.query(
      'UPDATE users SET vacation_days_total = $1 WHERE id = $2 AND company_id = $3 AND role != $4',
      [vacationDaysTotal, id, req.companyId, 'admin']
    );

    // Notify user
    await pool.query(
      'INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)',
      [id, `Ihre Urlaubstage wurden auf ${vacationDaysTotal} angepasst`, 'vacation_update']
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update vacation days' });
  }
});

// Update user role (Admin only)
app.put('/api/users/:id/role', authMiddleware, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  try {
    await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3',
      [role, id, req.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Toggle user active status
app.put('/api/users/:id/toggle-active', authMiddleware, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE users SET active = NOT active WHERE id = $1 AND company_id = $2',
      [id, req.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

// ======================== COMPANY SETTINGS ========================

// Get company info
app.get('/api/company', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM companies WHERE id = $1',
      [req.companyId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch company info' });
  }
});

// Update company settings
app.put('/api/company', authMiddleware, requireRole(['admin']), async (req, res) => {
  const { name, workDays, vacationDays, plan, excludeWeekends } = req.body;

  try {
    await pool.query(
      'UPDATE companies SET name = $1, work_days = $2, vacation_days = $3, plan = $4, exclude_weekends = $5 WHERE id = $6',
      [name, workDays, vacationDays, plan, excludeWeekends ?? true, req.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// ======================== NOTIFICATIONS ========================

// Get user notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND read = false ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notifications as read
app.put('/api/notifications/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = true WHERE user_id = $1',
      [req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// ======================== STATISTICS ========================

// Get dashboard statistics
app.get('/api/stats', authMiddleware, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    // Total employees
    const employeesResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE company_id = $1 AND active = true',
      [req.companyId]
    );

    // Pending requests
    const pendingResult = await pool.query(
      `SELECT COUNT(*) as count FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       WHERE u.company_id = $1 AND vr.status = 'pending'`,
      [req.companyId]
    );

    // Approved requests this month
    const approvedResult = await pool.query(
      `SELECT COUNT(*) as count FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       WHERE u.company_id = $1 AND vr.status = 'approved'
       AND DATE_PART('month', vr.created_at) = DATE_PART('month', CURRENT_DATE)`,
      [req.companyId]
    );

    res.json({
      totalEmployees: employeesResult.rows[0].count,
      pendingRequests: pendingResult.rows[0].count,
      approvedThisMonth: approvedResult.rows[0].count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ======================== FRONTEND ROUTES ========================

// MUST BE BEFORE express.static!
// FORCE serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Direct app routes
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// NOW add static files AFTER our custom routes
app.use(express.static('public'));

// Catch-all route for everything else (must be last!)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
