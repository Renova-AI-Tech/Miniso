import type { Database } from '@renova/db-types';
import { sql, type Kysely, type RawBuilder } from 'kysely';

type QueryDatabase = Kysely<Database>;

type Row = Record<string, unknown>;
type LinxSource = 'powerbi_monthly' | 'linx_movements';

export interface LinxStore {
  portal: number;
  company_cnpj: string;
  company_code: number | null;
  legal_name: string | null;
  trade_name: string | null;
  active: boolean | null;
}

export interface LinxSummary {
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
  stores: number;
  products: number;
  last_date: string | null;
  source?: LinxSource;
}

export interface LinxDashboard {
  source?: LinxSource;
  summary: LinxSummary;
  daily: Row[];
  stores: Row[];
  suppliers: Row[];
  categories: Row[];
  origins: Row[];
  stock_by_store: Row[];
}

export interface LinxPage {
  data: Row[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
  source?: LinxSource;
}

export interface LinxAnalyses {
  source?: LinxSource;
  suppliers: Row[];
  categories: Row[];
  origins: Row[];
  velocity: Row[];
  turnover: Row[];
  store_daily: Row[];
}

export interface LinxRepository {
  getHealth(): Promise<Row>;
  listStores(): Promise<LinxStore[]>;
  getSummary(start: string, end: string, companies: string[]): Promise<LinxSummary>;
  getDashboard(start: string, end: string, companies: string[]): Promise<LinxDashboard>;
  listProducts(input: {
    search?: string;
    asOf: string;
    companies: string[];
    page: number;
    pageSize: number;
  }): Promise<LinxPage>;
  getInventory(input: {
    asOf: string;
    companies: string[];
    page: number;
    pageSize: number;
  }): Promise<LinxPage>;
  getDailySales(input: {
    start: string;
    end: string;
    companies: string[];
    page: number;
    pageSize: number;
    productCode?: number | undefined;
  }): Promise<LinxPage>;
  getAnalyses(start: string, end: string, companies: string[]): Promise<LinxAnalyses>;
  getSyncStatus(): Promise<Row>;
  getSyncHistory(input: {
    page: number;
    pageSize: number;
    method?: string | undefined;
    status?: string | undefined;
  }): Promise<LinxPage>;
  getSyncAudit(input: {
    page: number;
    pageSize: number;
    runId?: number | undefined;
    tableName?: string | undefined;
    changeType?: string | undefined;
  }): Promise<LinxPage>;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function date(value: unknown): string | null {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value
      ? String(value).slice(0, 10)
      : null;
}

function normalizeRow(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Date) return [key, date(value)];
      if (
        typeof value === 'string' &&
        /^(net_|cost_|gross_|stock_|balance_|sales_|average_|sale_|quantity|turnover|coverage|active_days|first_sale|products|stores|pages|records|changed_rows|duration|stock_age_days)/i.test(
          key,
        )
      ) {
        const n = Number(value);
        if (Number.isFinite(n)) return [key, n];
      }
      return [key, value];
    }),
  );
}

type ReportSource = 'powerbi_monthly' | 'linx_movements';

function sourceLabel(source: ReportSource): ReportSource {
  return source;
}

