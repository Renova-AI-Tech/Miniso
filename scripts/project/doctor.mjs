import { execFile } from 'node:child_process';
import { constants, realpathSync } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { get } from 'node:http';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  readLocalDatabase,
  runCompose,
  validateDatabaseEnvironment,
  validateLocalProfile,
} from '../db/local.mjs';
import { parseProjectConfig } from './config.mjs';
import { inspectParents } from './auth-recipe.mjs';

const execute = promisify(execFile);
const resume = 'pnpm run setup -- --config renova.project.json --yes';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function inspect(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readSafe(path) {
  const stat = await inspect(path);
  if (!stat) return undefined;
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65_536) throw new Error('Unsafe file');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await file.stat();
    if (actual.ino !== stat.ino || actual.dev !== stat.dev || actual.size > 65_536)
      throw new Error('Changed file');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}

function servicePorts(env, profile) {
  validateLocalProfile(env, profile);
  const frontend = new URL(env.FRONTEND_URL);
  const backend = Number(env.PORT);
  if (
    env.HOST !== '127.0.0.1' ||
    !['development', 'test'].includes(env.NODE_ENV) ||
    frontend.protocol !== 'http:' ||
    frontend.hostname !== '127.0.0.1' ||
    frontend.username ||
    frontend.password ||
    frontend.search ||
    frontend.hash ||
    frontend.pathname !== '/' ||
    !frontend.port ||
    !/^\d+$/.test(env.PORT ?? '') ||
    !Number.isInteger(backend) ||
    backend < 1 ||
    backend > 65535 ||
    new Set([backend, Number(frontend.port), Number(env.POSTGRES_HOST_PORT)]).size !== 3
  )
    throw new Error('Invalid local services');
  return { frontend: Number(frontend.port), backend };
}

export async function probePort(port) {
  const server = createServer();
  return new Promise((accept, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') accept('occupied');
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close(() => accept('free')));
  });
}

/** Fixed loopback address, no redirects, no response body included in diagnostics. */
async function localHttp(port, path) {
  return new Promise((accept, reject) => {
    const request = get({ host: '127.0.0.1', port, path, timeout: 2000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16_384) request.destroy(new Error('Response too large'));
      });
      response.on('error', reject);
      response.on('end', () =>
        accept({ status: response.statusCode, headers: response.headers, body }),
      );
    });
    request.on('timeout', () => request.destroy(new Error('Timeout')));
    request.on('error', reject);
  });
}

function installedDependencies(root, profile) {
  for (const [path, name] of [
    ['package.json', 'pg'],
    ['apps/frontend/package.json', 'vite'],
    ['apps/backend/package.json', 'fastify'],
  ])
    createRequire(join(root, path)).resolve(name);
  if (profile === 'authenticated')
    createRequire(join(root, 'packages/auth/package.json')).resolve('better-auth');
}

/** Both sessions enforce read-only; bootstrap identity is intentionally hidden from runtime. */
export async function probeDatabase(root, handle) {
  validateDatabaseEnvironment(handle.plan, handle.env);
  const built = join(root, 'packages/dbmigrator/dist/index.js');
  const stat = await inspect(built);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error('Build unavailable');
  const { default: pg } = await import(createRequire(join(root, 'package.json')).resolve('pg'));
  const { checkReadiness } = await import(pathToFileURL(built).href);
  const connection = {
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
    options: '-c default_transaction_read_only=on',
  };
  const client = new pg.Client({
    ...connection,
    connectionString: handle.env.MIGRATION_DATABASE_URL,
  });
  try {
    await client.connect();
    const result = await client.query(
      'select current_database() as database, project_id, current_user as role, rolsuper from renova_bootstrap.identity cross join pg_roles where rolname = current_user',
    );
    const identity = result.rows[0];
    const matches =
      result.rows.length === 1 &&
      identity.database === handle.plan.databaseName &&
      identity.project_id === handle.plan.projectId &&
      identity.role === 'renova_migrator' &&
      !identity.rolsuper;
    if (!matches) return false;
  } finally {
    await client.end();
  }
  const runtime = new pg.Client({ ...connection, connectionString: handle.env.DATABASE_URL });
  try {
    await runtime.connect();
    const role = await runtime.query(
      'select current_user as role, rolsuper from pg_roles where rolname = current_user',
    );
    return (
      role.rows[0]?.role === 'renova_runtime' &&
      !role.rows[0]?.rolsuper &&
      (await checkReadiness(runtime))
    );
  } finally {
    await runtime.end();
  }
}

