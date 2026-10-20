import { spawnSync } from 'node:child_process';
import { link, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareLocalDatabase } from '../../scripts/db/local.mjs';
import { applyProject, planProject } from '../../scripts/project/generate.mjs';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, link: vi.fn(actual.link) };
});

const initial = {
  schemaVersion: 1,
  project: { slug: 'renova-local', displayName: 'Meu projeto Renova' },
  profile: 'public',
  capabilities: [],
  initialTarget: 'local',
  origin: { templateVersion: '0.1.0-dev', sourceRevision: 'd0c2db9', uiVersion: '0.1.0-dev' },
};
const requested = {
  ...initial,
  project: { slug: 'meu-projeto', displayName: 'Meu projeto' },
};
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'renova-generation-'));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), `${JSON.stringify(initial, null, 2)}\n`);
  await mkdir(join(root, '.git'));
  await writeFile(join(root, '.git/index'), 'git-index-sentinel');
  await mkdir(join(root, 'apps/frontend/src'), { recursive: true });
  await writeFile(join(root, 'apps/frontend/src/product.ts'), 'customized-product-sentinel');
  return root;
}
async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(root.length + 1)] = await readFile(path, 'utf8');
    }
  }
  return files;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local project generation (REQ-003, REQ-005, REQ-018, REQ-036, REQ-037)', () => {
  it('planeja somente identidade sem escrever arquivos ou expor caminhos absolutos', async () => {
    const root = await fixture();
    const before = await snapshot(root);
    const plan = await planProject(root, requested);
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(root)).not.toContain('.renova');
    expect(plan).toMatchObject({ status: 'planned', canApply: true, profile: 'public' });
    expect(plan.files.map((file: { path: string }) => file.path)).toEqual([
      'renova.project.json',
      '.renova/project-state.json',
    ]);
    expect(JSON.stringify(plan)).not.toContain(root);
    expect(JSON.stringify(plan)).not.toContain('git-index-sentinel');
  });

  it('gera perfil e preserva customizacoes em conflito', async () => {
    const root = await fixture();
    await applyProject(await planProject(root, requested));
    const config = JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'));
    expect(config).toEqual(requested);
    expect(await readFile(join(root, 'apps/frontend/src/product.ts'), 'utf8')).toBe(
      'customized-product-sentinel',
    );
    expect(await readFile(join(root, '.git/index'), 'utf8')).toBe('git-index-sentinel');
    await writeFile(join(root, 'renova.project.json'), JSON.stringify(initial));
    const before = await snapshot(root);
    const conflict = await planProject(root, requested);
    expect(conflict.canApply).toBe(false);
    expect(conflict.conflicts).toEqual([
      expect.objectContaining({ path: 'renova.project.json', code: 'MANAGED_FILE_CHANGED' }),
    ]);
    await expect(applyProject(conflict)).rejects.toMatchObject({ code: 2 });
    expect(await snapshot(root)).toEqual(before);
  });

  it('reaplica de forma idempotente preservando segredos e estado do banco', async () => {
    const root = await fixture();
    await applyProject(await planProject(root, requested));
    await writeFile(join(root, '.env'), 'DATABASE_URL=secret-sentinel\n');
    await writeFile(join(root, '.renova/db-state.json'), '{"projectId":"db-sentinel"}\n');
    const before = await snapshot(root);
    const result = await applyProject(await planProject(root, requested));
    expect(result.changedFiles).toEqual([]);
    expect(result.unchangedFiles).toEqual(['renova.project.json', '.renova/project-state.json']);
    expect(await snapshot(root)).toEqual(before);
  });

  it('recusa configuracao invalida e recursos futuros antes de qualquer escrita', async () => {
    const root = await fixture();
    const before = await snapshot(root);
    for (const config of [
      { ...requested, password: 'secret-sentinel' },
      { ...requested, project: { ...requested.project, slug: '../escape' } },
      { ...requested, profile: 'authenticated', capabilities: ['auth'] },
      { ...requested, initialTarget: 'railway' },
      { ...requested, origin: { ...requested.origin, sourceRevision: 'abcdef0' } },
    ]) {
      await expect(planProject(root, config)).rejects.toMatchObject({ code: 2 });
    }
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(root)).not.toContain('.renova');
  });

  it('recusa symlink no manifesto e no diretorio de estado sem alterar destino', async () => {
    const root = await fixture();
    const outside = await fixture();
    const outsideBefore = await snapshot(outside);
    await rm(join(root, 'renova.project.json'));
    await symlink(join(outside, 'renova.project.json'), join(root, 'renova.project.json'));
    await expect(planProject(root, requested)).rejects.toMatchObject({ code: 2 });
    await rm(join(root, 'renova.project.json'));
    await writeFile(join(root, 'renova.project.json'), JSON.stringify(initial));
    await symlink(outside, join(root, '.renova'));
    await expect(planProject(root, requested)).rejects.toMatchObject({ code: 2 });
    expect(await snapshot(outside)).toEqual(outsideBefore);
  });

  it('revalida hashes antes de aplicar e nao grava um plano obsoleto', async () => {
    const root = await fixture();
    const plan = await planProject(root, requested);
    await writeFile(join(root, 'renova.project.json'), JSON.stringify(initial));
    const before = await snapshot(root);
    await expect(applyProject(plan)).rejects.toMatchObject({ code: 2 });
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(root)).not.toContain('.renova');
  });

  it('recusa plano adulterado e detecta substituicao por symlink apos planejar', async () => {
    const root = await fixture();
    const outside = await fixture();
    const plan = await planProject(root, requested);
    await expect(applyProject({ ...plan, files: [] })).rejects.toMatchObject({ code: 2 });
    expect(Object.isFrozen(plan)).toBe(true);
    await symlink(outside, join(root, '.renova'));
    const outsideBefore = await snapshot(outside);
    await expect(applyProject(plan)).rejects.toMatchObject({ code: 2 });
    expect(await snapshot(outside)).toEqual(outsideBefore);
    expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(initial);
  });

  it('permite nome de exibicao mas protege slug quando ha banco ou ambiente local', async () => {
    const root = await fixture();
    await writeFile(join(root, '.env'), 'DATABASE_URL=secret-sentinel\n');
    await expect(planProject(root, requested)).rejects.toMatchObject({ code: 2 });
    const renamed = {
      ...initial,
      project: { ...initial.project, displayName: 'Nome alterado sem recriar banco' },
    };
    await applyProject(await planProject(root, renamed));
    expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(renamed);
    expect(await readFile(join(root, '.env'), 'utf8')).toBe('DATABASE_URL=secret-sentinel\n');
  });

  it('nao retoma estado adulterado nem mostra seu conteudo no erro', async () => {
    const root = await fixture();
    await mkdir(join(root, '.renova'));
    await writeFile(join(root, '.renova/project-state.json'), '{"token":"secret-sentinel"}');
    const before = await snapshot(root);
    const plan = await planProject(root, requested);
    expect(plan.canApply).toBe(false);
    expect(JSON.stringify(plan)).not.toContain('secret-sentinel');
    await expect(applyProject(plan)).rejects.toMatchObject({ code: 2 });
    expect(await snapshot(root)).toEqual(before);
  });

  it('aceita raiz canonica acessada por symlink sem gerar arquivos fora do clone', async () => {
    const root = await fixture();
    const container = await mkdtemp(join(tmpdir(), 'renova-root-link-'));
    roots.push(container);
    const alias = join(container, 'clone');
    await symlink(root, alias);
    await applyProject(await planProject(alias, requested));
    expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
      requested,
    );
    expect(await readdir(container)).toEqual(['clone']);
  });

  it('desfaz somente os arquivos aplicados quando a gravacao do estado falha', async () => {
    const root = await fixture();
    const before = await snapshot(root);
    const plan = await planProject(root, requested);
    vi.mocked(link).mockRejectedValueOnce(new Error('operational-secret-sentinel'));
    await expect(applyProject(plan)).rejects.toMatchObject({ code: 1 });
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(root)).not.toContain('.renova');
    const resumed = await applyProject(await planProject(root, requested));
    expect(resumed.status).toBe('ready');
    expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
      requested,
    );
  });

  it('recusa remover identidade de um projeto autenticado mesmo pedindo perfil publico', async () => {
    const root = await fixture();
    await writeFile(
      join(root, 'renova.project.json'),
      JSON.stringify({ ...initial, profile: 'authenticated', capabilities: ['auth'] }),
    );
    const before = await snapshot(root);
    await expect(planProject(root, requested)).rejects.toMatchObject({ code: 2 });
    expect(await snapshot(root)).toEqual(before);
  });

  it('retoma apos SIGKILL entre manifesto atualizado e registro sem sobrescrever edicao', async () => {
    const root = await fixture();
    await applyProject(await planProject(root, requested));
    const renamed = {
      ...requested,
      project: { ...requested.project, displayName: 'Nome novo' },
    };
    const oldState = await readFile(join(root, '.renova/project-state.json'), 'utf8');
    const crashed = crashGeneration(root, renamed, 'rename', 'before');
    expect(crashed.signal).toBe('SIGKILL');
    expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(renamed);
    expect(await readFile(join(root, '.renova/project-state.json'), 'utf8')).toBe(oldState);
    const plan = await planProject(root, renamed);
    expect(plan.canApply).toBe(true);
    expect(
      plan.files.find((file: { path: string }) => file.path === 'renova.project.json').action,
    ).toBe('unchanged');
    expect(plan.nextActions.join(' ')).toContain('reconciliado');
    const applied = await applyProject(plan);
    expect(applied.changedFiles).toEqual(['.renova/project-state.json']);
    expect(await readFile(join(root, '.renova/project-state.json'), 'utf8')).not.toBe(oldState);
    expect((await planProject(root, requested)).canApply).toBe(true);
    await writeFile(join(root, 'renova.project.json'), JSON.stringify(initial));
    expect((await planProject(root, requested)).canApply).toBe(false);
  });

  it('retoma publicacao do registro interrompida depois do hardlink exclusivo', async () => {
    const root = await fixture();
    const crashed = crashGeneration(root, requested, 'link', 'after');
    expect(crashed.signal).toBe('SIGKILL');
    const before = await snapshot(root);
    const plan = await planProject(root, requested);
    expect(plan.canApply).toBe(true);
    const result = await applyProject(plan);
    expect(result.changedFiles).toEqual([]);
    expect(await readFile(join(root, 'renova.project.json'), 'utf8')).toBe(
      before['renova.project.json'],
    );
    expect(await readdir(join(root, '.renova'))).toEqual(['project-state.json']);
    expect((await planProject(root, requested)).canApply).toBe(true);
  });

  it('permite retomar apenas hardlinks comprovados da preparacao do proprio banco', async () => {
    const root = await fixture();
    await expect(
      prepareLocalDatabase(root, {
        onCheckpoint: async (step: string) => {
          if (step === 'state-published') throw new Error('interrupcao esperada');
        },
      }),
    ).rejects.toThrow('interrupcao esperada');
    const beforeEnv = await readFile(join(root, '.env'));
    const beforeDatabase = await readFile(join(root, '.renova/db-state.json'));
    const plan = await planProject(root, initial);
    expect(plan.canApply).toBe(true);
    await applyProject(plan);
    await prepareLocalDatabase(root);
    expect((await readFile(join(root, '.env'))).equals(beforeEnv)).toBe(true);
    expect((await readFile(join(root, '.renova/db-state.json'))).equals(beforeDatabase)).toBe(true);
    const other = await fixture();
    await link(join(root, '.env'), join(other, '.env'));
    await expect(planProject(other, initial)).rejects.toMatchObject({ code: 2 });
  });
});
function crashGeneration(root: string, config: object, method: string, moment: string) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import fs from 'node:fs/promises';
       import { syncBuiltinESMExports } from 'node:module';
       const method = process.argv[4];
       const original = fs[method];
       fs[method] = async (...args) => {
         if (!String(args[1]).endsWith('/.renova/project-state.json')) return original(...args);
         if (process.argv[5] === 'before') process.kill(process.pid, 'SIGKILL');
         const result = await original(...args);
         process.kill(process.pid, 'SIGKILL');
         return result;
       };
       syncBuiltinESMExports();
       const { planProject, applyProject } = await import(process.argv[1]);
       await applyProject(await planProject(process.argv[2], JSON.parse(process.argv[3])));`,
      pathToFileURL(resolve('scripts/project/generate.mjs')).href,
      root,
      JSON.stringify(config),
      method,
      moment,
    ],
    { encoding: 'utf8', timeout: 5_000 },
  );
}
