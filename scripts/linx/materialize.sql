INSERT INTO analytics.store
    (portal, company_cnpj, company_code, legal_name, trade_name, active, raw_payload, updated_at)
SELECT DISTINCT ON (
    _portal,
    regexp_replace(coalesce(_payload->>'CNPJ', ''), '[^0-9]', '', 'g')
)
    _portal,
    regexp_replace(coalesce(_payload->>'CNPJ', ''), '[^0-9]', '', 'g'),
    CASE
      WHEN _payload->>'empresa' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (_payload->>'empresa')::numeric::integer
      ELSE NULL
    END,
    coalesce(NULLIF(_payload->>'nome_empresa', ''), NULLIF(_payload->>'rede', '')),
    coalesce(NULLIF(_payload->>'nome_empresa', ''), NULLIF(_payload->>'rede', ''), NULLIF(_payload->>'nome_portal', '')),
    true, _payload, now()
FROM replica.linx_grupo_lojas
WHERE length(regexp_replace(coalesce(_payload->>'CNPJ', ''), '[^0-9]', '', 'g')) = 14
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ORDER BY _portal,
         regexp_replace(coalesce(_payload->>'CNPJ', ''), '[^0-9]', '', 'g'),
         _linx_timestamp DESC NULLS LAST, _collected_at DESC, _id DESC
ON CONFLICT (portal, company_cnpj) DO NOTHING;

INSERT INTO analytics.store
    (portal, company_cnpj, company_code, legal_name, trade_name, active, raw_payload, updated_at)
SELECT DISTINCT ON (
    NULLIF(_payload->>'portal', '')::numeric::integer,
    regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g')
)
    NULLIF(_payload->>'portal', '')::numeric::integer,
    regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g'),
    NULLIF(_payload->>'empresa', '')::numeric::integer,
    NULLIF(_payload->>'razao_emp', ''),
    NULLIF(_payload->>'nome_emp', ''),
    true, _payload, now()
