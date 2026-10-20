import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const recipePath = 'templates/modules/auth/recipe.json';
const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function inspectParents(root, path) {
  const parts = path.split('/').slice(0, -1);
  for (let index = 1; index <= parts.length; index++) {
    try {
      const stat = await lstat(join(root, ...parts.slice(0, index)));
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw Object.assign(new Error('Unsafe parent'), { code: 'UNSAFE_PATH' });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function validDestination(path) {
  return (
    typeof path === 'string' &&
    /^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(path) &&
    path.split('/').every((part) => part !== '.' && part !== '..') &&
    (/^(apps\/(backend|frontend)|packages|tests|scripts\/auth)\//.test(path) ||
      ['package.json', 'pnpm-lock.yaml', 'docker-compose.yml', '.env.example'].includes(path))
  );
}

async function readRecipeFile(root, path) {
  await inspectParents(root, path);
  const stat = await lstat(join(root, path));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe recipe');
  return readFile(join(root, path));
}

/** A single checked-in recipe, outside the runtime workspaces. Never resolves dependencies. */
export async function readAuthRecipe(root) {
  const bytes = await readRecipeFile(root, recipePath);
  const recipe = JSON.parse(bytes.toString('utf8'));
  if (
    recipe.schemaVersion !== 1 ||
    !Array.isArray(recipe.entries) ||
    !recipe.entries.length ||
    new Set(recipe.entries.map((entry) => entry.path)).size !== recipe.entries.length
  )
    throw new Error('Invalid auth recipe');
  const entries = [];
  const inputs = { [recipePath]: digest(bytes) };
  for (const entry of recipe.entries) {
    if (
      !validDestination(entry.path) ||
      !(entry.beforeSha256 === null || /^[a-f0-9]{64}$/.test(entry.beforeSha256)) ||
      Object.keys(entry).sort().join(',') !== 'beforeSha256,path'
    )
      throw new Error('Invalid auth destination');
    const source = `templates/modules/auth/files/${entry.path}`;
    const content = await readRecipeFile(root, source);
    inputs[source] = digest(content);
    entries.push({ ...entry, content, afterSha256: digest(content) });
  }
  if (
    !entries.some((entry) => entry.path === 'pnpm-lock.yaml') ||
    !entries.some((entry) => entry.path === 'packages/auth/package.json')
  )
    throw new Error('Auth lockfile or package missing');
  // Publish this tracked package last: another clone can recognize complete composition without ignored local state.
  entries.sort(
    (a, b) =>
      Number(a.path === 'packages/auth/package.json') -
      Number(b.path === 'packages/auth/package.json'),
  );
  return { entries, inputs };
}

export async function verifyRecipeInputs(root, inputs) {
  for (const [path, expected] of Object.entries(inputs)) {
    if (digest(await readRecipeFile(root, path)) !== expected) throw new Error('Recipe changed');
  }
}
