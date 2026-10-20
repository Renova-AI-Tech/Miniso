import { createHash } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isPendingLocalDatabaseFile } from '../db/local.mjs';
import { parseProjectConfig } from './config.mjs';
import { inspectParents, readAuthRecipe, verifyRecipeInputs } from './auth-recipe.mjs';

const manifestPath = 'renova.project.json';
const statePath = '.renova/project-state.json';
const authMarkerPath = '.renova/auth-install.json';
const authPackagePath = 'packages/auth/package.json';
const authMarker = `${JSON.stringify({ schemaVersion: 1, profile: 'authenticated' })}\n`;
const guardedPaths = [
  manifestPath,
  statePath,
  '.renova/db-state.json',
  '.env',
  authMarkerPath,
  authPackagePath,
];
const plans = new WeakMap();
const digest = (value) => createHash('sha256').update(value).digest('hex');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

export class ProjectSetupError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'ProjectSetupError';
    this.code = code;
  }
}

export function requireSupportedConfig(input) {
  let config;
  try {
    config = parseProjectConfig(input);
  } catch {
    throw new ProjectSetupError(
      'Configuração inválida. Confira nome, identificador e campos de renova.project.json.',
    );
  }
  if (config.initialTarget !== 'local') {
    throw new ProjectSetupError(
      'A publicação no Railway será entregue em outra etapa. Escolha rodar localmente agora.',
    );
  }
  return config;
}

async function inspect(root, path, directory = false) {
  try {
    await inspectParents(root, path);
    const stat = await lstat(join(root, path));
    let pendingLink = null;
    if (
      !directory &&
      stat.isFile() &&
      stat.nlink === 2 &&
      ![manifestPath, '.env', '.renova/db-state.json'].includes(path)
    ) {
      pendingLink = await pendingProjectState(root, stat, path);
    }
    const pendingDatabaseLink =
      !directory &&
      stat.isFile() &&
      stat.nlink === 2 &&
      ['.env', '.renova/db-state.json'].includes(path) &&
      (await isPendingLocalDatabaseFile(root, path));
    if (
      stat.isSymbolicLink() ||
      (directory
        ? !stat.isDirectory()
        : !stat.isFile() || (stat.nlink !== 1 && !pendingLink && !pendingDatabaseLink))
    ) {
      throw new ProjectSetupError(
        `O caminho ${path} precisa ser ${directory ? 'uma pasta' : 'um arquivo'} próprio do projeto, sem links.`,
      );
    }
    const identity = `${stat.dev}:${stat.ino}`;
    if (directory) return { identity };
    const content = await readFile(join(root, path));
    return { identity, hash: digest(content), content, mode: stat.mode & 0o777, pendingLink };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'UNSAFE_PATH')
      throw new ProjectSetupError(`O caminho ${path} precisa usar pastas próprias, sem links.`);
    if (error instanceof ProjectSetupError) throw error;
    throw new ProjectSetupError(`Não foi possível ler ${path}. Confira a permissão local.`, 1);
  }
}

