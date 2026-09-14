const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { sendError } = require('../lib/httpErrors');
const notify = require('../modules/notify');

router.get('/', auth, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const params = [req.user.id];
    let sql = `SELECT * FROM notifications WHERE user_id = $1`;
    if (unreadOnly) sql += ' AND is_read = false';
    sql += ' ORDER BY created_at DESC LIMIT $2';
    params.push(limit);
    const result = await query(sql, params);
    const unread = await query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({
      notifications: result.rows,
      unread_count: unread.rows[0].count,
    });
  } catch (error) {
    console.error('List notifications error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get notifications');
  }
});

router.patch('/:id/read', auth, async (req, res) => {
  try {
    const result = await query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) {
      return sendError(res, 404, 'NOT_FOUND', '알림을 찾을 수 없습니다');
    }
    res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Read notification error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to update notification');
  }
});

router.post('/read-all', auth, async (req, res) => {
  try {
    const result = await query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [req.user.id]
    );
    res.json({ updated: result.rowCount });
  } catch (error) {
    console.error('Read-all notifications error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to update notifications');
  }
});

router.get('/providers', auth, async (req, res) => {
  res.json({
    in_app: { configured: true },
    alimtalk: {
      configured: notify.isAlimtalkConfigured(),
      code: notify.isAlimtalkConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED',
    },
    sms: {
      configured: notify.isSmsConfigured(),
      code: notify.isSmsConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED',
    },
  });
});

module.exports = router;
