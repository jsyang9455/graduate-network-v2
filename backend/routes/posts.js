const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth, checkRole } = require('../middleware/auth');
const { forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isSchoolAdmin, isStaffAdmin } = require('../lib/roles');
const {
  canSeeSchoolResource,
  appendSchoolColumnFilter,
  denySchoolResourceAccess,
} = require('../lib/schoolResourceAccess');

const ALLOWED_CATEGORIES = new Set([
  'employment_review',
  'interview_review',
  'job_qa',
  'mentoring',
  'news',
]);

function canModeratePost(user, schoolId) {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  if (!schoolId) return false;
  if (Number(user.school_id) !== Number(schoolId)) return false;
  return isStaffAdmin(user) || user.user_type === 'teacher' || user.role === 'teacher';
}

function sanitizePost(post, viewer) {
  if (!post) return post;
  const out = { ...post };
  if (out.is_anonymous && !canModeratePost(viewer, out.school_id)
      && !(viewer && Number(viewer.id) === Number(out.user_id))) {
    out.author_name = '익명';
    out.author_image = null;
    out.user_id = null;
  }
  if (out.blinded_at && !canModeratePost(viewer, out.school_id)) {
    out.title = '[블라인드 처리된 게시글]';
    out.content = '운영자에 의해 숨겨진 게시글입니다.';
    out.author_name = '익명';
    out.author_image = null;
  }
  return out;
}

