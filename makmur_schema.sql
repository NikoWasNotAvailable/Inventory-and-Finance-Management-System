-- =====================================================================
--  MAKMUR / REZEKI MAKMUR  -  SQLite schema (local use)  -  v4
--  Requires SQLite >= 3.31 (generated columns + window functions).
--
--  THE BIG PICTURE
--
--   BUY  (Product page)  -> row ins `purchases`  = a STOCK LOT + a HUTANG
--        Payment page    -> hutang: unpaid -> Pay -> paid (History)
--
--   SELL (Invoice page)  -> rows in `invoice_items`
--        On insert, a trigger takes stock FIFO (oldest purchase date
--        first) and records exactly which lots were used in
--        `stock_allocations`. Not enough stock -> the insert is rejected.
--        Transaction page-> piutang: unpaid -> paid (History)
--
--   PROFIT (laba) = selling price - cost of the lots the FIFO trigger used.
--     * invoice created, not paid yet -> its profit is PIUTANG (pending)
--     * customer pays                 -> that share of the profit becomes
--                                        INCOME (a partial payment realises
--                                        a proportional part of the profit)
--   OUTCOME = operational expenses (`expenses`), grouped by category;
--             the default category is 'Others'.
--   Purchases are NOT in outcome: their cost is already inside the profit
--   (HPP), so adding them again would count them twice.
--
--  Conventions
--   * Money        : INTEGER, whole Rupiah (no decimals -> no float errors).
--   * Business date: TEXT 'YYYY-MM-DD'          (UI shows dd/mm/yyyy).
--   * Timestamps   : TEXT 'YYYY-MM-DD HH:MM:SS' (local time, WIB).
--   * One unit per product (products.unit). Buy and sell in the same unit.
--   * Run `PRAGMA foreign_keys = ON;` on EVERY new connection.
--   * Always insert an invoice and its lines inside ONE transaction and
--     ROLLBACK if any line is rejected (e.g. insufficient stock).
-- =====================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------------------------------------------------------------------
-- USERS  (Manage User / Log Out)
-- Store a bcrypt/argon2 hash in password_hash, never the plain password.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
-- SETTINGS  (Setting page) - simple key/value store
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
) WITHOUT ROWID;

INSERT INTO settings (key, value) VALUES
  ('company_name',    'REZEKI MAKMUR'),
  ('company_tagline', 'Plastics and Other Resto Supplies'),
  ('company_address', 'Jl. Prepedan Dalam No.9 Kel. Kamal, Jakarta Barat'),
  ('next_do_seq',     '1');   -- set to (last paper D/O number + 1), e.g. 14805

