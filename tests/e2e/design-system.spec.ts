import { expect, test } from '@playwright/test';

test('carrega fontes e componentes sem CSS de outra aplicacao', async ({ page }) => {
  const fonts: string[] = [];
  const violations: string[] = [];
  page.on('response', (response) => {
    if (/\.woff2?(?:\?|$)/.test(response.url()) && response.ok()) fonts.push(response.url());
  });
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to execute/i.test(message.text()))
      violations.push(message.text());
  });
  const response = await page.goto('/referência');
  expect(response?.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/);
  await page.getByRole('tab', { name: 'Componentes' }).click();
  await expect(page.getByTestId('component-gallery')).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      sans: getComputedStyle(document.documentElement).fontFamily,
      display: getComputedStyle(document.querySelector('h1') as HTMLElement).fontFamily,
      families: [...document.fonts]
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family),
    };
  });
  expect(loaded.sans).toContain('Manrope Variable');
  expect(loaded.display).toContain('Playfair Display Variable');
  for (const name of [
    'Manrope Variable',
    'Playfair Display Variable',
    'Material Symbols Outlined',
  ]) {
    expect(loaded.families.some((family) => family.includes(name))).toBe(true);
  }
  expect(fonts.length).toBeGreaterThanOrEqual(3);
  expect(fonts.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(violations).toEqual([]);
});

test('navega por teclado e opera checkbox e switch', async ({ page }) => {
  await page.goto('/referência');
  await page.getByRole('tab', { name: 'Visão geral' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Componentes' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Componentes' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await page.getByRole('button', { name: 'Explorar componentes' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Componentes' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Componentes' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('checkbox', { name: 'Selecionar exemplo' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Selecionar exemplo' })).toBeChecked();
  await expect(page.getByTestId('choice-preview')).toContainText('Exemplo selecionado');
  await page.getByRole('switch', { name: 'Exibição compacta' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Exibição compacta' })).toBeChecked();
  await expect(page.getByTestId('choice-preview')).toContainText('Visualização compacta.');
  await page.getByLabel('Nome de exemplo', { exact: true }).fill('Minha ideia');
  await expect(page.getByLabel('Nome de exemplo', { exact: true })).toHaveValue('Minha ideia');
});

test('contem foco no painel e restaura ao fechar por Esc', async ({ page }) => {
  await page.goto('/referência');
  await page.getByRole('tab', { name: 'Componentes' }).click();
  const trigger = page.getByRole('button', { name: 'Abrir painel', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Espaço para os detalhes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fechar painel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Voltar à galeria' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Fechar painel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Abrir diálogo' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Uma pausa para confirmar' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à galeria' }).click();
  await expect(page.getByRole('button', { name: 'Abrir diálogo' })).toBeFocused();
});

test('mantem shell e galeria utilizaveis em 390 pixels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/referência');
  await expect(page.getByTestId('public-record')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath('renova-overview-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Componentes' }).click();
  await expect(page.getByRole('heading', { name: 'Uma linguagem em comum.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('renova-gallery-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Abrir painel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.getByRole('dialog').evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('button', { name: 'Abrir painel', exact: true })).toBeFocused();
});
