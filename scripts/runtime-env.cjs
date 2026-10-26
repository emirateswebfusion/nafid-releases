/**
 * The environment shipped inside the installer (resources/app.env). Only these public keys are copied from the
 * build machine's environment / .env.production; secrets such as GH_TOKEN (used only to publish releases) never
 * leave the build machine. tests/unit/runtimeEnv.test.ts fails if a secret-looking key is added here.
 */
const fs = require('fs');
const path = require('path');

const RUNTIME_ENV_KEYS = [
  'VITE_CLOUD_API',
  'VENDORA_CLOUD_API',
  'VENDORA_SYNC_INTERVAL_MINUTES',
  'ALLOWED_CONNECT_ORIGINS',
  'UPDATES_REPO_URL',
];

/** Writes the allow-listed keys present in `env` to `file` (KEY=value lines) and returns the keys written. */
function writeRuntimeEnv(env, file) {
  const written = RUNTIME_ENV_KEYS.filter((key) => typeof env[key] === 'string' && env[key] !== '');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, written.map((key) => `${key}=${env[key]}`).join('\n') + '\n', 'utf8');
  return written;
}

module.exports = { RUNTIME_ENV_KEYS, writeRuntimeEnv };