-- ---------------------------------------------------------------------
-- STORES  ("Toko")  - supplier, customer, or both
-- ---------------------------------------------------------------------
CREATE TABLE stores (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,   -- 'TOKO 1'
  address     TEXT,                                     -- printed under "Kepada YTH."
  phone       TEXT,
  notes       TEXT,
  is_supplier INTEGER NOT NULL DEFAULT 1 CHECK (is_supplier IN (0,1)),
  is_customer INTEGER NOT NULL DEFAULT 1 CHECK (is_customer IN (0,1)),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
-- PRODUCTS  (now REQUIRED: stock is tracked per product)
-- Never delete a product that has history; set is_active = 0 instead.
-- ---------------------------------------------------------------------
CREATE TABLE products (
  id                 INTEGER PRIMARY KEY,
  name               TEXT    NOT NULL UNIQUE COLLATE NOCASE,   -- 'Plastik 1'
  unit               TEXT    NOT NULL DEFAULT 'PCK',
  default_buy_price  INTEGER NOT NULL DEFAULT 0 CHECK (default_buy_price  >= 0),
  default_sell_price INTEGER NOT NULL DEFAULT 0 CHECK (default_sell_price >= 0),
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- =====================================================================
--  BUY SIDE  -  Product page + Payment page  (stock lot + hutang)
-- =====================================================================

-- PURCHASES: one row = one lot bought = one hutang.
--   Same product + same toko but different date/price = separate rows,
--   so every lot keeps its own date and its own cost. That is what FIFO
--   needs.
--   qty_sold      : kept by triggers (from stock_allocations)
--   qty_remaining : what is still on the shelf from this lot
--   paid_amount   : kept by triggers (from purchase_payments)
CREATE TABLE purchases (
  id            INTEGER PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES stores(id)   ON DELETE RESTRICT,  -- "From"
  purchase_date TEXT    NOT NULL
                CHECK (purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,  -- "Name"
  quantity      INTEGER NOT NULL CHECK (quantity > 0),                        -- "QNT"
  unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),                     -- "Price" = cost per unit
  total_amount  INTEGER GENERATED ALWAYS AS (quantity * unit_price) STORED,   -- "Total Price"
  qty_sold      INTEGER NOT NULL DEFAULT 0 CHECK (qty_sold >= 0),
  qty_remaining INTEGER GENERATED ALWAYS AS (quantity - qty_sold) VIRTUAL,
  paid_amount   INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status        TEXT GENERATED ALWAYS AS (                 -- hutang status
                  CASE WHEN total_amount > 0 AND paid_amount >= total_amount THEN 'paid'
                       WHEN paid_amount > 0                                  THEN 'partial'
                       ELSE 'unpaid' END
                ) VIRTUAL,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (paid_amount <= total_amount),      -- no over-payment
  CHECK (qty_sold    <= quantity)           -- no over-selling of a lot
);

-- PURCHASE_PAYMENTS: money we paid out. The "Pay" button inserts a row
-- for the remaining balance (installments are possible but optional).
CREATE TABLE purchase_payments (
  id          INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  paid_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  method      TEXT    NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','transfer','other')),
  reference   TEXT,
  note        TEXT,
  paid_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- =====================================================================
--  SELL SIDE  -  Invoice page + Transaction page  (piutang)
-- =====================================================================

-- INVOICES: sales document (D/O). One invoice = one piutang.
--   do_number : 'D/O No.'  e.g. '14805/0926'
--   po_number : customer's PO, e.g. 'PO202609140027' (the "Cust" column)
--   is_void   : cancel an invoice (stock goes back). Not allowed once it
--               has payments; cannot be undone.
CREATE TABLE invoices (
  id            INTEGER PRIMARY KEY,
  do_number     TEXT    NOT NULL UNIQUE,
  invoice_date  TEXT    NOT NULL
                CHECK (invoice_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,    -- "Kepada YTH."
  po_number     TEXT,
  receiver_name TEXT,                                 -- "Yang menerima"
  notes         TEXT,
  total_amount  INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),         -- kept by triggers
  paid_amount   INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount  >= 0),         -- kept by triggers
  is_void       INTEGER NOT NULL DEFAULT 0 CHECK (is_void IN (0,1)),
  status        TEXT GENERATED ALWAYS AS (
                  CASE WHEN is_void = 1                                      THEN 'void'
                       WHEN total_amount > 0 AND paid_amount >= total_amount THEN 'paid'
                       WHEN paid_amount > 0                                  THEN 'partial'
                       ELSE 'unpaid' END
                ) VIRTUAL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (paid_amount <= total_amount)
);

-- INVOICE_ITEMS: printed lines (QNT, Name, Price, Total Price).
--   INSERT => FIFO stock is taken automatically (see triggers).
--   product_name / unit are snapshots for the printed document.
--   unit_price is the SELLING price.
CREATE TABLE invoice_items (
  id           INTEGER PRIMARY KEY,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT    NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit         TEXT    NOT NULL DEFAULT 'PCK',
  unit_price   INTEGER NOT NULL CHECK (unit_price >= 0),
  line_total   INTEGER GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- STOCK_ALLOCATIONS: which lot(s) each invoice line consumed.
--   SYSTEM-MANAGED by triggers. The app should never write to it.
--   One invoice line can span several lots (e.g. 100 pcs = 50 from the
--   oldest lot + 30 from the next + 20 from the one after).
--   Cost of goods = SUM(quantity * purchases.unit_price) over these rows.
CREATE TABLE stock_allocations (
  id              INTEGER PRIMARY KEY,
  invoice_item_id INTEGER NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  purchase_id     INTEGER NOT NULL REFERENCES purchases(id)     ON DELETE RESTRICT,
  quantity        INTEGER NOT NULL CHECK (quantity > 0)
);

-- INVOICE_PAYMENTS: money received from customers.
CREATE TABLE invoice_payments (
  id          INTEGER PRIMARY KEY,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  paid_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  method      TEXT    NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','transfer','other')),
  reference   TEXT,
  note        TEXT,
  received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- =====================================================================
--  OUTCOME  -  operational expenses (shown on the Income page chart)
-- =====================================================================

-- Categories for the outcome chart. Starts with 'Others' (id 1, the
-- default). Add more later (Gaji, Sewa, Ongkir...) without changing schema.
CREATE TABLE expense_categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO expense_categories (id, name) VALUES (1, 'Others');

-- One row = one operational cost, paid on expense_date (no hutang here).
CREATE TABLE expenses (
  id           INTEGER PRIMARY KEY,
  expense_date TEXT    NOT NULL
               CHECK (expense_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  category_id  INTEGER NOT NULL DEFAULT 1 REFERENCES expense_categories(id) ON DELETE RESTRICT,
  description  TEXT    NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  note         TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------
CREATE INDEX idx_purchases_fifo     ON purchases(product_id, purchase_date, id);  -- FIFO lookup
CREATE INDEX idx_purchases_store    ON purchases(store_id);
CREATE INDEX idx_purchases_date     ON purchases(purchase_date);
CREATE INDEX idx_purchases_status   ON purchases(status);
CREATE INDEX idx_purch_pay_purchase ON purchase_payments(purchase_id);
CREATE INDEX idx_purch_pay_paid_at  ON purchase_payments(paid_at);

CREATE INDEX idx_invoices_store     ON invoices(store_id);
CREATE INDEX idx_invoices_date      ON invoices(invoice_date);
CREATE INDEX idx_invoices_status    ON invoices(status);
CREATE INDEX idx_inv_items_invoice  ON invoice_items(invoice_id);
CREATE INDEX idx_inv_items_product  ON invoice_items(product_id);
CREATE INDEX idx_alloc_item         ON stock_allocations(invoice_item_id);
CREATE INDEX idx_alloc_purchase     ON stock_allocations(purchase_id);
CREATE INDEX idx_inv_pay_invoice    ON invoice_payments(invoice_id);
CREATE INDEX idx_inv_pay_paid_at    ON invoice_payments(paid_at);
CREATE INDEX idx_expenses_date     ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- =====================================================================
--  TRIGGERS - FIFO stock
-- =====================================================================

-- Keep purchases.qty_sold in sync with stock_allocations.
CREATE TRIGGER trg_alloc_ins AFTER INSERT ON stock_allocations
BEGIN
  UPDATE purchases SET qty_sold = qty_sold + NEW.quantity WHERE id = NEW.purchase_id;
END;

CREATE TRIGGER trg_alloc_del AFTER DELETE ON stock_allocations
BEGIN
  UPDATE purchases SET qty_sold = qty_sold - OLD.quantity WHERE id = OLD.purchase_id;
END;

-- FIFO allocation when an invoice line is added.
--   Oldest purchase_date first (ties: lowest id). Running total of the
--   remaining quantity per lot decides how much to take from each lot.
--   If the shelf can't cover the line, the whole INSERT is rejected.
CREATE TRIGGER trg_inv_items_fifo_ins AFTER INSERT ON invoice_items
BEGIN
  INSERT INTO stock_allocations (invoice_item_id, purchase_id, quantity)
  SELECT NEW.id, lot_id, take
    FROM (SELECT lot_id,
                 MIN(remaining, NEW.quantity - (running - remaining)) AS take
            FROM (SELECT id AS lot_id,
                         qty_remaining AS remaining,
                         SUM(qty_remaining) OVER (ORDER BY purchase_date, id
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
                    FROM purchases
                   WHERE product_id = NEW.product_id AND qty_remaining > 0))
   WHERE take > 0;

  SELECT RAISE(ABORT, 'Insufficient stock for this product')
   WHERE (SELECT COALESCE(SUM(quantity), 0) FROM stock_allocations
           WHERE invoice_item_id = NEW.id) < NEW.quantity;
END;

-- Changing quantity/product of a line: give the stock back, allocate again.
-- (If the new quantity can't be covered, the whole UPDATE is rolled back.)
CREATE TRIGGER trg_inv_items_fifo_upd AFTER UPDATE OF quantity, product_id ON invoice_items
BEGIN
  DELETE FROM stock_allocations WHERE invoice_item_id = NEW.id;

  INSERT INTO stock_allocations (invoice_item_id, purchase_id, quantity)
  SELECT NEW.id, lot_id, take
    FROM (SELECT lot_id,
                 MIN(remaining, NEW.quantity - (running - remaining)) AS take
            FROM (SELECT id AS lot_id,
                         qty_remaining AS remaining,
                         SUM(qty_remaining) OVER (ORDER BY purchase_date, id
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
                    FROM purchases
                   WHERE product_id = NEW.product_id AND qty_remaining > 0))
   WHERE take > 0;

  SELECT RAISE(ABORT, 'Insufficient stock for this product')
   WHERE (SELECT COALESCE(SUM(quantity), 0) FROM stock_allocations
           WHERE invoice_item_id = NEW.id) < NEW.quantity;
END;

-- Voiding an invoice puts its stock back on the shelf.
CREATE TRIGGER trg_inv_void_restock AFTER UPDATE OF is_void ON invoices
WHEN NEW.is_void = 1 AND OLD.is_void = 0
BEGIN
  DELETE FROM stock_allocations
   WHERE invoice_item_id IN (SELECT id FROM invoice_items WHERE invoice_id = NEW.id);
END;

CREATE TRIGGER trg_inv_void_guard_paid BEFORE UPDATE OF is_void ON invoices
WHEN NEW.is_void = 1 AND OLD.paid_amount > 0
BEGIN SELECT RAISE(ABORT, 'Cannot void an invoice that already has payments'); END;

CREATE TRIGGER trg_inv_void_guard_undo BEFORE UPDATE OF is_void ON invoices
WHEN OLD.is_void = 1 AND NEW.is_void = 0
BEGIN SELECT RAISE(ABORT, 'A void invoice cannot be reactivated - create a new one'); END;

-- A lot that has been (partly) sold can't be switched to another product.
CREATE TRIGGER trg_purchases_product_lock BEFORE UPDATE OF product_id ON purchases
WHEN OLD.qty_sold > 0 AND NEW.product_id <> OLD.product_id
BEGIN SELECT RAISE(ABORT, 'This lot is already (partly) sold - product cannot change'); END;

-- =====================================================================
--  TRIGGERS - hutang: purchases.paid_amount from purchase_payments
-- =====================================================================
CREATE TRIGGER trg_purch_pay_ins AFTER INSERT ON purchase_payments
BEGIN
  UPDATE purchases
     SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM purchase_payments
                         WHERE purchase_payments.purchase_id = purchases.id)
   WHERE id = NEW.purchase_id;
END;

CREATE TRIGGER trg_purch_pay_upd AFTER UPDATE OF amount, purchase_id ON purchase_payments
BEGIN
  UPDATE purchases
     SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM purchase_payments
                         WHERE purchase_payments.purchase_id = purchases.id)
   WHERE id IN (OLD.purchase_id, NEW.purchase_id);
END;

CREATE TRIGGER trg_purch_pay_del AFTER DELETE ON purchase_payments
BEGIN
  UPDATE purchases
     SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM purchase_payments
                         WHERE purchase_payments.purchase_id = purchases.id)
   WHERE id = OLD.purchase_id;
END;

-- =====================================================================
--  TRIGGERS - piutang: invoices.total_amount / paid_amount
-- =====================================================================
CREATE TRIGGER trg_inv_items_total_ins AFTER INSERT ON invoice_items
BEGIN
  UPDATE invoices
     SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM invoice_items
                          WHERE invoice_items.invoice_id = invoices.id)
   WHERE id = NEW.invoice_id;
END;

CREATE TRIGGER trg_inv_items_total_upd AFTER UPDATE OF quantity, unit_price, invoice_id ON invoice_items
BEGIN
  UPDATE invoices
     SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM invoice_items
                          WHERE invoice_items.invoice_id = invoices.id)
   WHERE id IN (OLD.invoice_id, NEW.invoice_id);
END;

CREATE TRIGGER trg_inv_items_total_del AFTER DELETE ON invoice_items
BEGIN
  UPDATE invoices
     SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM invoice_items
                          WHERE invoice_items.invoice_id = invoices.id)
   WHERE id = OLD.invoice_id;
END;

CREATE TRIGGER trg_inv_pay_ins AFTER INSERT ON invoice_payments
BEGIN
  UPDATE invoices
     SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM invoice_payments
                         WHERE invoice_payments.invoice_id = invoices.id)
   WHERE id = NEW.invoice_id;
END;

CREATE TRIGGER trg_inv_pay_upd AFTER UPDATE OF amount, invoice_id ON invoice_payments
BEGIN
  UPDATE invoices
     SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM invoice_payments
                         WHERE invoice_payments.invoice_id = invoices.id)
   WHERE id IN (OLD.invoice_id, NEW.invoice_id);
END;

CREATE TRIGGER trg_inv_pay_del AFTER DELETE ON invoice_payments
BEGIN
  UPDATE invoices
     SET paid_amount = (SELECT COALESCE(SUM(amount),0) FROM invoice_payments
                         WHERE invoice_payments.invoice_id = invoices.id)
   WHERE id = OLD.invoice_id;
END;

-- =====================================================================
--  TRIGGERS - invoice integrity
-- =====================================================================

-- Lines are locked once the invoice has a payment or is void.
CREATE TRIGGER trg_inv_items_lock_ins
BEFORE INSERT ON invoice_items
WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) IN ('partial','paid','void')
BEGIN SELECT RAISE(ABORT, 'Invoice is paid/void - items are locked'); END;

