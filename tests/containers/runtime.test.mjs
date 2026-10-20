import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const image = `renova-template-container:${process.pid}`;
const name = `renova-template-container-${process.pid}`;
const sentinel = 'SENTINEL_RUNTIME_SECRET_MUST_NOT_REACH_BROWSER';
const runtime = {
  NODE_ENV: 'production',
  DEPLOY_TARGET: 'railway',
  PORT: '3000',
  HOST: '::',
  RAILWAY_PROJECT_ID: 'fa03c408-2461-4401-9de8-a25449b629e6',
  RAILWAY_ENVIRONMENT_ID: 'ef3aa4b0-c060-4607-9741-3cb8d1756360',
  RAILWAY_SERVICE_ID: 'cab41b9f-c6a0-4bd1-a7c6-e163544fe337',
  RENOVA_DB_NAME: 'railway',
  FRONTEND_URL: 'https://project.example.com',
  DATABASE_URL: `postgresql://renova_runtime:${sentinel}@postgres.railway.internal:5432/railway`,
  MIGRATION_DATABASE_URL: 'SENTINEL_MIGRATOR_MUST_NOT_REACH_APPLICATION',
  AUTH_SECRET: '5e09f1a3c8b647d210a7e4d9c32f68b0a97dc3e124658fb0c7ae93b56df81042',
  RESEND_API_KEY: `re_${sentinel}`,
  AUTH_EMAIL_FROM: 'test@example.com',
};
let origin;

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
    ...options,
  });
}

before(
  async () => {
    docker(['build', '-t', image, '.']);
    const flags = Object.entries(runtime).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    docker(['run', '-d', '--name', name, '-p', '127.0.0.1::3000', ...flags, image]);
    const published = docker(['port', name, '3000/tcp']).trim();
    assert.match(published, /^127\.0\.0\.1:\d+$/);
    origin = `http://${published}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(`${origin}/health`)).status === 200) return;
      } catch {
        // Startup is observed through the health endpoint, never assumed after a sleep.
      }
      await delay(100);
    }
    assert.fail(`Container did not become healthy: ${docker(['logs', name])}`);
  },
  { timeout: 180_000 },
);

after(() => {
  try {
    docker(['rm', '-f', name]);
  } finally {
    docker(['image', 'rm', image]);
  }
});

test('inicia backend compilado com configuracao validada', async () => {
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const ready = await fetch(`${origin}/ready`);
  assert.equal(ready.status, 503, 'Missing database must not report ready');
});

test('serve SPA, assets e API sem expor env ou sourcemap privado', async () => {
  const page = await fetch(`${origin}/refer%C3%AAncia`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /font-src 'self'(?:;|$)/);
  assert.ok(!html.includes(sentinel));
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, 'Built HTML must reference an actual asset');
  const asset = await fetch(`${origin}${script}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.ok(!(await asset.text()).includes(sentinel));
  const stylesheets = [...html.matchAll(/href="(\/assets\/[^"\s]+\.css)"/g)];
  assert.ok(stylesheets.length > 0, 'Built HTML must reference its stylesheet');
  for (const [, path] of stylesheets) {
    const stylesheet = await fetch(`${origin}${path}`);
    assert.equal(stylesheet.status, 200);
    const css = await stylesheet.text();
    const fonts = [...css.matchAll(/@font-face\{[^}]+\}/g)];
    assert.ok(fonts.length > 0, 'Built CSS must include the local fonts');
    for (const [font] of fonts) {
      const source = font.match(/src:url\(["']?([^"')]+)["']?\)/)?.[1];
      assert.ok(source, 'Every font must have a served source');
      assert.match(source, /^\/assets\/[^/?#]+\.woff2$/);
      const response = await fetch(`${origin}${source}`);
      assert.equal(response.status, 200, source);
      assert.match(response.headers.get('cache-control'), /immutable/);
      assert.ok((await response.arrayBuffer()).byteLength > 0, source);
    }
  }
  for (const path of ['/assets/missing.js', `${script}.map`, '/.env', '/api/missing']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    assert.ok(!(await response.text()).includes('<html'), path);
  }
});

test('imagem final preserva somente artefatos e dependencias de producao', () => {
  const check = `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync } from 'node:fs';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    for (const path of ['/app/.env', '/app/.git', '/app/.renova', '/app/tests', '/app/templates', '/app/apps/backend/src', '/app/packages/dbmigrator/src']) assert.equal(existsSync(path), false, path);
    for (const dependency of ['typescript', 'tsx', 'vitest', '@playwright/test']) assert.throws(() => require.resolve(dependency));
    await import('/app/apps/backend/dist/server/app.js');
    await import('/app/packages/dbmigrator/dist/index.js');
    await import('/app/scripts/deploy/predeploy.mjs');
    if (existsSync('/app/scripts/auth/invite-remote.mjs')) {
      const { runtimeDependencies } = await import('/app/scripts/auth/invite-remote.mjs');
      const runtime = await runtimeDependencies();
      assert.equal(typeof runtime.parseEnv, 'function');
      assert.equal(typeof runtime.createAuthService, 'function');
      assert.equal(typeof runtime.createClient, 'function');
    }
    assert.equal(process.getuid(), 1000);
    const applicationEnv = readFileSync('/proc/1/environ', 'utf8');
    assert.ok(!applicationEnv.includes('MIGRATION_DATABASE_URL='));
    assert.ok(!applicationEnv.includes('SENTINEL_MIGRATOR_MUST_NOT_REACH_APPLICATION'));
  `;
  docker(['exec', name, 'node', '--input-type=module', '-e', check]);
  const source = YAML.parse(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8'));
  const deployed = YAML.parse(
    docker(['exec', name, 'cat', '/app/apps/backend/node_modules/.pnpm/lock.yaml']),
  );
  for (const [key, pkg] of Object.entries(deployed.packages)) {
    if (key.includes('file:')) continue;
    assert.ok(source.packages[key], `Unpinned production dependency: ${key}`);
    assert.equal(pkg.resolution.integrity, source.packages[key].resolution.integrity, key);
  }
});

test('startup e predeploy invalidos falham sem publicar segredos', () => {
  for (const command of [[], ['node', 'scripts/deploy/predeploy.mjs']]) {
    let failure;
    try {
      docker(['run', '--rm', '-e', `DATABASE_URL=${sentinel}`, image, ...command], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.status, 1);
    assert.ok(!`${failure.stdout}${failure.stderr}`.includes(sentinel));
  }
});

test('SIGTERM encerra o runtime sem kill forcado', () => {
  docker(['stop', '--time', '10', name]);
  const state = JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]));
  assert.equal(state.Running, false);
  assert.equal(state.OOMKilled, false);
  assert.equal(state.ExitCode, 0);
});
