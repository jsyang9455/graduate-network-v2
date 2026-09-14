const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, checkRole } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isStaffAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { writeAudit, requestIp } = require('../modules/audit');

function canReadUser(req, target) {
  if (Number(target.id) === Number(req.user.id)) return true;
  if (isSystemAdmin(req.user)) return true;
  if (target.user_type === 'company') return true;
  return assertSameSchool(req, target.school_id);
}

function canManageTarget(req, target) {
  if (isSystemAdmin(req.user)) return true;
  if (!isStaffAdmin(req.user)) return false;
  return assertSameSchool(req, target.school_id);
}

// Stats endpoint (메인 페이지용 통계)
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true) AS total_members,
        COUNT(*) FILTER (WHERE is_active = true AND user_type IN ('student','graduate')) AS total_students,
        COUNT(*) FILTER (WHERE is_active = true AND user_type = 'company') AS total_companies,
        COUNT(*) FILTER (WHERE is_active = true AND user_type = 'teacher') AS total_teachers
      FROM users
    `);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Self-withdraw (자진 회원탈퇴)
router.post('/withdraw', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.user.id;

    let result;
    try {
      result = await query(
        `UPDATE users
         SET is_active = false,
             withdraw_reason = $1,
             withdrawn_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, email, name`,
        [reason || null, userId]
      );
    } catch (colError) {
      console.warn('Withdraw fallback (missing columns):', colError.message);
      result = await query(
        `UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, name`,
        [userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: '회원 탈퇴가 완료되었습니다.', user: result.rows[0] });
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({ error: 'Failed to withdraw' });
  }
});

// Get current user's own profile (must be before /:id)
router.get('/profile', auth, async (req, res) => {
  try {
    const colCheckResult = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN ('major','desired_job','school_name','school_id','graduation_year','department_name')`
    );
    const existingCols = colCheckResult.rows.map(r => r.column_name);
    const sel = (col, alias) => existingCols.includes(col)
      ? `u.${col}${alias ? ` AS ${alias}` : ''}`
      : `null AS ${alias || col}`;

    const result = await query(
      `SELECT u.id, u.email, u.name, u.user_type, u.phone,
              ${sel('school_name')}, ${sel('school_id')}, ${sel('major')}, ${sel('desired_job')},
              u.profile_image, u.created_at,
              ${sel('graduation_year')}, ${sel('department_name')},
              gp.major AS gp_major, gp.current_company, gp.current_position,
              gp.bio, gp.skills, gp.is_mentor,
              cp.company_name, cp.industry, cp.company_size, cp.website, cp.description AS company_description
       FROM users u
       LEFT JOIN graduate_profiles gp ON u.id = gp.user_id
       LEFT JOIN company_profiles cp ON u.id = cp.user_id
       WHERE u.id = $1 AND u.is_active = true`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Must be before GET /:id (REQ-PLT-001 / B-LS)
router.get('/company-profile', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM company_profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Company profile not found' });
    }
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({ error: 'Failed to get company profile' });
  }
});

// Get user by ID (school-scoped; REQ-IAM-009)
router.get('/:id', auth, schoolScope, async (req, res) => {
  try {
    const { id } = req.params;

    const colCheckResult = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN ('major','desired_job','school_name','school_id','graduation_year','department_name')`
    );
    const existingCols = colCheckResult.rows.map(r => r.column_name);
    const sel = (col, alias) => existingCols.includes(col)
      ? `u.${col}${alias ? ` AS ${alias}` : ''}`
      : `null AS ${alias || col}`;

    const result = await query(
      `SELECT u.id, u.email, u.name, u.user_type, u.phone,
              ${sel('school_name')}, ${sel('school_id')}, ${sel('major')}, ${sel('desired_job')},
              u.profile_image, u.created_at,
              ${sel('graduation_year')}, ${sel('department_name')},
              gp.major AS gp_major, gp.current_company, gp.current_position, 
              gp.bio, gp.skills, gp.is_mentor
       FROM users u
       LEFT JOIN graduate_profiles gp ON u.id = gp.user_id
       WHERE u.id = $1 AND u.is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!canReadUser(req, result.rows[0])) {
      return forbidCrossSchool(res);
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, profile_image, school_name, major, desired_job, graduation_year, department_name } = req.body;
    const userId = req.user.id;

    // 실제 존재하는 컬럼만 SET절에 포함
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN 
         ('phone','profile_image','school_name','major','desired_job','graduation_year','department_name')`
    );
    const existingCols = colCheck.rows.map(r => r.column_name);

    const fieldMap = {
      phone:           phone,
      profile_image:   profile_image,
      school_name:     school_name,
      major:           major,
      desired_job:     desired_job,
      graduation_year: graduation_year || null,
      department_name: department_name || null,
    };

    const setClauses = ['name = COALESCE($1, name)', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [name];
    let paramIdx = 1;

    for (const [col, val] of Object.entries(fieldMap)) {
      if (existingCols.includes(col)) {
        paramIdx++;
        setClauses.push(`${col} = COALESCE($${paramIdx}, ${col})`);
        params.push(val);
      }
    }

    paramIdx++;
    params.push(userId);

    const baseReturn = 'id, email, name, user_type, profile_image';
    const extraReturn = Object.keys(fieldMap)
      .filter(c => existingCols.includes(c))
      .join(', ');

    const result = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING ${baseReturn}${extraReturn ? ', ' + extraReturn : ''}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Profile updated for user ${userId}, cols: [${existingCols.join(',')}]`);

    res.json({ 
      message: 'Profile updated successfully',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Update profile error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to update profile', detail: error.message });
  }
});

