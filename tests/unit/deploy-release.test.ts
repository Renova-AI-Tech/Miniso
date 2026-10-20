import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRelease, parseReleaseArgs, prepareRelease } from '../../scripts/deploy/release.mjs';

const execute = promisify(execFile);
const target = {
  project: '11111111-1111-1111-1111-111111111111',
  environment: '22222222-2222-2222-2222-222222222222',
  service: '33333333-3333-3333-3333-333333333333',
};
const timestamp = Date.parse('2026-10-20T12:00:00Z');
const roots: string[] = [];

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'renova-release-test-')));
  roots.push(root);
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await git('init', '-q');
  await git('config', 'user.name', 'Synthetic test');
  await git('config', 'user.email', 'test@example.invalid');
  await git('remote', 'add', 'origin', 'git@github.com:owner/example.git');
  await writeFile(join(root, '.gitignore'), '.renova\n.env\n');
  await writeFile(join(root, 'app.txt'), 'committed-source');
  await mkdir(join(root, '.railway'));
  await writeFile(join(root, '.railway/railway.ts'), '// synthetic IaC');
  await git('add', '.');
  await git('commit', '-qm', 'fixture');
  const sha = (await git('rev-parse', 'HEAD')).stdout.trim();
  const configTree = (await git('rev-parse', 'HEAD:.railway')).stdout.trim();
  const status = {
    id: target.project,
    services: { edges: [{ node: { id: target.service, name: 'app' } }] },
    environments: {
      edges: [
        {
          node: {
            id: target.environment,
            canAccess: true,
            serviceInstances: {
              edges: [
                {
                  node: {
                    serviceId: target.service,
                    serviceName: 'app',
                    environmentId: target.environment,
                  },
                },
              ],
            },
          },
        },
      ],
    },
  };
  const state = {
    status,
    plan: {
      kind: 'railway.config.plan',
      version: 1,
      sourceTree: configTree,
      environmentId: target.environment,
      destructive: false,
      changeSet: {
        partial: 'renova-app',
        declared: ['service.app'],
        changes: [
          {
            address: 'service.app',
            kind: 'resource.update',
            severity: 'safe',
            summary: 'Update app',
            before: { secret: 'DO_NOT_PRINT' },
            after: { secret: 'DO_NOT_PRINT' },
          },
        ],
      },
    },
    runs: [
      {
        databaseId: 12,
        headSha: sha,
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-10-20T11:00:00Z',
      },
    ],
    jobs: {
      total_count: 1,
      jobs: [{ name: 'required', head_sha: sha, status: 'completed', conclusion: 'success' }],
    },
    failApply: false,
    uploadFiles: [] as string[],
    uploadContent: '',
    planEnvironment: {} as NodeJS.ProcessEnv,
  };
  const calls: { program: string; args: string[]; cwd: string }[] = [];
  const runner = async (
    program: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ) => {
    calls.push({ program, args, cwd: options.cwd });
    if (['git', 'tar'].includes(program)) return execute(program, args, options);
    if (program === 'railway' && args[0] === 'link')
      return {
        stdout: JSON.stringify({
          projectId: target.project,
          environmentId: target.environment,
          serviceId: target.service,
        }),
      };
    if (program === 'railway' && args[0] === 'status')
      return { stdout: JSON.stringify(state.status) };
    if (program === 'railway' && args[0] === 'config' && args[1] === 'plan') {
      state.planEnvironment = options.env;
      await writeFile(args[args.indexOf('--out') + 1], JSON.stringify(state.plan));
      return { stdout: 'DO_NOT_PRINT' };
    }
    if (program === 'railway' && args[0] === 'config' && args[1] === 'apply') {
      if (state.failApply) throw new Error('DO_NOT_PRINT provider payload');
      return { stdout: 'DO_NOT_PRINT' };
    }
    if (program === 'railway' && args[0] === 'up') {
      state.uploadFiles = await readdir(options.cwd);
      state.uploadContent = await readFile(join(options.cwd, 'app.txt'), 'utf8');
      return { stdout: 'DO_NOT_PRINT' };
    }
    if (program === 'gh' && args[0] === 'run') return { stdout: JSON.stringify(state.runs) };
    if (program === 'gh' && args[0] === 'api') return { stdout: JSON.stringify(state.jobs) };
    throw new Error(`Unexpected synthetic command: ${program}`);
  };
  const options = { root, runner, now: () => timestamp };
  const mutated = () =>
    calls.some(
      ({ program, args }) => program === 'railway' && (args[0] === 'up' || args[1] === 'apply'),
    );
  return { root, sha, configTree, git, state, calls, options, mutated };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release Railway com plano fixado e CI do SHA exato', () => {
  it('SDK nativo verifica Railway, mesmo quando o wrapper herda o executável Node em _', async () => {
    const f = await fixture();
    const bin = join(f.root, '.renova/bin');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'railway'), "#!/bin/sh\nprintf '%s\\n' 'railway 5.45.10'\n", {
      mode: 0o700,
    });
    const sdk = new URL('../../node_modules/railway/dist/iac/index.js', import.meta.url).href;
    // Same native-evaluation markers as the installed SDK; only --version uses the stub CLI.
    const source = `const mod = await import(${JSON.stringify(sdk)}); const partial = mod.partial; const graph = {}; process.stdout.write(JSON.stringify({ partial, project: graph }));`;
    const evaluate = (env: NodeJS.ProcessEnv) =>
      execute(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '-e', source],
        { env: { ...env, PATH: `${bin}:${env.PATH ?? ''}` } },
      );
    vi.stubEnv('_', process.execPath);
    await expect(evaluate(process.env)).rejects.toMatchObject({
      stderr: expect.stringContaining('requires Railway CLI 5.42.1 or newer'),
    });
    const runner = async (
      program: string,
      args: string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => {
      if (program === 'railway' && args[0] === 'config' && args[1] === 'plan') {
        await evaluate(options.env);
      }
      return f.options.runner(program, args, options);
    };
    await expect(prepareRelease(target, { ...f.options, runner })).resolves.toMatchObject({
      sha: f.sha,
    });
    expect(f.state.planEnvironment._).toBe('railway');
  });

  it('prepara resumo sem payload e publica somente git archive após CI e plano', async () => {
    const f = await fixture();
    await writeFile(join(f.root, '.env'), 'ignored-secret');
    const plan = await prepareRelease(target, f.options);
    expect(f.configTree).not.toBe(f.sha);
    const planCommand = f.calls.find(({ args }) => args[0] === 'config' && args[1] === 'plan');
    expect(planCommand?.args[planCommand.args.indexOf('--source-tree') + 1]).toBe(f.configTree);
    expect(
      JSON.parse(await readFile(join(f.root, '.renova/railway/release.json'), 'utf8')),
    ).toMatchObject({ sha: f.sha, configTree: f.configTree });
    expect(JSON.stringify(plan)).not.toContain('DO_NOT_PRINT');
    expect(plan.changes).toEqual([
      { kind: 'resource.update', severity: 'safe', summary: 'Update app' },
    ]);
    expect(f.state.planEnvironment).toMatchObject({
      RENOVA_DEPLOY_PROJECT_ID: target.project,
      RENOVA_DEPLOY_ENVIRONMENT_ID: target.environment,
    });
    expect((await stat(join(f.root, '.renova/railway/release.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(plan.planPath)).mode & 0o777).toBe(0o600);
    expect(f.calls.some(({ program }) => program === 'gh')).toBe(false);
    expect(await applyRelease(target.project, f.options)).toMatchObject({ sha: f.sha, runId: 12 });
    expect(f.calls.find(({ args }) => args[0] === 'archive')?.args.at(-1)).toBe(f.sha);
    expect(f.state.uploadContent).toBe('committed-source');
    expect(f.state.uploadFiles).not.toContain('.env');
    expect(f.state.uploadFiles).not.toContain('.renova');
    expect(f.state.uploadFiles).not.toContain('.git');
    const upload = f.calls.find(({ args }) => args[0] === 'up');
    expect(upload?.args).toEqual([
      'up',
      '--project',
      target.project,
      '--environment',
      target.environment,
      '--service',
      target.service,
      '--detach',
    ]);
    expect(f.calls.some(({ args }) => args.includes('--confirm-destructive'))).toBe(false);
    expect(f.calls.find(({ args }) => args[1] === 'apply')?.args).toEqual([
      'config',
      'apply',
      '--plan',
      plan.planPath,
      '--yes',
    ]);
    expect(
      f.calls.find(({ program, args }) => program === 'gh' && args[0] === 'run')?.args,
    ).toContain(f.sha);
  });

  it.each(['tracked', 'untracked'])('recusa WIP %s antes de preparar ou aplicar', async (kind) => {
    const f = await fixture();
    await prepareRelease(target, f.options);
    await writeFile(
      join(f.root, kind === 'tracked' ? 'app.txt' : 'unfinished.txt'),
      'work in progress',
    );
    await expect(prepareRelease(target, f.options)).rejects.toThrow('WIP');
    await expect(applyRelease(target.project, f.options)).rejects.toThrow('WIP');
    expect(f.mutated()).toBe(false);
  });

  it.each(['project', 'environment', 'service'])('recusa destino %s divergente', async (field) => {
    const f = await fixture();
    await prepareRelease(target, f.options);
    if (field === 'project') f.state.status.id = target.service;
    if (field === 'environment') f.state.status.environments.edges[0].node.id = target.project;
    if (field === 'service')
      f.state.status.environments.edges[0].node.serviceInstances.edges[0].node.serviceId =
        target.project;
    await expect(applyRelease(target.project, f.options)).rejects.toThrow('binding');
    expect(f.mutated()).toBe(false);
  });

  it.each(['expired', 'future', 'digest', 'head', 'origin', 'confirmation'])(
    'recusa plano %s antes de escrever no provider',
    async (kind) => {
      const f = await fixture();
      await prepareRelease(target, f.options);
      if (kind === 'expired') f.options.now = () => timestamp + 31 * 60_000;
      if (kind === 'future') f.options.now = () => timestamp - 1;
      if (kind === 'digest')
        await writeFile(join(f.root, '.renova/railway/config.plan.json'), '{}');
      if (kind === 'head') await f.git('commit', '--allow-empty', '-qm', 'next commit');
      if (kind === 'origin')
        await f.git('remote', 'set-url', 'origin', 'https://github.com/owner/other.git');
      await expect(
        applyRelease(kind === 'confirmation' ? target.service : target.project, f.options),
      ).rejects.toThrow('Publicação recusada');
      expect(f.mutated()).toBe(false);
    },
  );

  it.each(['queued', 'failed', 'wrong-sha', 'missing', 'required-skipped', 'required-failed'])(
    'recusa CI %s, inclusive quando execução anterior está verde',
    async (kind) => {
      const f = await fixture();
      await prepareRelease(target, f.options);
      f.state.runs.push({ ...f.state.runs[0], databaseId: 13, createdAt: '2026-10-20T11:30:00Z' });
      if (kind === 'queued') f.state.runs[1].status = 'queued';
      if (kind === 'failed') f.state.runs[1].conclusion = 'failure';
      if (kind === 'wrong-sha') f.state.runs[1].headSha = 'a'.repeat(40);
      if (kind === 'missing') f.state.runs = [];
      if (kind === 'required-skipped') f.state.jobs.jobs[0].conclusion = 'skipped';
      if (kind === 'required-failed') f.state.jobs.jobs[0].conclusion = 'failure';
      await expect(applyRelease(target.project, f.options)).rejects.toThrow('CI');
      expect(f.mutated()).toBe(false);
    },
  );

  it('falha no apply impede archive/upload e sanitiza o erro sem remover recursos', async () => {
    const f = await fixture();
    await prepareRelease(target, f.options);
    f.state.failApply = true;
    await expect(applyRelease(target.project, f.options)).rejects.toThrow('saída externa omitida');
    expect(
      f.calls.some(({ args }) => ['up', 'archive', 'delete', 'remove'].includes(args[0])),
    ).toBe(false);
    expect(await readFile(join(f.root, '.renova/railway/release.json'), 'utf8')).toContain(f.sha);
  });

  it.each(['destructive', 'environment', 'source', 'commit-as-tree', 'scope'])(
    'recusa plano nativo %s',
    async (kind) => {
      const f = await fixture();
      if (kind === 'destructive') f.state.plan.destructive = true;
      if (kind === 'environment') f.state.plan.environmentId = target.project;
      if (kind === 'source') f.state.plan.sourceTree = 'b'.repeat(40);
      if (kind === 'commit-as-tree') f.state.plan.sourceTree = f.sha;
      if (kind === 'scope') f.state.plan.changeSet.declared.push('service.postgres');
      await expect(prepareRelease(target, f.options)).rejects.toThrow('recorte seguro');
      expect(f.mutated()).toBe(false);
    },
  );

  it('CLI exige IDs explícitos e confirmação exata, sem opções destrutivas', () => {
    expect(parseReleaseArgs(['apply', '--confirm-project', target.project])).toEqual({
      operation: 'apply',
      values: { 'confirm-project': target.project },
    });
    for (const args of [
      [],
      ['apply'],
      ['apply', '--confirm-project', 'production'],
      ['apply', '--confirm-project', target.project, '--confirm-destructive'],
      [
        'prepare',
        '--project',
        target.project,
        '--project',
        target.project,
        '--service',
        target.service,
      ],
    ])
      expect(() => parseReleaseArgs(args)).toThrow('Publicação recusada');
  });
});
