'use strict';

const path = require('path');
const { createLocalStorage } = require('./local');

let singleton;

function createStorage() {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver === 's3') {
    const { createS3Storage } = require('./s3');
    return createS3Storage();
  }
  const root = process.env.STORAGE_LOCAL_DIR
    || process.env.UPLOAD_PATH
    || path.join(__dirname, '..', '..', 'uploads');
  return createLocalStorage(root);
}

function getStorage() {
  if (!singleton) singleton = createStorage();
  return singleton;
}

function resetStorageForTests() {
  singleton = null;
}

module.exports = { createStorage, getStorage, resetStorageForTests };