async function loadPostById(id) {
  const result = await query(
    `SELECT p.*, u.name as author_name, u.profile_image as author_image,
            u.user_type as author_type
     FROM posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

function assertPostAccess(req, res, post) {
  if (!post) return false;
  if (!canSeeSchoolResource(req.user, post.school_id)) {
    denySchoolResourceAccess(res, req.user);
    return false;
  }
  return true;
}

// Categories (REQ-COM-001)
router.get('/categories', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT code, name, sort_order FROM post_categories ORDER BY sort_order, code`
    );
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get post categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// My scraps (REQ-COM-003)
router.get('/scraps/me', auth, async (req, res) => {
  try {
    let queryText = `
      SELECT p.*, u.name as author_name, u.profile_image as author_image, s.created_at AS scraped_at
      FROM post_scraps s
      JOIN posts p ON p.id = s.post_id
      JOIN users u ON p.user_id = u.id
      WHERE s.user_id = $1
    `;
    const params = [req.user.id];
    let paramCount = 1;
    const scoped = appendSchoolColumnFilter(queryText, params, paramCount, req.user, 'p.school_id');
    queryText = scoped.queryText;
    paramCount = scoped.paramCount;
    queryText += ' ORDER BY s.created_at DESC';

    const result = await query(queryText, params);
    res.json({
      posts: result.rows
        .filter((p) => !p.blinded_at || canModeratePost(req.user, p.school_id))
        .map((p) => sanitizePost(p, req.user)),
    });
  } catch (error) {
    console.error('Get scraps error:', error);
    res.status(500).json({ error: 'Failed to get scraps' });
  }
});

// Open reports for moderators (REQ-COM-005)
router.get('/reports', auth, checkRole('admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    let queryText = `
      SELECT r.*, p.title, p.school_id, p.blinded_at, u.name AS reporter_name
      FROM post_reports r
      JOIN posts p ON p.id = r.post_id
      JOIN users u ON u.id = r.reporter_id
      WHERE r.status = 'open'
    `;
    const params = [];
    let paramCount = 0;
    if (!isSystemAdmin(req.user)) {
      paramCount++;
      queryText += ` AND p.school_id = $${paramCount}`;
      params.push(req.user.school_id);
    }
    queryText += ' ORDER BY r.created_at DESC LIMIT 100';
    const result = await query(queryText, params);
    res.json({ reports: result.rows });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Get posts (REQ-COM-001/004)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20, sort = 'recent' } = req.query;
    const includeBlinded = req.query.include_blinded === 'true'
      && req.user
      && (isSystemAdmin(req.user) || isStaffAdmin(req.user) || req.user.user_type === 'teacher');

    let queryText = `
      SELECT p.*, u.name as author_name, u.profile_image as author_image
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    const scoped = appendSchoolColumnFilter(queryText, params, paramCount, req.user, 'p.school_id');
    queryText = scoped.queryText;
    paramCount = scoped.paramCount;

    if (!includeBlinded) {
      queryText += ' AND p.blinded_at IS NULL';
    }

    if (category) {
      paramCount++;
      queryText += ` AND p.category = $${paramCount}`;
      params.push(category);
    }

    if (search) {
      paramCount++;
      queryText += ` AND (p.title ILIKE $${paramCount} OR p.content ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (sort === 'popular') {
      queryText += ' ORDER BY p.is_pinned DESC, p.likes_count DESC, p.views_count DESC, p.created_at DESC';
    } else {
      queryText += ' ORDER BY p.is_pinned DESC, p.created_at DESC';
    }

    queryText += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await query(queryText, params);

    let countSql = 'SELECT COUNT(*) FROM posts p WHERE 1=1';
    const countParams = [];
    let countParam = 0;
    const counted = appendSchoolColumnFilter(countSql, countParams, countParam, req.user, 'p.school_id');
    countSql = counted.queryText;
    countParam = counted.paramCount;
    if (!includeBlinded) {
      countSql += ' AND p.blinded_at IS NULL';
    }
    if (category) {
      countParam++;
      countSql += ` AND p.category = $${countParam}`;
      countParams.push(category);
    }
    if (search) {
      countParam++;
      countSql += ` AND (p.title ILIKE $${countParam} OR p.content ILIKE $${countParam})`;
      countParams.push(`%${search}%`);
    }
    const countResult = await query(countSql, countParams);

    res.json({
      posts: result.rows.map((p) => sanitizePost(p, req.user)),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(countResult.rows[0].count, 10),
        pages: Math.ceil(countResult.rows[0].count / limit),
      },
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// Get single post
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(String(id))) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const post = await loadPostById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!assertPostAccess(req, res, post)) return;

    if (post.blinded_at && !canModeratePost(req.user, post.school_id)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await query('UPDATE posts SET views_count = views_count + 1 WHERE id = $1', [id]);
    const refreshed = await loadPostById(id);

    let scraped = false;
    if (req.user) {
      const scrap = await query(
        'SELECT 1 FROM post_scraps WHERE user_id = $1 AND post_id = $2',
        [req.user.id, id]
      );
      scraped = scrap.rows.length > 0;
    }

    res.json({ post: sanitizePost(refreshed, req.user), scraped });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Create post (REQ-COM-001/003)
router.post('/', auth, async (req, res) => {
  try {
    const { category, title, content, is_anonymous } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const cat = category || 'news';
    if (!ALLOWED_CATEGORIES.has(cat)) {
      return res.status(400).json({
        error: 'Invalid category',
        allowed: [...ALLOWED_CATEGORIES],
      });
    }

    const result = await query(
      `INSERT INTO posts (user_id, category, title, content, school_id, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.id,
        cat,
        title,
        content,
        req.user.school_id ?? null,
        Boolean(is_anonymous),
      ]
    );

    res.status(201).json({
      message: 'Post created successfully',
      post: sanitizePost(result.rows[0], req.user),
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, title, content, is_pinned, is_anonymous } = req.body;

    const postCheck = await query(
      'SELECT user_id, school_id FROM posts WHERE id = $1',
      [id]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const row = postCheck.rows[0];
    if (!canSeeSchoolResource(req.user, row.school_id)) {
      return forbidCrossSchool(res);
    }

    if (row.user_id !== req.user.id && !isSystemAdmin(req.user) && !canModeratePost(req.user, row.school_id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (category != null && !ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid category', allowed: [...ALLOWED_CATEGORIES] });
    }

    const result = await query(
      `UPDATE posts 
       SET category = COALESCE($1, category),
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           is_pinned = COALESCE($4, is_pinned),
           is_anonymous = COALESCE($5, is_anonymous),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        category,
        title,
        content,
        is_pinned !== undefined ? is_pinned : null,
        is_anonymous !== undefined ? Boolean(is_anonymous) : null,
        id,
      ]
    );

    res.json({
      message: 'Post updated successfully',
      post: sanitizePost(result.rows[0], req.user),
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const postCheck = await query(
      'SELECT user_id, school_id FROM posts WHERE id = $1',
      [id]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const row = postCheck.rows[0];
    if (!canSeeSchoolResource(req.user, row.school_id)) {
      return forbidCrossSchool(res);
    }

    if (row.user_id !== req.user.id && !isSystemAdmin(req.user) && !canModeratePost(req.user, row.school_id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await query('DELETE FROM posts WHERE id = $1', [id]);

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Get comments for a post
router.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!assertPostAccess(req, res, post)) return;
    if (post.blinded_at && !canModeratePost(req.user, post.school_id)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const result = await query(
      `SELECT c.*, u.name as author_name, u.profile_image as author_image
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    );

    res.json({ comments: result.rows });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// Add comment
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, parent_id } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canSeeSchoolResource(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }
    if (post.blinded_at) {
      return res.status(400).json({ error: 'Cannot comment on blinded post' });
    }

    const result = await query(
      `INSERT INTO comments (post_id, user_id, parent_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, req.user.id, parent_id, content]
    );

    await query(
      'UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1',
      [id]
    );

    res.status(201).json({
      message: 'Comment added successfully',
      comment: result.rows[0],
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Like post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canSeeSchoolResource(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }
    if (post.blinded_at) {
      return res.status(400).json({ error: 'Cannot like blinded post' });
    }

    await query(
      'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1',
      [id]
    );

    res.json({ message: 'Post liked successfully' });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Scrap toggle (REQ-COM-003)
router.post('/:id/scrap', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canSeeSchoolResource(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }
    if (post.blinded_at) {
      return res.status(400).json({ error: 'Cannot scrap blinded post' });
    }

    await query(
      `INSERT INTO post_scraps (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING`,
      [req.user.id, id]
    );

    res.status(201).json({ message: 'Post scraped', scraped: true });
  } catch (error) {
    console.error('Scrap post error:', error);
    res.status(500).json({ error: 'Failed to scrap post' });
  }
});

router.delete('/:id/scrap', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canSeeSchoolResource(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }

    await query(
      'DELETE FROM post_scraps WHERE user_id = $1 AND post_id = $2',
      [req.user.id, id]
    );

    res.json({ message: 'Scrap removed', scraped: false });
  } catch (error) {
    console.error('Unscrap post error:', error);
    res.status(500).json({ error: 'Failed to remove scrap' });
  }
});

// Report (REQ-COM-005)
router.post('/:id/report', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canSeeSchoolResource(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }

    const result = await query(
      `INSERT INTO post_reports (post_id, reporter_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, reporter_id)
       DO UPDATE SET reason = EXCLUDED.reason, status = 'open', created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, req.user.id, reason]
    );

    res.status(201).json({ message: 'Report submitted', report: result.rows[0] });
  } catch (error) {
    console.error('Report post error:', error);
    res.status(500).json({ error: 'Failed to report post' });
  }
});

// Blind / unblind (REQ-COM-005)
router.post('/:id/blind', auth, checkRole('admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body?.reason || '').trim() || null;
    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canModeratePost(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }

    const result = await query(
      `UPDATE posts
       SET blinded_at = CURRENT_TIMESTAMP,
           blinded_by = $1,
           blind_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [req.user.id, reason, id]
    );

    await query(
      `UPDATE post_reports SET status = 'actioned'
       WHERE post_id = $1 AND status = 'open'`,
      [id]
    );

    res.json({ message: 'Post blinded', post: result.rows[0] });
  } catch (error) {
    console.error('Blind post error:', error);
    res.status(500).json({ error: 'Failed to blind post' });
  }
});

router.delete('/:id/blind', auth, checkRole('admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const post = await loadPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!canModeratePost(req.user, post.school_id)) {
      return forbidCrossSchool(res);
    }

    const result = await query(
      `UPDATE posts
       SET blinded_at = NULL,
           blinded_by = NULL,
           blind_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json({ message: 'Post unblinded', post: result.rows[0] });
  } catch (error) {
    console.error('Unblind post error:', error);
    res.status(500).json({ error: 'Failed to unblind post' });
  }
});

module.exports = router;
