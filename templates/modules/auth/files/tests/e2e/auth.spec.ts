import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  activate,
  emailLink,
  invite,
  login,
  mutation,
  password,
  resetAuthCounters,
  testMigrator,
} from './auth-helpers';

test.beforeEach(resetAuthCounters);

test('convite real ativa acesso, preserva senha, abre guia e sai por teclado em mobile', async ({
  page,
}, testInfo) => {
  const account = await invite();
  await page.setViewportSize({ width: 390, height: 844 });
  await activate(page, account.link);
  await page.getByRole('link', { name: 'Ir para entrar' }).click();
  await page.getByLabel('E-mail', { exact: true }).focus();
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  await page.keyboard.type(password);
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue(password);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('product-home')).toBeVisible();
  await expect(page.getByRole('main')).toHaveAccessibleName(/\S/);
  await expect(
    page.getByRole('list', { name: 'Primeiros passos' }).getByRole('listitem'),
  ).toHaveCount(3);
  await expect(page.getByRole('navigation', { name: 'Sua conta' })).toContainText(account.name);
  const help = page.getByText('Onde editar e como verificar o ambiente', { exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('pnpm run doctor', { exact: true })).toBeVisible();
  await expect(
    page.getByText('apps/frontend/src/pages/HomePage.tsx', { exact: true }),
  ).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({ path: testInfo.outputPath(`auth-home-${width}.png`), fullPage: true });
  }
  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }));
  expect(storage).toEqual({ local: 0, session: 0 });
  const cookies = await page.context().cookies();
  const sessionCookies = cookies.filter((cookie) => cookie.name.includes('session'));
  expect(sessionCookies.length).toBeGreaterThan(0);
  expect(sessionCookies.every((cookie) => cookie.httpOnly && cookie.sameSite !== 'None')).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Minha área', exact: true }).click();
  await expect(page.getByTestId('private-area')).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByTestId('product-home')).toHaveCount(0);
  const session = await page.request.get('/api/auth/get-session');
  expect(await session.json()).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByTestId('product-home')).toHaveCount(0);
});

test('recuperacao por e-mail troca senha, revoga outra sessao e impede reutilizacao do link', async ({
  page,
  browser,
}) => {
  const account = await invite();
  await activate(page, account.link);
  await login(page, account.email);
  const otherContext = await browser.newContext({ baseURL: process.env.FRONTEND_URL });
  try {
    const other = await otherContext.newPage();
    await login(other, account.email);
    await page.goto('/recuperar');
    await page.getByLabel('E-mail', { exact: true }).fill(account.email);
    await page.getByRole('button', { name: 'Enviar instruções' }).click();
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
    const link = await emailLink(account.email, account.link);
    const replacement = 'Outra frase de acesso privada 2026';
    await page.goto(link);
    await page.getByLabel('Nova senha', { exact: true }).fill(replacement);
    await page.getByLabel('Repita a nova senha', { exact: true }).fill(replacement);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByRole('heading', { name: 'Tudo pronto para entrar' })).toBeVisible();
    await other.goto('/minha-area');
    await expect(other).toHaveURL(/\/entrar$/);
    await page.goto(link);
    await page.getByLabel('Nova senha', { exact: true }).fill(password);
    await page.getByLabel('Repita a nova senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(page.getByRole('alert')).toContainText('Este link não está disponível');
    await login(page, account.email, replacement);
  } finally {
    await otherContext.close();
  }
});

test('link expirado e token ausente explicam o proximo passo sem revelar token ou conta', async ({
  page,
}) => {
  const account = await invite();
  const pool = testMigrator();
  try {
    const expired = await pool.query(
      'UPDATE public.auth_verification SET "expiresAt" = CURRENT_TIMESTAMP - interval \'1 second\' WHERE value = (SELECT id FROM public.auth_user WHERE email = $1)',
      [account.email],
    );
    expect(expired.rowCount).toBe(1);
  } finally {
    await pool.end();
  }
  await page.goto(account.link);
  await page.getByLabel('Nova senha', { exact: true }).fill(password);
  await page.getByLabel('Repita a nova senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ativar acesso', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Este link não está disponível');
  await expect(page.locator('body')).not.toContainText(account.email);
  await expect(page.locator('body')).not.toContainText(
    new URL(account.link).searchParams.get('token') ?? 'MISSING',
  );
  await page.goto('/ativar');
  await expect(page.getByRole('alert')).toContainText('Abra o link completo');
  await expect(page.getByRole('link', { name: 'Solicitar novo link' })).toBeVisible();
});

test('anonimo nao acessa produto ou API privada e nao encontra cadastro publico', async ({
  page,
  request,
}) => {
  for (const path of ['/', '/minha-area']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByTestId('private-area')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /cadastrar|criar conta/i })).toHaveCount(0);
  }
  const denied = await request.get('/api/trpc/records.list?input=%7B%7D');
  expect(denied.status()).toBe(401);
  const signup = await mutation(request, '/api/auth/sign-up/email', {
    email: 'public@example.test',
    password,
    name: 'Sem convite',
  });
  expect(signup.status()).toBe(404);
  await page.goto('/recuperar');
  await page.getByLabel('E-mail', { exact: true }).fill(`absent-${randomUUID()}@example.test`);
  await page.getByRole('button', { name: 'Enviar instruções' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Se houver uma conta liberada');
});

