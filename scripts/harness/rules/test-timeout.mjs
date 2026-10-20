/**
 * Timeouts do Vitest são contrato. Default 5s sob carga vira "flake" e o agente
 * aprende a retryar (Osmani; Central Ops #173/#176/#181).
 *
 * @param {{ files: { rel: string, content: string }[], options: { minMs?: number } }} ctx
 */
export function testTimeout(ctx) {
  const minMs = ctx.options.minMs ?? 1000;
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];

  for (const file of ctx.files) {
    if (!/vitest(\.[\w-]+)?\.config\.(ts|mjs|js)$/.test(file.rel.split('/').at(-1) ?? '')) {
      continue;
    }
    const timeoutMatch = file.content.match(/testTimeout\s*:\s*(\d[\d_]*)/);
    if (!timeoutMatch) {
      violations.push({
        file: file.rel,
        line: 1,
        id: 'test-timeout',
        message: 'vitest config sem testTimeout explícito',
      });
      continue;
    }
    const ms = Number((timeoutMatch[1] ?? '0').replaceAll('_', ''));
    if (!Number.isFinite(ms) || ms < minMs) {
      violations.push({
        file: file.rel,
        line: 1,
        id: 'test-timeout',
        message: `testTimeout ${ms} abaixo do mínimo honesto (${minMs}ms)`,
      });
    }
  }

  return violations;
}