async function reportSource(
  database: QueryDatabase,
  start: string,
  end: string,
  companies: string[],
): Promise<ReportSource> {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const startDay = startDate.getUTCDate();
  const endYear = endDate.getUTCFullYear();
  const startYear = startDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();
  const startMonth = startDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(endYear, endMonth + 1, 0)).getUTCDate();
  if (
    startDay !== 1 ||
    startYear !== endYear ||
    startMonth !== endMonth ||
    endDate.getUTCDate() !== lastDay
  ) {
    return 'linx_movements';
  }
  const filter = companyFilter('m', companies);
  const result = await sql<{ available: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM analytics.powerbi_monthly_sales_enriched m
        WHERE m.document_date = ${start}::date${filter}
      ) AS available
    `.execute(database);
  return result.rows[0]?.available ? 'powerbi_monthly' : 'linx_movements';
}

function sourceTable(source: ReportSource) {
  return source === 'powerbi_monthly'
    ? 'analytics.powerbi_monthly_sales_enriched'
    : 'analytics.daily_sales_cache';
}

function companyFilter(alias: string, companies: string[]) {
  return companies.length
    ? sql` AND ${sql.ref(`${alias}.company_cnpj`)} IN (${sql.join(
        companies.map((value) => sql`${value}`),
        sql`, `,
      )})`
    : sql``;
}

async function rows<T>(database: QueryDatabase, query: RawBuilder<T>): Promise<Row[]> {
  const result = await query.execute(database);
  return result.rows.map((row) => normalizeRow(row as Row));
}

async function one<T>(database: QueryDatabase, query: RawBuilder<T>): Promise<Row> {
  const result = await query.execute(database);
  return normalizeRow((result.rows[0] ?? {}) as Row);
}

export function createLinxRepository(database: QueryDatabase): LinxRepository {
  return {
    async listStores() {
      return rows<LinxStore>(
        database,
        sql<LinxStore>`
        SELECT portal, company_cnpj, company_code, legal_name, trade_name, active
        FROM analytics.store
        WHERE coalesce(active, true)
        ORDER BY coalesce(trade_name, legal_name, company_cnpj)
      `,
      ) as unknown as Promise<LinxStore[]>;
    },

    async getHealth() {
      return one(
        database,
        sql`
          SELECT
            true AS ok,
            now()::text AS database_time,
            (SELECT row_to_json(x) FROM (
              SELECT id, method, status, started_at, finished_at,
                     records_received, records_inserted, error_message
              FROM replica.collection_run ORDER BY started_at DESC LIMIT 1
            ) x) AS last_run,
            (SELECT row_to_json(x) FROM (
              SELECT id, method, status, started_at, finished_at,
                     records_received, records_inserted, error_message
              FROM replica.collection_run
              WHERE status = 'succeeded'
              ORDER BY finished_at DESC NULLS LAST LIMIT 1
            ) x) AS last_successful_run,
            json_build_object(
              'last_movement_date', (SELECT max(document_date) FROM analytics.sales_movement),
              'last_stock_date', (SELECT max(snapshot_date) FROM analytics.inventory_snapshot),
              'stock_age_days', (SELECT current_date - max(snapshot_date) FROM analytics.inventory_snapshot),
              'movement_rows', (SELECT count(*) FROM analytics.sales_movement),
              'product_rows', (SELECT count(*) FROM analytics.product),
              'products_with_metadata', (SELECT count(*) FROM analytics.product WHERE name IS NOT NULL),
              'supplier_rows', (SELECT count(*) FROM analytics.supplier)
            ) AS data_quality
        `,
      );
    },

    async getSummary(start, end, companies) {
      const source = await reportSource(database, start, end, companies);
      const table = sourceTable(source);
      const filter = companyFilter('d', companies);
      const row = await one<LinxSummary>(
        database,
        sql<LinxSummary>`
        SELECT
          coalesce(sum(d.net_quantity), 0)::float8 AS net_quantity,
          coalesce(sum(d.net_revenue), 0)::float8 AS net_revenue,
          coalesce(sum(d.cost_value), 0)::float8 AS cost_value,
          coalesce(sum(d.gross_margin), 0)::float8 AS gross_margin,
          count(DISTINCT d.company_cnpj)::int AS stores,
          count(DISTINCT d.product_code)::int AS products,
          max(d.document_date) AS last_date
        FROM ${sql.raw(table)} d
        WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}
      `,
      );
      return { ...row, last_date: date(row.last_date), source: sourceLabel(source) } as LinxSummary;
    },

    async getDashboard(start, end, companies) {
      const source = await reportSource(database, start, end, companies);
      const table = sourceTable(source);
      const filter = companyFilter('d', companies);
      const stockFilter = companyFilter('i', companies);
      const [summary, daily, stores, suppliers, categories, origins, stockByStore] =
        await Promise.all([
          one<LinxSummary>(
            database,
            sql<LinxSummary>`
              SELECT coalesce(sum(d.net_quantity), 0)::float8 AS net_quantity,
                     coalesce(sum(d.net_revenue), 0)::float8 AS net_revenue,
                     coalesce(sum(d.cost_value), 0)::float8 AS cost_value,
                     coalesce(sum(d.gross_margin), 0)::float8 AS gross_margin,
                     count(DISTINCT d.company_cnpj)::int AS stores,
                     count(DISTINCT d.product_code)::int AS products,
                     max(d.document_date) AS last_date
              FROM ${sql.raw(table)} d
              WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}
            `,
          ).then(
            (row) =>
              ({
                ...row,
                last_date: date(row.last_date),
                source: sourceLabel(source),
              }) as LinxSummary,
          ),
          rows(
            database,
            sql`
          WITH calendar AS (
            SELECT generate_series(${start}::date, ${end}::date, interval '1 day')::date AS document_date
          ), daily AS (
            SELECT document_date, sum(net_quantity)::float8 AS net_quantity,
                   sum(net_revenue)::float8 AS net_revenue, sum(cost_value)::float8 AS cost_value,
                   sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY document_date
          )
          SELECT c.document_date,
                 coalesce(d.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(d.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(d.cost_value, 0)::float8 AS cost_value,
                 coalesce(d.gross_margin, 0)::float8 AS gross_margin
          FROM calendar c
          LEFT JOIN daily d ON d.document_date = c.document_date
          ORDER BY c.document_date
        `,
          ),
          rows(
            database,
            sql`
          SELECT company_cnpj, max(store_name) AS store_name,
                 sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                 sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
          FROM ${sql.raw(table)} d
          WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
          GROUP BY company_cnpj ORDER BY net_revenue DESC
        `,
          ),
          rows(
            database,
            sql`
          WITH sales AS (
            SELECT supplier_code, coalesce(supplier_name, 'Sem fornecedor') AS supplier_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY supplier_code, supplier_name
          ), stock AS (
            SELECT p.supplier_code, max(p.supplier_name) AS supplier_name,
                   sum(i.quantity)::float8 AS balance_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   sum(i.total_cost)::float8 AS stock_cost_value
            FROM analytics.inventory_snapshot i
            JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
            WHERE i.snapshot_date = (
              SELECT max(i2.snapshot_date)
              FROM analytics.inventory_snapshot i2
              WHERE i2.company_cnpj = i.company_cnpj
                AND i2.snapshot_date <= ${end}::date
            )${stockFilter}
            GROUP BY p.supplier_code
          )
          SELECT coalesce(s.supplier_code, k.supplier_code) AS supplier_code,
                 coalesce(s.supplier_name, k.supplier_name, 'Sem fornecedor') AS supplier_name,
                 coalesce(s.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(s.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(s.cost_value, 0)::float8 AS cost_value,
                 coalesce(s.gross_margin, 0)::float8 AS gross_margin,
                 coalesce(k.balance_quantity, 0)::float8 AS balance_quantity,
                 coalesce(k.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(k.stock_cost_value, 0)::float8 AS stock_cost_value
          FROM sales s
          FULL OUTER JOIN stock k ON coalesce(k.supplier_code, -1) = coalesce(s.supplier_code, -1)
          ORDER BY net_revenue DESC, stock_sale_value DESC
        `,
          ),
          rows(
            database,
            sql`
          WITH sales AS (
            SELECT coalesce(category_name, 'Sem categoria') AS category_name,
                   max(class_name) AS class_name, max(subclass_name) AS subclass_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY category_name
          ), stock AS (
            SELECT coalesce(p.category_name, 'Sem categoria') AS category_name,
                   max(p.class_name) AS class_name, max(p.subclass_name) AS subclass_name,
                   sum(i.quantity)::float8 AS balance_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   sum(i.total_cost)::float8 AS stock_cost_value
            FROM analytics.inventory_snapshot i
            JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
            WHERE i.snapshot_date = (
              SELECT max(i2.snapshot_date)
              FROM analytics.inventory_snapshot i2
              WHERE i2.company_cnpj = i.company_cnpj
                AND i2.snapshot_date <= ${end}::date
            )${stockFilter}
            GROUP BY p.category_name
          )
          SELECT coalesce(s.category_name, k.category_name) AS category_name,
                 coalesce(s.class_name, k.class_name) AS class_name,
                 coalesce(s.subclass_name, k.subclass_name) AS subclass_name,
                 coalesce(s.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(s.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(s.cost_value, 0)::float8 AS cost_value,
                 coalesce(s.gross_margin, 0)::float8 AS gross_margin,
                 coalesce(k.balance_quantity, 0)::float8 AS balance_quantity,
                 coalesce(k.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(k.stock_cost_value, 0)::float8 AS stock_cost_value
          FROM sales s
          FULL OUTER JOIN stock k ON k.category_name = s.category_name
          ORDER BY net_revenue DESC, stock_sale_value DESC
        `,
          ),
          rows(
            database,
            sql`
          WITH sales AS (
            SELECT CASE
                     WHEN coalesce(p.supplier_name, d.supplier_name, '') ILIKE '%miniso%'
                       OR coalesce(p.supplier_name, d.supplier_name, '') ILIKE '%prodigy%'
                     THEN 'Importado (Miniso/Prodigy)'
                     ELSE 'Nacional'
                   END AS origin_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            LEFT JOIN analytics.product p ON p.portal = d.portal AND p.product_code = d.product_code
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY 1
          ), stock AS (
            SELECT CASE
                     WHEN coalesce(p.supplier_name, '') ILIKE '%miniso%'
                       OR coalesce(p.supplier_name, '') ILIKE '%prodigy%'
                     THEN 'Importado (Miniso/Prodigy)'
                     ELSE 'Nacional'
                   END AS origin_name,
                   sum(i.quantity)::float8 AS balance_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   sum(i.total_cost)::float8 AS stock_cost_value
            FROM analytics.inventory_snapshot i
            JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
            WHERE i.snapshot_date = (
              SELECT max(i2.snapshot_date)
              FROM analytics.inventory_snapshot i2
              WHERE i2.company_cnpj = i.company_cnpj
                AND i2.snapshot_date <= ${end}::date
            )${stockFilter}
            GROUP BY 1
          )
          SELECT coalesce(s.origin_name, k.origin_name) AS origin_name,
                 coalesce(s.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(s.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(s.cost_value, 0)::float8 AS cost_value,
                 coalesce(s.gross_margin, 0)::float8 AS gross_margin,
                 coalesce(k.balance_quantity, 0)::float8 AS balance_quantity,
                 coalesce(k.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(k.stock_cost_value, 0)::float8 AS stock_cost_value
          FROM sales s
          FULL OUTER JOIN stock k ON k.origin_name = s.origin_name
          ORDER BY net_revenue DESC, stock_sale_value DESC
        `,
          ),
          rows(
            database,
            sql`
          SELECT i.company_cnpj, max(s.trade_name) AS store_name,
                 sum(i.quantity)::float8 AS balance_quantity,
                 sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                 sum(i.total_cost)::float8 AS stock_cost_value,
                 count(DISTINCT i.product_code)::int AS products_in_stock
          FROM analytics.inventory_snapshot i
          LEFT JOIN analytics.store s ON s.portal = i.portal AND s.company_cnpj = i.company_cnpj
          WHERE i.snapshot_date = (
            SELECT max(i2.snapshot_date)
            FROM analytics.inventory_snapshot i2
            WHERE i2.company_cnpj = i.company_cnpj
              AND i2.snapshot_date <= ${end}::date
          )${stockFilter}
          GROUP BY i.company_cnpj ORDER BY stock_sale_value DESC
        `,
          ),
        ]);
      return {
        summary,
        daily,
        stores,
        suppliers,
        categories,
        origins,
        stock_by_store: stockByStore,
        source: sourceLabel(source),
      };
    },

    async listProducts({ search = '', asOf, companies, page, pageSize }) {
      const offset = (page - 1) * pageSize;
      const filter = companyFilter('i', companies);
      const searchClause = search
        ? sql` AND (p.name ILIKE ${`%${search}%`} OR p.reference ILIKE ${`%${search}%`} OR p.barcode ILIKE ${`%${search}%`})`
        : sql``;
      const [data, count] = await Promise.all([
        rows(
          database,
          sql`
          SELECT p.portal, p.product_code, p.barcode, p.reference, p.name, p.basic_description,
                 p.brand_name, p.line_name, p.sector_name, p.supplier_code, p.supplier_name,
                 p.classification_name, p.category_name, p.class_name, p.subclass_name, p.origin_name,
                 i.company_cnpj, s.trade_name AS store_name, i.snapshot_date,
                 i.quantity AS balance_quantity, i.total_cost AS stock_cost_value,
                 i.cost_price, i.sale_price, i.location, p.disabled
          FROM analytics.inventory_snapshot i
          JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
          LEFT JOIN analytics.store s ON s.portal = i.portal AND s.company_cnpj = i.company_cnpj
          WHERE i.snapshot_date = (
            SELECT max(i2.snapshot_date)
            FROM analytics.inventory_snapshot i2
            WHERE i2.portal = i.portal
              AND i2.company_cnpj = i.company_cnpj
              AND i2.product_code = i.product_code
              AND i2.snapshot_date <= ${asOf}::date
          )${filter}${searchClause}
          ORDER BY i.company_cnpj, p.name NULLS LAST, p.product_code
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        ),
        one<{ total: number }>(
          database,
          sql`
          SELECT count(*)::int AS total
          FROM analytics.inventory_snapshot i
          JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
          WHERE i.snapshot_date = (
            SELECT max(i2.snapshot_date)
            FROM analytics.inventory_snapshot i2
            WHERE i2.portal = i.portal
              AND i2.company_cnpj = i.company_cnpj
              AND i2.product_code = i.product_code
              AND i2.snapshot_date <= ${asOf}::date
          )${filter}${searchClause}
        `,
        ),
      ]);
      return {
        data,
        page,
        page_size: pageSize,
        total: num(count.total),
        has_next: page * pageSize < num(count.total),
      };
    },

    async getInventory({ asOf, companies, page, pageSize }) {
      const offset = (page - 1) * pageSize;
      const filter = companyFilter('i', companies);
      const [data, count] = await Promise.all([
        rows(
          database,
          sql`
          SELECT i.portal, i.company_cnpj, i.product_code, i.snapshot_date, i.quantity,
                 i.average_cost, i.total_cost, i.cost_price, i.sale_price, i.location,
                 p.name AS product_name, p.reference, p.supplier_code, p.supplier_name,
                 p.classification_name, p.category_name, p.class_name, p.subclass_name, p.origin_name,
                 s.trade_name AS store_name
          FROM analytics.inventory_snapshot i
          JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
          LEFT JOIN analytics.store s ON s.portal = i.portal AND s.company_cnpj = i.company_cnpj
          WHERE i.snapshot_date = (
            SELECT max(i2.snapshot_date)
            FROM analytics.inventory_snapshot i2
            WHERE i2.company_cnpj = i.company_cnpj
              AND i2.snapshot_date <= ${asOf}::date
          )${filter}
          ORDER BY i.company_cnpj, p.name NULLS LAST, i.product_code
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        ),
        one<{ total: number }>(
          database,
          sql`
          SELECT count(*)::int AS total FROM analytics.inventory_snapshot i
          WHERE i.snapshot_date = (
            SELECT max(i2.snapshot_date)
            FROM analytics.inventory_snapshot i2
            WHERE i2.company_cnpj = i.company_cnpj
              AND i2.snapshot_date <= ${asOf}::date
          )${filter}
        `,
        ),
      ]);
      return {
        data,
        page,
        page_size: pageSize,
        total: num(count.total),
        has_next: page * pageSize < num(count.total),
      };
    },

    async getDailySales({ start, end, companies, page, pageSize, productCode }) {
      const source = await reportSource(database, start, end, companies);
      const table = sourceTable(source);
      const offset = (page - 1) * pageSize;
      const filter = companyFilter('d', companies);
      const productFilter = productCode ? sql` AND d.product_code = ${productCode}` : sql``;
      const [data, count] = await Promise.all([
        rows(
          database,
          sql`
          SELECT * FROM ${sql.raw(table)} d
          WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}${productFilter}
          ORDER BY d.document_date DESC, d.net_revenue DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        ),
        one<{ total: number }>(
          database,
          sql`
          SELECT count(*)::int AS total FROM ${sql.raw(table)} d
          WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}${productFilter}
        `,
        ),
      ]);
      return {
        data,
        page,
        page_size: pageSize,
        total: num(count.total),
        has_next: page * pageSize < num(count.total),
        source,
      };
    },

    async getAnalyses(start, end, companies) {
      const source = await reportSource(database, start, end, companies);
      const table = sourceTable(source);
      const filter = companyFilter('d', companies);
      const stockFilter = companyFilter('i', companies);
      const [suppliers, categories, origins, velocity, turnover, storeDaily] = await Promise.all([
        rows(
          database,
          sql`
          WITH sales AS (
            SELECT supplier_code, coalesce(supplier_name, 'Sem fornecedor') AS supplier_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY supplier_code, supplier_name
          ), stock AS (
            SELECT p.supplier_code, max(p.supplier_name) AS supplier_name,
                   sum(i.quantity)::float8 AS balance_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   sum(i.total_cost)::float8 AS stock_cost_value
            FROM analytics.inventory_snapshot i
            JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
            WHERE i.snapshot_date = (
              SELECT max(i2.snapshot_date)
              FROM analytics.inventory_snapshot i2
              WHERE i2.company_cnpj = i.company_cnpj
                AND i2.snapshot_date <= ${end}::date
            )${stockFilter}
            GROUP BY p.supplier_code
          )
          SELECT coalesce(s.supplier_code, k.supplier_code) AS supplier_code,
                 coalesce(s.supplier_name, k.supplier_name, 'Sem fornecedor') AS supplier_name,
                 coalesce(s.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(s.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(s.cost_value, 0)::float8 AS cost_value,
                 coalesce(s.gross_margin, 0)::float8 AS gross_margin,
                 coalesce(k.balance_quantity, 0)::float8 AS balance_quantity,
                 coalesce(k.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(k.stock_cost_value, 0)::float8 AS stock_cost_value
          FROM sales s
          FULL OUTER JOIN stock k ON coalesce(k.supplier_code, -1) = coalesce(s.supplier_code, -1)
          ORDER BY net_revenue DESC, stock_sale_value DESC
        `,
        ),
        rows(
          database,
          sql`
          WITH sales AS (
            SELECT coalesce(category_name, 'Sem categoria') AS category_name,
                   max(class_name) AS class_name, max(subclass_name) AS subclass_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY category_name
          ), stock AS (
            SELECT coalesce(p.category_name, 'Sem categoria') AS category_name,
                   max(p.class_name) AS class_name, max(p.subclass_name) AS subclass_name,
                   sum(i.quantity)::float8 AS balance_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   sum(i.total_cost)::float8 AS stock_cost_value
            FROM analytics.inventory_snapshot i
            JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
            WHERE i.snapshot_date = (
              SELECT max(i2.snapshot_date)
              FROM analytics.inventory_snapshot i2
              WHERE i2.company_cnpj = i.company_cnpj
                AND i2.snapshot_date <= ${end}::date
            )${stockFilter}
            GROUP BY p.category_name
          )
          SELECT coalesce(s.category_name, k.category_name) AS category_name,
                 coalesce(s.class_name, k.class_name) AS class_name,
                 coalesce(s.subclass_name, k.subclass_name) AS subclass_name,
                 coalesce(s.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(s.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(s.cost_value, 0)::float8 AS cost_value,
                 coalesce(s.gross_margin, 0)::float8 AS gross_margin,
                 coalesce(k.balance_quantity, 0)::float8 AS balance_quantity,
                 coalesce(k.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(k.stock_cost_value, 0)::float8 AS stock_cost_value
          FROM sales s
          FULL OUTER JOIN stock k ON k.category_name = s.category_name
          ORDER BY net_revenue DESC, stock_sale_value DESC
        `,
        ),
        rows(
          database,
          sql`
          WITH sales AS (
            SELECT CASE
                     WHEN coalesce(p.supplier_name, d.supplier_name, '') ILIKE '%miniso%'
                       OR coalesce(p.supplier_name, d.supplier_name, '') ILIKE '%prodigy%'
                     THEN 'Importado (Miniso/Prodigy)'
                     ELSE 'Nacional'
                   END AS origin_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   sum(cost_value)::float8 AS cost_value, sum(gross_margin)::float8 AS gross_margin
            FROM ${sql.raw(table)} d
            LEFT JOIN analytics.product p ON p.portal = d.portal AND p.product_code = d.product_code
            WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY 1
          ), stock AS (
            SELECT CASE
                     WHEN coalesce(p.supplier_name, '') ILIKE '%miniso%'
                       OR coalesce(p.supplier_name, '') ILIKE '%prodigy%'
                     THEN 'Importado (Miniso/Prodigy)'
                     ELSE 'Nacional'
                   END AS origin_name,
                   sum(i.quantity)::float8 AS balance_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   sum(i.total_cost)::float8 AS stock_cost_value
            FROM analytics.inventory_snapshot i
            JOIN analytics.product p ON p.portal = i.portal AND p.product_code = i.product_code
            WHERE i.snapshot_date = (
              SELECT max(i2.snapshot_date)
              FROM analytics.inventory_snapshot i2
              WHERE i2.company_cnpj = i.company_cnpj
                AND i2.snapshot_date <= ${end}::date
            )${stockFilter}
            GROUP BY 1
          )
          SELECT coalesce(s.origin_name, k.origin_name) AS origin_name,
                 coalesce(s.net_quantity, 0)::float8 AS net_quantity,
                 coalesce(s.net_revenue, 0)::float8 AS net_revenue,
                 coalesce(s.cost_value, 0)::float8 AS cost_value,
                 coalesce(s.gross_margin, 0)::float8 AS gross_margin,
                 coalesce(k.balance_quantity, 0)::float8 AS balance_quantity,
                 coalesce(k.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(k.stock_cost_value, 0)::float8 AS stock_cost_value
          FROM sales s
          FULL OUTER JOIN stock k ON k.origin_name = s.origin_name
          ORDER BY net_revenue DESC, stock_sale_value DESC
        `,
        ),
        rows(
          database,
          sql`
          WITH sales AS (
            SELECT product_code, max(product_name) AS product_name, max(supplier_name) AS supplier_name, max(category_name) AS category_name,
                   sum(net_quantity)::float8 AS net_quantity, sum(net_revenue)::float8 AS net_revenue,
                   min(document_date) AS first_sale_date,
                   (${end}::date - min(document_date) + 1)::int AS active_days
            FROM ${sql.raw(table)} d WHERE document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY product_code
          ), stock AS (
            SELECT product_code, sum(quantity)::float8 AS stock_quantity, sum(quantity * coalesce(sale_price, 0))::float8 AS stock_sale_value,
                   avg(quantity)::float8 AS average_stock_quantity, count(*)::int AS stock_history_points
            FROM analytics.inventory_snapshot i WHERE snapshot_date BETWEEN ${start}::date AND ${end}::date${companyFilter('i', companies)} GROUP BY product_code
          )
          SELECT sales.*, stock.stock_quantity, stock.stock_sale_value, stock.average_stock_quantity, stock.stock_history_points,
                 CASE WHEN sales.active_days > 0 THEN sales.net_quantity / sales.active_days ELSE 0 END AS sales_velocity,
                 CASE WHEN stock.average_stock_quantity > 0 THEN sales.net_quantity / stock.average_stock_quantity ELSE NULL END AS turnover
          FROM sales LEFT JOIN stock USING(product_code) ORDER BY sales_velocity DESC NULLS LAST LIMIT 200
        `,
        ),
        rows(
          database,
          sql`
          WITH sales AS (
            SELECT d.product_code,
                   max(d.product_name) AS product_name,
                   max(d.supplier_name) AS supplier_name,
                   max(d.category_name) AS category_name,
                   sum(d.net_quantity)::float8 AS net_quantity,
                   sum(d.net_revenue)::float8 AS net_revenue,
                   min(d.document_date) AS first_sale_date,
                   (${end}::date - min(d.document_date) + 1)::int AS active_days
            FROM ${sql.raw(table)} d
            WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY d.product_code
          ), stock AS (
            SELECT i.product_code,
                   sum(i.quantity)::float8 AS stock_quantity,
                   sum(i.quantity * coalesce(i.sale_price, 0))::float8 AS stock_sale_value,
                   avg(i.quantity)::float8 AS average_stock_quantity,
                   count(*)::int AS stock_history_points
            FROM analytics.inventory_snapshot i
            WHERE i.snapshot_date BETWEEN ${start}::date AND ${end}::date${companyFilter('i', companies)}
            GROUP BY i.product_code
          )
          SELECT sales.*, stock.stock_quantity, stock.stock_sale_value,
                 stock.average_stock_quantity, stock.stock_history_points,
                 CASE WHEN sales.active_days > 0
                      THEN sales.net_quantity / sales.active_days ELSE 0 END AS sales_velocity,
                 CASE WHEN stock.average_stock_quantity > 0
                      THEN sales.net_quantity / stock.average_stock_quantity ELSE NULL END AS turnover
          FROM sales
          LEFT JOIN stock USING (product_code)
          WHERE stock.stock_history_points > 0
          ORDER BY turnover DESC NULLS LAST, net_revenue DESC
          LIMIT 500
        `,
        ),
        rows(
          database,
          sql`
          WITH sales AS (
            SELECT d.document_date, d.company_cnpj, max(d.store_name) AS store_name,
                   sum(d.net_quantity)::float8 AS net_quantity, sum(d.net_revenue)::float8 AS net_revenue,
                   sum(d.cost_value)::float8 AS cost_value
            FROM ${sql.raw(table)} d
            WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}
            GROUP BY d.document_date, d.company_cnpj
          ), stock AS (
            SELECT days.document_date, days.company_cnpj,
                   coalesce(sum(latest.quantity), 0)::float8 AS stock_quantity,
                   coalesce(sum(latest.quantity * coalesce(latest.sale_price, 0)), 0)::float8 AS stock_sale_value,
                   coalesce(sum(latest.total_cost), 0)::float8 AS stock_cost_value
            FROM (SELECT DISTINCT d.document_date, d.company_cnpj
                  FROM ${sql.raw(table)} d
                  WHERE d.document_date BETWEEN ${start}::date AND ${end}::date${filter}) days
            LEFT JOIN LATERAL (
              SELECT DISTINCT ON (i.product_code)
                     i.product_code, i.quantity, i.sale_price, i.total_cost
              FROM analytics.inventory_snapshot i
              WHERE i.company_cnpj = days.company_cnpj
                AND i.snapshot_date <= days.document_date
              ORDER BY i.product_code, i.snapshot_date DESC
            ) latest ON true
            GROUP BY days.document_date, days.company_cnpj
          )
          SELECT sales.document_date, sales.company_cnpj, sales.store_name,
                 sales.net_quantity, sales.net_revenue, sales.cost_value,
                 coalesce(stock.stock_quantity, 0)::float8 AS stock_quantity,
                 coalesce(stock.stock_sale_value, 0)::float8 AS stock_sale_value,
                 coalesce(stock.stock_cost_value, 0)::float8 AS stock_cost_value,
                 sales.net_quantity AS sales_velocity,
                 CASE WHEN coalesce(stock.stock_quantity, 0) > 0
                      THEN sales.net_quantity / stock.stock_quantity
                      ELSE NULL END AS turnover,
                 CASE WHEN sales.net_quantity > 0
                      THEN coalesce(stock.stock_quantity, 0) / sales.net_quantity
                      ELSE NULL END AS coverage_days
          FROM sales
          LEFT JOIN stock USING (document_date, company_cnpj)
          ORDER BY sales.document_date, sales.net_revenue DESC
        `,
        ),
      ]);
      return {
        source: sourceLabel(source),
        suppliers,
        categories,
        origins,
        velocity,
        turnover,
        store_daily: storeDaily,
      };
    },

    async getSyncStatus() {
      return one(
        database,
        sql`
        SELECT
          (SELECT row_to_json(x) FROM (SELECT id, method, status, started_at, finished_at, records_received, records_inserted, error_message FROM replica.collection_run ORDER BY started_at DESC LIMIT 1) x) AS last_run,
          (SELECT row_to_json(x) FROM (SELECT id, method, status, started_at, finished_at, records_received, records_inserted, error_message FROM replica.collection_run WHERE status = 'succeeded' ORDER BY finished_at DESC NULLS LAST LIMIT 1) x) AS last_successful_run,
          (SELECT max(snapshot_date) FROM analytics.inventory_snapshot) AS latest_stock_date,
          (SELECT count(*) FROM analytics.daily_sales_cache)::int AS movement_rows
      `,
      );
    },

    async getSyncHistory({ page, pageSize, method, status }) {
      const offset = (page - 1) * pageSize;
      const methodFilter = method ? sql` AND method = ${method}` : sql``;
      const statusFilter = status ? sql` AND status = ${status}` : sql``;
      const [data, count] = await Promise.all([
        rows(
          database,
          sql`SELECT id, method, company_cnpj, window_start, window_end, status, pages, records_received, records_inserted, started_at, finished_at, error_message FROM replica.collection_run WHERE true${methodFilter}${statusFilter} ORDER BY started_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
        ),
        one<{ total: number }>(
          database,
          sql`SELECT count(*)::int AS total FROM replica.collection_run WHERE true${methodFilter}${statusFilter}`,
        ),
      ]);
      return {
        data,
        page,
        page_size: pageSize,
        total: num(count.total),
        has_next: page * pageSize < num(count.total),
      };
    },

    async getSyncAudit({ page, pageSize, runId, tableName, changeType }) {
      const offset = (page - 1) * pageSize;
      const runFilter = runId ? sql` AND collection_run_id = ${runId}` : sql``;
      const tableFilter = tableName ? sql` AND table_name = ${tableName}` : sql``;
      const changeFilter = changeType ? sql` AND change_type = ${changeType}` : sql``;
      const [data, count] = await Promise.all([
        rows(
          database,
          sql`SELECT id, collection_run_id, table_name, record_key, change_type, previous_hash, current_hash, changed_at FROM replica.collection_change WHERE true${runFilter}${tableFilter}${changeFilter} ORDER BY changed_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
        ),
        one<{ total: number }>(
          database,
          sql`SELECT count(*)::int AS total FROM replica.collection_change WHERE true${runFilter}${tableFilter}${changeFilter}`,
        ),
      ]);
      return {
        data,
        page,
        page_size: pageSize,
        total: num(count.total),
        has_next: page * pageSize < num(count.total),
      };
    },
  };
}
