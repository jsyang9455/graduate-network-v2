const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');
const { forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const {
  canSeeSchoolResource,
  appendSchoolColumnFilter,
  denySchoolResourceAccess,
} = require('../lib/schoolResourceAccess');

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

// Get posts
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;

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

    queryText += ` ORDER BY p.is_pinned DESC, p.created_at DESC 
                   LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await query(queryText, params);

    let countSql = 'SELECT COUNT(*) FROM posts p WHERE 1=1';
    const countParams = [];
    let countParam = 0;
    const counted = appendSchoolColumnFilter(countSql, countParams, countParam, req.user, 'p.school_id');
    countSql = counted.queryText;
    countParam = counted.paramCount;
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
      posts: result.rows,
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
    const post = await loadPostById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!assertPostAccess(req, res, post)) return;

    await query('UPDATE posts SET views_count = views_count + 1 WHERE id = $1', [id]);
    const refreshed = await loadPostById(id);
    res.json({ post: refreshed });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Create post
router.post('/', auth, async (req, res) => {
  try {
    const { category, title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await query(
      `INSERT INTO posts (user_id, category, title, content, school_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, category, title, content, req.user.school_id ?? null]
    );

    res.status(201).json({
      message: 'Post created successfully',
      post: result.rows[0],
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
    const { category, title, content, is_pinned } = req.body;

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

    if (row.user_id !== req.user.id && !isSystemAdmin(req.user)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await query(
      `UPDATE posts 
       SET category = COALESCE($1, category),
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           is_pinned = COALESCE($4, is_pinned),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [category, title, content, is_pinned !== undefined ? is_pinned : null, id]
    );

    res.json({
      message: 'Post updated successfully',
      post: result.rows[0],
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

    if (row.user_id !== req.user.id && !isSystemAdmin(req.user)) {
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

module.exports = router;
