import nextEnv from '@next/env';
import { database } from '../src/lib/db';
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const db = await database();
console.log('Database migrations applied.');
await db.close();
