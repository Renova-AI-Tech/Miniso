import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function runGate(fail = '') {
  const dir = mkdtempSync(join(tmpdir(), 'renova-gate-'));
  const log = join(dir, 'commands');
  writeFileSync(
    join(dir, 'pnpm'),
    '#!/bin/sh\necho "$*" >> "$GATE_LOG"\n[ "$*" != "$GATE_FAIL" ]\n',
    { mode: 0o700 },
  );
  let passed = true;
  try {
    execFileSync('bash', ['scripts/check-full'], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GATE_LOG: log,
        GATE_FAIL: fail,
        SKIP_E2E: '1',
      },
      stdio: 'pipe',
    });
  } catch {
    passed = false;
  }
  const commands = readFileSync(log, 'utf8').trim().split('\n');
  rmSync(dir, { recursive: true, force: true });
  return { passed, commands };
}

describe('gate completo executavel (REQ-032)', () => {
  it('exige build integracao e navegador mesmo com variavel antiga de skip', () => {
    const result = runGate();
    expect(result.passed).toBe(true);
    expect(result.commands.slice(-3)).toEqual(['build', 'test:integration', 'test:e2e']);
  });

  it('falha no primeiro gate de qualidade sem seguir para build', () => {
    expect(runGate('harness:check')).toEqual({ passed: false, commands: ['harness:check'] });
  });

  it('falha de build impede integracao', () => {
    const result = runGate('build');
    expect(result.passed).toBe(false);
    expect(result.commands.at(-1)).toBe('build');
    expect(result.commands).not.toContain('test:integration');
  });

  it('falha de integracao impede navegador e nao retorna sucesso', () => {
    const result = runGate('test:integration');
    expect(result.passed).toBe(false);
    expect(result.commands.at(-1)).toBe('test:integration');
    expect(result.commands).not.toContain('test:e2e');
  });

  it('falha de navegador impede sucesso final', () => {
    const result = runGate('test:e2e');
    expect(result.passed).toBe(false);
    expect(result.commands.at(-1)).toBe('test:e2e');
  });
});
