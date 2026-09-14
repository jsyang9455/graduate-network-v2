const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const rbac = require('../modules/rbac');
const { sendError } = require('../lib/httpErrors');

router.get('/permissions', auth, async (req, res) => {
  try {
    const data = await rbac.permissionsFor(req.user);
    res.json(data);
  } catch (error) {
    console.error('Get permissions error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to load permissions');
  }
});

module.exports = router;
