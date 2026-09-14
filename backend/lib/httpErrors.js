function sendError(res, status, code, message) {
  return res.status(status).json({
    error: message,
    code,
    status,
  });
}

module.exports = { sendError };
