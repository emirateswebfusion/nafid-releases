import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { RUNTIME_ENV_KEYS, writeRuntimeEnv, PRODUCTION_CLOUD_API, validateProductionCloudEnv } = require('../../scripts/runtime-env.cjs') as {
  RUNTIME_ENV_KEYS: string[];
  PRODUCTION_CLOUD_API: string;
  validateProductionCloudEnv: (env: Record<string, string | undefined>) => void;
  writeRuntimeEnv: (env: Record<string, string | undefined>, file: string) => string[];
};

describe('installer runtime env', () => {
  it('keeps both platform release workflows on the approved backend', () => {
    expect(PRODUCTION_CLOUD_API).toBe('https://nafid.vercel.app');
    for (const workflow of ['windows-installer.yml', 'macos-installers.yml']) {
      const text = fs.readFileSync(path.resolve('.github/workflows', workflow), 'utf8');
      for (const key of ['VITE_CLOUD_API', 'VENDORA_CLOUD_API']) {
        const value = text.match(new RegExp(`^\\s+${key}: (\\S+)`, 'm'))?.[1];
        expect(value).toBe(PRODUCTION_CLOUD_API);
      }
    }
  });

  it('accepts the approved endpoint for both renderer and main', () => {
    expect(() => validateProductionCloudEnv({ VITE_CLOUD_API: PRODUCTION_CLOUD_API, VENDORA_CLOUD_API: PRODUCTION_CLOUD_API })).not.toThrow();
  });

  it.each([undefined, '', 'https://nafid-eta.vercel.app', 'http://localhost:3001'])('blocks missing, retired or development production endpoints (%s)', endpoint => {
    for (const key of ['VITE_CLOUD_API', 'VENDORA_CLOUD_API']) {
      expect(() => validateProductionCloudEnv({ VITE_CLOUD_API: PRODUCTION_CLOUD_API, VENDORA_CLOUD_API: PRODUCTION_CLOUD_API, [key]: endpoint })).toThrow('approved production backend');
    }
  });

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
