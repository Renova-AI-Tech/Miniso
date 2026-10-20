import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const lifetime = 30 * 60 * 1000;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const targetArgs = (target) => [
  '--project',
  target.project,
  '--environment',
  target.environment,
  '--service',
  target.service,
];
const refuse = (reason) => {
  throw new Error(`Publicação recusada: ${reason}.`);
};

async function command(runner, root, program, args, env = process.env) {
  try {
    const result = await runner(program, args, {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      env,
    });
    return result.stdout.trim();
  } catch {
    const stage = args.slice(0, program === 'railway' && args[0] === 'config' ? 2 : 1).join(' ');
    refuse(`falha em ${program} ${stage}; saída externa omitida`);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    refuse('resposta JSON inválida');
  }
}

function validateTarget(target) {
  if (
    !target ||
    !['project', 'environment', 'service'].every((key) => uuid.test(target[key] ?? ''))
  ) {
    refuse('projeto, ambiente e serviço devem ser UUIDs explícitos');
  }
}

function summarizePlan(bytes, target, configTree) {
  const plan = parseJson(bytes.toString('utf8'));
  const set = plan.changeSet;
  if (
    plan.kind !== 'railway.config.plan' ||
    plan.version !== 1 ||
    plan.sourceTree !== configTree ||
    plan.environmentId !== target.environment ||
    plan.destructive !== false ||
    set?.partial !== 'renova-app' ||
    JSON.stringify(set.declared) !== '["service.app"]' ||
    !Array.isArray(set.changes) ||
    set.changes.some((change) => change.address !== 'service.app')
  ) {
    refuse('plano fora da árvore de configuração, ambiente ou recorte seguro do serviço app');
  }
  return set.changes.map(({ kind, severity, summary }) => {
    if (![kind, severity, summary].every((value) => typeof value === 'string'))
      refuse('resumo do plano inválido');
    return { kind, severity, summary: summary.replace(/\p{Cc}/gu, ' ') };
  });
}