// Get or create graduate profile
router.get('/graduate-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      'SELECT * FROM graduate_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Graduate profile not found' });
    }

    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Get graduate profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update graduate profile
router.put('/graduate-profile', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      graduation_year,
      major,
      current_company,
      current_position,
      career_start_date,
      bio,
      skills,
      linkedin_url,
      portfolio_url,
      is_mentor,
      mentor_capacity
    } = req.body;

    // Check if profile exists
    const existing = await query(
      'SELECT id FROM graduate_profiles WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existing.rows.length === 0) {
      // Create new profile
      result = await query(
        `INSERT INTO graduate_profiles 
         (user_id, graduation_year, major, current_company, current_position, 
          career_start_date, bio, skills, linkedin_url, portfolio_url, is_mentor, mentor_capacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [userId, graduation_year, major, current_company, current_position,
         career_start_date, bio, skills, linkedin_url, portfolio_url, is_mentor, mentor_capacity]
      );
    } else {
      // Update existing profile
      result = await query(
        `UPDATE graduate_profiles 
         SET graduation_year = COALESCE($1, graduation_year),
             major = COALESCE($2, major),
             current_company = COALESCE($3, current_company),
             current_position = COALESCE($4, current_position),
             career_start_date = COALESCE($5, career_start_date),
             bio = COALESCE($6, bio),
             skills = COALESCE($7, skills),
             linkedin_url = COALESCE($8, linkedin_url),
             portfolio_url = COALESCE($9, portfolio_url),
             is_mentor = COALESCE($10, is_mentor),
             mentor_capacity = COALESCE($11, mentor_capacity),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $12
         RETURNING *`,
        [graduation_year, major, current_company, current_position,
         career_start_date, bio, skills, linkedin_url, portfolio_url, 
         is_mentor, mentor_capacity, userId]
      );
    }

    res.json({ 
      message: 'Graduate profile updated successfully',
      profile: result.rows[0] 
    });
  } catch (error) {
    console.error('Update graduate profile error:', error);
    res.status(500).json({ error: 'Failed to update graduate profile' });
  }
});

// Upsert company profile (REQ-PLT-001 — API source of truth; replaces company_profile_* localStorage)
router.put('/company-profile', auth, checkRole('company', 'admin'), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_name,
      industry,
      company_size,
      website,
      address,
      description,
      logo_url,
      founded_year,
    } = req.body;

    if (!company_name) {
      return res.status(400).json({ error: 'company_name is required' });
    }

    const existing = await query(
      'SELECT id FROM company_profiles WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existing.rows.length === 0) {
      result = await query(
        `INSERT INTO company_profiles
         (user_id, company_name, industry, company_size, website, address, description, logo_url, founded_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          company_name,
          industry || null,
          company_size || null,
          website || null,
          address || null,
          description || null,
          logo_url || null,
          founded_year || null,
        ]
      );
    } else {
      result = await query(
        `UPDATE company_profiles
         SET company_name = COALESCE($1, company_name),
             industry = COALESCE($2, industry),
             company_size = COALESCE($3, company_size),
             website = COALESCE($4, website),
             address = COALESCE($5, address),
             description = COALESCE($6, description),
             logo_url = COALESCE($7, logo_url),
             founded_year = COALESCE($8, founded_year),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $9
         RETURNING *`,
        [
          company_name,
          industry,
          company_size,
          website,
          address,
          description,
          logo_url,
          founded_year,
          userId,
        ]
      );
    }

    res.json({
      message: 'Company profile updated successfully',
      profile: result.rows[0],
    });
  } catch (error) {
    console.error('Update company profile error:', error);
    res.status(500).json({ error: 'Failed to update company profile' });
  }
});

