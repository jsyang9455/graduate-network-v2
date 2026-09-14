'use strict';

/**
 * S3-compatible adapter (MinIO / AWS). Selected when STORAGE_DRIVER=s3.
 * Requires @aws-sdk/client-s3 and credentials; otherwise NOT_CONFIGURED.
 */
function createS3Storage() {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.S3_REGION || 'ap-northeast-2';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY;

  if (!bucket || !accessKey || !secretKey) {
    const err = new Error('S3 storage is NOT_CONFIGURED');
    err.code = 'NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  let S3Client;
  let PutObjectCommand;
  let GetObjectCommand;
  let DeleteObjectCommand;
  try {
    ({ S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    const err = new Error('S3 storage is NOT_CONFIGURED (@aws-sdk/client-s3 missing)');
    err.code = 'NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  async function put({ buffer, mime, kind, schoolId, originalName }) {
    const { randomUUID } = require('crypto');
    const safeKind = String(kind || 'attachment').replace(/[^a-z0-9_-]/gi, '');
    const schoolPart = schoolId != null ? String(schoolId) : 'global';
    const key = `${schoolPart}/${safeKind}/${Date.now()}-${randomUUID()}`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mime || 'application/octet-stream',
      Metadata: originalName ? { original: encodeURIComponent(originalName) } : undefined,
    }));
    return { bucketKey: key, size: buffer.length, mime, originalName: originalName || null };
  }

  async function get(bucketKey) {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: bucketKey }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async function remove(bucketKey) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: bucketKey }));
  }

  return { driver: 's3', put, get, remove, bucket };
}

module.exports = { createS3Storage };
