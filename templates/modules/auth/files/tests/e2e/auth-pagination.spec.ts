import { expect, test, type Request } from '@playwright/test';
import { activate, invite, login, resetAuthCounters, testMigrator } from './auth-helpers';

test.beforeEach(resetAuthCounters);

async function seedPagedRecords(email: string) {
  const pool = testMigrator();
  try {
    // Os 25 primeiros UUIDs v4 deixam qualquer novo UUID v4 sem colisão após a primeira página.
    for (let index = 0; index < 25; index++) {
      const id = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
      const result = await pool.query(
        'INSERT INTO public.owned_records (id, owner_id, title) SELECT $1, id, $3 FROM public.auth_user WHERE email = $2',
        [id, email, `Registro paginado ${String(index + 1).padStart(2, '0')}`],
      );
      expect(result.rowCount).toBe(1);
    }
  } finally {
    await pool.end();
  }
}

async function removePagedRecords(email: string) {
  const pool = testMigrator();
  try {
    await pool.query(
      'DELETE FROM public.owned_records WHERE owner_id = (SELECT id FROM public.auth_user WHERE email = $1)',
      [email],
    );
  } finally {
    await pool.end();
  }
}

test('confirma o registro salvo mesmo quando ele fica depois da primeira pagina', async ({
  page,
}) => {
  const account = await invite();
  await activate(page, account.link);
  await login(page, account.email);
  try {
    await seedPagedRecords(account.email);
    await page.goto('/minha-area');
    await expect(page.getByTestId('private-record')).toHaveCount(20);
    const title = 'Minha nova ideia depois dos primeiros vinte registros';
    await page.getByLabel('Título do registro').fill(title);
    await page.getByRole('button', { name: 'Adicionar registro' }).click();
    await expect(page.getByTestId('saved-record')).toHaveText(`Registro salvo: ${title}.`);
    await expect(page.getByTestId('private-loading')).toHaveCount(0);
    await expect(page.getByTestId('private-record')).toHaveCount(20);
    await expect(page.getByTestId('private-record').filter({ hasText: title })).toHaveCount(0);
    const persisted = await page.request.get('/api/trpc/records.list?input=%7B%7D');
    expect(persisted.ok()).toBe(true);
    const body = await persisted.json();
    expect(body.result.data.items).toHaveLength(26);
    expect(body.result.data.items.at(-1).title).toBe(title);
    await page.getByRole('button', { name: 'Carregar mais' }).click();
    await expect(page.getByTestId('private-record')).toHaveCount(26);
    await expect(page.getByTestId('private-record').filter({ hasText: title })).toHaveCount(1);
  } finally {
    await removePagedRecords(account.email);
  }
});

test('descarta pagina atrasada quando salvar atualiza a lista e preserva o cursor', async ({
  page,
}) => {
  const account = await invite();
  await activate(page, account.link);
  await login(page, account.email);
  let delayedRequest: Request | undefined;
  let release: () => void = () => {};
  let received: () => void = () => {};
  let delivered: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const responseReady = new Promise<void>((resolve) => {
    received = resolve;
  });
  const responseDelivered = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  try {
    await seedPagedRecords(account.email);
    await page.goto('/minha-area');
    await expect(page.getByTestId('private-record')).toHaveCount(20);
    await page.route('**/api/trpc/records.list*', async (route) => {
      const input = JSON.parse(new URL(route.request().url()).searchParams.get('input') ?? '{}');
      if (!input.cursor || delayedRequest) return route.continue();
      delayedRequest = route.request();
      const response = await route.fetch();
      received();
      await waiting;
      await route.fulfill({ response });
      delivered();
    });
    await page.getByRole('button', { name: 'Carregar mais' }).click();
    await responseReady;
    await expect(page.getByTestId('private-loading')).toBeVisible();
    await page.getByRole('button', { name: 'Editar Registro paginado 01', exact: true }).click();
    const title = 'Primeiro registro atualizado durante a paginação';
    await page.getByLabel('Editar título').fill(title);
    await page.getByRole('button', { name: 'Salvar alteração' }).click();
    await expect(page.getByTestId('saved-record')).toHaveText(`Registro salvo: ${title}.`);
    await expect(page.getByTestId('private-loading')).toHaveCount(0);
    await expect.poll(() => delayedRequest?.failure()?.errorText ?? '').toContain('ERR_ABORTED');
    release();
    await responseDelivered;
    await expect(page.getByTestId('private-record')).toHaveCount(20);
    await expect(page.getByTestId('private-record').first()).toContainText(title);
    await page.getByRole('button', { name: 'Carregar mais' }).click();
    await expect(page.getByTestId('private-record')).toHaveCount(25);
    await expect(
      page.getByTestId('private-record').filter({ hasText: 'Registro paginado 25' }),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Carregar mais' })).toHaveCount(0);
  } finally {
    release();
    await removePagedRecords(account.email);
  }
});
