'use strict';

/**
 * Worknet (고용24) stub — live sync only when WORKNET_API_KEY is set (REQ-WN-010).
 * Gate in docs/STATUS.md must be ready before real integration.
 */

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendError } = require('../lib/httpErrors');

function isConfigured() {
  return Boolean(process.env.WORKNET_API_KEY && String(process.env.WORKNET_API_KEY).trim());
}

router.get('/status', auth, async (req, res) => {
  res.json({
    configured: isConfigured(),
    code: isConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED',
    message: isConfigured()
      ? 'Worknet key present (live sync not implemented in this build)'
      : 'Worknet OpenAPI key not configured — set WORKNET_API_KEY when school gate is ready',
    gate: 'B-GATE',
  });
});

router.post('/sync', auth, authorize('jobs', 'write'), async (req, res) => {
  if (!isConfigured()) {
    return sendError(res, 503, 'NOT_CONFIGURED', 'Worknet API key missing');
  }
  return sendError(res, 503, 'NOT_CONFIGURED', 'Worknet live sync not enabled (gate/stub only)');
});

router.get('/logs', auth, authorize('jobs', 'read'), async (req, res) => {
  res.json({
    logs: [],
    code: isConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED',
    message: 'No sync logs until live Worknet integration is enabled',
  });
});

module.exports = router;