CREATE TRIGGER trg_inv_items_lock_upd
BEFORE UPDATE ON invoice_items
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) IN ('partial','paid','void')
BEGIN SELECT RAISE(ABORT, 'Invoice is paid/void - items are locked'); END;

CREATE TRIGGER trg_inv_items_lock_del
BEFORE DELETE ON invoice_items
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) IN ('partial','paid','void')
BEGIN SELECT RAISE(ABORT, 'Invoice is paid/void - items are locked'); END;

-- No payments on a void invoice.
CREATE TRIGGER trg_inv_pay_not_void
BEFORE INSERT ON invoice_payments
WHEN (SELECT is_void FROM invoices WHERE id = NEW.invoice_id) = 1
BEGIN SELECT RAISE(ABORT, 'Cannot pay a void invoice'); END;

-- =====================================================================
--  VIEWS
-- =====================================================================

-- ---- Product page + Payment page (hutang) ---------------------------
CREATE VIEW v_purchases AS
SELECT p.id, s.name AS store_name, p.store_id, p.purchase_date,
       pr.id AS product_id, pr.name AS product_name, pr.unit,
       p.quantity, p.unit_price, p.total_amount,
       p.qty_sold, p.qty_remaining,
       p.paid_amount, p.total_amount - p.paid_amount AS balance,
       p.status, p.note,
       (SELECT MAX(pp.paid_at) FROM purchase_payments pp WHERE pp.purchase_id = p.id) AS last_paid_at
  FROM purchases p
  JOIN stores   s  ON s.id  = p.store_id
  JOIN products pr ON pr.id = p.product_id;

