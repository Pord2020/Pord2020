import { test, expect, type Page } from '@playwright/test';

const password = 'correct-horse-battery-42';
const uniqueEmail = (role: string) =>
  `browser-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
async function signup(page: Page, role: 'founder' | 'tester', email: string) {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  if (role === 'founder')
    await page.getByRole('button', { name: 'I’m building an app', exact: true }).click();
  await page
    .getByLabel('Your name', { exact: true })
    .fill(role === 'founder' ? 'Avery Founder' : 'Alex Tester');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/workspace/);
}

test('public discovery is bilingual, searchable, labeled as sample content, and responsive', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good apps start');
  await expect(page.getByText('You’re exploring sample studies.', { exact: false })).toBeVisible();
  await expect(page.locator('.study-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Android', exact: true }).click();
  await expect(page.locator('.study-card')).toHaveCount(3);
  await page.getByRole('searchbox').fill('crumb');
  await expect(page.locator('.study-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('not-a-study');
  await expect(page.getByText('Nothing here just yet.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Español', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Las buenas apps');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/pilotlane-${testInfo.project.name}-es.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('a founder funds a study, accepts a tester, and the tester records real work without skipping time', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const appName = `Fieldnotes ${testInfo.project.name}`;
  const founderEmail = uniqueEmail('founder');
  await signup(page, 'founder', founderEmail);
  await page.getByRole('button', { name: 'Create a study', exact: true }).first().click();
  await page.getByLabel('App name', { exact: true }).fill(appName);
  await page.getByLabel('Study title', { exact: true }).fill('A calmer daily journal');
  await page
    .getByLabel('What would you like to learn?', { exact: true })
    .fill(
      'We want to understand whether a first journal entry is simple, useful, and easy to find.',
    );
  await page.getByRole('combobox', { name: 'Study type', exact: true }).selectOption('usability');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Number of testers', { exact: true }).fill('20');
  await page.getByLabel('Study length (days)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByLabel('Private test invitation link', { exact: false })
    .fill('https://play.google.com/apps/testing/dev.pilotlane.fieldnotes');
  await page
    .getByLabel('What should testers do?', { exact: false })
    .fill('Complete onboarding and describe one confusing moment.');
  await expect(page.getByText('$399.90', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate funding', exact: true }).click();
  await expect(page.getByText('Sandbox funding recorded.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Close / Cerrar', exact: true }).click();
  const own = await (await page.request.get('/api/studies?own=true')).json();
  const study = own[0];
  expect(study.app_name).toBe(appName);
  expect(study.invite_url).toBeUndefined();
  const attacker = await page.request.post(`/api/studies/${study.id}/sandbox-fund`, {
    headers: { Origin: 'https://evil.example' },
  });
  expect(attacker.status()).toBe(403);
  const testerContext = await browser.newContext({
    baseURL,
    viewport: page.viewportSize() || undefined,
  });
  const tester = await testerContext.newPage();
  await signup(tester, 'tester', uniqueEmail('tester'));
  await tester.getByLabel('Age', { exact: true }).fill('28');
  await tester.getByLabel('I agree to use these details', { exact: false }).check();
  await tester.getByRole('button', { name: 'Save changes', exact: true }).click();
  await tester
    .getByRole('button', { name: new RegExp(`${appName}.*A calmer daily journal`) })
    .click();
  await tester
    .getByLabel('Why would you be a good fit?', { exact: true })
    .fill('I journal daily and can give detailed feedback.');
  await tester.getByRole('button', { name: 'Apply to study', exact: true }).click();
  await expect(tester.getByText('Application sent.', { exact: false })).toBeVisible();
  await tester.getByRole('button', { name: 'Close / Cerrar', exact: true }).click();
  await page.reload();
  await page
    .getByRole('button', { name: new RegExp(`${appName}.*A calmer daily journal`) })
    .click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText('Tester accepted.', { exact: false })).toBeVisible();
  const outsider = await tester.request.get('/api/studies?own=true');
  expect(await outsider.json()).toEqual([]);
  await tester.reload();
  if (testInfo.project.name === 'mobile')
    await tester.getByRole('button', { name: 'Workspace', exact: true }).click();
  await tester.getByRole('button', { name: 'My studies', exact: true }).click();
  await tester
    .getByRole('button', { name: new RegExp(`${appName}.*A calmer daily journal`) })
    .click();
  await expect(
    tester.getByRole('link', { name: 'Open test invitation', exact: false }),
  ).toHaveAttribute('href', 'https://play.google.com/apps/testing/dev.pilotlane.fieldnotes');
  await tester.getByRole('button', { name: 'I’ve joined — start my study', exact: true }).click();
  await tester
    .getByRole('textbox', { name: 'Your daily check-in', exact: true })
    .fill('I explored onboarding and wrote a first entry. The save action was clear.');
  await tester.getByRole('button', { name: 'Save today’s check-in', exact: true }).click();
  await expect(
    tester.getByText('Today’s check-in is saved.', { exact: true }).first(),
  ).toBeVisible();
  await tester
    .getByRole('textbox', { name: 'Your feedback 1', exact: true })
    .fill(
      'The welcome screen is useful, but the first entry button could have a more specific label.',
    );
  await tester.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(
    tester.getByRole('button', { name: 'Submit for review', exact: true }),
  ).toBeDisabled();
  const participations = await (await tester.request.get('/api/participations')).json();
  const participation = participations[0];
  const early = await tester.request.post(`/api/participations/${participation.id}/submit`, {
    headers: { Origin: baseURL! },
  });
  expect(early.status()).toBe(409);
  expect((await early.json()).error).toBe('REQUIREMENTS_INCOMPLETE');
  const duplicate = await tester.request.post(`/api/participations/${participation.id}/check-in`, {
    headers: { Origin: baseURL! },
    data: { note: 'Trying a duplicate check-in must never advance progress.' },
  });
  expect(duplicate.status()).toBe(409);
  const ledger = await (await tester.request.get('/api/wallet')).json();
  expect(ledger.paidCents).toBe(0);
  await testerContext.close();
});

test('private API reads reject anonymous callers and live checkout fails closed', async ({
  request,
  page,
}) => {
  expect((await request.get('/api/wallet')).status()).toBe(401);
  expect((await request.get('/api/dashboard')).status()).toBe(401);
  const c = await (await request.get('/api/capabilities')).json();
  expect(c.livePayments).toBe(false);
  expect(c.mode).toBe('sandbox');
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).database).toBe('connected');
});