async function pendingProjectState(root, stat, destination) {
  // Exceção limitada ao hardlink de publicação interrompida; nunca a links arbitrários.
  let entries;
  try {
    entries = await readdir(join(root, '.renova'), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\.project-stage-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
    for (const name of (await readdir(join(root, '.renova', entry.name))).filter((name) =>
      /^\d+$/.test(name),
    )) {
      const path = join(root, '.renova', entry.name, name);
      try {
        const staged = await lstat(path);
        if (
          staged.isFile() &&
          staged.nlink === 2 &&
          staged.dev === stat.dev &&
          staged.ino === stat.ino
        ) {
          if (
            destination !== statePath ||
            validManagedState(JSON.parse(await readFile(path, 'utf8')))
          )
            return path;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') return null;
      }
    }
  }
  return null;
}

async function inventory(root, paths = guardedPaths) {
  const directory = await inspect(root, '.renova', true);
  const files = {};
  for (const path of paths) files[path] = await inspect(root, path);
  return { directory, files };
}

function freeze(value) {
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') freeze(item);
  }
  return Object.freeze(value);
}

function parseExistingManifest(entry) {
  try {
    return parseProjectConfig(JSON.parse(entry.content.toString('utf8')));
  } catch {
    throw new ProjectSetupError(
      'O manifesto existente está ausente ou inválido. Restaure renova.project.json antes do setup.',
    );
  }
}

function validManagedState(parsed) {
  return (
    parsed?.schemaVersion === 1 &&
    ['public', 'authenticated'].includes(parsed.profile) &&
    Object.keys(parsed).length === 3 &&
    parsed.files &&
    Object.keys(parsed.files).length === 1 &&
    /^[a-f0-9]{64}$/.test(parsed.files[manifestPath])
  );
}

function managedConflict(state, manifest, requestedHash, profile) {
  if (!state) return [];
  try {
    const parsed = JSON.parse(state.content.toString('utf8'));
    const expected = {
      schemaVersion: 1,
      profile,
      files: { [manifestPath]: manifest.hash },
    };
    if (JSON.stringify(parsed) === JSON.stringify(expected)) return [];
    if (validManagedState(parsed)) {
      // Crash entre manifesto e estado: a configuração explicitamente solicitada
      // já existe byte a byte. Só reconciliamos o registro, sem sobrescrever edição.
      if (manifest.hash === requestedHash) return [];
      return [
        {
          path: manifestPath,
          code: 'MANAGED_FILE_CHANGED',
          message:
            'O manifesto foi editado após o último setup. Revise a diferença antes de substituir sua configuração.',
        },
      ];
    }
  } catch {
    // Conteúdo de estado nunca integra a mensagem pública.
  }
  return [
    {
      path: statePath,
      code: 'INVALID_PROJECT_STATE',
      message: 'O registro do setup está inválido. Revise o arquivo preservado antes de continuar.',
    },
  ];
}

/** O plano é somente leitura. Seu conteúdo público nunca contém env, Git ou caminhos absolutos. */
export async function planProject(root, input) {
  const config = requireSupportedConfig(input);
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(root);
  } catch {
    throw new ProjectSetupError('A pasta do projeto não está acessível.', 1);
  }
  const rootIdentity = await inspect(canonicalRoot, '.', true);
  let before = await inventory(canonicalRoot);
  const existing = requireSupportedConfig(parseExistingManifest(before.files[manifestPath]));
  if (JSON.stringify(config.origin) !== JSON.stringify(existing.origin)) {
    throw new ProjectSetupError('A origem do template deve permanecer igual à origem deste clone.');
  }
  if (
    config.project.slug !== existing.project.slug &&
    (before.files['.env'] || before.files['.renova/db-state.json'])
  ) {
    throw new ProjectSetupError(
      'Este projeto já tem ambiente local. Mantenha seu identificador para preservar o banco; o nome exibido pode mudar.',
    );
  }
  if (existing.profile === 'authenticated' && config.profile !== existing.profile)
    throw new ProjectSetupError(
      'Remover login automaticamente não é permitido. O projeto foi preservado.',
    );
  const authState =
    before.files[statePath] &&
    (() => {
      try {
        const state = JSON.parse(before.files[statePath].content);
        return validManagedState(state) && state.profile === 'authenticated';
      } catch {
        return false;
      }
    })();
  const authPackage = before.files[authPackagePath];
  if (authPackage) {
    try {
      if (JSON.parse(authPackage.content).name !== '@renova/auth') throw new Error();
    } catch {
      throw new ProjectSetupError('O pacote de login está inválido; conteúdo preservado.');
    }
  }
  const marker = before.files[authMarkerPath];
  if (marker && marker.hash !== digest(authMarker))
    throw new ProjectSetupError(
      'O registro da instalação de login está inválido; arquivos preservados.',
    );
  if (config.profile === 'public' && (marker || authState || authPackage))
    throw new ProjectSetupError(
      'A instalação de login foi iniciada. Retome com o perfil authenticated; não é seguro voltar automaticamente ao perfil público.',
    );
  if (authState && !authPackage)
    throw new ProjectSetupError(
      'O módulo de login instalado está incompleto. Restaure seus arquivos; o setup não sobrescreve personalizações.',
    );
  const installedAuth = existing.profile === 'authenticated' && Boolean(authPackage);
  const installingAuth = config.profile === 'authenticated' && !installedAuth;
  if (installingAuth && (before.files['.env'] || before.files['.renova/db-state.json']))
    throw new ProjectSetupError(
      'Este projeto já foi preparado. Adicionar login a um produto existente exige revisão de dados e permissões; nada foi alterado.',
    );
  let recipe;
  if (installingAuth) {
    try {
      recipe = await readAuthRecipe(canonicalRoot);
      before = await inventory(canonicalRoot, [
        ...guardedPaths,
        ...recipe.entries.map((entry) => entry.path),
      ]);
    } catch {
      throw new ProjectSetupError(
        'A receita de login está ausente, inválida ou contém caminhos inseguros. O projeto foi preservado.',
      );
    }
  }
  // The schema allows only [] or ["auth"]. Keep that array in the formatter's
  // canonical form without requiring installed dependencies during bootstrap.
  const manifest = serialize(config).replace(
    '"capabilities": [\n    "auth"\n  ]',
    '"capabilities": ["auth"]',
  );
  // Runtime and its exact lockfile are published before the profile can claim auth is installed.
  const contents = {
    ...(installingAuth ? { [authMarkerPath]: authMarker } : {}),
    ...Object.fromEntries((recipe?.entries ?? []).map((entry) => [entry.path, entry.content])),
    [manifestPath]: manifest,
    [statePath]: serialize({
      schemaVersion: 1,
      profile: config.profile,
      files: { [manifestPath]: digest(manifest) },
    }),
  };
  const conflicts = managedConflict(
    before.files[statePath],
    before.files[manifestPath],
    digest(manifest),
    existing.profile,
  );
  for (const entry of recipe?.entries ?? []) {
    const hash = before.files[entry.path]?.hash ?? null;
    if (hash !== entry.beforeSha256 && hash !== entry.afterSha256)
      conflicts.push({
        path: entry.path,
        code: 'CUSTOMIZED_AUTH_TARGET',
        message:
          'O arquivo tem alterações próprias. Login só pode ser instalado automaticamente na base original; conteúdo preservado.',
      });
  }
  const reconcilesState =
    !conflicts.length &&
    before.files[manifestPath].hash === digest(manifest) &&
    before.files[statePath] &&
    before.files[statePath].hash !== digest(contents[statePath]);
  const files = Object.entries(contents).map(([path, content]) => {
    const beforeHash = before.files[path]?.hash ?? null;
    const afterHash = digest(content);
    return {
      path,
      action: beforeHash === afterHash ? 'unchanged' : beforeHash ? 'update' : 'create',
      beforeHash,
      afterHash,
    };
  });
  const description = {
    schemaVersion: 1,
    status: conflicts.length ? 'conflict' : 'planned',
    canApply: conflicts.length === 0,
    project: config.project,
    profile: config.profile,
    initialTarget: config.initialTarget,
    files,
    conflicts,
    nextActions: conflicts.length
      ? ['Revise os conflitos. Nenhum arquivo foi alterado.']
      : reconcilesState
        ? [
            'O manifesto já corresponde à escolha. Apenas seu registro será reconciliado, preservando o arquivo.',
          ]
        : ['Aplicar configuração local e verificar Docker antes de preparar o banco.'],
  };
  const plan = freeze({ ...description, planId: digest(JSON.stringify(description)) });
  plans.set(plan, {
    root: canonicalRoot,
    rootIdentity,
    before,
    contents,
    recipeInputs: recipe?.inputs ?? {},
  });
  return plan;
}

