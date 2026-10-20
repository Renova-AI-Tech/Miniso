import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareLocalDatabase, validateLocalProfile } from '../../scripts/db/local.mjs';
import { applyProject, planProject } from '../../scripts/project/generate.mjs';
import { diagnose } from '../../scripts/project/doctor.mjs';
import { runSetup } from '../../scripts/project/setup.mjs';

const roots: string[] = [];
const initial = {
  schemaVersion: 1,
  project: { slug: 'renova-local', displayName: 'Meu projeto' },
  profile: 'public',
  capabilities: [],
  initialTarget: 'local',
  origin: { templateVersion: '0.1.0-dev', sourceRevision: 'd0c2db9', uiVersion: '0.1.0-dev' },
};
const authenticated = { ...initial, profile: 'authenticated', capabilities: ['auth'] };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const runtime = {
  'apps/frontend/src/App.tsx': 'export const app = "authenticated";\n',
  'packages/auth/package.json': '{"name":"@renova/auth"}\n',
  'scripts/auth/provision.mjs': 'export const provision = true;\n',
  'pnpm-lock.yaml': 'auth-exact-lock\n',
};
async function file(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'renova-auth-composition-'));
  roots.push(root);
  await file(root, 'renova.project.json', JSON.stringify(initial));
  await file(root, 'package.json', JSON.stringify({ packageManager: 'pnpm@10.33.4' }));
  await file(root, 'apps/frontend/src/App.tsx', 'export const app = "public";\n');
  await file(root, 'apps/frontend/src/pages/HomePage.tsx', 'product-customization-sentinel');
  await file(root, 'pnpm-lock.yaml', 'public-exact-lock\n');
  const entries = [];
  for (const [path, content] of Object.entries(runtime)) {
    let beforeSha256 = null;
    try {
      beforeSha256 = hash(await readFile(join(root, path), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    entries.push({ path, beforeSha256 });
    await file(root, `templates/modules/auth/files/${path}`, content);
  }
  await file(
    root,
    'templates/modules/auth/recipe.json',
    JSON.stringify({ schemaVersion: 1, entries }),
  );
  return root;
}
async function snapshot(root: string) {
  const files: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(root.length + 1)] = hash(await readFile(path, 'utf8'));
    }
  }
  return files;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('planeja login sem I/O e publica receita exata antes do manifesto', async () => {
  const root = await fixture();
  const before = await snapshot(root);
  const plan = await planProject(root, authenticated);
  expect(await snapshot(root)).toEqual(before);
  expect(plan.files.map((entry: { path: string }) => entry.path)).toEqual([
    '.renova/auth-install.json',
    ...Object.keys(runtime).filter((path) => path !== 'packages/auth/package.json'),
    'packages/auth/package.json',
    'renova.project.json',
    '.renova/project-state.json',
  ]);
  await applyProject(plan);
  for (const [path, content] of Object.entries(runtime))
    expect(await readFile(join(root, path), 'utf8')).toBe(content);
  expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
    authenticated,
  );
  expect(await readFile(join(root, 'apps/frontend/src/pages/HomePage.tsx'), 'utf8')).toBe(
    'product-customization-sentinel',
  );
});