// Search users (school-scoped for non-system admins; REQ-IAM-009)
router.get('/', auth, schoolScope, async (req, res) => {
  try {
    const { 
      search, 
      user_type, 
      graduation_year, 
      major,
      school_name,
      is_mentor,
      is_counselor,
      include_withdrawn,
      exclude_user_id,
      page = 1, 
      limit = 20 
    } = req.query;

    const showWithdrawn = include_withdrawn === 'true';

    // users 테이블에 실제 존재하는 컬럼만 SELECT (AWS DB가 구버전일 수 있음)
    const colCheckResult = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN ('major','desired_job','school_name','school_id','withdraw_reason','withdrawn_at','graduation_year','department_name')`
    );
    const existingCols = colCheckResult.rows.map(r => r.column_name);

    const sel = (col, alias) => existingCols.includes(col)
      ? `u.${col}${alias ? ` AS ${alias}` : ''}`
      : `null AS ${alias || col}`;

    const extraWithdraw = existingCols.includes('withdraw_reason')
      ? ', u.withdraw_reason, u.withdrawn_at'
      : ', null AS withdraw_reason, null AS withdrawn_at';

    let queryText = `
      SELECT u.id, u.email, u.name, u.user_type, u.phone,
             ${sel('school_name')}, ${sel('school_id')}, ${sel('major')}, ${sel('desired_job')},
             ${sel('graduation_year', 'graduation_year')}, ${sel('department_name', 'department_name')},
             u.profile_image, u.created_at, u.is_active${extraWithdraw},
             COALESCE(u.is_counselor, false) AS is_counselor,
             gp.graduation_year AS gp_graduation_year, gp.major AS gp_major, gp.current_company, 
             gp.current_position, gp.is_mentor
      FROM users u
      LEFT JOIN graduate_profiles gp ON u.id = gp.user_id
      WHERE ${showWithdrawn ? 'u.is_active = false' : 'u.is_active = true'}
    `;

    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      queryText += ` AND (u.name ILIKE $${paramCount} OR gp.current_company ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    if (exclude_user_id) {
      paramCount++;
      queryText += ` AND u.id != $${paramCount}`;
      params.push(parseInt(exclude_user_id));
    }
    if (user_type) {
      // 쉼표 구분 지원 (예: student,graduate)
      const typeList = user_type.split(',').map(t => t.trim()).filter(Boolean);
      if (typeList.length === 1) {
        paramCount++;
        queryText += ` AND u.user_type = $${paramCount}`;
        params.push(typeList[0]);
      } else if (typeList.length > 1) {
        paramCount++;
        queryText += ` AND u.user_type = ANY($${paramCount}::text[])`;
        params.push(typeList);
      }
    }
    if (graduation_year) {
      paramCount++;
      queryText += ` AND gp.graduation_year = $${paramCount}`;
      params.push(graduation_year);
    }
    if (major) {
      paramCount++;
      queryText += ` AND gp.major ILIKE $${paramCount}`;
      params.push(`%${major}%`);
    }
    if (school_name) {
      paramCount++;
      queryText += ` AND u.school_name ILIKE $${paramCount}`;
      params.push(`%${school_name}%`);
    }
    if (is_mentor === 'true') {
      queryText += ` AND gp.is_mentor = true`;
    }
    if (is_counselor === 'true') {
      queryText += ` AND COALESCE(u.is_counselor, false) = true`;
    }
    if (!isSystemAdmin(req.user)) {
      if (req.user.school_id) {
        paramCount++;
        queryText += ` AND (u.school_id = $${paramCount} OR u.user_type = 'company')`;
        params.push(req.user.school_id);
      } else {
        queryText += ` AND (u.user_type = 'company' OR u.id = ${parseInt(req.user.id, 10)})`;
      }
    }

    queryText += ` ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await query(queryText, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM users u
      LEFT JOIN graduate_profiles gp ON u.id = gp.user_id
      WHERE ${showWithdrawn ? 'u.is_active = false' : 'u.is_active = true'}
    `;
    const countParams = [];
    let countParamNum = 0;

    if (search) {
      countParamNum++;
      countQuery += ` AND (u.name ILIKE $${countParamNum} OR gp.current_company ILIKE $${countParamNum})`;
      countParams.push(`%${search}%`);
    }
    if (user_type) {
      const typeList = user_type.split(',').map(t => t.trim()).filter(Boolean);
      if (typeList.length === 1) {
        countParamNum++;
        countQuery += ` AND u.user_type = $${countParamNum}`;
        countParams.push(typeList[0]);
      } else if (typeList.length > 1) {
        countParamNum++;
        countQuery += ` AND u.user_type = ANY($${countParamNum}::text[])`;
        countParams.push(typeList);
      }
    }
    if (graduation_year) {
      countParamNum++;
      countQuery += ` AND gp.graduation_year = $${countParamNum}`;
      countParams.push(graduation_year);
    }
    if (major) {
      countParamNum++;
      countQuery += ` AND gp.major ILIKE $${countParamNum}`;
      countParams.push(`%${major}%`);
    }
    if (school_name) {
      countParamNum++;
      countQuery += ` AND u.school_name ILIKE $${countParamNum}`;
      countParams.push(`%${school_name}%`);
    }
    if (!isSystemAdmin(req.user)) {
      if (req.user.school_id) {
        countParamNum++;
        countQuery += ` AND (u.school_id = $${countParamNum} OR u.user_type = 'company')`;
        countParams.push(req.user.school_id);
      } else {
        countQuery += ` AND (u.user_type = 'company' OR u.id = ${parseInt(req.user.id, 10)})`;
      }
    }

    const countResult = await query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Assign role (REQ-IAM-003, IAM-007)
router.post('/:id/roles', auth, authorize('users', 'write'), schoolScope, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { role: roleCode, school_id } = req.body;
    if (!roleCode) {
      return sendError(res, 400, 'VALIDATION', 'role is required');
    }

    const targetRes = await query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (targetRes.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    const target = targetRes.rows[0];
    if (!canManageTarget(req, target)) {
      return forbidCrossSchool(res);
    }

    if (roleCode === 'system_admin' && !isSystemAdmin(req.user)) {
      return sendError(res, 403, 'FORBIDDEN', '시스템 관리자 역할은 시스템 관리자만 지정할 수 있습니다');
    }

    const roleRes = await query('SELECT id, code FROM roles WHERE code = $1', [roleCode]);
    if (roleRes.rows.length === 0) {
      return sendError(res, 400, 'VALIDATION', 'Unknown role');
    }

    const scopedSchool = roleCode === 'system_admin'
      ? null
      : (school_id || target.school_id || req.user.school_id || null);

    const mappedType = roleCode === 'system_admin' ? 'admin' : roleCode;
    await query('UPDATE users SET user_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [mappedType, targetId]);
    if (scopedSchool && roleCode !== 'system_admin') {
      await query('UPDATE users SET school_id = $1 WHERE id = $2', [scopedSchool, targetId]);
    }

    await query(
      `INSERT INTO user_roles (user_id, role_id, school_id, granted_by)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2 AND school_id IS NOT DISTINCT FROM $3
       )`,
      [targetId, roleRes.rows[0].id, scopedSchool, req.user.id]
    );

    await writeAudit({
      actorId: req.user.id,
      schoolId: scopedSchool || req.user.school_id,
      action: 'user.assign_role',
      resource: `users:${targetId}`,
      payload: { role: roleCode, school_id: scopedSchool },
      ip: requestIp(req),
    });

    res.json({ message: 'Role assigned', user_id: targetId, role: roleCode, school_id: scopedSchool });
  } catch (error) {
    console.error('Assign role error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to assign role');
  }
});

// Transfer school (REQ-IAM-005)
router.post('/:id/transfer', auth, authorize('users', 'write'), schoolScope, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { to_school_id, reason } = req.body;
    if (!to_school_id) {
      return sendError(res, 400, 'VALIDATION', 'to_school_id is required');
    }

    const targetRes = await query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (targetRes.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    const target = targetRes.rows[0];
    if (!canManageTarget(req, target) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }

    const schoolRes = await query(`SELECT id, name FROM schools WHERE id = $1 AND status = 'active'`, [to_school_id]);
    if (schoolRes.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', '학교를 찾을 수 없습니다');
    }

    await query(
      `INSERT INTO school_transfers (user_id, from_school_id, to_school_id, reason, actor_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [targetId, target.school_id, to_school_id, reason || null, req.user.id]
    );
    await query(
      `UPDATE users SET school_id = $1, school_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [to_school_id, schoolRes.rows[0].name, targetId]
    );

    await writeAudit({
      actorId: req.user.id,
      schoolId: to_school_id,
      action: 'user.transfer',
      resource: `users:${targetId}`,
      payload: { from: target.school_id, to: to_school_id, reason },
      ip: requestIp(req),
    });

    res.json({
      message: '전출 처리되었습니다',
      user_id: targetId,
      from_school_id: target.school_id,
      to_school_id,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to transfer user');
  }
});

// Update user (admin / school_admin of same school)
router.put('/:id', auth, authorize('users', 'write'), schoolScope, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, user_type, phone, school_name, major, desired_job, graduation_year, department_name, is_counselor } = req.body;

    const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    if (!canManageTarget(req, existingUser.rows[0])) {
      return forbidCrossSchool(res);
    }

    // 실제 존재하는 컬럼만 SET (information_schema 확인)
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN 
         ('phone','school_name','school_id','major','desired_job','graduation_year','department_name','is_counselor')`
    );
    const existingCols = colCheck.rows.map(r => r.column_name);

    const alwaysFields = { name, email, user_type };
    const optionalFields = { phone, school_name, major, desired_job, graduation_year: graduation_year || null, department_name };

    const setClauses = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];
    let paramIdx = 0;

    for (const [col, val] of Object.entries(alwaysFields)) {
      paramIdx++;
      setClauses.push(`${col} = COALESCE($${paramIdx}, ${col})`);
      params.push(val);
    }
    for (const [col, val] of Object.entries(optionalFields)) {
      if (existingCols.includes(col)) {
        paramIdx++;
        setClauses.push(`${col} = COALESCE($${paramIdx}, ${col})`);
        params.push(val);
      }
    }
    // is_counselor: boolean 필드 - COALESCE 불가, 직접 설정
    if (existingCols.includes('is_counselor') && is_counselor !== undefined) {
      paramIdx++;
      setClauses.push(`is_counselor = $${paramIdx}`);
      params.push(is_counselor === true || is_counselor === 'true');
    }

    paramIdx++;
    params.push(id);

    const result = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password_hash, ...userData } = result.rows[0];
    await writeAudit({
      actorId: req.user.id,
      schoolId: userData.school_id || req.user.school_id,
      action: 'user.update',
      resource: `users:${id}`,
      payload: { user_type, name },
      ip: requestIp(req),
    });
    res.json({ message: 'User updated successfully', user: userData });
  } catch (error) {
    console.error('Update user error:', error.message);
    res.status(500).json({ error: 'Failed to update user', detail: error.message });
  }
});

// Restore (reactivate) withdrawn user (admin only)
router.patch('/:id/restore', auth, authorize('users', 'write'), schoolScope, async (req, res) => {
  try {
    const { id } = req.params;

    const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    if (!canManageTarget(req, existingUser.rows[0])) {
      return forbidCrossSchool(res);
    }

    let result;
    try {
      result = await query(
        `UPDATE users
         SET is_active = true,
             withdraw_reason = NULL,
             withdrawn_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_active = false
         RETURNING id, email, name, user_type`,
        [id]
      );
    } catch (colError) {
      result = await query(
        `UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_active = false RETURNING id, email, name, user_type`,
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '해당 탈퇴 회원을 찾을 수 없습니다.' });
    }

    res.json({ message: '회원이 복구되었습니다.', user: result.rows[0] });
  } catch (error) {
    console.error('Restore user error:', error);
    res.status(500).json({ error: 'Failed to restore user' });
  }
});

// Deactivate user (soft delete)
router.delete('/:id', auth, authorize('users', 'write'), schoolScope, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    if (!canManageTarget(req, existingUser.rows[0])) {
      return forbidCrossSchool(res);
    }
    
    let result;
    try {
      result = await query(
        `UPDATE users 
         SET is_active = false,
             withdraw_reason = COALESCE($1, withdraw_reason),
             withdrawn_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, email, name`,
        [reason || null, id]
      );
    } catch (colError) {
      console.warn('Deactivate fallback (missing columns):', colError.message);
      result = await query(
        `UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, name`,
        [id]
      );
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'User deactivated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

module.exports = router;
