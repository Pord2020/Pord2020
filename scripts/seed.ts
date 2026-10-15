import { database } from '../src/lib/db';
import { appMode } from '../src/lib/config';
import { createStudy } from '../src/lib/services/studies';
import { sandboxFund } from '../src/lib/services/funding';
import type { Actor } from '../src/lib/services/auth';
import { examples } from '../src/lib/examples';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
if (appMode() !== 'sandbox') throw new Error('Example data is only allowed in sandbox mode.');
const ownerEmail = process.argv
  .find((v) => v.startsWith('--owner='))
  ?.slice('--owner='.length)
  .toLowerCase();
if (!ownerEmail) throw new Error('Usage: npm run db:seed -- --owner=<existing-founder-email>');
const db = await database();
try {
  const [actor] = await db.query<Actor>(
    'SELECT id,name,email,role,locale FROM users WHERE email=$1 AND role=$2',
    [ownerEmail, 'founder'],
  );
  if (!actor)
    throw new Error(
      'Register a founder account first. This script never creates login credentials.',
    );
  for (const example of examples) {
    const [existing] = await db.query(
      'SELECT id FROM studies WHERE founder_id=$1 AND app_name=$2 AND app_mode=$3',
      [actor.id, example.app, 'sandbox'],
    );
    if (existing) continue;
    const study = await createStudy(db, actor, {
      title: example.title[actor.locale],
      appName: example.app,
      description: example.description[actor.locale],
      platform: example.platform,
      kind: 'usability',
      category: example.category,
      rewardCents: example.reward,
      seats: example.seats,
      durationDays: example.days,
      countries: [],
      minimumAge: 18,
      maximumAge: 100,
      gender: 'any',
      requiredInterests: [],
      inviteUrl: 'https://example.com/pilotlane-sandbox-invitation',
      tasks: [
        actor.locale === 'es'
          ? 'Explora el registro y describe un punto de fricción.'
          : 'Explore onboarding and describe one point of friction.',
      ],
    });
    await sandboxFund(db, actor, study.id);
  }
  console.log('Sandbox example studies prepared. Existing studies preserved.');
} finally {
  await db.close();
}
import nextEnv from '@next/env';
