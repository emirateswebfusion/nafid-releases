const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
if (!process.env.GH_TOKEN) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const token = process.env.GH_TOKEN;
const owner = 'emirateswebfusion';
const repo = 'nafid-pos';
const pkg = require('../package.json');
const tag = `v${pkg.version}`;

if (!token) {
  console.error('GH_TOKEN missing in .env or .env.production');
  process.exit(1);
}

function request(url, options = {}, bodyStreamOrBuf = null, contentLength = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {
      'User-Agent': 'Node.js-Release-Uploader',
      'Authorization': `token ${token}`,
      ...options.headers
    };
    if (contentLength !== null) {
      headers['Content-Length'] = contentLength;
    }

    const reqOptions = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers
    };

    const req = https.request(reqOptions, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const str = buffer.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(str) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: buffer, body: str });
        }
      });
    });

    req.on('error', reject);

    if (bodyStreamOrBuf) {
      if (typeof bodyStreamOrBuf.pipe === 'function') {
        bodyStreamOrBuf.pipe(req);
      } else if (Buffer.isBuffer(bodyStreamOrBuf) || typeof bodyStreamOrBuf === 'string') {
        req.write(bodyStreamOrBuf);
        req.end();
      }
    } else {
      req.end();
    }
  });
}

function uploadFileWithProgress(uploadUrl, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const fileName = path.basename(filePath);
    const u = new URL(uploadUrl);

    let uploaded = 0;
    let lastPercent = -1;

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('data', chunk => {
      uploaded += chunk.length;
      const pct = Math.floor((uploaded / totalSize) * 100);
      if (pct !== lastPercent && pct % 10 === 0) {
        lastPercent = pct;
        const uploadedMb = (uploaded / (1024 * 1024)).toFixed(1);
        const totalMb = (totalSize / (1024 * 1024)).toFixed(1);
        console.log(`  -> ${fileName}: ${uploadedMb}MB / ${totalMb}MB (${pct}%)`);
      }
    });

    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Node.js-Release-Uploader',
        'Authorization': `token ${token}`,
        'Content-Type': contentType,
        'Content-Length': totalSize
      }
    }, res => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const str = buffer.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(str) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: buffer, body: str });
        }
      });
    });

    req.on('error', reject);
    fileStream.pipe(req);
  });
}

async function run() {
  console.log(`Checking release for tag ${tag}...`);
  let res = await request(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);

  if (res.status === 404) {
    console.log(`Release ${tag} not found. Creating release...`);
    res = await request(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: tag,
      body: `Release ${tag}`,
      draft: false,
      prerelease: false
    }));
  }

  if (res.status !== 200 && res.status !== 201) {
    console.error(`Failed to get/create release:`, res.body);
    process.exit(1);
  }

  const release = res.body;
  console.log(`Release ID: ${release.id}, Upload URL: ${release.upload_url}`);

  const releaseDir = fs.existsSync(path.join(__dirname, '../release'))
    ? path.join(__dirname, '../release')
    : path.join(__dirname, '../dist/release');

  console.log(`Using release directory: ${releaseDir}`);

  const filesToUpload = [
    { name: 'latest.yml', contentType: 'text/yaml' },
    { name: `Nafid-Setup-${pkg.version}.exe`, contentType: 'application/octet-stream' },
    { name: `Nafid-Setup-${pkg.version}.exe.blockmap`, contentType: 'application/octet-stream' }
  ];

  // Refresh release assets list
  const assetsRes = await request(`https://api.github.com/repos/${owner}/${repo}/releases/${release.id}/assets`);
  const existingAssets = Array.isArray(assetsRes.body) ? assetsRes.body : [];

  for (const f of filesToUpload) {
    const filePath = path.join(releaseDir, f.name);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }

    const existing = existingAssets.find(a => a.name === f.name);
    if (existing) {
      console.log(`Deleting existing asset ${f.name} (ID: ${existing.id})...`);
      await request(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`, {
        method: 'DELETE'
      });
    }

    console.log(`Uploading ${f.name} (${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB)...`);
    const baseUrl = release.upload_url.replace(/\{.*?\}/, '');
    const uploadUrl = `${baseUrl}?name=${encodeURIComponent(f.name)}`;

    const uploadRes = await uploadFileWithProgress(uploadUrl, filePath, f.contentType);

    if (uploadRes.status === 201) {
      console.log(`✅ Successfully uploaded ${f.name}!`);
    } else {
      console.error(`❌ Failed to upload ${f.name}:`, uploadRes.body);
    }
  }

  console.log('\n🎉 Done uploading all release assets!');
}

run().catch(console.error);