FROM replica.linx_lojas
WHERE length(regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g')) = 14
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ORDER BY NULLIF(_payload->>'portal', '')::numeric::integer,
         regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g'),
         _linx_timestamp DESC NULLS LAST, _collected_at DESC, _id DESC
ON CONFLICT (portal, company_cnpj) DO NOTHING;

INSERT INTO analytics.supplier
    (portal, supplier_code, document, name, legal_name, active, raw_payload, updated_at)
SELECT DISTINCT ON (
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_cliente', '')::numeric::bigint
)
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_cliente', '')::numeric::bigint,
    NULLIF(regexp_replace(coalesce(_payload->>'doc_cliente', ''), '[^0-9]', '', 'g'), ''),
    NULLIF(_payload->>'nome_cliente', ''),
    NULLIF(_payload->>'razao_cliente', ''),
    upper(coalesce(_payload->>'ativo', 'S')) IN ('S', 'SIM', 'TRUE', '1'),
    _payload, now()
FROM replica.linx_clientes_fornec
WHERE upper(coalesce(_payload->>'tipo_cliente', '')) = 'F'
  AND (_payload->>'portal') ~ '^[0-9]+$'
  AND (_payload->>'cod_cliente') ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ORDER BY NULLIF(_payload->>'portal', '')::numeric::integer,
         NULLIF(_payload->>'cod_cliente', '')::numeric::bigint,
         _linx_timestamp DESC NULLS LAST, _collected_at DESC
ON CONFLICT (portal, supplier_code) DO UPDATE SET
    document = coalesce(EXCLUDED.document, analytics.supplier.document),
    name = coalesce(EXCLUDED.name, analytics.supplier.name),
    legal_name = coalesce(EXCLUDED.legal_name, analytics.supplier.legal_name),
    active = EXCLUDED.active,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = now();

INSERT INTO analytics.product
    (portal, product_code, barcode, reference, name, basic_description,
     brand_id, brand_name, line_id, line_name, collection_id, collection_name,
     sector_id, sector_name, unit, disabled, linx_updated_at, linx_timestamp,
     supplier_code, classification_id, classification_name, category_id,
     category_name, class_id, class_name, subclass_id, subclass_name,
     origin_code, origin_name, raw_payload, updated_at)
SELECT DISTINCT ON (
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint
)
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
    NULLIF(_payload->>'cod_barra', ''),
    NULLIF(_payload->>'referencia', ''),
    NULLIF(_payload->>'nome', ''),
    NULLIF(_payload->>'descricao_basica', ''),
    NULLIF(_payload->>'id_marca', '')::numeric::bigint, NULLIF(_payload->>'desc_marca', ''),
    NULLIF(_payload->>'id_linha', '')::numeric::bigint, NULLIF(_payload->>'desc_linha', ''),
    NULLIF(_payload->>'id_colecao', '')::numeric::bigint, NULLIF(_payload->>'desc_colecao', ''),
    NULLIF(_payload->>'id_setor', '')::numeric::bigint, NULLIF(_payload->>'desc_setor', ''),
    NULLIF(_payload->>'unidade', ''),
    upper(coalesce(_payload->>'desativado', 'N')) IN ('S', 'SIM', 'TRUE', '1'),
    NULLIF(_payload->>'dt_update', '')::timestamp,
    NULLIF(_payload->>'timestamp', '')::numeric::bigint,
    NULLIF(_payload->>'cod_fornecedor', '')::numeric::bigint,
    NULLIF(_payload->>'id_classificacao', '')::numeric::bigint,
    NULLIF(_payload->>'desc_classificacao', ''),
    NULLIF(_payload->>'id_setor', '')::numeric::bigint,
    NULLIF(_payload->>'desc_setor', ''),
    NULLIF(_payload->>'id_linha', '')::numeric::bigint,
    NULLIF(_payload->>'desc_linha', ''),
    NULLIF(_payload->>'id_colecao', '')::numeric::bigint,
    NULLIF(_payload->>'desc_colecao', ''),
    NULLIF(_payload->>'origem_mercadoria', ''),
    CASE WHEN _payload->>'origem_mercadoria' = '0' THEN 'Nacional'
         WHEN NULLIF(_payload->>'origem_mercadoria', '') IS NULL THEN NULL
         ELSE 'Importado' END,
    _payload, now()
FROM replica.linx_produtos
WHERE (_payload->>'portal') ~ '^[0-9]+$'
  AND (_payload->>'cod_produto') ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ORDER BY NULLIF(_payload->>'portal', '')::numeric::integer,
         NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
         _linx_timestamp DESC NULLS LAST, _collected_at DESC
ON CONFLICT (portal, product_code) DO UPDATE SET
    barcode = coalesce(EXCLUDED.barcode, analytics.product.barcode),
    reference = coalesce(EXCLUDED.reference, analytics.product.reference),
    name = coalesce(EXCLUDED.name, analytics.product.name),
    basic_description = coalesce(EXCLUDED.basic_description, analytics.product.basic_description),
    supplier_code = coalesce(EXCLUDED.supplier_code, analytics.product.supplier_code),
    classification_id = coalesce(EXCLUDED.classification_id, analytics.product.classification_id),
    classification_name = coalesce(EXCLUDED.classification_name, analytics.product.classification_name),
    category_id = coalesce(EXCLUDED.category_id, analytics.product.category_id),
    category_name = coalesce(EXCLUDED.category_name, analytics.product.category_name),
    class_id = coalesce(EXCLUDED.class_id, analytics.product.class_id),
    class_name = coalesce(EXCLUDED.class_name, analytics.product.class_name),
    subclass_id = coalesce(EXCLUDED.subclass_id, analytics.product.subclass_id),
    subclass_name = coalesce(EXCLUDED.subclass_name, analytics.product.subclass_name),
    origin_code = coalesce(EXCLUDED.origin_code, analytics.product.origin_code),
    origin_name = coalesce(EXCLUDED.origin_name, analytics.product.origin_name),
    raw_payload = EXCLUDED.raw_payload,
    updated_at = now();

INSERT INTO analytics.product (portal, product_code, barcode, raw_payload)
SELECT DISTINCT ON (
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint
)
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
    NULLIF(_payload->>'cod_barra', ''), _payload
FROM replica.linx_produtos_detalhes
WHERE (_payload->>'portal') ~ '^[0-9]+$'
  AND (_payload->>'cod_produto') ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ORDER BY NULLIF(_payload->>'portal', '')::numeric::integer,
         NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
         _linx_timestamp DESC NULLS LAST, _collected_at DESC
ON CONFLICT (portal, product_code) DO UPDATE SET
    barcode = coalesce(EXCLUDED.barcode, analytics.product.barcode),
    raw_payload = EXCLUDED.raw_payload,
    updated_at = now();

-- O endpoint LinxProdutos nem sempre retorna o cadastro completo no mesmo
-- recorte da coleta. Criamos uma linha mínima para os produtos presentes no
-- movimento; quando o cadastro detalhado chegar, o upsert a complementa.
INSERT INTO analytics.product (portal, product_code, barcode, raw_payload)
SELECT DISTINCT ON (
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint
)
    NULLIF(_payload->>'portal', '')::numeric::integer,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
    NULLIF(_payload->>'cod_barra', ''),
    _payload
FROM replica.linx_movimento
WHERE (_payload->>'portal') ~ '^[0-9]+$'
  AND (_payload->>'cod_produto') ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ORDER BY NULLIF(_payload->>'portal', '')::numeric::integer,
         NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
         _linx_timestamp DESC NULLS LAST, _collected_at DESC, _id DESC
ON CONFLICT (portal, product_code) DO UPDATE SET
    barcode = coalesce(EXCLUDED.barcode, analytics.product.barcode),
    raw_payload = CASE
      WHEN analytics.product.raw_payload = '{}'::jsonb THEN EXCLUDED.raw_payload
      ELSE analytics.product.raw_payload
    END,
    updated_at = now();

INSERT INTO analytics.sales_movement
    (portal, company_cnpj, linx_timestamp, company_code, transaction_id,
     document_number, document_series, document_date, posted_at, product_code,
     barcode, customer_code, seller_code, operation, transaction_type, cancelled,
     deleted, included_in_report, quantity, unit_price, gross_value, liquid_value,
     cost_price, deposit, raw_payload, collected_at)
SELECT
    NULLIF(_payload->>'portal', '')::numeric::integer,
    regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g'),
    NULLIF(_payload->>'timestamp', '')::numeric::bigint,
    NULLIF(_payload->>'empresa', '')::numeric::integer,
    NULLIF(_payload->>'transacao', '')::numeric::bigint,
    NULLIF(_payload->>'documento', ''), NULLIF(_payload->>'serie', ''),
    NULLIF(left(_payload->>'data_documento', 10), '')::date,
    CASE
      WHEN _payload->>'data_lancamento' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (_payload->>'data_lancamento')::timestamp
      ELSE NULL
    END,
    NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
    NULLIF(_payload->>'cod_barra', ''),
    NULLIF(_payload->>'codigo_cliente', '')::numeric::bigint,
    NULLIF(_payload->>'cod_vendedor', '')::numeric::bigint,
    trim(_payload->>'operacao'), trim(_payload->>'tipo_transacao'),
    upper(coalesce(_payload->>'cancelado', 'N')) IN ('S', 'SIM', 'TRUE', '1'),
    upper(coalesce(_payload->>'excluido', 'N')) IN ('S', 'SIM', 'TRUE', '1'),
    upper(coalesce(_payload->>'soma_relatorio', 'N')) IN ('S', 'SIM', 'TRUE', '1'),
    replace(NULLIF(_payload->>'quantidade', ''), ',', '.')::numeric,
    replace(NULLIF(_payload->>'preco_unitario', ''), ',', '.')::numeric,
    replace(NULLIF(_payload->>'valor_total', ''), ',', '.')::numeric,
    replace(NULLIF(_payload->>'valor_liquido', ''), ',', '.')::numeric,
    replace(NULLIF(_payload->>'preco_custo', ''), ',', '.')::numeric,
    NULLIF(_payload->>'deposito', ''), _payload, _collected_at
FROM replica.linx_movimento
WHERE (_payload->>'portal') ~ '^[0-9]+$'
  AND (_payload->>'timestamp') ~ '^[0-9]+$'
  AND (_payload->>'cod_produto') ~ '^[0-9]+$'
  AND length(regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g')) = 14
  AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
ON CONFLICT (portal, company_cnpj, linx_timestamp) DO UPDATE SET
    company_code = EXCLUDED.company_code, transaction_id = EXCLUDED.transaction_id,
    document_number = EXCLUDED.document_number, document_series = EXCLUDED.document_series,
    document_date = EXCLUDED.document_date, posted_at = EXCLUDED.posted_at,
    product_code = EXCLUDED.product_code, barcode = EXCLUDED.barcode,
    customer_code = EXCLUDED.customer_code, seller_code = EXCLUDED.seller_code,
    operation = EXCLUDED.operation, transaction_type = EXCLUDED.transaction_type,
    cancelled = EXCLUDED.cancelled, deleted = EXCLUDED.deleted,
    included_in_report = EXCLUDED.included_in_report, quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price, gross_value = EXCLUDED.gross_value,
    liquid_value = EXCLUDED.liquid_value, cost_price = EXCLUDED.cost_price,
    deposit = EXCLUDED.deposit, raw_payload = EXCLUDED.raw_payload,
    collected_at = EXCLUDED.collected_at;

WITH inventory_rows AS (
    SELECT DISTINCT ON (
        NULLIF(_payload->>'portal', '')::numeric::integer,
        regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g'),
        NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
        coalesce((SELECT window_end FROM replica.collection_run cr WHERE cr.id = _collection_run_id), _collected_at::date)
    )
        NULLIF(_payload->>'portal', '')::numeric::integer AS portal,
        regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g') AS company_cnpj,
        NULLIF(_payload->>'cod_produto', '')::numeric::bigint AS product_code,
        coalesce((SELECT window_end FROM replica.collection_run cr WHERE cr.id = _collection_run_id), _collected_at::date) AS snapshot_date,
        coalesce(NULLIF(_payload->>'timestamp', '')::numeric::bigint, _id) AS linx_timestamp,
        NULLIF(_payload->>'empresa', '')::numeric::integer AS company_code,
        replace(NULLIF(_payload->>'quantidade', ''), ',', '.')::numeric AS quantity,
        replace(NULLIF(_payload->>'custo_medio', ''), ',', '.')::numeric AS average_cost,
        replace(NULLIF(_payload->>'custototal', ''), ',', '.')::numeric AS total_cost,
        replace(NULLIF(_payload->>'preco_custo', ''), ',', '.')::numeric AS cost_price,
        replace(NULLIF(_payload->>'preco_venda', ''), ',', '.')::numeric AS sale_price,
        NULLIF(_payload->>'localizacao', '') AS location,
        _payload AS raw_payload, _collected_at AS collected_at
    FROM replica.linx_produtos_detalhes
    WHERE (_payload->>'portal') ~ '^[0-9]+$'
      AND (_payload->>'cod_produto') ~ '^[0-9]+$'
      AND length(regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g')) = 14
      AND EXISTS (SELECT 1 FROM linx_materialize_runs mr WHERE mr.id = _collection_run_id)
    ORDER BY NULLIF(_payload->>'portal', '')::numeric::integer,
             regexp_replace(coalesce(_payload->>'cnpj_emp', ''), '[^0-9]', '', 'g'),
             NULLIF(_payload->>'cod_produto', '')::numeric::bigint,
             coalesce((SELECT window_end FROM replica.collection_run cr WHERE cr.id = _collection_run_id), _collected_at::date),
             coalesce(NULLIF(_payload->>'timestamp', '')::numeric::bigint, _id) DESC,
             _collected_at DESC, _id DESC
)
INSERT INTO analytics.inventory_snapshot
    (portal, company_cnpj, product_code, snapshot_date, linx_timestamp, company_code,
     quantity, average_cost, total_cost, cost_price, sale_price, location, raw_payload, collected_at)
SELECT portal, company_cnpj, product_code, snapshot_date, linx_timestamp, company_code,
       quantity, average_cost, total_cost, cost_price, sale_price, location, raw_payload, collected_at
FROM inventory_rows
ON CONFLICT (portal, company_cnpj, product_code, snapshot_date) DO UPDATE SET
    linx_timestamp = EXCLUDED.linx_timestamp, company_code = EXCLUDED.company_code,
    quantity = EXCLUDED.quantity, average_cost = EXCLUDED.average_cost,
    total_cost = EXCLUDED.total_cost, cost_price = EXCLUDED.cost_price,
    sale_price = EXCLUDED.sale_price, location = EXCLUDED.location,
    raw_payload = EXCLUDED.raw_payload, collected_at = EXCLUDED.collected_at;