/** Inspect only this project's local container; never sends or reads a message. */
export async function probeMailbox(root, handle) {
  validateDatabaseEnvironment(handle.plan, handle.env);
  const result = await runCompose(root, handle.env, ['ps', '--format', 'json', 'mailpit']);
  const parsed = JSON.parse(result.stdout.trim());
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.length !== 1) return false;
  const container = rows[0];
  return (
    container.Project === handle.plan.composeProject &&
    container.Service === 'mailpit' &&
    container.Image === 'axllent/mailpit:v1.31.6' &&
    container.State === 'running' &&
    container.Health === 'healthy' &&
    [
      [1025, handle.env.SMTP_PORT],
      [8025, handle.env.MAILPIT_PORT],
    ].every(([target, published]) =>
      container.Publishers?.some(
        (port) =>
          port.URL === '127.0.0.1' &&
          port.TargetPort === target &&
          port.PublishedPort === Number(published),
      ),
    )
  );
}

function finish(checks, invalid = false) {
  const failed = checks.some((check) => check.status === 'failed');
  return {
    schemaVersion: 1,
    status: invalid ? 'invalid' : failed ? 'attention' : 'ready',
    checks,
    nextActions: [...new Set(checks.flatMap((check) => (check.action ? [check.action] : [])))],
    exitCode: invalid ? 2 : failed ? 1 : 0,
  };
}

