import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('protege a entrada do produto sem mostrar o guia antes de entrar', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta.' })).toBeVisible();
  await expect(page.getByTestId('product-home')).toHaveCount(0);
  await expect(page.getByTestId('private-area')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Referência de componentes' })).toHaveAttribute(
    'href',
    '/referência',
  );
  expect(requests.some((url) => url.includes('/api/auth/get-session'))).toBe(true);
  expect(
    requests.filter((url) => /public.list|records.list|ReferencePage|ReferenceGallery/.test(url)),
  ).toEqual([]);
});

test('abre referencia por Unicode, alias, codificacao e normalizacao apos atualizar', async ({
  page,
}) => {
  for (const pathname of ['/referência', '/referencia', '/refer%C3%AAncia/', '/refere%CC%82ncia']) {
    await page.goto(pathname);
    await expect(page.getByRole('heading', { name: /Sua próxima ideia/ })).toBeVisible();
    await expect(page.getByTestId('public-record')).toHaveCount(3);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Componentes' })).toBeVisible();
    await expect(page.getByTestId('public-record')).toHaveCount(3);
    await expect(page).toHaveTitle(/^Referência · /);
  }
});

test('exibe 404 sem catalogo e permite seguir para referencia ou raiz', async ({ page }) => {
  await page.goto('/pagina-inexistente');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByTestId('public-record')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('link', { name: 'Referência de componentes' }).click();
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toBeVisible();
  await page.goto('/referencia/nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Página inicial' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta.' })).toBeVisible();
});

test('usa bytes da logo oficial com proporcao preservada em desktop e mobile', async ({
  page,
  request,
}, testInfo) => {
  const asset = await request.get('/renova-logo.png');
  expect(asset.ok()).toBe(true);
  expect(
    createHash('sha256')
      .update(await asset.body())
      .digest('hex'),
  ).toBe('8b92fc666951122ac121492678da6e315df78c727ad562ceb6ed5532d4fd55c7');
  await page.goto('/referência');
  const logo = page.getByRole('img', { name: 'Renova Consulting Group' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', '/renova-logo.png');
    const dimensions = await logo.evaluate((element) => {
      const image = element as HTMLImageElement;
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: image.width,
        height: image.height,
      };
    });
    expect(dimensions.naturalWidth).toBe(2846);
    expect(dimensions.naturalHeight).toBe(660);
    expect(dimensions.width / dimensions.height).toBeCloseTo(2846 / 660, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('tab', { name: 'Componentes' }).click();
  await expect(page.getByTestId('component-gallery')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('renova-reference-gallery-desktop.png'),
    fullPage: true,
  });
});
