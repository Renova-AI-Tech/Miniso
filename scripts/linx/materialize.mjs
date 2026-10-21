import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

try {
  loadEnvFile('.env');
} catch {
  // The deployment injects environment variables directly.
}

const { Client } = pg;
const sqlPath = new URL('./materialize.sql', import.meta.url);

export async function materialize({ full = false, incrementalDays = 7, runIds = [] } = {}) {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString)
    throw new Error('MIGRATION_DATABASE_URL é obrigatória para materializar os dados.');
  if (!Number.isInteger(incrementalDays) || incrementalDays < 1)
    throw new Error('--incremental-days deve ser positivo.');
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'CREATE TEMP TABLE linx_materialize_runs (id bigint PRIMARY KEY) ON COMMIT DROP',
    );
    if (full || runIds.length === 0) {
      await client.query(
        `INSERT INTO linx_materialize_runs (id)
         SELECT id FROM replica.collection_run
         WHERE $1::boolean OR started_at >= now() - make_interval(days => $2::integer)`,
        [full, incrementalDays],
      );
    } else {
      await client.query(
        'INSERT INTO linx_materialize_runs (id) SELECT value::bigint FROM unnest($1::text[]) AS values(value)',
        [runIds.map(String)],
      );
    }
    await client.query(await readFile(sqlPath, 'utf8'));
    if (full) await client.query('TRUNCATE analytics.daily_sales_cache');
    else
      await client.query(
        'DELETE FROM analytics.daily_sales_cache WHERE document_date >= current_date - $1::integer',
        [incrementalDays],
      );
    const cacheQuery = full
      ? 'INSERT INTO analytics.daily_sales_cache SELECT * FROM analytics.daily_sales'
      : 'INSERT INTO analytics.daily_sales_cache SELECT * FROM analytics.daily_sales WHERE document_date >= current_date - $1::integer';
    await client.query(
      `${cacheQuery} ON CONFLICT (portal, company_cnpj, document_date, product_code) DO UPDATE SET net_quantity = EXCLUDED.net_quantity, net_revenue = EXCLUDED.net_revenue, cost_value = EXCLUDED.cost_value, gross_margin = EXCLUDED.gross_margin`,
      full ? [] : [incrementalDays],
    );
    await client.query('ANALYZE analytics.daily_sales_cache');
    await client.query('COMMIT');
    const result = await client.query(
      "SELECT table_name FROM (VALUES ('store'), ('product'), ('sales_movement'), ('inventory_snapshot')) AS tables(table_name)",
    );
    const counts = {};
    for (const row of result.rows) {
      const count = await client.query(
        `SELECT count(*)::int AS count FROM analytics.${row.table_name}`,
      );
      counts[row.table_name] = count.rows[0].count;
    }
    return counts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('materialize.mjs')) {
  const full = process.argv.includes('--full');
  const index = process.argv.indexOf('--incremental-days');
  const incrementalDays = Number(index >= 0 ? process.argv[index + 1] : 7);
  materialize({ full, incrementalDays })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