export async function diagnose(root, options = {}) {
  const probes = {
    run: execute,
    dependencies: installedDependencies,
    database: probeDatabase,
    mailbox: probeMailbox,
    port: probePort,
    http: localHttp,
    nodeVersion: process.versions.node,
    ...options,
  };
  const checks = [];
  const add = (id, status, message, action) =>
    checks.push({ id, status, message, ...(action ? { action } : {}) });
  let pkg;
  let profile;
  try {
    const rootStat = await inspect(root);
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error();
    const config = parseProjectConfig(
      JSON.parse(await readSafe(join(root, 'renova.project.json'))),
    );
    if (config.initialTarget !== 'local') throw new Error();
    profile = config.profile;
    await inspectParents(root, 'packages/auth/package.json');
    const authPackage = await readSafe(join(root, 'packages/auth/package.json'));
    if ((profile === 'authenticated') !== Boolean(authPackage)) throw new Error();
    if (authPackage && JSON.parse(authPackage).name !== '@renova/auth') throw new Error();
    pkg = JSON.parse(await readSafe(join(root, 'package.json')));
    if (!/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager)) throw new Error();
    add(
      'configuration',
      'ready',
      `Configuração válida: ${profile === 'authenticated' ? 'com login e contas liberadas pelo responsável' : 'sem login'} e execução local.`,
    );
  } catch {
    add(
      'configuration',
      'failed',
      'Configuração ausente, inválida ou caminho inseguro.',
      'Revise o perfil em renova.project.json e os arquivos do módulo. Execute o setup em um clone novo para escolher login; use destino local.',
    );
    return finish(checks, true);
  }
  if (Number(probes.nodeVersion.split('.')[0]) === 24) add('node', 'ready', 'Node 24 disponível.');
  else
    add(
      'node',
      'failed',
      'A versão do Node não é compatível.',
      'Instale Node 24 e repita pnpm run doctor.',
    );
  const commands = [
    [
      'pnpm',
      ['--version'],
      'pnpm',
      'pnpm compatível com o projeto.',
      'Instale a versão de pnpm indicada em package.json.',
    ],
    [
      'docker',
      ['info', '--format', '{{.ServerVersion}}'],
      'docker',
      'Docker está disponível.',
      'Abra o Docker e repita pnpm run doctor.',
    ],
    [
      'docker',
      ['compose', 'version', '--short'],
      'compose',
      'Docker Compose está disponível.',
      'Instale Docker com Compose e repita pnpm run doctor.',
    ],
  ];
  for (const [command, args, id, message, action] of commands) {
    try {
      const result = await probes.run(command, args, {
        cwd: root,
        timeout: 5000,
        maxBuffer: 16_384,
      });
      if (id === 'pnpm' && `pnpm@${result.stdout.trim()}` !== pkg.packageManager) throw new Error();
      add(id, 'ready', message);
    } catch {
      add(
        id,
        'failed',
        `${id === 'pnpm' ? 'pnpm' : id === 'docker' ? 'Docker' : 'Docker Compose'} não está disponível na versão necessária.`,
        action,
      );
    }
  }
  let dependencies = false;
  try {
    await probes.dependencies(root, profile);
    dependencies = true;
    add('dependencies', 'ready', 'Dependências locais disponíveis.');
  } catch {
    add(
      'dependencies',
      'failed',
      'As dependências do projeto ainda não estão disponíveis.',
      resume,
    );
  }
  let handle;
  let ports;
  try {
    const directory = await inspect(join(root, '.renova'));
    if (!directory) {
      add('environment', 'failed', 'Este clone ainda não foi preparado neste computador.', resume);
      return finish(checks);
    }
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error();
    const names = await readdir(join(root, '.renova'));
    if (names.some((name) => name === 'db-setup.pending' || name.startsWith('db-setup-stage-'))) {
      add(
        'setup',
        'failed',
        'A preparação das credenciais locais foi interrompida; arquivos preservados.',
        resume,
      );
      return finish(checks);
    }
    const setupText = await readSafe(join(root, '.renova/setup-state.json'));
    if (setupText) {
      const setup = JSON.parse(setupText);
      if (
        setup.schemaVersion !== 1 ||
        !['ready', 'failed', 'applying'].includes(setup.status) ||
        !Array.isArray(setup.steps)
      )
        throw new Error();
      add(
        'setup',
        setup.status === 'ready' ? 'ready' : 'failed',
        setup.status === 'ready'
          ? 'A preparação local terminou.'
          : 'A preparação local ainda não terminou.',
        setup.status === 'ready' ? undefined : resume,
      );
    } else
      add(
        'setup',
        'info',
        'Sem registro do configurador; conferindo os recursos locais existentes.',
      );
    const env = await readSafe(join(root, '.env'));
    const state = await readSafe(join(root, '.renova/db-state.json'));
    if (!env && !state) {
      add('environment', 'failed', 'O ambiente local ainda não foi preparado.', resume);
      return finish(checks);
    }
    handle = await readLocalDatabase(root);
    ports = servicePorts(handle.env, profile);
    add('environment', 'ready', 'Ambiente vinculado exclusivamente ao banco local deste projeto.');
  } catch {
    add(
      'environment',
      'failed',
      'Ambiente ou estado local inválido; nenhum arquivo foi alterado.',
      'Peça à IA ou ao responsável para revisar .env e .renova sem compartilhar credenciais; não apague o volume.',
    );
    return finish(checks, true);
  }
  if (profile === 'authenticated') {
    try {
      if (!(await probes.mailbox(root, handle))) throw new Error();
      add(
        'mail',
        'ready',
        'Caixa de email de teste deste projeto disponível somente neste computador.',
        `Email local: http://127.0.0.1:${handle.env.MAILPIT_PORT}`,
      );
    } catch {
      add(
        'mail',
        'failed',
        'A caixa de email local deste projeto não está pronta; nenhum email foi enviado pelo diagnóstico.',
        resume,
      );
    }
  }
  if (dependencies) {
    try {
      if (!(await probes.database(root, handle))) throw new Error();
      add('database', 'ready', 'Banco correto e schema pronto; consulta somente leitura.');
    } catch {
      add(
        'database',
        'failed',
        'Não foi possível confirmar a identidade e o schema do banco local.',
        'Abra o Docker e execute o setup novamente; ele preserva as credenciais e o volume.',
      );
    }
  } else add('database', 'info', 'Banco não consultado: faltam dependências locais.');
  try {
    const [frontend, backend] = await Promise.all([
      probes.port(ports.frontend),
      probes.port(ports.backend),
    ]);
    if (frontend === 'free' && backend === 'free')
      add('services', 'ready', 'Frontend e API desligados, com as duas portas livres.', 'pnpm dev');
    else if (frontend !== 'occupied' || backend !== 'occupied') throw new Error();
    else {
      for (const [port, path, expected] of [
        [ports.backend, '/health', 'ok'],
        [ports.backend, '/ready', 'ready'],
      ]) {
        const response = await probes.http(port, path);
        if (
          response.status !== 200 ||
          !uuid.test(response.headers['x-request-id'] ?? '') ||
          JSON.parse(response.body).status !== expected
        )
          throw new Error();
      }
      const proxy = await probes.http(ports.frontend, '/api/trpc/system.health');
      if (
        proxy.status !== 200 ||
        !uuid.test(proxy.headers['x-request-id'] ?? '') ||
        JSON.parse(proxy.body).result?.data?.status !== 'ok'
      )
        throw new Error();
      const page = await probes.http(ports.frontend, '/');
      if (
        page.status !== 200 ||
        !/<div\s+id=["']root["']/.test(page.body) ||
        !/<title>[^<]+<\/title>/.test(page.body)
      )
        throw new Error();
      add('services', 'ready', 'Frontend, API e proxy local respondem corretamente.');
    }
  } catch {
    add(
      'services',
      'failed',
      'Há uma aplicação incompleta ou outra aplicação usando as portas do projeto.',
      'Confira o terminal de pnpm dev. Encerre somente a execução deste projeto antes de iniciá-la novamente.',
    );
  }
  add(
    'remote',
    'info',
    'CI Blacksmith e Railway não verificados: este diagnóstico confirma somente o ambiente local.',
  );
  return finish(checks);
}

