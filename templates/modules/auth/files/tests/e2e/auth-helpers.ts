import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { createDatabase } from '../../apps/backend/src/database.js';
import { parseEnv } from '../../apps/backend/src/env.js';
import { readTestEnvironment } from './env';

export const password = '  Minha frase privada de teste 2026  ';

export function testMigrator() {
  const environment = readTestEnvironment();
  const connection = new URL(environment.MIGRATION_DATABASE_URL ?? '');
  if (
    connection.hostname !== '127.0.0.1' ||
    connection.pathname !== new URL(environment.DATABASE_URL ?? '').pathname
  ) {
    throw new Error('The migrator must target the same disposable test database.');
  }
  return new pg.Pool({ connectionString: connection.href });
}

export async function resetAuthCounters() {
  // Cada jornada usa a política real. Só os contadores são isolados ENTRE casos no banco
  // descartável; tests/integration/auth.test.ts verifica abuso, concorrência e persistência.
  const pool = testMigrator();
  try {
    await pool.query('DELETE FROM public.auth_rate_limit; DELETE FROM public.auth_account_limits');
  } finally {
    await pool.end();
  }
}

export async function invite(name = 'Pessoa de teste') {
  const environment = readTestEnvironment();
  const email = `auth-${randomUUID()}@example.test`;
  const database = createDatabase(parseEnv(environment));
  try {
    await database.auth.invite(email, name);
  } finally {
    await database.close();
  }
  return { email, name, link: await emailLink(email) };
}

export async function emailLink(email: string, previous = '') {
  const environment = readTestEnvironment();
  let found = '';
  await expect
    .poll(
      async () => {
        const origin = `http://127.0.0.1:${environment.MAILPIT_PORT}`;
        const listing = await fetch(
          `${origin}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        if (!listing.ok) return false;
        const result = (await listing.json()) as { messages: { ID: string }[] };
        for (const message of result.messages) {
          const detail = await fetch(`${origin}/api/v1/message/${message.ID}`);
          const body = (await detail.json()) as { Text: string };
          const candidate = body.Text.match(
            /http:\/\/127\.0\.0\.1:\d+\/(?:ativar|redefinir-senha)\?token=[^\s<>]+/,
          )?.[0];
          if (candidate && candidate !== previous) {
            expect(new URL(candidate).origin).toBe(new URL(environment.FRONTEND_URL ?? '').origin);
            found = candidate;
            return true;
          }
        }
        return false;
      },
      { message: 'A mensagem real deve chegar ao Mailpit exclusivo deste teste.' },
    )
    .toBe(true);
  return found;
}

export async function activate(page: Page, link: string, chosenPassword = password) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Prepare seu acesso.' })).toBeVisible();
  await expect(page).toHaveURL(/\/ativar$/);
  await page.getByLabel('Nova senha', { exact: true }).fill(chosenPassword);
  await page.getByLabel('Repita a nova senha', { exact: true }).fill(chosenPassword);
  await page.getByRole('button', { name: 'Ativar acesso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tudo pronto para entrar' })).toBeVisible();
}

export async function login(page: Page, email: string, chosenPassword = password) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(chosenPassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('product-home')).toBeVisible();
}

export async function mutation(request: APIRequestContext, path: string, body: object) {
  const environment = readTestEnvironment();
  const csrf = await request.get('/api/auth/csrf');
  expect(csrf.ok()).toBe(true);
  const { token } = await csrf.json();
  return request.post(path, {
    data: body,
    headers: { origin: new URL(environment.FRONTEND_URL ?? '').origin, 'x-csrf-token': token },
  });
}
