import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const maxResponseBytes = 80 * 1024 * 1024;
const pageCap = 5000;
const maxStatementParameters = 60_000;
const maxRowsPerStatement = 250;

try {
  loadEnvFile('.env');
} catch {
  // Standalone jobs may receive all settings from the process environment.
}

const fullMethods = [
  'LinxClientesFornec',
  'LinxConfiguracoesTributarias',
  'LinxFaturas',
  'LinxLojas',
  'LinxMetasVendedores',
  'LinxMovimento',
  'LinxMovimentoCartoes',
  'LinxPedidosCompra',
  'LinxPedidosVenda',
  'LinxPlanos',
  'LinxProdutos',
  'LinxProdutosDetalhes',
  'LinxVendedores',
  'LinxXMLDocumentos',
];
const dashboardMethods = [
  'LinxClientesFornec',
  'LinxLojas',
  'LinxMovimento',
  'LinxMovimentoCartoes',
  'LinxProdutos',
  'LinxProdutosDetalhes',
];

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Data inválida: ${value}.`);
  return value;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlDecode(value) {
  return String(value ?? '')
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function tagContents(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  return pattern.exec(xml)?.[1] ?? '';
}

function allTagContents(xml, tag) {
  const pattern = new RegExp(
    `<${tag}(?:\\s+(?!\\/)[^>]*)?\\s*(?:\\/>|>([\\s\\S]*?)</${tag}>)`,
    'gi',
  );
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? '');
}

export function parseResponse(xml, method) {
  const success = tagContents(xml, 'ResponseSuccess').trim().toLowerCase();
  if (success !== 'true') {
    const responseError = tagContents(xml, 'ResponseError');
    const message =
      xmlDecode(tagContents(xml, 'ResponseMessage') || tagContents(responseError, 'Message')).slice(
        0,
        300,
      ) || 'consulta recusada';
    throw new Error(`Linx recusou ${method}: ${message}`);
  }
  const columns = allTagContents(tagContents(xml, 'C'), 'D').map((value) => xmlDecode(value));
  const rows = [];
  for (const rowXml of allTagContents(tagContents(xml, 'ResponseData'), 'R')) {
    const values = allTagContents(rowXml, 'D').map((value) => xmlDecode(value));
    if (!columns.length) {
      rows.push(Object.fromEntries(values.map((value, index) => [`campo_${index + 1}`, value])));
      continue;
    }
    if (values.length > columns.length) throw new Error(`Resposta inconsistente em ${method}.`);
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])));
  }
  return rows;
}

function collectionValues(path) {
  try {
    const collection = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    return Object.fromEntries(
      (Array.isArray(collection?.variable) ? collection.variable : [])
        .filter((item) => typeof item?.key === 'string')
        .map((item) => [item.key, String(item.value ?? item.current ?? '')]),
    );
  } catch {
    throw new Error('Arquivo de coleção Linx inválido ou inacessível.');
  }
}

function collectionPath() {
  const configured = process.env.LINX_COLLECTION?.trim();
  if (configured) return resolve(configured);
  const candidates = [
    join(process.cwd(), 'secrets', 'MiniSo - Linx.json'),
    join(process.cwd(), 'MiniSo - Linx.json'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function authFromEnvironment() {
  const path = collectionPath();
  const values = path ? collectionValues(path) : {};
  const source = path ? values : process.env;
  const auth = {
    endpoint: source.LINX_URL || source.url || 'https://webapi.microvix.com.br/1.0/api/integracao',
    user: source.LINX_USER || source.user,
    password: source.LINX_PASSWORD || source.password,
    key: source.LINX_KEY || source.chave,
    portal: source.LINX_PORTAL || source.portal || '18376',
  };
  const missing = ['user', 'password', 'key', 'portal'].filter((field) => !auth[field]);
  if (missing.length) throw new Error(`Credenciais Linx ausentes: ${missing.join(', ')}.`);
  return auth;
}

function requestXml(auth, endpoint, parameters) {
  const params = endpoint.method === 'LinxMetodos' ? [] : [['chave', auth.key]];
  params.push(...Object.entries(parameters));
  const serialized = params
    .map(([key, value]) => `<Parameter id="${xmlEscape(key)}">${xmlEscape(value)}</Parameter>`)
    .join('');
  return `<LinxMicrovix><Authentication user="${xmlEscape(auth.user)}" password="${xmlEscape(auth.password)}"/><ResponseFormat>xml</ResponseFormat><IdPortal>${xmlEscape(auth.portal)}</IdPortal><Command><Name>${xmlEscape(endpoint.method)}</Name><Parameters>${serialized}</Parameters></Command></LinxMicrovix>`;
}

async function queryLinx(auth, endpoint, parameters) {
  const body = requestXml(auth, endpoint, parameters);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(auth.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/xml', accept: 'application/xml' },
        body,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > maxResponseBytes)
        throw new Error('resposta excedeu o limite de memória');
      return parseResponse(buffer.toString('utf8').replace(/^\uFEFF/, ''), endpoint.method);
    } catch (error) {
      if (attempt === 2) throw new Error(`Falha em ${endpoint.method}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  return [];
}

