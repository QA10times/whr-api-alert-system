// E17: phone viewport — top bar navigation and no horizontal page scroll.
import { expect, test } from '@playwright/test';
import { backend, cleanBackend, createApi, createModule, uid, waitFirstRun, waitRunnerIdle } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('E17 mobile viewport 390 × 844 uses top bar navigation with no horizontal page scroll', async ({ page }) => {
  await page.goto('/?env=gtm');
  await waitRunnerIdle(page);
  await cleanBackend(page);
  const g = await backend.post<{ id: number }>(page, '/email-groups', { name: `Mobile ${uid()}`, emails: ['someone.with.a.long.address@example.com'] });
  const m = await createModule(page, { emailGroupId: g.id, name: `A module with a fairly long name ${uid()}` });
  const api = await createApi(page, m.id, { name: `An API whose name is long enough to wrap ${uid()}`, endpoint: `/api/v1/events/search?q=${'x'.repeat(60)}` });
  await waitFirstRun(page, [api.id]);

  for (const path of ['/?env=gtm', '/modules?env=gtm', '/email-groups']) {
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    const box = (await nav.boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(1); // a bar across the top, not a side rail
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(box.height).toBeLessThan(120);
    for (const name of ['Monitor', 'Modules', 'Email groups']) await expect(nav.getByRole('link', { name })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `horizontal scroll on ${path}`).toBeLessThanOrEqual(innerWidth);
  }
});
