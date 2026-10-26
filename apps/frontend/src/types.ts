export type Store = {
  portal: number;
  company_cnpj: string;
  company_code: number | null;
  legal_name: string | null;
  trade_name: string | null;
  active: boolean | null;
};

export type Summary = {
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
  stores: number;
  products: number;
  last_date: string | null;
  source?: 'powerbi_monthly' | 'linx_movements';
};

export type DailySale = {
  portal: number;
  company_cnpj: string;
  store_name: string | null;
  document_date: string;
  product_code: number;
  product_name: string | null;
  supplier_code: number | null;
  supplier_name: string | null;
  classification_name: string | null;
  category_name: string | null;
  class_name: string | null;
  subclass_name: string | null;
  origin_name: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
};

export type Product = {
  portal: number;
  product_code: number;
  barcode: string | null;
  reference: string | null;
  name: string | null;
  basic_description: string | null;
  brand_name: string | null;
  line_name: string | null;
  sector_name: string | null;
  supplier_code: number | null;
  supplier_name: string | null;
  classification_name: string | null;
  category_name: string | null;
  class_name: string | null;
  subclass_name: string | null;
  origin_name: string | null;
  company_cnpj: string | null;
  store_name: string | null;
  snapshot_date: string | null;
  balance_quantity: number | null;
  stock_cost_value: number | null;
  cost_price: number | null;
  sale_price: number | null;
  unit: string | null;
  disabled: boolean | null;
};

export type InventoryItem = {
  portal: number;
  company_cnpj: string;
  product_code: number;
  snapshot_date: string;
  quantity: number | null;
  average_cost: number | null;
  total_cost: number | null;
  cost_price: number | null;
  sale_price: number | null;
  location: string | null;
  product_name: string | null;
  reference: string | null;
  supplier_code: number | null;
  supplier_name: string | null;
  classification_name: string | null;
  category_name: string | null;
  class_name: string | null;
  subclass_name: string | null;
  origin_name: string | null;
};

export type StorePerformance = {
  company_cnpj: string;
  store_name: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
};

export type SupplierPerformance = {
  supplier_code: number | null;
  supplier_name: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
};

export type CategoryPerformance = {
  category_name: string | null;
  class_name: string | null;
  subclass_name: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
};

export type StockByStore = {
  company_cnpj: string;
  balance_quantity: number;
  stock_cost_value: number;
  stock_sale_value: number;
  products_in_stock: number;
};

export type OriginPerformance = {
  origin_name: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
};

export type StockAnalysisRow = {
  supplier_code?: number | null;
  supplier_name?: string | null;
  category_name?: string | null;
  class_name?: string | null;
  subclass_name?: string | null;
  origin_name?: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  gross_margin: number;
  balance_quantity: number;
  stock_sale_value: number;
  stock_cost_value: number;
};

export type ProductAnalysisRow = {
  product_code: number;
  product_name: string | null;
  supplier_name: string | null;
  category_name: string | null;
  net_quantity: number;
  net_revenue: number;
  first_sale_date: string | null;
  stock_quantity: number;
  stock_sale_value: number;
  average_stock_quantity: number;
  stock_history_points: number;
  active_days: number;
  sales_velocity: number | null;
  turnover: number | null;
};

export type StoreDailyAnalysisRow = {
  document_date: string;
  company_cnpj: string;
  store_name: string | null;
  net_quantity: number;
  net_revenue: number;
  cost_value: number;
  stock_quantity: number;
  stock_sale_value: number;
  stock_cost_value: number;
  sales_velocity: number;
  turnover: number | null;
  coverage_days: number | null;
};

export type AnalyticsPayload = {
  start: string;
  end: string;
  source?: 'powerbi_monthly' | 'linx_movements';
  suppliers: StockAnalysisRow[];
  categories: StockAnalysisRow[];
  origins: StockAnalysisRow[];
  velocity: ProductAnalysisRow[];
  turnover: ProductAnalysisRow[];
  store_daily: StoreDailyAnalysisRow[];
};

export type DashboardPayload = {
  start: string;
  end: string;
  source?: 'powerbi_monthly' | 'linx_movements';
  summary: Summary;
  daily: Array<
    Pick<
      DailySale,
      'document_date' | 'net_quantity' | 'net_revenue' | 'cost_value' | 'gross_margin'
    >
  >;
  stores: StorePerformance[];
  suppliers: SupplierPerformance[];
  categories: CategoryPerformance[];
  origins: OriginPerformance[];
  stock_by_store: StockByStore[];
};

export type SyncStatus = {
  running: boolean;
  pid?: number;
  started_at?: string | null;
  exit_code?: number | null;
  source?: string;
  log?: string;
  last_run?: SyncRun | null;
  last_successful_run?: SyncRun | null;
  latest_stock_date?: string | null;
  stock_age_days?: number | null;
};

export type SyncRun = {
  id?: number;
  method?: string;
  table_name?: string;
  company_cnpj?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  status?: 'running' | 'succeeded' | 'failed' | string;
  pages?: number;
  records_received?: number;
  records_inserted?: number;
  changed_rows?: number;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
  error_message?: string | null;
};

export type SyncHistoryPayload = {
  data: SyncRun[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export type SyncAuditRow = {
  id: number;
  collection_run_id: number | null;
  table_name: string;
  record_key: string;
  change_type: 'insert' | 'update' | string;
  previous_hash: string | null;
  current_hash: string;
  changed_at: string;
  method?: string | null;
  company_cnpj?: string | null;
};

export type SyncAuditPayload = {
  data: SyncAuditRow[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export type HealthPayload = {
  ok: boolean;
  database_time?: string;
  last_run?: SyncRun | null;
  last_successful_run?: SyncRun | null;
  data_quality?: {
    last_movement_date: string | null;
    last_stock_date: string | null;
    stock_age_days: number | null;
    movement_rows: number;
    product_rows: number;
    products_with_metadata: number;
    supplier_rows: number;
  };
};
