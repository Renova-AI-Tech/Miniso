import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));

describe('contrato CI Blacksmith (REQ-031, REQ-039)', () => {
  it('recusa CI incompleto mesmo com workflow secundario verde', () => {
    const command = workflow.jobs.required.steps[0].run;
    for (const result of ['failure', 'cancelled', 'skipped', 'pending', '']) {
      for (const env of [
        {
          QUALITY_RESULT: result,
          FULL_RESULT: 'success',
          PROFILES_RESULT: 'success',
          SOURCE_REPOSITORY: 'Renova-AI-Tech/renova-template',
        },
        {
          QUALITY_RESULT: 'success',
          FULL_RESULT: result,
          PROFILES_RESULT: 'success',
          SOURCE_REPOSITORY: 'Renova-AI-Tech/renova-template',
        },
        {
          QUALITY_RESULT: 'success',
          FULL_RESULT: 'success',
          PROFILES_RESULT: result,
          SOURCE_REPOSITORY: 'Renova-AI-Tech/renova-template',
        },
      ]) {
        expect(spawnSync('bash', ['-c', command], { env }).status).toBe(1);
      }
    }
    expect(
      spawnSync('bash', ['-c', command], {
        env: {
          QUALITY_RESULT: 'success',
          FULL_RESULT: 'success',
          PROFILES_RESULT: 'success',
          SOURCE_REPOSITORY: 'Renova-AI-Tech/renova-template',
        },
      }).status,
    ).toBe(0);
  });

  it('exige matriz no template e valida apenas o perfil escolhido em clones', () => {
    expect(workflow.jobs.profiles.if).toBe("github.repository == 'Renova-AI-Tech/renova-template'");
    const command = workflow.jobs.required.steps[0].run;
    for (const profile of ['failure', 'cancelled', 'pending', 'success', '']) {
      expect(
        spawnSync('bash', ['-c', command], {
          env: {
            QUALITY_RESULT: 'success',
            FULL_RESULT: 'success',
            PROFILES_RESULT: profile,
            SOURCE_REPOSITORY: 'Renova-AI-Tech/meu-produto',
          },
        }).status,
      ).toBe(1);
    }
    expect(
      spawnSync('bash', ['-c', command], {
        env: {
          QUALITY_RESULT: 'success',
          FULL_RESULT: 'success',
          PROFILES_RESULT: 'skipped',
          SOURCE_REPOSITORY: 'Renova-AI-Tech/meu-produto',
        },
      }).status,
    ).toBe(0);
    expect(workflow.jobs.profiles.steps.map((step: { run?: string }) => step.run)).toContain(
      'pnpm test:profiles',
    );
  });

  it('executa todos os jobs em Blacksmith sem fallback', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['quality', 'full', 'profiles', 'required']);
    for (const job of Object.values(workflow.jobs) as Record<string, unknown>[]) {
      expect(job['runs-on']).toMatch(/^blacksmith-[24]vcpu-ubuntu-2404$/);
      expect(job['continue-on-error']).toBeUndefined();
    }
  });

  it('cobre PR push e exige agregador mesmo em falha ou skip', () => {
    expect(workflow.on.pull_request.types).toContain('synchronize');
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.jobs.required.if).toBe('always()');
    expect(workflow.jobs.required.needs).toEqual(['quality', 'full', 'profiles']);
    expect(workflow.jobs.quality.if).toBeUndefined();
  });

  it('executa banco e navegador como gates bloqueantes', () => {
    const commands = workflow.jobs.full.steps
      .map((step: { run?: string }) => step.run)
      .filter(Boolean);
    expect(commands).toContain('pnpm test:integration');
    expect(commands).toContain('pnpm test:e2e');
    expect(commands).toContain('pnpm exec playwright install --with-deps chromium');
    expect(commands).toContain('pnpm install --frozen-lockfile');
  });

  it('fixa actions e limita permissoes sem credenciais de publicacao', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs) as {
      steps: { uses?: string; with?: Record<string, unknown> }[];
    }[]) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
        if (step.uses?.startsWith('actions/checkout@')) {
          expect(step.with?.['persist-credentials']).toBe(false);
          expect(step.with?.ref).toBe(`\${{ github.event.pull_request.head.sha || github.sha }}`);
        }
      }
    }
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).not.toContain('secrets.');
  });
});