-- ---- Stock ----------------------------------------------------------
-- Every lot still on the shelf, in the order it will be sold.
-- fifo_rank = 1 is what the next invoice will take first.
CREATE VIEW v_stock_lots AS
SELECT p.id AS purchase_id, pr.id AS product_id, pr.name AS product_name, pr.unit,
       s.name AS store_name, p.purchase_date, p.unit_price AS cost_per_unit,
       p.quantity AS qty_bought, p.qty_sold, p.qty_remaining,
       p.qty_remaining * p.unit_price AS lot_value,
       ROW_NUMBER() OVER (PARTITION BY p.product_id ORDER BY p.purchase_date, p.id) AS fifo_rank
  FROM purchases p
  JOIN products pr ON pr.id = p.product_id
  JOIN stores   s  ON s.id  = p.store_id
 WHERE p.qty_remaining > 0;

-- Stock per product (includes products with zero stock).
CREATE VIEW v_stock AS
SELECT pr.id AS product_id, pr.name AS product_name, pr.unit,
       COALESCE(SUM(p.quantity), 0)                   AS qty_bought,
       COALESCE(SUM(p.qty_sold), 0)                   AS qty_sold,
       COALESCE(SUM(p.qty_remaining), 0)              AS qty_on_hand,
       COALESCE(SUM(p.qty_remaining * p.unit_price), 0) AS stock_value,
       MIN(CASE WHEN p.qty_remaining > 0 THEN p.purchase_date END) AS oldest_lot_date
  FROM products pr
  LEFT JOIN purchases p ON p.product_id = pr.id
 GROUP BY pr.id;

