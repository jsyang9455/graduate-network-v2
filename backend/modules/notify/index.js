const { query } = require('../../config/database');

function isAlimtalkConfigured() {
  return Boolean(process.env.ALIMTALK_API_KEY || process.env.ALIMTALK_SENDER_KEY);
}

function isSmsConfigured() {
  return Boolean(process.env.SMS_API_KEY || process.env.NCP_SMS_ACCESS_KEY);
}

async function notifyExternal(channel, _payload) {
  const configured = channel === 'sms' ? isSmsConfigured() : isAlimtalkConfigured();
  if (!configured) {
    return { skipped: true, code: 'NOT_CONFIGURED', channel };
  }
  return { skipped: true, code: 'NOT_CONFIGURED', channel };
}

async function notifyInApp({
  userId,
  type,
  title,
  message,
  link = null,
  eventCode = null,
  schoolId = null,
  payload = null,
}) {
  const result = await query(
    `INSERT INTO notifications
       (user_id, type, title, message, link, event_code, channel, school_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_app', $7, $8)
     RETURNING *`,
    [userId, type, title, message, link, eventCode, schoolId, payload ? JSON.stringify(payload) : null]
  );
  return result.rows[0];
}

async function emit(eventCode, {
  userId,
  type,
  title,
  message,
  link = null,
  schoolId = null,
  payload = null,
}) {
  const notification = await notifyInApp({
    userId,
    type: type || eventCode,
    title,
    message,
    link,
    eventCode,
    schoolId,
    payload,
  });
  const external = await notifyExternal('alimtalk', { eventCode, userId, payload });
  return {
    notification,
    channel_skipped: external.skipped ? external.channel : undefined,
    code: external.code,
  };
}

module.exports = {
  emit,
  notifyInApp,
  notifyExternal,
  isAlimtalkConfigured,
  isSmsConfigured,
};
