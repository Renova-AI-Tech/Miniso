import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { prepareLocalDatabase, startDatabase, startMailpit } from '../db/local.mjs';
import { buildMigrator, migrateLocalDatabase } from '../db/migrate.mjs';
import { applyProject, planProject, ProjectSetupError } from './generate.mjs';
import { collectSetupConfig, confirmPlan, parseSetupArguments, summarizePlan } from './prompts.mjs';

const execute = promisify(execFile);
const resume = 'pnpm run setup -- --config renova.project.json --yes';
const labels = {
  prerequisites: 'Conferir Node, pnpm e Docker',
  configuration: 'Salvar a configuração do projeto',
  dependencies: 'Instalar as dependências do lockfile',
  environment: 'Preparar as credenciais locais',
  database: 'Iniciar o Postgres deste projeto',
  migrations: 'Aplicar e verificar o schema do banco',
  mail: 'Iniciar a caixa de email de teste neste computador',
};
const remedies = {
  prerequisites: 'Execute pnpm run doctor para identificar o pré-requisito que precisa de atenção.',
  configuration: 'Revise os conflitos do manifesto e os arquivos preservados.',
  dependencies: 'Confira sua conexão e o lockfile; o setup não atualiza versões.',
  environment: 'Execute pnpm run doctor para conferir o ambiente preservado.',
  database: 'Abra o Docker e confira se a porta do banco está livre.',
  migrations: 'Execute pnpm run doctor; não edite migrations já aplicadas.',
  mail: 'Execute pnpm run doctor; confira o Docker e as portas da caixa de email local.',
};

export async function checkPrerequisites(root, run = execute) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node version');
  const options = { cwd: root, timeout: 15_000, maxBuffer: 64 * 1024 };
  const version = await run('pnpm', ['--version'], options);
  if (`pnpm@${version.stdout.trim()}` !== pkg.packageManager) throw new Error('pnpm version');
  await run('docker', ['info', '--format', '{{.ServerVersion}}'], options);
  await run('docker', ['compose', 'version', '--short'], options);
}

async function directory(path) {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new ProjectSetupError('Pasta local insegura; arquivos preservados.');
}

async function inspectState(root) {
  try {
    const path = join(root, '.renova/setup-state.json');
    const stat = await lstat(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65_536) throw new Error();
    const state = JSON.parse(await readFile(path, 'utf8'));
    if (
      state.schemaVersion !== 1 ||
      !['applying', 'ready', 'failed'].includes(state.status) ||
      !Array.isArray(state.steps)
    )
      throw new Error();
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new ProjectSetupError(
        'Registro de setup inválido; arquivo preservado. Execute pnpm run doctor.',
      );
  }
}

