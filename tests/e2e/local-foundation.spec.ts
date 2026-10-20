import { expect, test } from '@playwright/test';

test('consulta exemplos reais pela API na mesma origem', async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await request.get('/api/trpc/public.list');
  expect(response.ok()).toBe(true);
  const { result } = await response.json();
  expect(result.data.items).toHaveLength(3);
  const browserResponse = page.waitForResponse(
    (value) => value.url().includes('/api/trpc/public.list') && value.ok(),
  );
  await page.goto('/referência');
  const fetched = await browserResponse;
  expect(new URL(fetched.url()).origin).toBe(new URL(page.url()).origin);
  await expect(page.getByTestId('api-status')).toHaveText('API conectada');
  await expect(page.getByTestId('public-record')).toHaveCount(result.data.items.length);
  for (const item of result.data.items) {
    await expect(page.getByTestId('public-record').filter({ hasText: item.title })).toContainText(
      item.description,
    );
  }
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('renova-overview-desktop.png'),
    fullPage: true,
  });
});

test('apresenta carregamento antes da resposta real', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/trpc/public.list*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/referência');
  await expect(page.getByTestId('records-loading')).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText('Conectando');
  release();
  await expect(page.getByTestId('public-record')).toHaveCount(3);
  await expect(page.getByTestId('records-loading')).toHaveCount(0);
});

test('recupera uma falha de rede com nova consulta real', async ({ page }) => {
  let fail = true;
  await page.route('**/api/trpc/public.list*', async (route) => {
    if (fail) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/referência');
  await expect(page.getByTestId('records-error')).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText('Conexão indisponível');
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByTestId('public-record')).toHaveCount(3);
  await expect(page.getByTestId('records-error')).toHaveCount(0);
});

test('apresenta estado vazio com resposta simulada explicita', async ({ page }) => {
  await page.route('**/api/trpc/public.list*', (route) =>
    route.fulfill({ json: { result: { data: { items: [], nextCursor: null } } } }),
  );
  await page.goto('/referência');
  await expect(page.getByTestId('records-empty')).toHaveText(
    'Nenhum exemplo público por aqui ainda.',
  );
  await expect(page.getByTestId('public-record')).toHaveCount(0);
  await expect(page.getByTestId('api-status')).toHaveText('API conectada');
});

test('trata texto recebido como texto com resposta simulada explicita', async ({ page }) => {
  const title = '<img src=x onerror=alert(1)>';
  await page.route('**/api/trpc/public.list*', (route) =>
    route.fulfill({
      json: {
        result: {
          data: {
            items: [{ id: 'synthetic-xss', title, description: 'Conteúdo de teste controlado.' }],
            nextCursor: null,
          },
        },
      },
    }),
  );
  await page.goto('/referência');
  await expect(page.getByTestId('public-record').getByRole('heading')).toHaveText(title);
  await expect(page.getByTestId('public-record').locator('img')).toHaveCount(0);
});

test('mantem perfil publico somente leitura sem controles de conta', async ({ page, request }) => {
  await page.goto('/referência');
  await expect(page.getByText('Acesso público', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar|cadastrar|salvar|excluir/i })).toHaveCount(
    0,
  );
  const response = await request.post('/api/trpc/public.list', { data: {} });
  expect(response.status()).toBe(405);
  await expect(page.getByTestId('public-record')).toHaveCount(3);
});
