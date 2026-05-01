#!/usr/bin/env node
// One-shot R2 sanity check: PUT → GET → DELETE a tiny object via S3 SDK.
// Args via env: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  console.error('Missing one of: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  process.exit(2);
}

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const key = `sanity-check-${Date.now()}.txt`;
const body = `sisyphus r2 sanity check at ${new Date().toISOString()}\n`;

async function main() {
  console.log(`[r2-sanity] endpoint=${endpoint} bucket=${bucket} key=${key}`);

  // PUT
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'text/plain',
  }));
  console.log('[r2-sanity] PUT ok');

  // GET
  const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await got.Body.transformToString();
  if (text !== body) {
    console.error(`[r2-sanity] GET body mismatch:\n  expected: ${JSON.stringify(body)}\n  got:      ${JSON.stringify(text)}`);
    process.exit(1);
  }
  console.log(`[r2-sanity] GET ok (${text.length} bytes, content matches)`);

  // DELETE
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log('[r2-sanity] DELETE ok');

  console.log('[r2-sanity] ALL GOOD — credentials work, bucket is writable.');
}

main().catch((err) => {
  console.error('[r2-sanity] FAILED:', err?.name, err?.message);
  if (err?.$metadata) console.error('[r2-sanity] metadata:', err.$metadata);
  process.exit(1);
});
