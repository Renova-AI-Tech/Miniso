#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { formatViolations, runHarness } from './engine.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const configPath = resolve(root, 'harness.rules.mjs');
const mod = await import(pathToFileURL(configPath).href);
const config = mod.default;
const result = runHarness({ root, config });

if (result.violations.length > 0) {
  console.error(formatViolations(result.violations));
  console.error(
    `\nharness:check falhou (${result.violations.length} violação(ões), ${result.filesScanned} arquivos, ${result.rulesRun} regras)`,
  );
  process.exit(1);
}

console.log(`harness:check ok (${result.filesScanned} arquivos, ${result.rulesRun} regras)`);
