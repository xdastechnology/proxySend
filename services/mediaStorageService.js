const fs = require('fs');
const path = require('path');
const { getTemplateMediaDir, isServerlessRuntime } = require('../config/runtimePaths');

const ROOT_DIR = path.join(__dirname, '..');
const LOCAL_MEDIA_DIR = getTemplateMediaDir();

function getStorageMode() {
  return (process.env.MEDIA_STORAGE || 'local').toLowerCase() === 's3' ? 's3' : 'local';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveMediaTypeFromMime(mime) {
  const type = (mime || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'document';
}

function normalizeStoredRef(mediaPath) {
  if (!mediaPath) return { kind: 'none' };
  if (mediaPath.startsWith('s3:')) {
    return { kind: 's3', key: mediaPath.slice(3) };
  }
  if (mediaPath.startsWith('local:')) {
    return { kind: 'local', relativePath: mediaPath.slice(6) };
  }
  if (/^https?:\/\//i.test(mediaPath)) {
    return { kind: 'url', url: mediaPath };
  }
  return { kind: 'local', relativePath: mediaPath };
}

function cleanupTempFile(tempPath) {
  if (tempPath && fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}

function lazyS3Deps() {
  try {
    const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, getSignedUrl };
  } catch (err) {
    throw new Error('S3 mode requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner dependencies');
  }
}

function createS3Client() {
  const { S3Client } = lazyS3Deps();
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET is required when MEDIA_STORAGE=s3');
  }

  const options = {
    region: region || 'auto',
  };

  if (process.env.S3_ENDPOINT) {
    options.endpoint = process.env.S3_ENDPOINT;
  }

  if (process.env.S3_FORCE_PATH_STYLE === 'true') {
    options.forcePathStyle = true;
  }

  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    options.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    };
  }

  return { bucket, client: new S3Client(options) };
}

function buildObjectKey(file) {
  const ext = path.extname(file.originalname || '').replace(/[^a-zA-Z0-9.]/g, '');
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `templates/${stamp}_${rand}${ext}`;
}

async function storeUploadedFile(file) {
  if (!file) return null;

  const mediaMeta = {
    mediaType: resolveMediaTypeFromMime(file.mimetype),
    mediaMime: file.mimetype || null,
    mediaName: file.originalname || path.basename(file.path),
  };

  if (getStorageMode() === 's3') {
    const { PutObjectCommand } = lazyS3Deps();
    const { bucket, client } = createS3Client();
    const key = buildObjectKey(file);

    const stream = fs.createReadStream(file.path);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: stream,
        ContentType: file.mimetype || 'application/octet-stream',
      })
    );

    cleanupTempFile(file.path);

    return {
      ...mediaMeta,
      mediaPath: `s3:${key}`,
    };
  }

  ensureDir(LOCAL_MEDIA_DIR);
  const targetName = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname || '')}`;
  const targetPath = path.join(LOCAL_MEDIA_DIR, targetName);

  fs.renameSync(file.path, targetPath);
  const storedPath = isServerlessRuntime()
    ? targetPath
    : path.relative(ROOT_DIR, targetPath).replace(/\\/g, '/');

  return {
    ...mediaMeta,
    mediaPath: `local:${storedPath}`,
  };
}

async function removeStoredMedia(mediaPath) {
  const ref = normalizeStoredRef(mediaPath);

  if (ref.kind === 'none' || ref.kind === 'url') return;

  if (ref.kind === 's3') {
    const { DeleteObjectCommand } = lazyS3Deps();
    const { bucket, client } = createS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: ref.key,
      })
    );
    return;
  }

  const absolutePath = path.isAbsolute(ref.relativePath)
    ? ref.relativePath
    : path.join(ROOT_DIR, ref.relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

async function resolveMediaForSend(mediaPath) {
  const ref = normalizeStoredRef(mediaPath);

  if (ref.kind === 'none') return null;
  if (ref.kind === 'url') return { kind: 'url', value: ref.url };

  if (ref.kind === 's3') {
    const { GetObjectCommand, getSignedUrl } = lazyS3Deps();
    const { bucket, client } = createS3Client();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: ref.key }),
      { expiresIn: 3600 }
    );
    return { kind: 'url', value: url };
  }

  const absolutePath = path.isAbsolute(ref.relativePath)
    ? ref.relativePath
    : path.join(ROOT_DIR, ref.relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error('Template media file not found on server');
  }

  return { kind: 'local', value: absolutePath };
}

module.exports = {
  getStorageMode,
  storeUploadedFile,
  removeStoredMedia,
  resolveMediaForSend,
  cleanupTempFile,
};