-- ---- Cost / profit per invoice line ---------------------------------
CREATE VIEW v_invoice_item_cost AS
SELECT ii.id AS invoice_item_id, ii.invoice_id, ii.product_id, ii.product_name,
       ii.quantity, ii.unit_price AS sell_price, ii.line_total,
       COALESCE(SUM(a.quantity * p.unit_price), 0)                AS cogs,
       ii.line_total - COALESCE(SUM(a.quantity * p.unit_price), 0) AS profit
  FROM invoice_items ii
  LEFT JOIN stock_allocations a ON a.invoice_item_id = ii.id
  LEFT JOIN purchases         p ON p.id = a.purchase_id
 GROUP BY ii.id;

-- ---- Transaction page (piutang) + Detail Transaction ----------------
CREATE VIEW v_invoices AS
SELECT x.*,
       -- part of the profit already collected (paid share) ...
       CASE WHEN x.total_amount > 0
            THEN CAST(ROUND(1.0 * x.profit * x.paid_amount / x.total_amount) AS INTEGER)
            ELSE 0 END AS profit_realized,
       -- ... and the part that is still piutang
       x.profit - CASE WHEN x.total_amount > 0
            THEN CAST(ROUND(1.0 * x.profit * x.paid_amount / x.total_amount) AS INTEGER)
            ELSE 0 END AS profit_pending
  FROM (
    SELECT i.id, i.do_number, i.invoice_date, i.po_number,
           s.name AS store_name, s.address AS store_address, i.store_id,
           i.total_amount, i.paid_amount, i.total_amount - i.paid_amount AS balance,
           i.status, i.receiver_name, i.notes,
           COALESCE((SELECT SUM(c.cogs) FROM v_invoice_item_cost c WHERE c.invoice_id = i.id), 0) AS cogs,
           CASE WHEN i.is_void = 1 THEN 0
                ELSE i.total_amount - COALESCE((SELECT SUM(c.cogs) FROM v_invoice_item_cost c
                                                 WHERE c.invoice_id = i.id), 0) END AS profit,
           (SELECT MAX(ip.paid_at) FROM invoice_payments ip WHERE ip.invoice_id = i.id) AS last_paid_at
      FROM invoices i
      JOIN stores s ON s.id = i.store_id
  ) x;

