import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { RUNTIME_ENV_KEYS, writeRuntimeEnv } = require('../../scripts/runtime-env.cjs') as {
  RUNTIME_ENV_KEYS: string[];
  writeRuntimeEnv: (env: Record<string, string | undefined>, file: string) => string[];
};

describe('installer runtime env', () => {
  it('ships no secret-looking keys', () => {
    for (const key of RUNTIME_ENV_KEYS) expect(key).not.toMatch(/TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL|_KEY$/i);
  });

  it('copies only allow-listed keys, never GH_TOKEN', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-env-')), 'app.env');
    const written = writeRuntimeEnv({ VENDORA_CLOUD_API: 'https://api.example', GH_TOKEN: 'ghp_secret', UPDATES_REPO_URL: '' }, file);
    const text = fs.readFileSync(file, 'utf8');
    expect(written).toEqual(['VENDORA_CLOUD_API']);
    expect(text).toBe('VENDORA_CLOUD_API=https://api.example\n');
    expect(text).not.toContain('ghp_secret');
  });
});
