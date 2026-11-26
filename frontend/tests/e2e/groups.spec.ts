// E14, E15: email groups.
import { expect, test } from '@playwright/test';
import { backend, cleanBackend, createModule, uid, waitRunnerIdle } from './fixtures';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/email-groups');
  await waitRunnerIdle(page);
  await cleanBackend(page);
});

test('E14 adding "A@x.com, a@x.com, bad" shows an inline error, then adds one lower-cased address', async ({ page }) => {
  const g = await backend.post<{ id: number; name: string }>(page, '/email-groups', { name: `Sales ${uid()}`, emails: [] });
  await page.goto('/email-groups');
  const groupCard = page.getByRole('article', { name: g.name });
  const input = groupCard.getByLabel(`Add emails to ${g.name}`);

  await input.fill('A@x.com, a@x.com, bad');
  await groupCard.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(groupCard.getByText('Check these addresses: bad')).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');

  await input.fill('A@x.com, a@x.com');
  await groupCard.getByRole('button', { name: 'Add', exact: true }).click();
  const members = groupCard.getByRole('list', { name: `Members of ${g.name}` }).getByRole('listitem');
  await expect(members).toHaveCount(1);
  await expect(members.first()).toContainText('a@x.com');
  await expect(groupCard.getByText('Check these addresses')).toHaveCount(0);

  const saved = await backend.get<{ id: number; members: { email: string }[] }[]>(page, '/email-groups');
  expect(saved.find((x) => x.id === g.id)!.members.map((x) => x.email)).toEqual(['a@x.com']);
});

test('E15 deleting a group used by a module leaves the module with "None — alerts won’t send"', async ({ page }) => {
  const g = await backend.post<{ id: number; name: string }>(page, '/email-groups', { name: `Ops ${uid()}`, emails: ['ops@example.com'] });
  const m = await createModule(page, { emailGroupId: g.id });

  await page.goto('/email-groups');
  const groupCard = page.getByRole('article', { name: g.name });
  await expect(groupCard.getByText(`Used by ${m.name} (gtm)`)).toBeVisible();
  await groupCard.getByRole('button', { name: 'Rename' }).click();
  const d = page.getByRole('dialog', { name: 'Rename group' });
  await d.getByRole('button', { name: 'Delete group' }).click();
  await d.getByRole('button', { name: /Click again/ }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole('article', { name: g.name })).toHaveCount(0);

  await page.goto(`/modules?env=gtm&module=${m.id}`);
  await expect(page.getByRole('region', { name: 'Selected module' }).getByText('None — alerts won’t send')).toBeVisible();
});
