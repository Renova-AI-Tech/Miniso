import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ProjectSetupError, requireSupportedConfig } from './generate.mjs';

export function parseSetupArguments(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  const options = { configPath: null, yes: false, plan: false, json: false, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--config', '--yes', '--plan', '--json', '--help'].includes(flag) || seen.has(flag)) {
      throw new ProjectSetupError('Opção inválida ou repetida. Use pnpm run setup -- --help.');
    }
    seen.add(flag);
    if (flag === '--config') {
      const path = args[++index];
      if (!path || path.startsWith('-')) {
        throw new ProjectSetupError('Informe o arquivo JSON depois de --config.');
      }
      options.configPath = path;
    } else options[flag.slice(2)] = true;
  }
  return options;
}

async function readConfig(path) {
  let input;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > 65_536) throw new Error();
    input = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ProjectSetupError(
      'Não foi possível ler a configuração. Informe um arquivo JSON válido de até 64 KB.',
    );
  }
  return requireSupportedConfig(input);
}

function requireTerminal(input, output) {
  if (!input.isTTY || !output.isTTY) {
    throw new ProjectSetupError(
      'Para IA ou terminal sem perguntas, use --config renova.project.json com --plan ou --yes.',
    );
  }
}

async function withQuestions({ input, output, ask }, run) {
  requireTerminal(input, output);
  const terminal = ask ? null : createInterface({ input, output });
  try {
    return await run(ask ?? ((question) => terminal.question(question)));
  } catch (error) {
    if (error instanceof ProjectSetupError) throw error;
    throw new ProjectSetupError('Configuração interrompida. Nenhum arquivo foi alterado.');
  } finally {
    terminal?.close();
  }
}

async function readLocalIdentity(root) {
  let keepSlug = false;
  let keepProfile = false;
  for (const path of ['.env', '.renova/db-state.json', '.renova/project-state.json']) {
    try {
      await lstat(resolve(root, path));
      keepSlug = true;
      if (path !== '.renova/project-state.json') keepProfile = true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new ProjectSetupError('Não foi possível conferir a identidade local do projeto.', 1);
      }
    }
  }
  return { keepSlug, keepProfile };
}

function slugForName(name, current) {
  const slug =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
      .replace(/-$/, '') || 'meu-projeto';
  try {
    // O schema decide validade e nomes reservados; não mantenha outra lista aqui.
    requireSupportedConfig({ ...current, project: { ...current.project, slug } });
    return slug;
  } catch {
    return `projeto-${slug}`.slice(0, 48).replace(/-$/, '');
  }
}

/** O nome informado e o JSON passam pelo mesmo schema e catálogo local disponível. */
export async function collectSetupConfig({
  root,
  options,
  input = process.stdin,
  output = process.stdout,
  ask,
}) {
  if (options.configPath) return readConfig(resolve(root, options.configPath));
  if (options.json) {
    throw new ProjectSetupError('O modo JSON precisa de --config renova.project.json.');
  }
  requireTerminal(input, output);
  const current = await readConfig(resolve(root, 'renova.project.json'));
  const { keepSlug, keepProfile } = await readLocalIdentity(root);
  return withQuestions({ input, output, ask }, async (question) => {
    const displayName =
      (await question(`Qual é o nome do projeto? [${current.project.displayName}] `)).trim() ||
      current.project.displayName;
    const configured = requireSupportedConfig({
      ...current,
      project: {
        displayName,
        slug:
          keepSlug || displayName === current.project.displayName
            ? current.project.slug
            : slugForName(displayName, current),
      },
    });
    if (keepProfile || current.profile === 'authenticated') return configured;
    const choice =
      (
        await question(
          'Quem pode acessar? [1] Sem login (padrão) [2] Contas liberadas pelo responsável: ',
        )
      ).trim() || '1';
    if (!['1', '2'].includes(choice))
      throw new ProjectSetupError(
        'Escolha 1 para sem login ou 2 para contas liberadas pelo responsável.',
      );
    return requireSupportedConfig({
      ...configured,
      profile: choice === '2' ? 'authenticated' : 'public',
      capabilities: choice === '2' ? ['auth'] : [],
    });
  });
}

export function summarizePlan(plan) {
  const actions = { create: 'Criar', update: 'Atualizar', unchanged: 'Preservar' };
  return [
    `Projeto: ${plan.project.displayName} (${plan.project.slug})`,
    `Perfil: ${plan.profile === 'authenticated' ? 'Com login; contas liberadas pelo responsável, sem cadastro público' : 'Sem login'}. Destino: este computador.`,
    'Publicação no Railway ainda não está disponível.',
    'Arquivos de configuração:',
    ...plan.files.map((file) => `  ${actions[file.action]} ${file.path}`),
    ...plan.conflicts.map((conflict) => `Conflito em ${conflict.path}: ${conflict.message}`),
    'Seu código, banco e segredos existentes serão preservados.',
  ].join('\n');
}

export async function confirmPlan(
  plan,
  { input = process.stdin, output = process.stdout, ask } = {},
) {
  if (!plan.canApply) return false;
  return withQuestions({ input, output, ask }, async (question) => {
    const answer = await question('Aplicar esta configuração local? [s/N] ');
    return ['s', 'sim'].includes(answer.trim().toLowerCase());
  });
}
