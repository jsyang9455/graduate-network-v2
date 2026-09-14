const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { signUserToken, publicUser } = require('../lib/jwt');
const { canonicalRole } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { writeAudit, requestIp } = require('../modules/audit');
const rbac = require('../modules/rbac');

async function resolveSchool({ school_id, school_name }) {
  if (school_id) {
    const found = await query(
      `SELECT id, name FROM schools WHERE id = $1 AND status = 'active'`,
      [school_id]
    );
    return found.rows[0] || null;
  }
  if (school_name && String(school_name).trim()) {
    const found = await query(
      `SELECT id, name FROM schools WHERE name = $1 AND status = 'active'`,
      [String(school_name).trim()]
    );
    return found.rows[0] || null;
  }
  return null;
}

async function attachPrimaryRole(userId, userType, schoolId) {
  const roleCode = canonicalRole({ user_type: userType });
  try {
    const role = await query('SELECT id FROM roles WHERE code = $1', [roleCode]);
    if (role.rows.length === 0) return;
    const scopedSchool = roleCode === 'system_admin' ? null : schoolId || null;
    await query(
      `INSERT INTO user_roles (user_id, role_id, school_id)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM user_roles
         WHERE user_id = $1 AND role_id = $2
           AND school_id IS NOT DISTINCT FROM $3
       )`,
      [userId, role.rows[0].id, scopedSchool]
    );
  } catch (err) {
    if (err.code !== '42P01') {
      console.warn('attachPrimaryRole:', err.message);
    }
  }
}

function tokenUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    user_type: row.user_type,
    school_id: row.school_id ?? null,
    role: canonicalRole(row),
  };
}

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 }),
  body('user_type').isIn(['student', 'graduate', 'teacher', 'company', 'admin'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'VALIDATION', code: 'VALIDATION' });
    }

    const {
      email, password, name, user_type, phone, school_name, school_id,
      major, desired_job, graduation_year, department_name
    } = req.body;

    const needsSchool = ['student', 'graduate', 'teacher'].includes(user_type);
    let school = null;
    if (needsSchool || school_id || school_name) {
      school = await resolveSchool({ school_id, school_name });
      if (needsSchool && !school) {
        return sendError(res, 400, 'VALIDATION', '소속 학교를 선택해주세요');
      }
    }

    const existingUser = await query(
      'SELECT id, is_active FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const found = existingUser.rows[0];
      if (found.is_active) {
        return res.status(400).json({ error: 'Email already registered', code: 'CONFLICT' });
      }
      const password_hash = await bcrypt.hash(password, 10);

      const reColCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'users' AND column_name IN 
           ('phone','school_name','school_id','major','desired_job','graduation_year','department_name','withdraw_reason','withdrawn_at')`
      );
      const reExistingCols = reColCheck.rows.map(r => r.column_name);

      const reOptional = {
        phone,
        school_name: school?.name || school_name,
        school_id: school?.id || null,
        major: major || null,
        desired_job: desired_job || null,
        graduation_year: graduation_year || null,
        department_name: department_name || null
      };
      let setClauses = ['password_hash = $1', 'name = $2', 'user_type = $3', 'is_active = true', 'updated_at = CURRENT_TIMESTAMP'];
      let updateVals = [password_hash, name, user_type];
      let pIdx = 3;

      for (const [col, val] of Object.entries(reOptional)) {
        if (reExistingCols.includes(col)) {
          pIdx++;
          setClauses.push(`${col} = $${pIdx}`);
          updateVals.push(val);
        }
      }
      if (reExistingCols.includes('withdraw_reason')) setClauses.push('withdraw_reason = NULL');
      if (reExistingCols.includes('withdrawn_at')) setClauses.push('withdrawn_at = NULL');

      pIdx++;
      updateVals.push(found.id);

      const reResult = await query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${pIdx} RETURNING *`,
        updateVals
      );
      const user = reResult.rows[0];
      await attachPrimaryRole(user.id, user.user_type, user.school_id);
      const token = signUserToken(tokenUser(user));
      return res.status(201).json({
        message: 'User registered successfully',
        user: publicUser(user),
        token
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN 
         ('phone','school_name','school_id','major','desired_job','graduation_year','department_name')`
    );
    const existingCols = colCheck.rows.map(r => r.column_name);

    const optionalFields = {
      phone,
      school_name: school?.name || school_name,
      school_id: school?.id || null,
      major: major || null,
      desired_job: desired_job || null,
      graduation_year: graduation_year || null,
      department_name: department_name || null
    };
    const insertCols = ['email', 'password_hash', 'name', 'user_type'];
    const insertVals = [email, password_hash, name, user_type];

    for (const [col, val] of Object.entries(optionalFields)) {
      if (existingCols.includes(col)) {
        insertCols.push(col);
        insertVals.push(val);
      }
    }

    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      insertVals
    );

    const user = result.rows[0];
    await attachPrimaryRole(user.id, user.user_type, user.school_id);
    const token = signUserToken(tokenUser(user));

    res.status(201).json({
      message: 'User registered successfully',
      user: publicUser(user),
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', code: 'INTERNAL' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'VALIDATION', code: 'VALIDATION' });
    }

    const { email, password } = req.body;

    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHENTICATED' });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHENTICATED' });
    }

    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    const token = signUserToken(tokenUser(user));
    const safe = publicUser(user);

    res.json({
      message: 'Login successful',
      user: {
        ...safe,
        is_counselor: user.is_counselor || false
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', code: 'INTERNAL' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM users WHERE id = $1 AND is_active = true`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }

    const user = publicUser(result.rows[0]);
    let permissions = null;
    try {
      permissions = await rbac.permissionsFor({ ...req.user, ...user });
    } catch (err) {
      console.warn('permissions attach skipped:', err.message);
    }

    res.json({ user: { ...user, permissions } });
  } catch (error) {
    console.error('Get user error:', error);
    return sendError(res, 401, 'UNAUTHENTICATED', 'Invalid token');
  }
});

// Change password — JWT required (REQ-IAM / docs/04)
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'VALIDATION', 'Both passwords required');
    }

    if (newPassword.length < 6) {
      return sendError(res, 400, 'VALIDATION', 'New password must be at least 6 characters');
    }

    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isMatch) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Current password is incorrect');
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [password_hash, req.user.id]
    );

    await writeAudit({
      actorId: req.user.id,
      schoolId: req.user.school_id,
      action: 'user.change_password',
      resource: `users:${req.user.id}`,
      ip: requestIp(req),
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Password change failed', code: 'INTERNAL' });
  }
});

module.exports = router;