export function safeColumn(name) {
  let normalized = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized || normalized.startsWith('_'))
    normalized = `field_${createHash('sha1').update(String(name)).digest('hex').slice(0, 10)}`;
  if (['user', 'current_user', 'session_user', 'table', 'column'].includes(normalized))
    normalized = `linx_${normalized}`;
  return normalized.slice(0, 63);
}

function identifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function recordHash(method, company, row) {
  return createHash('sha256').update(canonical({ method, company, row })).digest('hex');
}

async function endpointRows(client) {
  const result = await client.query(
    'SELECT method, table_name, requires_company, supports_cursor, start_parameter, end_parameter FROM replica.endpoint_catalog ORDER BY method',
  );
  return result.rows;
}

async function discoveredCompanies(client) {
  const result = await client.query(
    "SELECT DISTINCT regexp_replace(coalesce(_payload->>'CNPJ', ''), '\\D', '', 'g') AS cnpj FROM replica.linx_grupo_lojas WHERE length(regexp_replace(coalesce(_payload->>'CNPJ', ''), '\\D', '', 'g')) = 14 ORDER BY 1",
  );
  return result.rows.map((row) => row.cnpj);
}

async function ensureColumns(client, table, rows, columnCache) {
  const mapping = columnCache.get(table) ?? new Map();
  const usedColumns = new Set(mapping.values());
  for (const field of [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()) {
    if (mapping.has(field)) continue;
    let column = safeColumn(field);
    if (usedColumns.has(column))
      column = `${column.slice(0, 52)}_${createHash('sha1').update(field).digest('hex').slice(0, 10)}`;
    mapping.set(field, column);
    usedColumns.add(column);
    await client.query(
      `ALTER TABLE replica.${identifier(table)} ADD COLUMN IF NOT EXISTS ${identifier(column)} text`,
    );
  }
  columnCache.set(table, mapping);
  return mapping;
}

async function insertRows(client, endpoint, company, portal, runId, rows, columnCache) {
  if (!rows.length) return 0;
  const uniqueRows = [];
  const recordKeys = new Set();
  for (const row of rows) {
    const timestamp = row.timestamp ? Number(row.timestamp) : null;
    const hash = recordHash(endpoint.method, company, row);
    const key = Number.isFinite(timestamp) ? `timestamp:${timestamp}` : `hash:${hash}`;
    if (recordKeys.has(key)) continue;
    recordKeys.add(key);
    uniqueRows.push(row);
  }
  rows = uniqueRows;
  if (!rows.length) return 0;
  const mapping = await ensureColumns(client, endpoint.table_name, rows, columnCache);
  const columns = [
    '_portal',
    '_company_cnpj',
    '_linx_timestamp',
    '_record_hash',
    '_record_key',
    '_payload',
    '_collection_run_id',
    ...mapping.values(),
  ];
  const updates = [
    '_portal',
    '_company_cnpj',
    '_linx_timestamp',
    '_record_hash',
    '_payload',
    '_collection_run_id',
    ...mapping.values(),
    '_collected_at',
  ];
  const updateClause = updates
    .map((column) => `${identifier(column)} = EXCLUDED.${identifier(column)}`)
    .join(',');
  const rowsPerStatement = Math.max(
    1,
    Math.min(maxRowsPerStatement, Math.floor(maxStatementParameters / columns.length)),
  );
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
    const page = rows.slice(offset, offset + rowsPerStatement);
    const values = [];
    const tuples = page.map((row) => {
      const hash = recordHash(endpoint.method, company, row);
      const timestamp = row.timestamp ? Number(row.timestamp) : null;
      const rowValues = [
        portal,
        company,
        Number.isFinite(timestamp) ? timestamp : null,
        hash,
        timestamp ? `timestamp:${timestamp}` : `hash:${hash}`,
        JSON.stringify(row),
        runId,
        ...mapping.keys().map((field) => row[field] ?? null),
      ];
      const placeholders = rowValues.map((value, index) => {
        values.push(value);
        const placeholder = `$${values.length}`;
        return columns[index] === '_payload' ? `${placeholder}::jsonb` : placeholder;
      });
      return `(${placeholders.join(',')})`;
    });
    const statement = `INSERT INTO replica.${identifier(endpoint.table_name)} (${columns.map(identifier).join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (_record_key) DO UPDATE SET ${updateClause}`;
    const result = await client.query(statement, values);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

function windows(endpoint, start, end, windowDays) {
  if (!endpoint.start_parameter) return [[null, null]];
  const result = [];
  let current = new Date(`${start}T00:00:00Z`);
  const finish = new Date(`${end}T00:00:00Z`);
  while (current <= finish) {
    const windowEnd = new Date(current);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays - 1);
    if (windowEnd > finish) windowEnd.setTime(finish.getTime());
    result.push([current.toISOString().slice(0, 10), windowEnd.toISOString().slice(0, 10)]);
    current = new Date(windowEnd);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

async function collect(client, auth, endpoint, company, start, end, options) {
  const run = await client.query(
    "INSERT INTO replica.collection_run (method, company_cnpj, window_start, window_end, cursor_start, status) VALUES ($1,$2,$3,$4,$5,'running') RETURNING id",
    [endpoint.method, company, start, end, 0],
  );
  const runId = run.rows[0].id;
  let cursor = 0;
  let pages = 0;
  let received = 0;
  let inserted = 0;
  try {
    while (true) {
      const parameters = {};
      if (endpoint.requires_company) parameters.cnpjEmp = company;
      if (endpoint.start_parameter) {
        parameters[endpoint.start_parameter] = start;
        parameters[endpoint.end_parameter] = end;
      }
      if (endpoint.supports_cursor) parameters.timestamp = cursor;
      const batch = await queryLinx(auth, endpoint, parameters);
      pages += 1;
      received += batch.length;
      inserted += await insertRows(
        client,
        endpoint,
        company,
        Number(auth.portal),
        runId,
        batch,
        options.columnCache,
      );
      await client.query('COMMIT');
      await client.query('BEGIN');
      if (options.pauseSeconds)
        await new Promise((resolve) => setTimeout(resolve, options.pauseSeconds * 1000));
      if (!endpoint.supports_cursor || batch.length < pageCap) break;
      const nextCursor = Math.max(cursor, ...batch.map((row) => Number(row.timestamp) || 0));
      if (nextCursor <= cursor) throw new Error('cursor não avançou; reduza a janela');
      cursor = nextCursor;
      if (pages >= options.maxPages)
        throw new Error(`limite de ${options.maxPages} páginas atingido`);
    }
    await client.query(
      "UPDATE replica.collection_run SET status='succeeded', pages=$1, records_received=$2, records_inserted=$3, cursor_end=$4, finished_at=now() WHERE id=$5",
      [pages, received, inserted, cursor, runId],
    );
    await client.query('COMMIT');
    return { method: endpoint.method, company, pages, received, inserted, runId };
  } catch (error) {
    await client.query('ROLLBACK');
    await client.query(
      "UPDATE replica.collection_run SET status='failed', pages=$1, records_received=$2, records_inserted=$3, cursor_end=$4, error_message=$5, finished_at=now() WHERE id=$6",
      [pages, received, inserted, cursor, error.message.slice(0, 1000), runId],
    );
    await client.query('COMMIT');
    throw error;
  }
}

export async function runCollection({
  daysBack = 3,
  profile = 'dashboard',
  end = new Date().toISOString().slice(0, 10),
} = {}) {
  const auth = authFromEnvironment();
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL é obrigatória para gravar a réplica.');
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - daysBack + 1);
  const start = startDate.toISOString().slice(0, 10);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const columnCache = new Map();
  await client.connect();
  let lockAcquired = false;
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('renova-miniso-linx-sync')) AS acquired",
    );
    lockAcquired = Boolean(lock.rows[0]?.acquired);
    if (!lockAcquired)
      throw new Error('Outra coleta Linx já está em execução; esta execução foi ignorada.');
    await client.query('BEGIN');
    const endpoints = await endpointRows(client);
    const selectedNames = new Set(profile === 'full' ? fullMethods : dashboardMethods);
    const selected = endpoints.filter((endpoint) => selectedNames.has(endpoint.method));
    const groupEndpoint = endpoints.find((endpoint) => endpoint.method === 'LinxGrupoLojas');
    if (groupEndpoint)
      await collect(client, auth, groupEndpoint, null, null, null, {
        pauseSeconds: 0.2,
        maxPages: 100,
        columnCache,
      });
    const companies = [...new Set(await discoveredCompanies(client))];
    if (!companies.length)
      throw new Error('Nenhuma empresa válida foi encontrada em LinxGrupoLojas.');
    const results = [];
    for (const endpoint of selected) {
      const targets = endpoint.requires_company ? companies : [null];
      for (const company of targets) {
        for (const [windowStart, windowEnd] of windows(endpoint, start, end, 1)) {
          results.push(
            await collect(client, auth, endpoint, company, windowStart, windowEnd, {
              pauseSeconds: 0.2,
              maxPages: 100,
              columnCache,
            }),
          );
        }
      }
    }
    return { start, end, companies: companies.length, results };
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock(hashtext('renova-miniso-linx-sync'))")
        .catch(() => undefined);
    }
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const daysBack = Number(argument('--days-back', '3'));
  const profile = argument('--profile', 'dashboard');
  const end = isoDate(argument('--end', new Date().toISOString().slice(0, 10)));
  if (!Number.isInteger(daysBack) || daysBack < 1)
    throw new Error('--days-back deve ser positivo.');
  if (!['dashboard', 'full'].includes(profile))
    throw new Error('--profile deve ser dashboard ou full.');
  runCollection({ daysBack, profile, end })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
