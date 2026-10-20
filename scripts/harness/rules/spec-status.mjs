import { lineNumberAt, matchGlob } from '../walk.mjs';

const STATUS_RE = /\*\*Status:\*\*\s*`?([A-Za-z_]+)`?/g;

/**
 * @param {{ files: { rel: string, content: string }[], options: { tasksGlob?: string, allowed?: string[] } }} ctx
 */
export function specStatus(ctx) {
  const glob = ctx.options.tasksGlob ?? 'docs/specs/**/tasks.md';
  const allowed = new Set(ctx.options.allowed ?? ['todo', 'in_progress', 'done', 'blocked']);
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];

  for (const file of ctx.files) {
    if (!matchGlob(file.rel, glob)) continue;
    STATUS_RE.lastIndex = 0;
    let match = STATUS_RE.exec(file.content);
    while (match) {
      const status = match[1]?.toLowerCase() ?? '';
      const line = lineNumberAt(file.content, match.index);
      if (!allowed.has(status)) {
        violations.push({
          file: file.rel,
          line,
          id: 'spec-status',
          message: `status inválido "${match[1]}" (use: ${[...allowed].join(', ')})`,
        });
      }
      match = STATUS_RE.exec(file.content);
    }
  }

  return violations;
}
