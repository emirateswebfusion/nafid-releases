const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });

const token = process.env.GH_TOKEN;
const owner = 'emirateswebfusion';
const repo = 'nafid-pos';
const pkg = require('../package.json');
const tag = `v${pkg.version}`;

if (!token) {
  console.error('GH_TOKEN missing in .env.production');
  process.exit(1);
}

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Node.js-Release-Uploader',
        'Authorization': `token ${token}`,
        ...options.headers
      }
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
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      }
    }
    req.end();
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

  const releaseDir = path.join(__dirname, '../dist/release');
  const filesToUpload = [
    { name: 'latest.yml', contentType: 'text/yaml' },
    { name: `Nafid-Setup-${pkg.version}.exe`, contentType: 'application/octet-stream' },
    { name: `Nafid-Setup-${pkg.version}.exe.blockmap`, contentType: 'application/octet-stream' }
  ];

  // Delete existing assets if they have the same name
  const existingAssets = release.assets || [];

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

    console.log(`Uploading ${f.name} (${fs.statSync(filePath).size} bytes)...`);
    const fileBuf = fs.readFileSync(filePath);
    const baseUrl = release.upload_url.replace(/\{.*?\}/, '');
    const uploadUrl = `${baseUrl}?name=${encodeURIComponent(f.name)}`;

    const uploadRes = await request(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': f.contentType,
        'Content-Length': fileBuf.length
      }
    }, fileBuf);

    if (uploadRes.status === 201) {
      console.log(`Successfully uploaded ${f.name}!`);
    } else {
      console.error(`Failed to upload ${f.name}:`, uploadRes.body);
    }
  }

  console.log('Done uploading all release assets!');
}

run().catch(console.error);
