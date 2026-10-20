import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyProject, planProject } from '../../scripts/project/generate.mjs';
import {
  collectSetupConfig,
  confirmPlan,
  parseSetupArguments,
  summarizePlan,
} from '../../scripts/project/prompts.mjs';

const initial = {
  schemaVersion: 1,
  project: { slug: 'renova-local', displayName: 'Meu projeto Renova' },
  profile: 'public',
  capabilities: [],
  initialTarget: 'local',
  origin: { templateVersion: '0.1.0-dev', sourceRevision: 'd0c2db9', uiVersion: '0.1.0-dev' },
};
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'renova-prompts-'));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), JSON.stringify(initial));
  return root;
}
const input = { isTTY: true };
const output = { isTTY: true, write: () => true };
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('guided configuration (REQ-002, REQ-003)', () => {
  it('equivale escolhas interativas ao manifesto', async () => {
    const root = await fixture();
    const answers = ['Meu projeto', '1'];
    const questions: string[] = [];
    const interactive = await collectSetupConfig({
      root,
      options: parseSetupArguments([]),
      input,
      output,
      ask: async (question: string) => {
        questions.push(question);
        return answers.shift();
      },
    });
    expect(questions).toHaveLength(2);
    expect(questions[0]).toContain('nome');
    expect(questions[1]).toContain('Sem login');
    expect(questions.join('\n')).not.toMatch(/Railway|ORM|Kysely|provider|credencial/);
    const expected = {
      ...initial,
      project: { slug: 'meu-projeto', displayName: 'Meu projeto' },
    };
    expect(interactive).toEqual(expected);
    await writeFile(join(root, 'config.json'), JSON.stringify(expected));
    const declarative = await collectSetupConfig({
      root,
      options: parseSetupArguments(['--config', 'config.json', '--yes']),
      input: { isTTY: false },
      output,
    });
    expect(declarative).toEqual(interactive);
    expect(await planProject(root, declarative)).toEqual(await planProject(root, interactive));
  });

  it('oferece login fechado sem pedir escolhas técnicas e preserva o perfil na repetição', async () => {
    const root = await fixture();
    const answers = ['', '2'];
    const selected = await collectSetupConfig({
      root,
      options: parseSetupArguments([]),
      input,
      output,
      ask: async () => answers.shift(),
    });
    expect(selected).toEqual({ ...initial, profile: 'authenticated', capabilities: ['auth'] });
    await writeFile(join(root, 'renova.project.json'), JSON.stringify(selected));
    const questions: string[] = [];
    expect(
      await collectSetupConfig({
        root,
        options: parseSetupArguments([]),
        input,
        output,
        ask: async (question: string) => {
          questions.push(question);
          return '';
        },
      }),
    ).toEqual(selected);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain('nome');
  });

  it('recusa escolha de perfil desconhecida sem aplicar', async () => {
    const root = await fixture();
    const answers = ['', 'talvez'];
    await expect(
      collectSetupConfig({
        root,
        options: parseSetupArguments([]),
        input,
        output,
        ask: async () => answers.shift(),
      }),
    ).rejects.toMatchObject({ code: 2 });
    expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(initial);
  });

  it('permite escolher login após configuração interrompida antes do ambiente, preservando o slug', async () => {
    const root = await fixture();
    await applyProject(await planProject(root, initial));
    const state = await readFile(join(root, '.renova/project-state.json'), 'utf8');
    const answers = ['Nome atualizado', '2'];
    const questions: string[] = [];
    const selected = await collectSetupConfig({
      root,
      options: parseSetupArguments([]),
      input,
      output,
      ask: async (question: string) => {
        questions.push(question);
        return answers.shift();
      },
    });
    expect(questions).toHaveLength(2);
    expect(selected).toEqual({
      ...initial,
      project: { slug: initial.project.slug, displayName: 'Nome atualizado' },
      profile: 'authenticated',
      capabilities: ['auth'],
    });
    expect(await readFile(join(root, '.renova/project-state.json'), 'utf8')).toBe(state);
  });

  it.each(['.env', '.renova/db-state.json'])(
    'não oferece troca de perfil quando %s já existe',
    async (path) => {
      const root = await fixture();
      await mkdir(join(root, '.renova'));
      await writeFile(join(root, path), 'identity-sentinel');
      const questions: string[] = [];
      const selected = await collectSetupConfig({
        root,
        options: parseSetupArguments([]),
        input,
        output,
        ask: async (question: string) => {
          questions.push(question);
          return '';
        },
      });
      expect(questions).toHaveLength(1);
      expect(selected).toEqual(initial);
      expect(await readFile(join(root, path), 'utf8')).toBe('identity-sentinel');
    },
  );

  it('sem TTY exige config explicita e nao inicia prompt', async () => {
    const root = await fixture();
    let asked = false;
    for (const flags of [[], ['--yes'], ['--plan'], ['--json']]) {
      await expect(
        collectSetupConfig({
          root,
          options: parseSetupArguments(flags),
          input: { isTTY: false },
          output,
          ask: async () => {
            asked = true;
            return '';
          },
        }),
      ).rejects.toMatchObject({ code: 2 });
    }
    expect(asked).toBe(false);
  });

  it('mostra defaults simples e preserva identificador quando ambiente existe', async () => {
    const root = await fixture();
    const defaults = await collectSetupConfig({
      root,
      options: parseSetupArguments([]),
      input,
      output,
      ask: async () => '',
    });
    expect(defaults).toEqual(initial);
    await writeFile(join(root, '.env'), 'DATABASE_URL=secret-sentinel');
    const answers = ['RH'];
    const renamed = await collectSetupConfig({
      root,
      options: parseSetupArguments([]),
      input,
      output,
      ask: async () => answers.shift(),
    });
    expect(renamed.project).toEqual({ slug: 'renova-local', displayName: 'RH' });
    expect(await readFile(join(root, '.env'), 'utf8')).toBe('DATABASE_URL=secret-sentinel');
  });

  it('recusa Railway no manifesto sem perguntar nem alterar arquivos', async () => {
    const root = await fixture();
    for (const unsupported of [{ ...initial, initialTarget: 'railway' }]) {
      const questions: string[] = [];
      await writeFile(join(root, 'renova.project.json'), JSON.stringify(unsupported));
      for (const flags of [[], ['--config', 'renova.project.json', '--yes']]) {
        await expect(
          collectSetupConfig({
            root,
            options: parseSetupArguments(flags),
            input,
            output,
            ask: async (question: string) => {
              questions.push(question);
              return '';
            },
          }),
        ).rejects.toMatchObject({ code: 2 });
      }
      expect(questions).toHaveLength(0);
      expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
        unsupported,
      );
    }
  });

  it('rejeita flags invalidas duplicadas e config ausente sem interpretar shell', () => {
    expect(parseSetupArguments(['--', '--config', 'config.json', '--plan', '--json'])).toEqual({
      configPath: 'config.json',
      yes: false,
      plan: true,
      json: true,
      help: false,
    });
    for (const argv of [
      ['--unknown', 'secret-sentinel'],
      ['--config'],
      ['--config', '--yes'],
      ['--yes', '--yes'],
      ['--config', 'a.json', '--config', 'b.json'],
      ['argumento'],
    ]) {
      expect(() => parseSetupArguments(argv)).toThrow();
      try {
        parseSetupArguments(argv);
      } catch (error) {
        expect(error).toMatchObject({ code: 2 });
        expect(String(error)).not.toContain('secret-sentinel');
      }
    }
  });

  it('rejeita manifesto invalido sem imprimir entradas ou segredo', async () => {
    const root = await fixture();
    for (const content of [
      '{"password":"secret-sentinel"}',
      'invalid-secret-sentinel',
      JSON.stringify({ ...initial, project: { slug: 'rh', displayName: 'RH' } }),
    ]) {
      await writeFile(join(root, 'input.json'), content);
      await expect(
        collectSetupConfig({
          root,
          options: parseSetupArguments(['--config', 'input.json', '--yes']),
          input,
          output,
        }),
      ).rejects.toSatisfy(
        (error: { code: number; message: string }) =>
          error.code === 2 && !error.message.includes('secret-sentinel'),
      );
      expect(await readFile(join(root, 'input.json'), 'utf8')).toBe(content);
    }
  });

  it('resume arquivos e perfil antes de aceite com resposta negativa padrao', async () => {
    const root = await fixture();
    const plan = await planProject(root, initial);
    const summary = summarizePlan(plan);
    expect(summary).toContain('Meu projeto Renova');
    expect(summary).toContain('Sem login');
    expect(summary).toContain('Destino: este computador.');
    expect(summary).toContain('Publicação no Railway ainda não está disponível.');
    expect(summary).toContain('renova.project.json');
    expect(summary).toContain('.renova/project-state.json');
    expect(summary).not.toContain(root);
    expect(await confirmPlan(plan, { input, output, ask: async () => '' })).toBe(false);
    expect(await confirmPlan(plan, { input, output, ask: async () => 's' })).toBe(true);
    await expect(confirmPlan(plan, { input: { isTTY: false }, output })).rejects.toMatchObject({
      code: 2,
    });
  });

  it.each([
    ['Gestão de Projetos', 'gestao-de-projetos'],
    ['RH', 'projeto-rh'],
    ['A', 'projeto-a'],
    ['99 projetos', 'projeto-99-projetos'],
    ['a'.repeat(80), 'a'.repeat(48)],
    [`${'a'.repeat(47)} b`, 'a'.repeat(47)],
    ['CON', 'projeto-con'],
    ['postgres', 'projeto-postgres'],
    ['template', 'projeto-template'],
    ['node_modules', 'projeto-node-modules'],
    ['🙂', 'meu-projeto'],
    ['项目', 'meu-projeto'],
  ])(
    'deriva identificador valido para o nome %s sem perguntar dados tecnicos',
    async (name, slug) => {
      const root = await fixture();
      const questions: string[] = [];
      const result = await collectSetupConfig({
        root,
        options: parseSetupArguments([]),
        input,
        output,
        ask: async (question: string) => {
          questions.push(question);
          return question.includes('nome') ? name : '1';
        },
      });
      expect(result.project).toEqual({
        slug,
        displayName: name,
      });
      expect(questions).toHaveLength(2);
      expect((await planProject(root, result)).canApply).toBe(true);
      expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
        initial,
      );
    },
  );

  it.each(['a'.repeat(81), 'Nome\u0000inválido', 'Nome\u200binválido'])(
    'recusa nome de exibicao invalido sem criar arquivos: %s',
    async (name) => {
      const root = await fixture();
      await expect(
        collectSetupConfig({
          root,
          options: parseSetupArguments([]),
          input,
          output,
          ask: async () => name,
        }),
      ).rejects.toMatchObject({ code: 2 });
      expect(JSON.parse(await readFile(join(root, 'renova.project.json'), 'utf8'))).toEqual(
        initial,
      );
    },
  );
});