-- ---- Hutang / piutang summaries -------------------------------------
CREATE VIEW v_payable_by_store AS
SELECT store_id, store_name, COUNT(*) AS open_rows, SUM(balance) AS total_hutang
  FROM v_purchases WHERE status IN ('unpaid','partial')
 GROUP BY store_id, store_name;

CREATE VIEW v_receivable_by_store AS
SELECT store_id, store_name, COUNT(*) AS open_invoices,
       SUM(balance) AS total_piutang, SUM(profit_pending) AS profit_piutang
  FROM v_invoices WHERE status IN ('unpaid','partial')
 GROUP BY store_id, store_name;

-- ---- INCOME page: income = profit that has been COLLECTED -------------
-- Each payment realises its share of the invoice profit:
--   profit * (paid so far) / total     (cumulative rounding, so a fully
-- paid invoice always realises exactly its whole profit).
-- Profit of unpaid invoices is NOT here; see v_invoices.profit_pending.
CREATE VIEW v_income_events AS
SELECT payment_id, invoice_id, paid_at, amount,
       realized_cum - COALESCE(LAG(realized_cum) OVER (
            PARTITION BY invoice_id ORDER BY paid_at, payment_id), 0) AS profit
  FROM (SELECT ip.id AS payment_id, ip.invoice_id, ip.paid_at, ip.amount,
               CAST(ROUND(1.0 * v.profit
                    * SUM(ip.amount) OVER (PARTITION BY ip.invoice_id ORDER BY ip.paid_at, ip.id
                                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                    / v.total_amount) AS INTEGER) AS realized_cum
          FROM invoice_payments ip
          JOIN v_invoices v ON v.id = ip.invoice_id
         WHERE v.total_amount > 0);

CREATE VIEW v_income_daily AS
SELECT date(paid_at) AS day, COUNT(*) AS payment_count,
       SUM(amount) AS cash_received, SUM(profit) AS income
  FROM v_income_events GROUP BY date(paid_at);

CREATE VIEW v_income_monthly AS
SELECT strftime('%Y-%m', paid_at) AS month, COUNT(*) AS payment_count,
       SUM(amount) AS cash_received, SUM(profit) AS income
  FROM v_income_events GROUP BY strftime('%Y-%m', paid_at);

-- ---- OUTCOME chart: operational expenses by category ('Others', ...) --
CREATE VIEW v_outcome_daily AS
SELECT e.expense_date AS day, c.name AS category, SUM(e.amount) AS total
  FROM expenses e JOIN expense_categories c ON c.id = e.category_id
 GROUP BY e.expense_date, c.name;

CREATE VIEW v_outcome_monthly AS
SELECT strftime('%Y-%m', e.expense_date) AS month, c.name AS category, SUM(e.amount) AS total
  FROM expenses e JOIN expense_categories c ON c.id = e.category_id
 GROUP BY strftime('%Y-%m', e.expense_date), c.name;

-- ---- Income vs outcome per month (net = income - outcome) -------------
CREATE VIEW v_net_monthly AS
SELECT month, SUM(income) AS income, SUM(outcome) AS outcome, SUM(income) - SUM(outcome) AS net
  FROM (SELECT strftime('%Y-%m', paid_at) AS month, profit AS income, 0 AS outcome FROM v_income_events
        UNION ALL
        SELECT strftime('%Y-%m', expense_date), 0, amount FROM expenses)
 GROUP BY month;

-- ---- Sales profit by product (all non-void invoices, paid or not) -----
CREATE VIEW v_profit_by_product AS
SELECT c.product_id, c.product_name, SUM(c.quantity) AS qty_sold,
       SUM(c.line_total) AS revenue, SUM(c.cogs) AS cogs, SUM(c.profit) AS profit
  FROM v_invoice_item_cost c
  JOIN invoices i ON i.id = c.invoice_id AND i.is_void = 0
 GROUP BY c.product_id, c.product_name;

-- ---- Cash flow (secondary: real money in vs out, incl. expenses) ------
CREATE VIEW v_cashflow_monthly AS
SELECT month, SUM(money_in) AS money_in, SUM(money_out) AS money_out,
       SUM(money_in) - SUM(money_out) AS net
  FROM (SELECT strftime('%Y-%m', paid_at) AS month, amount AS money_in, 0 AS money_out FROM invoice_payments
        UNION ALL
        SELECT strftime('%Y-%m', paid_at), 0, amount FROM purchase_payments
        UNION ALL
        SELECT strftime('%Y-%m', expense_date), 0, amount FROM expenses)
 GROUP BY month;

-- ---------------------------------------------------------------------
-- PAGE -> QUERY CHEAT SHEET
--   Product page            SELECT * FROM v_purchases ORDER BY purchase_date DESC;
--   Stock summary           SELECT * FROM v_stock;            (Product page header / new tab)
--   Stock lots (FIFO order) SELECT * FROM v_stock_lots WHERE product_id = ? ORDER BY fifo_rank;
--
--   Payment (hutang)        SELECT * FROM v_purchases WHERE status IN ('unpaid','partial');
--   Payment - History       SELECT * FROM v_purchases WHERE status = 'paid';
--   Pay button              INSERT INTO purchase_payments (purchase_id, amount, method, paid_by)
--                           VALUES (?, <balance>, ?, ?);
--
--   Invoice page: max qty   SELECT qty_on_hand FROM v_stock WHERE product_id = ?;
--   Transaction (piutang)   SELECT * FROM v_invoices WHERE status IN ('unpaid','partial');
--   Transaction - History   SELECT * FROM v_invoices WHERE status = 'paid';
--   Detail Transaction      SELECT * FROM v_invoices WHERE id = ?;
--                           SELECT * FROM invoice_items WHERE invoice_id = ?;
--   Customer pays           INSERT INTO invoice_payments (invoice_id, amount, method, received_by)
--                           VALUES (?, <balance>, ?, ?);
--   Laba still in piutang   SELECT SUM(profit_pending) FROM v_invoices WHERE status IN ('unpaid','partial');
--                           (per toko: v_receivable_by_store.profit_piutang)
--
--   INCOME page             SELECT * FROM v_income_daily / v_income_monthly;   -- collected profit
--   Outcome chart           SELECT * FROM v_outcome_monthly;                   -- by category ('Others', ...)
--   Income vs outcome       SELECT * FROM v_net_monthly;
--   Add operational cost    INSERT INTO expenses (expense_date, description, amount)
--                           VALUES (?, ?, ?);              -- category defaults to 'Others'
--   Profit by product       SELECT * FROM v_profit_by_product;
--
--   Creating an invoice (ONE transaction, ROLLBACK on any error):
--     1. read+increment settings.next_do_seq  -> do_number = seq || '/' || 'MMYY'
--     2. INSERT INTO invoices (...)
--     3. INSERT INTO invoice_items (...) x N   -- FIFO stock + totals happen by trigger
--     (Insufficient stock => error 'Insufficient stock for this product')
-- ---------------------------------------------------------------------