async function revalidate(record, expectedDirectory = record.before.directory) {
  const currentRoot = await inspect(record.root, '.', true);
  const paths = Object.keys(record.before.files);
  const current = await inventory(record.root, paths);
  try {
    await verifyRecipeInputs(record.root, record.recipeInputs);
  } catch {
    throw new ProjectSetupError(
      'A receita mudou depois do plano. Gere outro plano antes de aplicar.',
    );
  }
  if (
    currentRoot?.identity !== record.rootIdentity?.identity ||
    current.directory?.identity !== expectedDirectory?.identity ||
    paths.some(
      (path) =>
        current.files[path]?.hash !== record.before.files[path]?.hash ||
        current.files[path]?.identity !== record.before.files[path]?.identity,
    )
  ) {
    throw new ProjectSetupError(
      'O projeto mudou depois do plano. Nenhum arquivo foi substituído; gere um plano atualizado.',
    );
  }
}

/** Aplica apenas o objeto original. Estado compartilhado no disco nunca autoriza sobrescrita. */
export async function applyProject(plan) {
  const record = plans.get(plan);
  if (!record) throw new ProjectSetupError('Plano inválido. Gere um novo plano antes de aplicar.');
  if (!plan.canApply) throw new ProjectSetupError('Resolva os conflitos antes de aplicar o plano.');
  await revalidate(record);
  const changed = plan.files.filter((file) => file.action !== 'unchanged');
  const result = {
    status: 'ready',
    changedFiles: changed.map((file) => file.path),
    unchangedFiles: plan.files
      .filter((file) => file.action === 'unchanged')
      .map((file) => file.path),
  };
  if (!changed.length) {
    await cleanPendingProjectState(record);
    return result;
  }

  let stage;
  let createdDirectory = false;
  const committed = [];
  try {
    if (!record.before.directory) {
      await mkdir(join(record.root, '.renova'), { mode: 0o700 });
      createdDirectory = true;
    }
    const directory = await inspect(record.root, '.renova', true);
    await revalidate(record, directory);
    stage = await mkdtemp(join(record.root, '.renova/.project-stage-'));
    for (const [index, file] of changed.entries()) {
      const stagedPath = join(stage, String(index));
      await writeFile(stagedPath, record.contents[file.path], {
        flag: 'wx',
        mode: record.before.files[file.path]?.mode ?? 0o600,
      });
      if (digest(await readFile(stagedPath)) !== file.afterHash) {
        throw new ProjectSetupError(
          'A preparação dos arquivos falhou. Execute o setup novamente.',
          1,
        );
      }
    }
    await revalidate(record, directory);
    for (const [index, file] of changed.entries()) {
      if ((await inspect(record.root, '.renova', true))?.identity !== directory?.identity) {
        throw new ProjectSetupError(
          'A pasta de configuração mudou durante o setup. Tente novamente.',
        );
      }
      const destination = await inspect(record.root, file.path);
      if (
        destination?.hash !== record.before.files[file.path]?.hash ||
        destination?.identity !== record.before.files[file.path]?.identity
      ) {
        throw new ProjectSetupError(
          'Um arquivo mudou durante o setup. Revise o projeto e tente novamente.',
        );
      }
      await inspectParents(record.root, file.path);
      await mkdir(dirname(join(record.root, file.path)), { recursive: true });
      await inspectParents(record.root, file.path);
      const stagedPath = join(stage, String(index));
      if (destination) await rename(stagedPath, join(record.root, file.path));
      else await link(stagedPath, join(record.root, file.path));
      committed.push(file);
      if (!destination) await rm(stagedPath);
    }
    await cleanPendingProjectState(record);
    return result;
  } catch (error) {
    // Desfaz somente bytes desta aplicação; nunca substitui uma edição concorrente.
    for (const file of committed.reverse()) {
      try {
        if ((await inspect(record.root, file.path))?.hash !== file.afterHash) continue;
        const previous = record.before.files[file.path];
        if (previous) {
          const rollback = join(stage, 'rollback');
          await writeFile(rollback, previous.content, { flag: 'wx', mode: previous.mode });
          await rename(rollback, join(record.root, file.path));
        } else await rm(join(record.root, file.path));
      } catch {
        // Preserva o arquivo se não puder provar que ainda pertence a esta aplicação.
      }
    }
    if (error instanceof ProjectSetupError) throw error;
    throw new ProjectSetupError(
      'Não foi possível aplicar a configuração local. Confira as permissões e execute o setup novamente.',
      1,
    );
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
    if (createdDirectory) await rmdir(join(record.root, '.renova')).catch(() => {});
  }
}

async function cleanPendingProjectState(record) {
  for (const previous of Object.values(record.before.files)) {
    if (!previous?.pendingLink) continue;
    const stat = await lstat(previous.pendingLink);
    if (stat.isFile() && `${stat.dev}:${stat.ino}` === previous.identity) {
      await rm(previous.pendingLink);
      await rmdir(join(previous.pendingLink, '..')).catch(() => {});
    }
  }
}