test('duas pessoas criam e editam apenas os proprios registros', async ({
  page,
  browser,
}, testInfo) => {
  const first = await invite('Primeira pessoa');
  await activate(page, first.link);
  await login(page, first.email);
  await page.getByRole('link', { name: 'Minha área', exact: true }).click();
  await expect(page.getByTestId('private-empty')).toBeVisible();
  await page.getByLabel('Título do registro').fill('Ideia privada da primeira pessoa');
  await page.getByRole('button', { name: 'Adicionar registro' }).click();
  await expect(page.getByTestId('private-record')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar Ideia privada da primeira pessoa' }).click();
  await expect(page.getByLabel('Editar título')).toBeFocused();
  await page.getByLabel('Editar título').fill('Ideia revisada da primeira pessoa');
  await page.getByRole('button', { name: 'Salvar alteração' }).click();
  await expect(page.getByTestId('private-record')).toContainText(
    'Ideia revisada da primeira pessoa',
  );
  const original = await page.request.get('/api/trpc/records.list?input=%7B%7D');
  const originalBody = await original.json();
  const id = originalBody.result.data.items[0].id;
  const secondContext = await browser.newContext({ baseURL: process.env.FRONTEND_URL });
  try {
    const other = await secondContext.newPage();
    const second = await invite('Segunda pessoa');
    await activate(other, second.link);
    await login(other, second.email);
    await other.goto('/minha-area');
    await expect(other.getByTestId('private-empty')).toBeVisible();
    await expect(other.locator('body')).not.toContainText('Ideia revisada da primeira pessoa');
    const denied = await mutation(other.request, '/api/trpc/records.update', {
      id,
      title: 'Tentativa indevida',
    });
    expect(denied.status()).toBe(404);
    await other.getByLabel('Título do registro').fill('Ideia privada da segunda pessoa');
    await other.getByRole('button', { name: 'Adicionar registro' }).click();
    await expect(other.getByTestId('private-record')).toHaveCount(1);
    await expect(other.getByTestId('private-record')).toContainText(
      'Ideia privada da segunda pessoa',
    );
    await page.reload();
    await expect(page.getByTestId('private-record')).toHaveCount(1);
    await expect(page.getByTestId('private-record')).toContainText(
      'Ideia revisada da primeira pessoa',
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: testInfo.outputPath(`private-area-${width}.png`),
        fullPage: true,
      });
    }
  } finally {
    await secondContext.close();
  }
});

test('rede indisponivel nao libera acesso e permite tentar novamente com API real', async ({
  page,
}) => {
  const account = await invite();
  await activate(page, account.link);
  await login(page, account.email);
  let failSession = true;
  await page.route('**/api/auth/get-session*', (route) =>
    failSession ? route.abort('failed') : route.continue(),
  );
  await page.goto('/minha-area');
  await expect(page.getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(page.getByTestId('private-area')).toHaveCount(0);
  failSession = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByTestId('private-empty')).toBeVisible();
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/trpc/records.list*', async (route) => {
    await waiting;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByTestId('private-loading')).toBeVisible();
  release();
  await expect(page.getByTestId('private-empty')).toBeVisible();
});

test('falha de login preserva o formulario e permite corrigir a senha', async ({
  page,
}, testInfo) => {
  const account = await invite();
  await activate(page, account.link);
  await page.goto('/entrar');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill('Uma senha incorreta longa 2026');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confira o e-mail e a senha');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(account.email);
  await expect(page.getByTestId('product-home')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('login-error-mobile.png'), fullPage: true });
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('product-home')).toBeVisible();
});

test('senha longa nao e truncada e confirmacao divergente pode ser corrigida', async ({ page }) => {
  const account = await invite();
  await page.goto(account.link);
  const tooLong = 'x'.repeat(129);
  await page.getByLabel('Nova senha', { exact: true }).fill(tooLong);
  await page.getByLabel('Repita a nova senha', { exact: true }).fill(tooLong);
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveValue(tooLong);
  await page.getByRole('button', { name: 'Ativar acesso', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('15 a 128 caracteres');
  await page.getByLabel('Nova senha', { exact: true }).fill(password);
  await page
    .getByLabel('Repita a nova senha', { exact: true })
    .fill('Uma frase diferente para confirmar');
  await page.getByRole('button', { name: 'Ativar acesso', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('As senhas não são iguais');
  await page.getByLabel('Repita a nova senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ativar acesso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tudo pronto para entrar' })).toBeVisible();
});