export function formatDiagnosis(result) {
  const label = { ready: 'OK', failed: 'Atenção', info: 'Info' };
  return [
    result.exitCode === 0
      ? 'Seu projeto está pronto para trabalhar localmente.'
      : 'Há pontos para resolver antes de continuar.',
    ...result.checks.map((check) => `${label[check.status]} — ${check.message}`),
    ...(result.nextActions.length
      ? ['Próximos passos:', ...result.nextActions.map((action) => `  ${action}`)]
      : []),
  ].join('\n');
}

export async function doctorMain(root, argv, output = process.stdout, probes = {}) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let result;
  if (args.some((arg) => arg !== '--json' && arg !== '--help')) {
    result = finish(
      [
        {
          id: 'arguments',
          status: 'failed',
          message: 'Opção desconhecida.',
          action: 'Use pnpm run doctor ou pnpm run doctor -- --json.',
        },
      ],
      true,
    );
  } else if (args.includes('--help')) {
    output.write(
      'Diagnóstico local, sem alterar arquivos ou recursos.\nUse pnpm run doctor ou pnpm run doctor -- --json.\n',
    );
    return 0;
  } else {
    try {
      result = await diagnose(root, probes);
    } catch {
      result = finish([
        {
          id: 'diagnosis',
          status: 'failed',
          message: 'Não foi possível concluir o diagnóstico.',
          action: 'Confira as permissões da pasta e repita pnpm run doctor.',
        },
      ]);
    }
  }
  output.write(`${args.includes('--json') ? JSON.stringify(result) : formatDiagnosis(result)}\n`);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  process.exitCode = await doctorMain(
    fileURLToPath(new URL('../../', import.meta.url)),
    process.argv.slice(2),
  );
