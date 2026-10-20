#!/usr/bin/env node
/**
 * Claude Code PostToolUse: formata o arquivo recém-escrito com Biome.
 * Lê JSON do stdin (file_path). Falha visível para o agente; não é conselho.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const raw = readFileSync(0, 'utf8').trim();
if (!raw) process.exit(0);

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.path ?? '';
if (!/\.(js|mjs|ts|tsx|css|json)$/.test(filePath)) process.exit(0);

const result = spawnSync(
  'pnpm',
  ['exec', 'biome', 'check', '--write', '--no-errors-on-unmatched', filePath],
  { stdio: 'inherit' },
);

process.exit(result.status === 0 ? 0 : (result.status ?? 1));