async function snapshot(root, runner) {
  const git = (args) => command(runner, root, 'git', args);
  if (await git(['status', '--porcelain=v1', '--untracked-files=all']))
    refuse('árvore Git contém WIP');
  if ((await realpath(await git(['rev-parse', '--show-toplevel']))) !== root)
    refuse('execute na raiz do repositório');
  const sha = await git(['rev-parse', 'HEAD']);
  const configTree = await git(['rev-parse', 'HEAD:.railway']);
  if (![sha, configTree].every((value) => /^[a-f0-9]{40}$/.test(value)))
    refuse('HEAD ou árvore .railway inválida');
  const origin = await git(['remote', 'get-url', 'origin']);
  const repo =
    /^(?:git@github\.com:|https:\/\/github\.com\/)([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/.exec(
      origin,
    )?.[1];
  if (!repo) refuse('origin deve ser um repositório GitHub sem credenciais na URL');
  return { sha, configTree, repo };
}

async function verifyDestination(directory, target, runner) {
  const status = parseJson(await command(runner, directory, 'railway', ['status', '--json']));
  const service = status.services?.edges?.find(({ node }) => node.id === target.service)?.node;
  const environment = status.environments?.edges?.find(
    ({ node }) => node.id === target.environment,
  )?.node;
  const instance = environment?.serviceInstances?.edges?.find(
    ({ node }) => node.serviceId === target.service,
  )?.node;
  if (
    status.id !== target.project ||
    service?.name !== 'app' ||
    environment?.canAccess !== true ||
    instance?.environmentId !== target.environment ||
    instance?.serviceName !== 'app'
  )
    refuse('binding Railway diverge do projeto, ambiente ou serviço app');
}

async function verifyCi(repo, sha, runner, root) {
  const runs = parseJson(
    await command(runner, root, 'gh', [
      'run',
      'list',
      '--repo',
      repo,
      '--commit',
      sha,
      '--workflow',
      'CI',
      '--limit',
      '100',
      '--json',
      'databaseId,headSha,status,conclusion,createdAt',
    ]),
  );
  if (
    !Array.isArray(runs) ||
    !runs.length ||
    runs.some(
      (run) =>
        run.headSha !== sha ||
        !Number.isSafeInteger(run.databaseId) ||
        !Number.isFinite(Date.parse(run.createdAt)),
    )
  )
    refuse('CI do SHA exato ausente ou inválido');
  const latest = runs.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.databaseId - a.databaseId,
  )[0];
  if (latest.status !== 'completed' || latest.conclusion !== 'success')
    refuse('CI mais recente não concluiu com sucesso');
  const jobs = parseJson(
    await command(runner, root, 'gh', [
      'api',
      `repos/${repo}/actions/runs/${latest.databaseId}/jobs?filter=latest&per_page=100`,
    ]),
  );
  const required = jobs.jobs?.filter((job) => job.name === 'required');
  if (
    !Number.isSafeInteger(jobs.total_count) ||
    jobs.total_count > 100 ||
    required?.length !== 1 ||
    required[0].head_sha !== sha ||
    required[0].status !== 'completed' ||
    required[0].conclusion !== 'success'
  ) {
    refuse('job required do CI não concluiu com sucesso para este SHA');
  }
  return latest.databaseId;
}

/** Prepara somente o plano nativo fixado; nenhuma configuração remota é aplicada. */
export async function prepareRelease(
  target,
  { root = process.cwd(), runner = execute, now = Date.now } = {},
) {
  validateTarget(target);
  root = await realpath(root);
  const source = await snapshot(root, runner);
  const directory = join(root, '.renova/railway');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const link = parseJson(
    await command(runner, directory, 'railway', ['link', ...targetArgs(target), '--json']),
  );
  if (
    link.projectId !== target.project ||
    link.environmentId !== target.environment ||
    link.serviceId !== target.service
  ) {
    refuse('Railway vinculou outro destino');
  }
  await verifyDestination(directory, target, runner);
  const planPath = join(directory, 'config.plan.json');
  await command(
    runner,
    directory,
    'railway',
    [
      'config',
      'plan',
      '--file',
      join(root, '.railway/railway.ts'),
      '--out',
      planPath,
      '--source-tree',
      source.configTree,
    ],
    {
      ...process.env,
      // railway/iac checks this executable's version during native CLI evaluation.
      _: 'railway',
      RENOVA_DEPLOY_PROJECT_ID: target.project,
      RENOVA_DEPLOY_ENVIRONMENT_ID: target.environment,
    },
  );
  const plan = await readFile(planPath);
  const changes = summarizePlan(plan, target, source.configTree);
  await chmod(planPath, 0o600);
  const metadata = {
    version: 1,
    root,
    ...source,
    target,
    createdAt: now(),
    planSha256: digest(plan),
  };
  const metadataPath = join(directory, 'release.json');
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  await chmod(metadataPath, 0o600);
  return {
    sha: source.sha,
    target,
    planPath,
    expiresAt: metadata.createdAt + lifetime,
    ci: 'será exigido na aplicação',
    changes,
  };
}

/** Aplica apenas o plano revisado e publica um git archive do mesmo SHA aprovado no CI. */
export async function applyRelease(
  confirmProject,
  { root = process.cwd(), runner = execute, now = Date.now } = {},
) {
  root = await realpath(root);
  const directory = join(root, '.renova/railway');
  const metadata = parseJson(await readFile(join(directory, 'release.json'), 'utf8'));
  validateTarget(metadata.target);
  if (
    metadata.version !== 1 ||
    metadata.root !== root ||
    metadata.target.project !== confirmProject
  )
    refuse('confirmação ou metadata divergente');
  if (
    !Number.isSafeInteger(metadata.createdAt) ||
    now() < metadata.createdAt ||
    now() - metadata.createdAt > lifetime
  )
    refuse('plano expirado; prepare novamente');
  const planPath = join(directory, 'config.plan.json');
  if (digest(await readFile(planPath)) !== metadata.planSha256)
    refuse('plano alterado desde a preparação');
  summarizePlan(await readFile(planPath), metadata.target, metadata.configTree);
  const source = await snapshot(root, runner);
  if (
    source.sha !== metadata.sha ||
    source.configTree !== metadata.configTree ||
    source.repo !== metadata.repo
  )
    refuse('SHA ou origin mudou desde a preparação');
  await verifyDestination(directory, metadata.target, runner);
  const runId = await verifyCi(source.repo, source.sha, runner, root);
  // As chamadas remotas podem demorar: recuse alterações e expiração antes da primeira escrita.
  const current = await snapshot(root, runner);
  if (
    current.sha !== source.sha ||
    current.configTree !== source.configTree ||
    current.repo !== source.repo ||
    now() - metadata.createdAt > lifetime ||
    digest(await readFile(planPath)) !== metadata.planSha256
  )
    refuse('estado mudou durante a validação');
  await command(runner, directory, 'railway', ['config', 'apply', '--plan', planPath, '--yes']);
  const scratch = await mkdtemp(join(tmpdir(), 'renova-release-'));
  try {
    const archive = join(scratch, 'source.tar');
    const upload = join(scratch, 'source');
    await mkdir(upload);
    await command(runner, root, 'git', [
      'archive',
      '--format=tar',
      '--output',
      archive,
      source.sha,
    ]);
    await command(runner, root, 'tar', ['-xf', archive, '-C', upload]);
    await command(runner, upload, 'railway', ['up', ...targetArgs(metadata.target), '--detach']);
    return {
      sha: source.sha,
      target: metadata.target,
      runId,
      status: 'enviado; saúde do provider ainda não verificada',
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export function parseReleaseArgs(args) {
  const [operation, ...options] = args;
  const keys =
    operation === 'prepare'
      ? ['project', 'environment', 'service']
      : operation === 'apply'
        ? ['confirm-project']
        : [];
  if (!keys.length || options.length !== keys.length * 2)
    refuse(
      'use prepare --project UUID --environment UUID --service UUID ou apply --confirm-project UUID',
    );
  const values = {};
  for (let index = 0; index < options.length; index += 2) {
    const key = options[index].slice(2);
    if (
      !options[index].startsWith('--') ||
      !keys.includes(key) ||
      values[key] ||
      !uuid.test(options[index + 1] ?? '')
    )
      refuse('argumentos inválidos');
    values[key] = options[index + 1];
  }
  return { operation, values };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { operation, values } = parseReleaseArgs(process.argv.slice(2));
    const result =
      operation === 'prepare'
        ? await prepareRelease(values)
        : await applyRelease(values['confirm-project']);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error && error.message.startsWith('Publicação recusada:') ? error.message : 'Publicação recusada; confira arquivos locais, destino e credenciais das CLIs.'}\n`,
    );
    process.exitCode = 1;
  }
}