async function acquireLock(root) {
  await directory(join(root, '.renova'));
  const locks = join(root, '.renova/setup-locks');
  await directory(locks);
  const own = `${process.pid}-${randomUUID()}`;
  await mkdir(join(locks, own), { mode: 0o700 });
  const release = () => rmdir(join(locks, own));
  try {
    for (const name of await readdir(locks)) {
      if (name === own) continue;
      const match = /^([1-9][0-9]*)-[a-f0-9-]{36}$/.exec(name);
      let dead = false;
      if (match && Number.isSafeInteger(Number(match[1]))) {
        try {
          process.kill(Number(match[1]), 0);
        } catch (error) {
          dead = error.code === 'ESRCH';
        }
      }
      if (!dead)
        throw new ProjectSetupError(
          'Outro setup pode estar em execução. Aguarde antes de repetir.',
          1,
        );
      try {
        await rmdir(join(locks, name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}

async function checkpoint(root, result) {
  await inspectState(root);
  const stage = join(root, `.renova/.setup-${randomUUID()}.json`);
  try {
    await writeFile(stage, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(stage, join(root, '.renova/setup-state.json'));
  } finally {
    await unlink(stage).catch(() => {});
  }
}

const defaults = {
  prerequisites: checkPrerequisites,
  dependencies: (root) =>
    execute('pnpm', ['install', '--frozen-lockfile'], {
      cwd: root,
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    }),
  environment: prepareLocalDatabase,
  database: startDatabase,
  mail: startMailpit,
  migrations: async (root, handle) => {
    if (handle.env.PROFILE === 'authenticated')
      await execute('pnpm', ['--filter', '@renova/auth', 'build'], {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
    await buildMigrator(root);
    await migrateLocalDatabase(handle);
  },
};

/** Rechecks each idempotent step; a prior green checkpoint never authorizes deleting data. */
export async function runSetup(root, config, { services = defaults, onStep = () => {} } = {}) {
  const plan = await planProject(root, config);
  if (!plan.canApply)
    throw new ProjectSetupError(
      'Há conflitos na configuração. Gere um plano e revise os arquivos preservados.',
    );
  await inspectState(root);
  const result = { schemaVersion: 1, status: 'applying', steps: [], nextActions: [] };
  let release;
  let handle;
  let active = 'prerequisites';
  try {
    await services.prerequisites(root);
    result.steps.push({ id: active, status: 'ready' });
    release = await acquireLock(root);
    for (const id of [
      'configuration',
      'dependencies',
      'environment',
      'database',
      'migrations',
      ...(config.profile === 'authenticated' ? ['mail'] : []),
    ]) {
      active = id;
      onStep(labels[id]);
      await checkpoint(root, result);
      if (id === 'configuration') {
        // The lock directory changed the inventory; replan under the lock before writing.
        const current = await planProject(root, config);
        if (current.planId !== plan.planId)
          throw new ProjectSetupError('O projeto mudou durante o setup. Gere outro plano.');
        await applyProject(current);
      } else if (id === 'environment') handle = await services.environment(root);
      else if (id === 'database' || id === 'migrations' || id === 'mail')
        await services[id](root, handle);
      else await services[id](root);
      result.steps.push({ id, status: 'ready' });
    }
    result.status = 'ready';
    result.nextActions = [
      'pnpm dev',
      'pnpm run doctor',
      ...(config.profile === 'authenticated'
        ? [
            'Libere a primeira conta: pnpm auth:invite -- pessoa@example.test "Nome da pessoa"',
            `Email local de teste: http://127.0.0.1:${handle.env.MAILPIT_PORT}`,
          ]
        : []),
    ];
    await checkpoint(root, result);
    return { ...result, exitCode: 0 };
  } catch {
    result.status = 'failed';
    result.steps.push({
      id: active,
      status: 'failed',
      message: `${labels[active]}: não concluído.`,
      action: remedies[active],
    });
    result.nextActions = [remedies[active], resume];
    if (release) await checkpoint(root, result).catch(() => {});
    return { ...result, exitCode: 1 };
  } finally {
    if (release) await release();
  }
}

const help = `Preparar seu projeto Renova neste computador\n\n  pnpm run setup\n  pnpm run setup -- --config renova.project.json --plan\n  pnpm run setup -- --config renova.project.json --yes\n\n--plan: somente apresenta o plano. --yes: aceita a preparação local.\n--json: saída estruturada; exige --config e, para aplicar, --yes.\nPré-requisitos: Node 24, pnpm 10.33.4 e Docker com Compose.\nEscolha sem login ou contas liberadas pelo responsável. Execução local; Railway ainda não está disponível.\n`;

export async function setupMain(
  root,
  argv,
  { input = process.stdin, output = process.stdout } = {},
) {
  let options;
  try {
    options = parseSetupArguments(argv);
    if (options.help) {
      output.write(help);
      return 0;
    }
    const config = await collectSetupConfig({ root, options, input, output });
    const plan = await planProject(root, config);
    if (options.plan) {
      output.write(`${options.json ? JSON.stringify(plan) : summarizePlan(plan)}\n`);
      return plan.canApply ? 0 : 2;
    }
    if (!options.json)
      output.write(
        `${summarizePlan(plan)}\nO setup instalará dependências, iniciará o Postgres local e aplicará migrations.\n`,
      );
    if (!plan.canApply)
      throw new ProjectSetupError('Resolva os conflitos antes de aplicar a configuração.');
    if (options.json && !options.yes)
      throw new ProjectSetupError(
        'Para aplicar em JSON, informe --yes; use --plan para apenas conferir.',
      );
    if (!options.yes && !(await confirmPlan(plan, { input, output }))) {
      output.write('Configuração cancelada. Nenhum arquivo foi alterado.\n');
      return 0;
    }
    const result = await runSetup(root, config, {
      onStep: (label) => {
        if (!options.json) output.write(`${label}…\n`);
      },
    });
    output.write(
      `${options.json ? JSON.stringify(result) : [result.status === 'ready' ? 'Tudo pronto para começar localmente.' : 'O setup parou. Os dados existentes foram preservados.', ...result.nextActions].join('\n')}\n`,
    );
    return result.exitCode;
  } catch (error) {
    const message =
      error instanceof ProjectSetupError
        ? error.message
        : 'Não foi possível preparar o projeto. Execute pnpm run doctor.';
    const exitCode = error instanceof ProjectSetupError ? error.code : 1;
    output.write(
      `${options?.json || argv.includes('--json') ? JSON.stringify({ schemaVersion: 1, status: 'failed', message, nextActions: ['pnpm run doctor'], exitCode }) : message}\n`,
    );
    return exitCode;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await setupMain(
    resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    process.argv.slice(2),
  );
}
