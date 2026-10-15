import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('English and Spanish discovery meet WCAG AA automated checks', async ({ page }) => {
  for (const locale of ['en', 'es']) {
    await page.goto(`/${locale}`);
    await expect(page.locator('.study-card')).toHaveCount(6);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([]);
  }
});