it('materializa login quando a pessoa edita o próprio manifesto antes do primeiro setup', async () => {
  const root = await fixture();
  await file(root, 'renova.project.json', JSON.stringify(authenticated));
  const result = await applyProject(await planProject(root, authenticated));
  expect(result.changedFiles).toContain('packages/auth/package.json');
  expect(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(runtime['pnpm-lock.yaml']);
});

it('preserva código e lockfile personalizados e recusa adicionar login depois do ambiente', async () => {
  for (const path of [
    'apps/frontend/src/App.tsx',
    'pnpm-lock.yaml',
    '.env',
    '.renova/db-state.json',
  ]) {
    const root = await fixture();
    await file(root, path, 'custom-content-sentinel');
    const before = await snapshot(root);
    if (path.startsWith('.'))
      await expect(planProject(root, authenticated)).rejects.toMatchObject({ code: 2 });
    else {
      const plan = await planProject(root, authenticated);
      expect(plan.canApply).toBe(false);
      expect(plan.conflicts).toContainEqual(
        expect.objectContaining({ path, code: 'CUSTOMIZED_AUTH_TARGET' }),
      );
      await expect(applyProject(plan)).rejects.toMatchObject({ code: 2 });
    }
    expect(await snapshot(root)).toEqual(before);
  }
});

it('repetir setup autenticado preserva customizações credenciais identidade e não copia receita', async () => {
  const root = await fixture();
  await applyProject(await planProject(root, authenticated));
  const handle = await prepareLocalDatabase(root);
  await file(root, 'apps/frontend/src/App.tsx', 'customized-authenticated-product');
  const before = await snapshot(root);
  const services = {
    prerequisites: async () => {},
    dependencies: async () => {},
    environment: prepareLocalDatabase,
    database: async () => {},
    migrations: async () => {},
    mail: async () => {},
  };
  expect((await runSetup(root, authenticated, { services })).exitCode).toBe(0);
  const after = await snapshot(root);
  for (const [path, content] of Object.entries(before)) expect(after[path]).toBe(content);
  expect((await prepareLocalDatabase(root)).env).toEqual(handle.env);
  expect((await planProject(root, authenticated)).files).toHaveLength(2);
  await expect(planProject(root, initial)).rejects.toMatchObject({ code: 2 });
});

it('clone de produto autenticado sem estado ignorado preserva código customizado', async () => {
  const root = await fixture();
  await applyProject(await planProject(root, authenticated));
  await rm(join(root, '.renova'), { recursive: true });
  await file(root, 'apps/frontend/src/App.tsx', 'customized-committed-product');
  const plan = await planProject(root, authenticated);
  expect(plan.canApply).toBe(true);
  expect(plan.files.map((entry: { path: string }) => entry.path)).toEqual([
    'renova.project.json',
    '.renova/project-state.json',
  ]);
  await applyProject(plan);
  expect(await readFile(join(root, 'apps/frontend/src/App.tsx'), 'utf8')).toBe(
    'customized-committed-product',
  );
  await expect(planProject(root, initial)).rejects.toMatchObject({ code: 2 });
});

it.each(['environment-published', 'state-published'])(
  'retoma setup com login interrompido em %s sem trocar credenciais',
  async (checkpoint) => {
    const root = await fixture();
    await applyProject(await planProject(root, authenticated));
    await expect(
      prepareLocalDatabase(root, {
        onCheckpoint: async (step: string) => {
          if (step === checkpoint) throw new Error('Interrupção sintética');
        },
      }),
    ).rejects.toThrow('Interrupção sintética');
    const environment = await readFile(join(root, '.env'), 'utf8');
    const state = await readFile(join(root, '.renova/db-setup.pending/state.json'), 'utf8');
    await applyProject(await planProject(root, authenticated));
    await prepareLocalDatabase(root);
    expect(await readFile(join(root, '.env'), 'utf8')).toBe(environment);
    expect(await readFile(join(root, '.renova/db-state.json'), 'utf8')).toBe(state);
    expect((await lstat(join(root, '.env'))).nlink).toBe(1);
  },
);

it('retoma arquivos parciais comprovados mas recusa cair no perfil público', async () => {
  const root = await fixture();
  await file(
    root,
    '.renova/auth-install.json',
    `${JSON.stringify({ schemaVersion: 1, profile: 'authenticated' })}\n`,
  );
  await file(root, 'apps/frontend/src/App.tsx', runtime['apps/frontend/src/App.tsx']);
  const before = await snapshot(root);
  await expect(planProject(root, initial)).rejects.toMatchObject({ code: 2 });
  expect(await snapshot(root)).toEqual(before);
  await applyProject(await planProject(root, authenticated));
  expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
    authenticated,
  );
});

