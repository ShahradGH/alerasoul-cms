#!/usr/bin/env node
/**
 * Idempotent S3-SigV4 Media Migrator for Cloudflare R2 (`alerasoul-cms-media`).
 * Streams local WordPress uploads (`tmp-export/uploads/...`) to `wp-content/uploads/...`
 * without storing binary media inside Git.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_ENV_CANDIDATES = [
  path.resolve(process.cwd(), '.env'),
  'C:\\Work\\Repo\\shwebsites\\.env',
];

function loadEnv() {
  for (const p of DEFAULT_ENV_CANDIDATES) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function walkFiles(dir, baseDir = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, baseDir));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const stat = fs.statSync(full);
      results.push({ full, rel, size: stat.size });
    }
  }
  return results;
}

function signS3Request({ method, host, canonicalUri, queryString = '', headers, payloadHash, accessKeyId, secretAccessKey }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const allHeaders = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers,
  };
  const sortedKeys = Object.keys(allHeaders).map((k) => k.toLowerCase()).sort();
  const lowerMap = {};
  for (const [k, v] of Object.entries(allHeaders)) lowerMap[k.toLowerCase()] = String(v).trim();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${lowerMap[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    ...allHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function listAllR2Objects({ host, bucket, accessKeyId, secretAccessKey }) {
  const existing = new Map();
  let continuationToken = null;
  while (true) {
    const params = new URLSearchParams({ 'list-type': '2', 'max-keys': '1000' });
    if (continuationToken) params.set('continuation-token', continuationToken);
    // RFC 3986 sorted query string
    const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const qs = sorted.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const canonicalUri = `/${bucket}`;
    const payloadHash = sha256Hex('');
    const hdrs = signS3Request({
      method: 'GET',
      host,
      canonicalUri,
      queryString: qs,
      headers: {},
      payloadHash,
      accessKeyId,
      secretAccessKey,
    });
    const res = await fetch(`https://${host}${canonicalUri}?${qs}`, { headers: hdrs });
    if (!res.ok) throw new Error(`ListObjectsV2 failed (${res.status}): ${await res.text()}`);
    const xml = await res.text();
    const contentBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
    for (const block of contentBlocks) {
      const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
      const sizeMatch = block.match(/<Size>(\d+)<\/Size>/);
      if (keyMatch) {
        const key = keyMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        existing.set(key, sizeMatch ? Number(sizeMatch[1]) : 0);
      }
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const nextMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
    if (!truncated || !nextMatch) break;
    continuationToken = nextMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
  return existing;
}

async function main() {
  loadEnv();
  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const bucket = process.env.R2_CMS_BUCKET || 'alerasoul-cms-media';
  const sourceDir = path.resolve(process.cwd(), 'tmp-export', 'uploads');
  const concurrency = Math.max(1, parseInt(process.env.R2_UPLOAD_CONCURRENCY || '24', 10));

  if (!token || !accountId) throw new Error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID');
  if (!fs.existsSync(sourceDir)) throw new Error(`Missing source directory: ${sourceDir}`);

  // Resolve Token ID for S3 SigV4 auth
  const verifyRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verifyJson = await verifyRes.json();
  const accessKeyId = verifyJson?.result?.id;
  if (!accessKeyId) throw new Error('Unable to resolve Cloudflare token ID for R2 S3 upload');
  const secretAccessKey = sha256Hex(token);
  const host = `${accountId}.r2.cloudflarestorage.com`;

  const files = walkFiles(sourceDir);
  console.log(`Discovered ${files.length} local upload files in tmp-export/uploads.`);

  const existing = await listAllR2Objects({ host, bucket, accessKeyId, secretAccessKey });
  console.log(`Found ${existing.size} existing objects in R2 bucket ${bucket}.`);

  const queue = files.filter((f) => {
    const r2Key = `wp-content/uploads/${f.rel}`;
    return existing.get(r2Key) !== f.size;
  });

  console.log(`Uploading ${queue.length} missing/changed files (concurrency=${concurrency})...`);

  let index = 0;
  let uploaded = 0;
  let failed = 0;

  async function worker() {
    while (true) {
      const myIdx = index++;
      if (myIdx >= queue.length) return;
      const item = queue[myIdx];
      const r2Key = `wp-content/uploads/${item.rel}`;
      const encodedPath = r2Key.split('/').map((seg) => encodeURIComponent(seg)).join('/');
      const canonicalUri = `/${bucket}/${encodedPath}`;
      const buf = fs.readFileSync(item.full);
      const payloadHash = sha256Hex(buf);
      const contentType = getMimeType(item.full);

      let attempt = 0;
      while (attempt < 4) {
        attempt++;
        const hdrs = signS3Request({
          method: 'PUT',
          host,
          canonicalUri,
          headers: {
            'cache-control': 'public, max-age=31536000, immutable',
            'content-type': contentType,
          },
          payloadHash,
          accessKeyId,
          secretAccessKey,
        });
        const res = await fetch(`https://${host}${canonicalUri}`, {
          method: 'PUT',
          headers: hdrs,
          body: buf,
        });
        if (res.ok) {
          uploaded++;
          if (uploaded % 500 === 0 || uploaded === queue.length) {
            console.log(`Progress: ${uploaded}/${queue.length} uploaded`);
          }
          break;
        }
        if (attempt >= 4) {
          failed++;
          console.error(`Failed ${r2Key}: HTTP ${res.status}`);
        } else {
          await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failed > 0) throw new Error(`${failed} uploads failed`);

  const finalObjects = await listAllR2Objects({ host, bucket, accessKeyId, secretAccessKey });
  const totalBytes = [...finalObjects.values()].reduce((acc, s) => acc + s, 0);
  console.log(`R2 verification complete: ${finalObjects.size} objects (${(totalBytes / 1024 / 1024).toFixed(2)} MiB) in ${bucket}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
