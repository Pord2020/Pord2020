import { spawn } from 'node:child_process';
import nextEnv from '@next/env';
import { database } from '../src/lib/db';
import { appUrl } from '../src/lib/config';

Object.assign(process.env, { NODE_ENV: 'production', NODE_USE_ENV_PROXY: '1' });
nextEnv.loadEnvConfig(process.cwd(), false);
appUrl();
const db = await database();
await db.close();
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env, detached: process.platform !== 'win32' },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  if (process.platform !== 'win32' && server.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  } else server.kill('SIGTERM');
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
server.on('error', () => {
  console.error('Web process failed to start.');
  process.exitCode = 1;
});
server.on('exit', (code) => {
  process.exitCode = stopping ? 0 : (code ?? 1);
});
