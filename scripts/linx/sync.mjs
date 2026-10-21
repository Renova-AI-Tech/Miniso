import { runCollection } from './collect.mjs';
import { materialize } from './materialize.mjs';

function value(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const daysBack = Number(value('--days-back', '3'));
const profile = value('--profile', 'dashboard');
const end = value('--end', new Date().toISOString().slice(0, 10));
const full = profile === 'full';

if (!Number.isInteger(daysBack) || daysBack < 1) throw new Error('--days-back deve ser positivo.');
if (!['dashboard', 'full'].includes(profile))
  throw new Error('--profile deve ser dashboard ou full.');

try {
  const collection = await runCollection({ daysBack, profile, end });
  const analytics = await materialize({
    full,
    incrementalDays: Math.max(daysBack, 7),
    runIds: collection.results.map((result) => result.runId),
  });
  console.log(JSON.stringify({ collection, analytics }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
