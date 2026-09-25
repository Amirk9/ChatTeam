import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3-compatible storage. Works against SeaweedFS (local dev), MinIO, or real
// S3 — swapping targets is config-only (S3_* env). No provider SDKs elsewhere.
// Interface: put/get/delete/signedUrl (+ presigned PUT via presignPut).
let client = null;
let bucket = null;
let ready = null;

function cfg() {
  return {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:8333',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY || 'teamchat',
    secretAccessKey: process.env.S3_SECRET_KEY || 'teamchat-dev-only',
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false',
  };
}

export function storageConfig() {
  const c = cfg();
  bucket = process.env.S3_BUCKET || 'teamchat';
  return { ...c, bucket };
}

function getClient() {
  if (!client) {
    const c = cfg();
    client = new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      forcePathStyle: c.forcePathStyle,
    });
  }
  return client;
}

export async function ensureBucket() {
  if (ready) return ready;
  ready = (async () => {
    const { bucket: b } = storageConfig();
    const s3 = getClient();
    try {
      await s3.send(new HeadBucketCommand({ Bucket: b }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: b }));
    }
    return b;
  })();
  return ready;
}

export async function putObject(key, body, contentType) {
  const b = await ensureBucket();
  await getClient().send(new PutObjectCommand({ Bucket: b, Key: key, Body: body, ContentType: contentType }));
  return { bucket: b, key };
}

export async function getObject(key) {
  const b = await ensureBucket();
  const res = await getClient().send(new GetObjectCommand({ Bucket: b, Key: key }));
  return { body: res.Body, contentType: res.ContentType, size: res.ContentLength };
}

export async function deleteObject(key) {
  const b = await ensureBucket();
  await getClient().send(new DeleteObjectCommand({ Bucket: b, Key: key }));
}

// Perm-checked redirect target: short-lived GET URL (plan 07 signed URL).
export async function signedUrl(key, expiresIn = 3600) {
  const b = await ensureBucket();
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: b, Key: key }), { expiresIn });
}

// Direct-upload flow: presigned PUT + confirm.
// Client: POST presign -> PUT bytes to uploadUrl -> POST /files/:id/confirm.
export async function presignPut(key, contentType, expiresIn = 900) {
  const b = await ensureBucket();
  const url = await getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: b, Key: key, ContentType: contentType }),
    { expiresIn }
  );
  return { bucket: b, key, uploadUrl: url, expiresIn };
}

export async function headObject(key) {
  const b = await ensureBucket();
  const res = await getClient().send(new HeadObjectCommand({ Bucket: b, Key: key }));
  return { size: res.ContentLength, contentType: res.ContentType };
}