it('SIGKILL após código publicado mantém manifesto público bloqueado e permite retomar login', async () => {
  const root = await fixture();
  const killed = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const rename = fs.rename;
    fs.rename = async (...args) => {
      const result = await rename(...args);
      if (String(args[1]).endsWith('/apps/frontend/src/App.tsx')) process.kill(process.pid, 'SIGKILL');
      return result;
    };
    syncBuiltinESMExports();
    const { applyProject, planProject } = await import(process.argv[1]);
    await applyProject(await planProject(process.argv[2], JSON.parse(process.argv[3])));
  `,
      new URL('../../scripts/project/generate.mjs', import.meta.url).href,
      root,
      JSON.stringify(authenticated),
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  expect(killed.signal).toBe('SIGKILL');
  expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(initial);
  expect(await readFile(join(root, 'apps/frontend/src/App.tsx'), 'utf8')).toBe(
    runtime['apps/frontend/src/App.tsx'],
  );
  await expect(planProject(root, initial)).rejects.toMatchObject({ code: 2 });
  await applyProject(await planProject(root, authenticated));
  expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
    authenticated,
  );
  for (const [path, content] of Object.entries(runtime))
    expect(await readFile(join(root, path), 'utf8')).toBe(content);
});

it('reconhece hardlink de publicação interrompida sem aceitar hardlink arbitrário', async () => {
  const root = await fixture();
  await file(
    root,
    '.renova/auth-install.json',
    `${JSON.stringify({ schemaVersion: 1, profile: 'authenticated' })}\n`,
  );
  const stage = '.renova/.project-stage-ABC123/1';
  await file(root, stage, runtime['packages/auth/package.json']);
  await mkdir(join(root, 'packages/auth'), { recursive: true });
  await link(join(root, stage), join(root, 'packages/auth/package.json'));
  await applyProject(await planProject(root, authenticated));
  expect((await lstat(join(root, 'packages/auth/package.json'))).nlink).toBe(1);
  const unsafe = await fixture();
  await file(unsafe, 'outside.txt', runtime['packages/auth/package.json']);
  await mkdir(join(unsafe, 'packages/auth'), { recursive: true });
  await link(join(unsafe, 'outside.txt'), join(unsafe, 'packages/auth/package.json'));
  await expect(planProject(unsafe, authenticated)).rejects.toMatchObject({ code: 2 });
});

it('recusa caminho fora do clone symlink ancestral e receita alterada após o plano', async () => {
  const root = await fixture();
  const outside = await fixture();
  await symlink(outside, join(root, 'packages'));
  const before = await snapshot(outside);
  await expect(planProject(root, authenticated)).rejects.toMatchObject({ code: 2 });
  expect(await snapshot(outside)).toEqual(before);
  await rm(join(root, 'packages'));
  const plan = await planProject(root, authenticated);
  await file(root, 'templates/modules/auth/files/pnpm-lock.yaml', 'changed-after-plan');
  await expect(applyProject(plan)).rejects.toMatchObject({ code: 2 });
  await file(
    root,
    'templates/modules/auth/recipe.json',
    JSON.stringify({ schemaVersion: 1, entries: [{ path: '../outside', beforeSha256: null }] }),
  );
  await expect(planProject(root, authenticated)).rejects.toMatchObject({ code: 2 });
});

it('gera email e segredo somente no perfil com login e mantém portas e bancos independentes', async () => {
  const publicRoot = await fixture();
  const authRoot = await fixture();
  await applyProject(await planProject(authRoot, authenticated));
  const plain = await prepareLocalDatabase(publicRoot);
  const auth = await prepareLocalDatabase(authRoot);
  expect(Object.keys(plain.env).some((name) => /^(AUTH_|SMTP_|MAILPIT_)/.test(name))).toBe(false);
  expect(auth.env.AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/);
  expect(auth.env.SMTP_HOST).toBe('127.0.0.1');
  expect(auth.env.RENOVA_DB_PROJECT_ID).not.toBe(plain.env.RENOVA_DB_PROJECT_ID);
  expect(auth.env.DATABASE_URL).not.toBe(plain.env.DATABASE_URL);
  expect(
    new Set([
      auth.env.PORT,
      auth.env.POSTGRES_HOST_PORT,
      new URL(auth.env.FRONTEND_URL).port,
      auth.env.SMTP_PORT,
      auth.env.MAILPIT_PORT,
    ]).size,
  ).toBe(5);
  expect(() => validateLocalProfile({ ...auth.env, PROFILE: 'public' }, 'authenticated')).toThrow();
  expect(() =>
    validateLocalProfile({ ...auth.env, SMTP_HOST: 'mail.example.com' }, 'authenticated'),
  ).toThrow();
});

it('diagnóstico verifica caixa local sem ler mensagens nem alterar arquivos', async () => {
  const root = await fixture();
  await applyProject(await planProject(root, authenticated));
  const handle = await prepareLocalDatabase(root);
  const before = await snapshot(root);
  let mailChecks = 0;
  const probes = {
    nodeVersion: '24.0.0',
    run: async (command: string) => ({ stdout: command === 'pnpm' ? '10.33.4' : 'available' }),
    dependencies: async () => {},
    database: async () => true,
    port: async () => 'free',
    mailbox: async () => {
      mailChecks++;
      return true;
    },
  };
  expect((await diagnose(root, probes)).exitCode).toBe(0);
  expect(mailChecks).toBe(1);
  const failed = await diagnose(root, {
    ...probes,
    mailbox: async () => {
      throw new Error(`private-${handle.env.AUTH_SECRET}`);
    },
  });
  expect(failed.exitCode).toBe(1);
  expect(failed.checks.find((entry: { id: string }) => entry.id === 'mail')?.status).toBe('failed');
  expect(JSON.stringify(failed)).not.toContain(handle.env.AUTH_SECRET);
  expect(await snapshot(root)).toEqual(before);
});
