export interface Migration {
  readonly id: string;
  readonly sql: string;
}

export const migrations: readonly Migration[] = Object.freeze([
  Object.freeze({
    id: '001_linx_analytics',
    sql: `
CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS ingest.sync_run (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method text NOT NULL,
    company_cnpj varchar(14),
    window_start date,
    window_end date,
    cursor_start bigint,
    cursor_end bigint,
    status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    records_received integer NOT NULL DEFAULT 0,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    error_message text
);

CREATE TABLE IF NOT EXISTS ingest.linx_record (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method text NOT NULL,
    portal integer NOT NULL,
    company_cnpj varchar(14),
    linx_timestamp bigint,
    record_hash char(64) NOT NULL,
    payload jsonb NOT NULL,
    collected_at timestamptz NOT NULL DEFAULT now(),
    sync_run_id bigint REFERENCES ingest.sync_run(id),
    UNIQUE (method, portal, company_cnpj, record_hash)
);

CREATE INDEX IF NOT EXISTS linx_record_method_timestamp_idx
    ON ingest.linx_record (method, portal, company_cnpj, linx_timestamp);
CREATE INDEX IF NOT EXISTS linx_record_payload_gin_idx
    ON ingest.linx_record USING gin (payload);

CREATE TABLE IF NOT EXISTS analytics.store (
    portal integer NOT NULL,
    company_cnpj varchar(14) NOT NULL,
    company_code integer,
    legal_name text,
    trade_name text,
    active boolean,
    raw_payload jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portal, company_cnpj),
    UNIQUE (portal, company_code)
);

CREATE TABLE IF NOT EXISTS analytics.product (
    portal integer NOT NULL,
    product_code bigint NOT NULL,
    barcode text,
    reference text,
    name text,
    basic_description text,
    brand_id bigint,
    brand_name text,
    line_id bigint,
    line_name text,
    collection_id bigint,
    collection_name text,
    sector_id bigint,
    sector_name text,
    size_id bigint,
    size_name text,
    color_id bigint,
    color_name text,
    unit text,
    disabled boolean,
    linx_updated_at timestamp,
    linx_timestamp bigint,
    raw_payload jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portal, product_code)
);

CREATE INDEX IF NOT EXISTS product_barcode_idx
    ON analytics.product (portal, barcode);

CREATE TABLE IF NOT EXISTS analytics.sales_movement (
    portal integer NOT NULL,
    company_cnpj varchar(14) NOT NULL,
    linx_timestamp bigint NOT NULL,
    company_code integer,
    transaction_id bigint,
    document_number text,
    document_series text,
    document_date date,
    posted_at timestamp,
    product_code bigint NOT NULL,
    barcode text,
    customer_code bigint,
    seller_code bigint,
    operation text,
    transaction_type text,
    cancelled boolean NOT NULL DEFAULT false,
    deleted boolean NOT NULL DEFAULT false,
    included_in_report boolean NOT NULL DEFAULT false,
    quantity numeric(18, 6),
    unit_price numeric(18, 6),
    gross_value numeric(18, 2),
    liquid_value numeric(18, 2),
    cost_price numeric(18, 6),
    deposit text,
    raw_payload jsonb NOT NULL,
    collected_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portal, company_cnpj, linx_timestamp),
    FOREIGN KEY (portal, company_cnpj)
        REFERENCES analytics.store (portal, company_cnpj),
    FOREIGN KEY (portal, product_code)
        REFERENCES analytics.product (portal, product_code)
);

CREATE INDEX IF NOT EXISTS sales_movement_date_store_idx
    ON analytics.sales_movement (document_date, company_cnpj);
ALTER TABLE analytics.sales_movement ADD COLUMN IF NOT EXISTS liquid_value numeric(18, 2);
CREATE INDEX IF NOT EXISTS sales_movement_product_date_idx
    ON analytics.sales_movement (product_code, document_date);
CREATE INDEX IF NOT EXISTS sales_movement_transaction_idx
    ON analytics.sales_movement (portal, company_cnpj, transaction_id);

CREATE TABLE IF NOT EXISTS analytics.inventory_snapshot (
    portal integer NOT NULL,
    company_cnpj varchar(14) NOT NULL,
    product_code bigint NOT NULL,
    snapshot_date date NOT NULL,
    linx_timestamp bigint NOT NULL,
    company_code integer,
    quantity numeric(18, 6),
    average_cost numeric(18, 6),
    total_cost numeric(18, 2),
    cost_price numeric(18, 6),
    sale_price numeric(18, 6),
    location text,
    raw_payload jsonb NOT NULL,
    collected_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portal, company_cnpj, product_code, snapshot_date),
    FOREIGN KEY (portal, company_cnpj)
        REFERENCES analytics.store (portal, company_cnpj),
    FOREIGN KEY (portal, product_code)
        REFERENCES analytics.product (portal, product_code)
);

CREATE INDEX IF NOT EXISTS inventory_snapshot_date_store_idx
    ON analytics.inventory_snapshot (snapshot_date, company_cnpj);

DROP VIEW IF EXISTS analytics.daily_sales;
CREATE VIEW analytics.daily_sales AS
SELECT
    portal,
    company_cnpj,
    document_date,
    product_code,
    sum(
        CASE
            WHEN btrim(operation) = 'S' AND btrim(transaction_type) = 'V' THEN quantity
            WHEN btrim(operation) = 'DS' THEN -quantity
            ELSE 0
        END
    ) AS net_quantity,
    sum(
        CASE
            WHEN btrim(operation) = 'S' AND btrim(transaction_type) = 'V' THEN coalesce(NULLIF(raw_payload->>'valor_liquido', '')::numeric, quantity * unit_price)
            WHEN btrim(operation) = 'DS' THEN -coalesce(NULLIF(raw_payload->>'valor_liquido', '')::numeric, quantity * unit_price)
            ELSE 0
        END
    ) AS net_revenue
FROM analytics.sales_movement
WHERE NOT cancelled
  AND NOT deleted
  AND included_in_report
  AND product_code <> 26736
GROUP BY portal, company_cnpj, document_date, product_code;



CREATE SCHEMA IF NOT EXISTS replica;

CREATE TABLE IF NOT EXISTS replica.endpoint_catalog (
    method text PRIMARY KEY,
    table_name text NOT NULL UNIQUE,
    requires_company boolean NOT NULL,
    supports_cursor boolean NOT NULL,
    start_parameter text,
    end_parameter text
);

INSERT INTO replica.endpoint_catalog
    (method, table_name, requires_company, supports_cursor, start_parameter, end_parameter)
VALUES
    ('LinxMetodos', 'linx_metodos', false, false, null, null),
    ('LinxLojas', 'linx_lojas', true, false, null, null),
    ('LinxClientesFornec', 'linx_clientes_fornec', true, true, 'data_inicial', 'data_fim'),
    ('LinxMovimento', 'linx_movimento', true, true, 'data_inicial', 'data_fim'),
    ('LinxMovimentoCartoes', 'linx_movimento_cartoes', true, true, 'data_inicial', 'data_fim'),
    ('LinxProdutos', 'linx_produtos', true, true, 'dt_update_inicio', 'dt_update_fim'),
    ('LinxProdutosDetalhes', 'linx_produtos_detalhes', true, true, 'data_mov_ini', 'data_mov_fim'),
    ('LinxPedidosVenda', 'linx_pedidos_venda', true, true, 'data_inicial', 'data_fim'),
    ('LinxPedidosCompra', 'linx_pedidos_compra', true, true, 'data_inicial', 'data_fim'),
    ('LinxFaturas', 'linx_faturas', true, true, 'data_inicial', 'data_fim'),
    ('LinxLancContabil', 'linx_lanc_contabil', true, true, 'data_ini', 'data_fim'),
    ('LinxPlanos', 'linx_planos', true, true, 'data_upd_inicial', 'data_upd_fim'),
    ('LinxVendedores', 'linx_vendedores', true, true, 'data_upd_inicial', 'data_upd_fim'),
    ('LinxMetasVendedores', 'linx_metas_vendedores', true, true, 'data_inicial_meta', 'data_fim_meta'),
    ('LinxConfiguracoesTributarias', 'linx_configuracoes_tributarias', true, true, null, null),
    ('LinxXMLDocumentos', 'linx_xml_documentos', true, true, 'data_inicial', 'data_fim'),
    ('LinxGrupoLojas', 'linx_grupo_lojas', false, false, null, null)
ON CONFLICT (method) DO UPDATE SET
    table_name = excluded.table_name,
    requires_company = excluded.requires_company,
    supports_cursor = excluded.supports_cursor,
    start_parameter = excluded.start_parameter,
    end_parameter = excluded.end_parameter;

CREATE TABLE IF NOT EXISTS replica.collection_run (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    method text NOT NULL REFERENCES replica.endpoint_catalog(method),
    company_cnpj varchar(14),
    window_start date,
    window_end date,
    cursor_start bigint,
    cursor_end bigint,
    status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    pages integer NOT NULL DEFAULT 0,
    records_received integer NOT NULL DEFAULT 0,
    records_inserted integer NOT NULL DEFAULT 0,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    error_message text
);

CREATE INDEX IF NOT EXISTS collection_run_lookup_idx
    ON replica.collection_run (method, company_cnpj, window_start, window_end, started_at DESC);

CREATE OR REPLACE FUNCTION replica.ensure_endpoint_table(target_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF target_table !~ '^linx_[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Invalid replica table name: %', target_table;
    END IF;

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS replica.%I (
            _id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            _portal integer NOT NULL,
            _company_cnpj varchar(14),
            _linx_timestamp bigint,
            _record_hash char(64) NOT NULL UNIQUE,
            _payload jsonb NOT NULL,
            _collected_at timestamptz NOT NULL DEFAULT now(),
            _collection_run_id bigint REFERENCES replica.collection_run(id)
        )',
        target_table
    );
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON replica.%I (_portal, _company_cnpj, _linx_timestamp)',
        target_table || '_cursor_idx',
        target_table
    );
END;
$$;

DO $$
DECLARE
    endpoint record;
BEGIN
    FOR endpoint IN SELECT table_name FROM replica.endpoint_catalog LOOP
        PERFORM replica.ensure_endpoint_table(endpoint.table_name);
    END LOOP;
END;
$$;



DO $$
DECLARE
    endpoint record;
BEGIN
    FOR endpoint IN SELECT table_name FROM replica.endpoint_catalog LOOP
        EXECUTE format(
            'ALTER TABLE replica.%I ADD COLUMN IF NOT EXISTS _record_key text',
            endpoint.table_name
        );
        EXECUTE format(
            'UPDATE replica.%I SET _record_key = CASE WHEN _linx_timestamp IS NOT NULL THEN ''timestamp:'' || _linx_timestamp::text ELSE ''hash:'' || _record_hash END WHERE _record_key IS NULL',
            endpoint.table_name
        );
        EXECUTE format(
            'ALTER TABLE replica.%I ALTER COLUMN _record_key SET NOT NULL',
            endpoint.table_name
        );
        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS %I ON replica.%I (_record_key)',
            endpoint.table_name || '_record_key_uq',
            endpoint.table_name
        );
    END LOOP;
END;
$$;



-- Dimensões e fatos necessários para o painel operacional da Miniso.
CREATE TABLE IF NOT EXISTS analytics.supplier (
    portal integer NOT NULL,
    supplier_code bigint NOT NULL,
    document text,
    name text,
    legal_name text,
    active boolean,
    raw_payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portal, supplier_code)
);

ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS supplier_code bigint;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS classification_id bigint;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS classification_name text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS category_id bigint;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS class_id bigint;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS subclass_id bigint;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS subclass_name text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS origin_code text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS origin_name text;
ALTER TABLE analytics.sales_movement ADD COLUMN IF NOT EXISTS liquid_value numeric(18, 2);

CREATE INDEX IF NOT EXISTS product_supplier_idx
    ON analytics.product (portal, supplier_code);
CREATE INDEX IF NOT EXISTS product_category_idx
    ON analytics.product (portal, category_name, class_name, subclass_name);

-- O cadastro do Linx usa setor/linha/coleção como a hierarquia comercial;
-- os aliases category/class/subclass deixam a consulta estável para o painel.
INSERT INTO analytics.supplier
    (portal, supplier_code, document, name, legal_name, active, raw_payload, updated_at)
SELECT DISTINCT ON (
    NULLIF(_payload->>'portal', '')::integer,
    NULLIF(_payload->>'cod_cliente', '')::bigint
)
    NULLIF(_payload->>'portal', '')::integer,
    NULLIF(_payload->>'cod_cliente', '')::bigint,
    NULLIF(regexp_replace(coalesce(_payload->>'doc_cliente', ''), '\\D', '', 'g'), ''),
    NULLIF(coalesce(_payload->>'nome_cliente', ''), ''),
    NULLIF(coalesce(_payload->>'razao_cliente', ''), ''),
    upper(coalesce(_payload->>'ativo', 'S')) IN ('S', 'SIM', 'TRUE', '1'),
    _payload,
    now()
FROM replica.linx_clientes_fornec
WHERE upper(coalesce(_payload->>'tipo_cliente', '')) = 'F'
  AND (_payload->>'portal') ~ '^[0-9]+$'
  AND (_payload->>'cod_cliente') ~ '^[0-9]+$'
ORDER BY
    NULLIF(_payload->>'portal', '')::integer,
    NULLIF(_payload->>'cod_cliente', '')::bigint,
    _linx_timestamp DESC NULLS LAST,
    _collected_at DESC
ON CONFLICT (portal, supplier_code) DO UPDATE SET
    document = coalesce(EXCLUDED.document, analytics.supplier.document),
    name = coalesce(EXCLUDED.name, analytics.supplier.name),
    legal_name = coalesce(EXCLUDED.legal_name, analytics.supplier.legal_name),
    active = EXCLUDED.active,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = now();

UPDATE analytics.product p
SET supplier_code = NULLIF(p.raw_payload->>'cod_fornecedor', '')::bigint,
    classification_id = NULLIF(p.raw_payload->>'id_classificacao', '')::bigint,
    classification_name = NULLIF(p.raw_payload->>'desc_classificacao', ''),
    category_id = NULLIF(p.raw_payload->>'id_setor', '')::bigint,
    category_name = NULLIF(p.raw_payload->>'desc_setor', ''),
    class_id = NULLIF(p.raw_payload->>'id_linha', '')::bigint,
    class_name = NULLIF(p.raw_payload->>'desc_linha', ''),
    subclass_id = NULLIF(p.raw_payload->>'id_colecao', '')::bigint,
    subclass_name = NULLIF(p.raw_payload->>'desc_colecao', ''),
    origin_code = NULLIF(p.raw_payload->>'origem_mercadoria', ''),
    origin_name = CASE
        WHEN p.raw_payload->>'origem_mercadoria' = '0' THEN 'Nacional'
        WHEN NULLIF(p.raw_payload->>'origem_mercadoria', '') IS NULL THEN NULL
        ELSE 'Importado'
    END,
    updated_at = now()
WHERE p.raw_payload ? 'cod_fornecedor';

UPDATE analytics.store s
SET trade_name = coalesce(nullif(g._payload->>'nome_empresa', ''), s.trade_name),
    updated_at = now()
FROM replica.linx_grupo_lojas g
WHERE s.portal = NULLIF(g._payload->>'portal', '')::integer
  AND s.company_cnpj = regexp_replace(coalesce(g._payload->>'CNPJ', ''), '\\D', '', 'g')
  AND length(regexp_replace(coalesce(g._payload->>'CNPJ', ''), '\\D', '', 'g')) = 14;

DROP VIEW IF EXISTS analytics.daily_sales;
CREATE VIEW analytics.daily_sales AS
SELECT
    m.portal,
    m.company_cnpj,
    s.trade_name AS store_name,
    m.document_date,
    m.product_code,
    p.name AS product_name,
    p.supplier_code,
    coalesce(sup.name, sup.legal_name, p.supplier_name) AS supplier_name,
    p.classification_name,
    p.category_name,
    p.class_name,
    p.subclass_name,
    p.origin_name,
    sum(CASE
        WHEN btrim(m.operation) = 'S' AND btrim(m.transaction_type) = 'V' THEN m.quantity
        WHEN btrim(m.operation) = 'DS' THEN -m.quantity
        ELSE 0
    END) AS net_quantity,
    sum(CASE
        WHEN btrim(m.operation) = 'S' AND btrim(m.transaction_type) = 'V' THEN coalesce(NULLIF(m.raw_payload->>'valor_liquido', '')::numeric, m.quantity * m.unit_price)
        WHEN btrim(m.operation) = 'DS' THEN -coalesce(NULLIF(m.raw_payload->>'valor_liquido', '')::numeric, m.quantity * m.unit_price)
        ELSE 0
    END) AS net_revenue,
    sum(CASE
        WHEN btrim(m.operation) = 'S' AND btrim(m.transaction_type) = 'V' THEN m.quantity * coalesce(m.cost_price, 0)
        WHEN btrim(m.operation) = 'DS' THEN -(m.quantity * coalesce(m.cost_price, 0))
        ELSE 0
    END) AS cost_value,
    sum(CASE
        WHEN btrim(m.operation) = 'S' AND btrim(m.transaction_type) = 'V' THEN coalesce(NULLIF(m.raw_payload->>'valor_liquido', '')::numeric, m.quantity * coalesce(m.unit_price, 0)) - m.quantity * coalesce(m.cost_price, 0)
        WHEN btrim(m.operation) = 'DS' THEN -(coalesce(NULLIF(m.raw_payload->>'valor_liquido', '')::numeric, m.quantity * coalesce(m.unit_price, 0)) - m.quantity * coalesce(m.cost_price, 0))
        ELSE 0
    END) AS gross_margin
FROM analytics.sales_movement m
LEFT JOIN analytics.store s
    ON s.portal = m.portal AND s.company_cnpj = m.company_cnpj
LEFT JOIN analytics.product p
    ON p.portal = m.portal AND p.product_code = m.product_code
LEFT JOIN analytics.supplier sup
    ON sup.portal = p.portal AND sup.supplier_code = p.supplier_code
WHERE NOT m.cancelled
  AND NOT m.deleted
  AND m.included_in_report
  AND m.product_code <> 26736
GROUP BY m.portal, m.company_cnpj, s.trade_name, m.document_date, m.product_code,
         p.name, p.supplier_code, sup.name, sup.legal_name, p.supplier_name,
         p.classification_name, p.category_name, p.class_name, p.subclass_name, p.origin_name;


-- Metadados complementares usados para reconciliar o cadastro exportado do Linx.
-- O valor de metadata_source deixa explícita a origem do preenchimento e evita
-- tratar um arquivo de referência como se fosse uma resposta nova da API.
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE analytics.product ADD COLUMN IF NOT EXISTS metadata_source text NOT NULL DEFAULT 'linx_api';

CREATE INDEX IF NOT EXISTS product_supplier_name_idx
    ON analytics.product (portal, supplier_name);


-- Cache da visão diária para que filtros do painel não agreguem milhões de
-- movimentos a cada requisição. A fonte continua sendo analytics.daily_sales.
CREATE TABLE IF NOT EXISTS analytics.daily_sales_cache AS
SELECT * FROM analytics.daily_sales WITH NO DATA;

CREATE INDEX IF NOT EXISTS daily_sales_cache_date_store_idx
    ON analytics.daily_sales_cache (document_date, company_cnpj);

CREATE INDEX IF NOT EXISTS daily_sales_cache_product_idx
    ON analytics.daily_sales_cache (product_code, document_date);

DO $$
BEGIN
    -- apply_migrations.py pode ser executado várias vezes. Não reconstruímos
    -- milhões de linhas em toda execução; o refresh_analytics.py continua
    -- responsável por atualizar a cache após uma coleta.
    IF NOT EXISTS (SELECT 1 FROM analytics.daily_sales_cache LIMIT 1) THEN
        INSERT INTO analytics.daily_sales_cache
        SELECT * FROM analytics.daily_sales;
    END IF;
END $$;

ANALYZE analytics.daily_sales_cache;


-- Fonte mensal usada pelo Power BI: CompraVendasSaldoPorEmpresa.
-- Esta tabela preserva o cálculo do modelo original (quantidade da loja
-- multiplicada pelo preço praticado médio do produto), sem substituir os
-- movimentos XML usados para a evolução diária.
CREATE TABLE IF NOT EXISTS analytics.powerbi_monthly_sales (
    portal integer NOT NULL,
    report_month date NOT NULL,
    company_code integer NOT NULL,
    product_code bigint NOT NULL,
    product_name text,
    reference text,
    sales_quantity numeric(18, 6) NOT NULL DEFAULT 0,
    stock_quantity numeric(18, 6) NOT NULL DEFAULT 0,
    cost_unit numeric(18, 6),
    table_price_unit numeric(18, 6),
    practiced_price_unit numeric(18, 6),
    table_revenue numeric(20, 6) NOT NULL DEFAULT 0,
    net_revenue numeric(20, 6) NOT NULL DEFAULT 0,
    cost_value numeric(20, 6) NOT NULL DEFAULT 0,
    source_file text NOT NULL,
    source_row integer,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portal, report_month, company_code, product_code)
);

CREATE INDEX IF NOT EXISTS powerbi_monthly_sales_month_store_idx
    ON analytics.powerbi_monthly_sales (report_month, company_code);
CREATE INDEX IF NOT EXISTS powerbi_monthly_sales_product_idx
    ON analytics.powerbi_monthly_sales (product_code, report_month);

DROP VIEW IF EXISTS analytics.powerbi_monthly_sales_enriched;
CREATE VIEW analytics.powerbi_monthly_sales_enriched AS
SELECT
    m.portal,
    m.report_month AS document_date,
    s.company_cnpj,
    s.trade_name AS store_name,
    m.product_code,
    coalesce(m.product_name, p.name) AS product_name,
    p.supplier_code,
    coalesce(sup.name, sup.legal_name, p.supplier_name) AS supplier_name,
    p.classification_name,
    p.category_name,
    p.class_name,
    p.subclass_name,
    p.origin_name,
    m.sales_quantity AS net_quantity,
    m.net_revenue,
    m.cost_value,
    m.net_revenue - m.cost_value AS gross_margin
FROM analytics.powerbi_monthly_sales m
LEFT JOIN analytics.store s
    ON s.portal = m.portal AND s.company_code = m.company_code
LEFT JOIN analytics.product p
    ON p.portal = m.portal AND p.product_code = m.product_code
LEFT JOIN analytics.supplier sup
    ON sup.portal = p.portal AND sup.supplier_code = p.supplier_code;


-- Índices para os indicadores de estoque, velocidade e giro.
CREATE INDEX IF NOT EXISTS inventory_snapshot_store_product_date_idx
    ON analytics.inventory_snapshot (portal, company_cnpj, product_code, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS inventory_snapshot_product_date_store_idx
    ON analytics.inventory_snapshot (product_code, snapshot_date, company_cnpj);

CREATE INDEX IF NOT EXISTS daily_sales_cache_date_company_product_idx
    ON analytics.daily_sales_cache (document_date, company_cnpj, product_code);


-- A cache diária é consultada em todos os filtros do painel. A chave única
-- permite atualizar somente os dias reprocessados pela coleta, sem truncar
-- milhões de linhas a cada sincronização.
CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_cache_grain_uq
    ON analytics.daily_sales_cache (portal, company_cnpj, document_date, product_code);

CREATE INDEX IF NOT EXISTS daily_sales_cache_company_date_idx
    ON analytics.daily_sales_cache (company_cnpj, document_date);


-- Histórico de alterações da réplica. Cada upsert da coleta gera um evento
-- apenas quando o hash do registro realmente muda.
CREATE TABLE IF NOT EXISTS replica.collection_change (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    collection_run_id bigint REFERENCES replica.collection_run(id),
    table_name text NOT NULL,
    record_key text NOT NULL,
    change_type text NOT NULL CHECK (change_type IN ('insert', 'update')),
    previous_hash char(64),
    current_hash char(64) NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collection_change_run_idx
    ON replica.collection_change (collection_run_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS collection_change_table_key_idx
    ON replica.collection_change (table_name, record_key, changed_at DESC);

CREATE OR REPLACE FUNCTION replica.audit_replica_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD._record_hash IS NOT DISTINCT FROM NEW._record_hash THEN
        RETURN NEW;
    END IF;

    INSERT INTO replica.collection_change
        (collection_run_id, table_name, record_key, change_type,
         previous_hash, current_hash)
    VALUES
        (NEW._collection_run_id, TG_TABLE_NAME, NEW._record_key,
         CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
         CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD._record_hash END,
         NEW._record_hash);
    RETURN NEW;
END;
$$;

DO $$
DECLARE endpoint record;
BEGIN
    FOR endpoint IN
        SELECT table_name FROM replica.endpoint_catalog
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON replica.%I',
                       endpoint.table_name || '_audit', endpoint.table_name);
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON replica.%I
             FOR EACH ROW EXECUTE FUNCTION replica.audit_replica_change()',
            endpoint.table_name || '_audit', endpoint.table_name
        );
    END LOOP;
END;
$$;

-- Runtime access: the application role remains read-only.
GRANT USAGE ON SCHEMA ingest, analytics, replica TO renova_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA ingest, analytics, replica TO renova_runtime;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA ingest, analytics, replica TO renova_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE renova_migrator IN SCHEMA ingest, analytics, replica GRANT SELECT ON TABLES TO renova_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE renova_migrator IN SCHEMA ingest, analytics, replica GRANT SELECT ON SEQUENCES TO renova_runtime;
`,
  }),
]);
