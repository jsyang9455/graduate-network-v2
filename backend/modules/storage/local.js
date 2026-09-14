'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function createLocalStorage(rootDir) {
  const root = path.resolve(rootDir);

  async function put({ buffer, mime, kind, schoolId, originalName }) {
    const safeKind = String(kind || 'attachment').replace(/[^a-z0-9_-]/gi, '');
    const schoolPart = schoolId != null ? String(schoolId) : 'global';
    const key = path.posix.join(schoolPart, safeKind, `${Date.now()}-${randomUUID()}`);
    const full = path.join(root, key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return {
      bucketKey: key,
      size: buffer.length,
      mime,
      originalName: originalName || null,
    };
  }

  async function get(bucketKey) {
    const full = path.join(root, bucketKey);
    return fs.promises.readFile(full);
  }

  async function remove(bucketKey) {
    const full = path.join(root, bucketKey);
    try {
      await fs.promises.unlink(full);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return { driver: 'local', put, get, remove, root };
}

module.exports = { createLocalStorage };
