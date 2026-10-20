import assert from 'node:assert/strict';

const [flag, value, ...extra] = process.argv.slice(2);
try {
  const origin = new URL(value);
  if (
    flag !== '--origin' ||
    extra.length ||
    origin.protocol !== 'https:' ||
    origin.origin !== value
  )
    throw new Error('Use pnpm deploy:verify --origin https://seu-app.up.railway.app');
  const get = (path) =>
    fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  for (const path of ['/health', '/ready']) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} não está saudável`);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  }
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  const html = await home.text();
  const script = html.match(/src="(\/assets\/[^"\s]+\.js)"/)?.[1];
  assert.ok(script, 'HTML sem build Vite');
  const asset = await get(script);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
  for (const path of [
    '/assets/renova-probe-missing.js',
    '/api/renova-probe-missing',
    '/.env',
    `${script}.map`,
  ]) {
    const response = await get(path);
    assert.equal(response.status, 404, `Caminho privado ou ausente acessível: ${path}`);
    assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/);
  }
  const reference = await get('/refer%C3%AAncia');
  assert.equal(reference.status, 200);
  assert.match(reference.headers.get('content-type') ?? '', /text\/html/);
  process.stdout.write(
    'HTTPS, processo, banco/identidade/schema, build, cache e isolamento de caminhos: OK.\n',
  );
  process.stdout.write(
    'Ainda valide a jornada no navegador. Este diagnóstico não prova entrega de email, recuperação de backup ou aceite humano.\n',
  );
} catch (error) {
  process.stderr.write(
    `Diagnóstico remoto falhou: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'confira a origem HTTPS e a disponibilidade do serviço.'}\n`,
  );
  process.exitCode = 1;
}
