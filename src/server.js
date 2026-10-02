const fs = require('node:fs');
const path = require('node:path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { db, databasePath } = require('./db');

const app = Fastify({ logger: true });
const publicDir = path.resolve(__dirname, '..', 'public');

app.register(cors, { origin: true });

app.get('/', async (_request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(publicDir, 'index.html')));
});

app.get('/produk', async (_request, reply) => {
  reply.redirect('/');
});

app.get('/product.html', async (_request, reply) => {
  reply.redirect('/');
});

app.get('/invoice.html', async (_request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(publicDir, 'invoice.html')));
});

app.get('/styles.css', async (_request, reply) => {
  reply.type('text/css').send(fs.readFileSync(path.join(publicDir, 'styles.css')));
});

app.get('/app.js', async (_request, reply) => {
  reply.type('application/javascript').send(fs.readFileSync(path.join(publicDir, 'app.js')));
});

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const paymentMethods = new Set(['cash', 'transfer', 'other']);

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function requiredPositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) fail(`${field} must be a positive integer`);
  return value;
}

function requiredMoney(value, field) {
  if (!Number.isInteger(value) || value < 0) fail(`${field} must be a non-negative integer`);
  return value;
}

function requiredDate(value, field) {
  if (typeof value !== 'string' || !datePattern.test(value)) fail(`${field} must use YYYY-MM-DD`);
  return value;
}

function getProduct(productId) {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(productId);
  if (!product) fail('Active product not found', 404);
  return product;
}

function getProductByName(name, unit) {
  if (!name || typeof name !== 'string') fail('item.productName is required');
  const product = db.prepare('SELECT * FROM products WHERE name = ? COLLATE NOCASE AND is_active = 1').get(name.trim());
  if (!product) fail(`Active product not found: ${name}`, 404);
  if (unit && product.unit.toLowerCase() !== String(unit).trim().toLowerCase()) {
    fail(`Product ${product.name} uses unit ${product.unit}`);
  }
  return product;
}

function getStore(storeId) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ? AND is_active = 1').get(storeId);
  if (!store) fail('Active store not found', 404);
  return store;
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function createInvoicePdf(invoice, items) {
  const commands = [];
  const text = (x, y, size, value, bold = false) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2) => commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const box = (x, y, width, height) => {
    line(x, y, x + width, y);
    line(x + width, y, x + width, y + height);
    line(x + width, y + height, x, y + height);
    line(x, y + height, x, y);
  };
  const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
  const date = invoice.invoice_date ? invoice.invoice_date.split('-').reverse().join('/') : '';

  const left = 36;
  const right = 559;
  text(left, 790, 20, 'REZEKI MAKMUR', true);
  text(left, 774, 9, 'Plastics and Other Resto Supplies');
  text(left, 761, 9, 'Jl. Prepedan Dalam No.9 Kel. Kamal, Jakarta Barat');
  box(350, 680, 209, 110);
  line(350, 762, 559, 762);
  line(350, 735, 559, 735);
  line(350, 708, 559, 708);
  line(400, 762, 400, 790);
  text(360, 772, 9, 'TGL.');
  text(412, 772, 9, date);
  text(420, 744, 9, 'Kepada YTH.', true);
  text(360, 717, 9, invoice.store_name);
  if (invoice.store_address) text(360, 690, 9, invoice.store_address);
  box(left, 700, 210, 28);
  line(115, 700, 115, 728);
  text(46, 710, 9, 'D/O NO.');
  text(125, 710, 9, invoice.do_number);
  box(left, 660, 210, 28);
  line(115, 660, 115, 688);
  text(46, 670, 9, 'PO CUST.');
  text(125, 670, 9, invoice.po_number || '');
  text(45, 650, 10, 'QNT', true);
  text(120, 650, 10, 'Name', true);
  text(365, 650, 10, 'Price', true);
  text(465, 650, 10, 'Total Price', true);
  line(left, 640, right, 640);

  const rowHeight = 22;
  let y = 618;
  for (let index = 0; index < 12; index += 1) {
    const item = items[index];
    if (item) {
      text(45, y, 9, `${item.quantity} ${item.unit}`);
      text(120, y, 9, item.product_name);
      text(365, y, 9, money(item.sell_price));
      text(465, y, 9, money(item.line_total));
    }
    line(left, y - 8, right, y - 8);
    y -= rowHeight;
  }
  box(390, 295, 169, 30);
  text(405, 306, 10, 'Total Rp.', true);
  text(475, 306, 10, money(invoice.total_amount), true);
  text(70, 270, 10, 'Yang menerima.');
  text(390, 270, 10, 'Hormat kami.');
  line(70, 220, 170, 220);
  line(390, 220, 490, 220);
  if (invoice.receiver_name) text(70, 205, 9, invoice.receiver_name);

  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

function getOrCreateStore(name, address = null) {
  if (!name || typeof name !== 'string') fail('storeName is required');
  const normalizedName = name.trim();
  if (!normalizedName) fail('storeName is required');
  const existing = db.prepare('SELECT * FROM stores WHERE name = ? COLLATE NOCASE').get(normalizedName);
  if (existing) {
    if (address && !existing.address) {
      db.prepare('UPDATE stores SET address = ? WHERE id = ?').run(address.trim(), existing.id);
      return db.prepare('SELECT * FROM stores WHERE id = ?').get(existing.id);
    }
    return existing;
  }
  const result = db.prepare('INSERT INTO stores (name, address) VALUES (?, ?)').run(normalizedName, address?.trim() || null);
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(result.lastInsertRowid);
}

function getOrCreateProduct(name, unit) {
  if (!name || typeof name !== 'string') fail('productName is required');
  if (!unit || typeof unit !== 'string') fail('unit is required');
  const normalizedName = name.trim();
  const normalizedUnit = unit.trim();
  if (!normalizedName) fail('productName is required');
  if (!normalizedUnit) fail('unit is required');
  const existing = db.prepare('SELECT * FROM products WHERE name = ? COLLATE NOCASE').get(normalizedName);
  if (existing) {
    if (existing.unit.toLowerCase() !== normalizedUnit.toLowerCase()) fail(`Product already uses unit ${existing.unit}`);
    if (!existing.is_active) fail('Product is inactive', 409);
    return existing;
  }
  const result = db.prepare('INSERT INTO products (name, unit) VALUES (?, ?)').run(normalizedName, normalizedUnit);
  return db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
}

app.get('/api/health', async () => ({ ok: true, database: path.basename(databasePath) }));

app.get('/api/products', async (request) => {
  const includeInactive = request.query.includeInactive === 'true';
  const sql = includeInactive ? 'SELECT * FROM products ORDER BY name' : 'SELECT * FROM products WHERE is_active = 1 ORDER BY name';
  return db.prepare(sql).all();
});

app.post('/api/products', async (request, reply) => {
  const body = request.body || {};
  if (!body.name || typeof body.name !== 'string') fail('name is required');
  const result = db.prepare(`
    INSERT INTO products (name, unit, default_buy_price, default_sell_price)
    VALUES (?, ?, ?, ?)
  `).run(
    body.name.trim(), body.unit || 'PCK',
    requiredMoney(body.defaultBuyPrice ?? 0, 'defaultBuyPrice'),
    requiredMoney(body.defaultSellPrice ?? 0, 'defaultSellPrice'),
  );
  reply.code(201).send(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
});

app.patch('/api/products/:id', async (request) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) fail('Product not found', 404);
  const body = request.body || {};
  const name = body.name ?? product.name;
  const unit = body.unit ?? product.unit;
  const buyPrice = body.defaultBuyPrice ?? product.default_buy_price;
  const sellPrice = body.defaultSellPrice ?? product.default_sell_price;
  const isActive = body.isActive ?? product.is_active;
  if (!name || typeof name !== 'string') fail('name is required');
  requiredMoney(buyPrice, 'defaultBuyPrice');
  requiredMoney(sellPrice, 'defaultSellPrice');
  if (![0, 1].includes(isActive)) fail('isActive must be 0 or 1');
  db.prepare(`
    UPDATE products
       SET name = ?, unit = ?, default_buy_price = ?, default_sell_price = ?, is_active = ?
     WHERE id = ?
  `).run(name.trim(), unit, buyPrice, sellPrice, isActive, id);
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
});

app.get('/api/stores', async (request) => {
  const includeInactive = request.query.includeInactive === 'true';
  const sql = includeInactive ? 'SELECT * FROM stores ORDER BY name' : 'SELECT * FROM stores WHERE is_active = 1 ORDER BY name';
  return db.prepare(sql).all();
});

app.post('/api/stores', async (request, reply) => {
  const body = request.body || {};
  if (!body.name || typeof body.name !== 'string') fail('name is required');
  const result = db.prepare(`
    INSERT INTO stores (name, address, phone, notes, is_supplier, is_customer)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    body.name.trim(), body.address || null, body.phone || null, body.notes || null,
    body.isSupplier === false ? 0 : 1, body.isCustomer === false ? 0 : 1,
  );
  reply.code(201).send(db.prepare('SELECT * FROM stores WHERE id = ?').get(result.lastInsertRowid));
});

app.patch('/api/stores/:id', async (request) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  if (!store) fail('Store not found', 404);
  const body = request.body || {};
  const isActive = body.isActive ?? store.is_active;
  if (![0, 1].includes(isActive)) fail('isActive must be 0 or 1');
  db.prepare(`
    UPDATE stores
       SET name = ?, address = ?, phone = ?, notes = ?, is_supplier = ?, is_customer = ?, is_active = ?
     WHERE id = ?
  `).run(
    body.name ?? store.name, body.address ?? store.address, body.phone ?? store.phone,
    body.notes ?? store.notes, body.isSupplier ?? store.is_supplier,
    body.isCustomer ?? store.is_customer, isActive, id,
  );
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
});

app.get('/api/stock', async () => db.prepare('SELECT * FROM v_stock ORDER BY product_name').all());

app.get('/api/stock/:productId/lots', async (request) => {
  const productId = requiredPositiveInteger(Number(request.params.productId), 'productId');
  return db.prepare('SELECT * FROM v_stock_lots WHERE product_id = ? ORDER BY fifo_rank').all(productId);
});

app.get('/api/purchases', async (request) => {
  const status = request.query.status;
  if (status && !['unpaid', 'partial', 'paid'].includes(status)) fail('Invalid purchase status');
  return status
    ? db.prepare('SELECT * FROM v_purchases WHERE status = ? ORDER BY purchase_date DESC, id DESC').all(status)
    : db.prepare('SELECT * FROM v_purchases ORDER BY purchase_date DESC, id DESC').all();
});

app.post('/api/purchases', async (request, reply) => {
  const body = request.body || {};
  const purchase = db.transaction(() => {
    const store = getOrCreateStore(body.storeName);
    const product = getOrCreateProduct(body.productName, body.unit);
    requiredDate(body.purchaseDate, 'purchaseDate');
    requiredPositiveInteger(body.quantity, 'quantity');
    requiredMoney(body.unitPrice, 'unitPrice');
    const result = db.prepare(`
      INSERT INTO purchases (store_id, purchase_date, product_id, quantity, unit_price, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(store.id, body.purchaseDate, product.id, body.quantity, body.unitPrice, body.note || null);
    return db.prepare('SELECT * FROM v_purchases WHERE id = ?').get(result.lastInsertRowid);
  })();
  reply.code(201).send(purchase);
});

app.patch('/api/purchases/:id', async (request) => {
  const purchaseId = requiredPositiveInteger(Number(request.params.id), 'id');
  const body = request.body || {};
  const purchase = db.transaction(() => {
    const current = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!current) fail('Purchase not found', 404);
    const store = getOrCreateStore(body.storeName);
    const product = getOrCreateProduct(body.productName, body.unit);
    requiredDate(body.purchaseDate, 'purchaseDate');
    requiredPositiveInteger(body.quantity, 'quantity');
    requiredMoney(body.unitPrice, 'unitPrice');
    if (body.quantity < current.qty_sold) fail(`Quantity cannot be less than sold quantity (${current.qty_sold})`, 409);
    db.prepare(`
      UPDATE purchases
         SET store_id = ?, purchase_date = ?, product_id = ?, quantity = ?, unit_price = ?, note = ?
       WHERE id = ?
    `).run(store.id, body.purchaseDate, product.id, body.quantity, body.unitPrice, body.note || null, purchaseId);
    return db.prepare('SELECT * FROM v_purchases WHERE id = ?').get(purchaseId);
  })();
  return purchase;
});

app.delete('/api/purchases/:id', async (request) => {
  const purchaseId = requiredPositiveInteger(Number(request.params.id), 'id');
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  if (!purchase) fail('Purchase not found', 404);
  if (purchase.qty_sold > 0) fail('A sold stock lot cannot be deleted', 409);
  if (purchase.paid_amount > 0) fail('A purchase with payments cannot be deleted', 409);
  db.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);
  return { deleted: true, id: purchaseId };
});

app.post('/api/purchases/:id/payments', async (request, reply) => {
  const purchaseId = requiredPositiveInteger(Number(request.params.id), 'id');
  const body = request.body || {};
  const payment = db.transaction(() => {
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!purchase) fail('Purchase not found', 404);
    requiredPositiveInteger(body.amount, 'amount');
    if (body.amount > purchase.total_amount - purchase.paid_amount) fail('Payment exceeds purchase balance', 409);
    if (body.method && !paymentMethods.has(body.method)) fail('Invalid payment method');
    const result = db.prepare(`
      INSERT INTO purchase_payments (purchase_id, amount, method, reference, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(purchaseId, body.amount, body.method || 'cash', body.reference || null, body.note || null);
    return db.prepare('SELECT * FROM purchase_payments WHERE id = ?').get(result.lastInsertRowid);
  })();
  reply.code(201).send(payment);
});

app.get('/api/invoices', async (request) => {
  const status = request.query.status;
  if (status && !['unpaid', 'partial', 'paid', 'void'].includes(status)) fail('Invalid invoice status');
  return status
    ? db.prepare('SELECT * FROM v_invoices WHERE status = ? ORDER BY invoice_date DESC, id DESC').all(status)
    : db.prepare('SELECT * FROM v_invoices ORDER BY invoice_date DESC, id DESC').all();
});

app.get('/api/invoices/:id', async (request) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const invoice = db.prepare('SELECT * FROM v_invoices WHERE id = ?').get(id);
  if (!invoice) fail('Invoice not found', 404);
  return {
    ...invoice,
    items: db.prepare('SELECT * FROM v_invoice_item_cost WHERE invoice_id = ?').all(id),
    payments: db.prepare('SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at, id').all(id),
  };
});

app.get('/api/invoices/:id/pdf', async (request, reply) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const invoice = db.prepare('SELECT * FROM v_invoices WHERE id = ?').get(id);
  if (!invoice) fail('Invoice not found', 404);
  const items = db.prepare(`
    SELECT c.*, ii.unit
      FROM v_invoice_item_cost c
      JOIN invoice_items ii ON ii.id = c.invoice_item_id
     WHERE c.invoice_id = ?
     ORDER BY c.invoice_item_id
  `).all(id);
  reply
    .type('application/pdf')
    .header('Content-Disposition', `attachment; filename="invoice-${invoice.do_number.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf"`)
    .send(createInvoicePdf(invoice, items));
});

function createInvoice(body) {
  const invoiceDate = requiredDate(body.invoiceDate, 'invoiceDate');
  const store = body.storeId
    ? getStore(requiredPositiveInteger(Number(body.storeId), 'storeId'))
    : getOrCreateStore(body.storeName, body.address);
  if (!Array.isArray(body.items) || body.items.length === 0) fail('items must contain at least one line');
  if (body.items.length > 12) fail('An invoice can contain at most 12 items', 400);
  const sequence = db.prepare("SELECT value FROM settings WHERE key = 'next_do_seq'").get();
  if (!sequence) fail('Invoice sequence setting is missing', 500);
  const nextSequence = Number(sequence.value);
  if (!Number.isInteger(nextSequence) || nextSequence < 1) fail('Invoice sequence setting is invalid', 500);
  const doNumber = body.doNumber || `${nextSequence}/${invoiceDate.slice(5, 7)}${invoiceDate.slice(2, 4)}`;
  const invoiceResult = db.prepare(`
    INSERT INTO invoices (do_number, invoice_date, store_id, po_number, receiver_name, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(doNumber, invoiceDate, store.id, body.poNumber || null, body.receiverName || null, body.notes || null);
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit, unit_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const item of body.items) {
    const product = item.productId
      ? getProduct(requiredPositiveInteger(Number(item.productId), 'item.productId'))
      : getProductByName(item.productName, item.unit);
    requiredPositiveInteger(item.quantity, 'item.quantity');
    requiredMoney(item.unitPrice, 'item.unitPrice');
    insertItem.run(invoiceResult.lastInsertRowid, product.id, product.name, item.quantity, product.unit, item.unitPrice);
  }
  db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = 'next_do_seq'").run(String(nextSequence + 1));
  return db.prepare('SELECT * FROM v_invoices WHERE id = ?').get(invoiceResult.lastInsertRowid);
}

app.post('/api/invoices', async (request, reply) => {
  const invoice = db.transaction(() => createInvoice(request.body || {}))();
  reply.code(201).send(invoice);
});

app.post('/api/invoices/:id/payments', async (request, reply) => {
  const invoiceId = requiredPositiveInteger(Number(request.params.id), 'id');
  const body = request.body || {};
  const payment = db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) fail('Invoice not found', 404);
    if (invoice.is_void) fail('Cannot pay a void invoice', 409);
    requiredPositiveInteger(body.amount, 'amount');
    if (body.amount > invoice.total_amount - invoice.paid_amount) fail('Payment exceeds invoice balance', 409);
    if (body.method && !paymentMethods.has(body.method)) fail('Invalid payment method');
    const result = db.prepare(`
      INSERT INTO invoice_payments (invoice_id, amount, method, reference, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(invoiceId, body.amount, body.method || 'cash', body.reference || null, body.note || null);
    return db.prepare('SELECT * FROM invoice_payments WHERE id = ?').get(result.lastInsertRowid);
  })();
  reply.code(201).send(payment);
});

app.post('/api/invoices/:id/void', async (request) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) fail('Invoice not found', 404);
  db.prepare('UPDATE invoices SET is_void = 1 WHERE id = ?').run(id);
  return db.prepare('SELECT * FROM v_invoices WHERE id = ?').get(id);
});

app.get('/api/expenses', async () => db.prepare(`
  SELECT e.*, c.name AS category_name
    FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id
   ORDER BY e.expense_date DESC, e.id DESC
`).all());

app.post('/api/expenses', async (request, reply) => {
  const body = request.body || {};
  requiredDate(body.expenseDate, 'expenseDate');
  if (!body.description || typeof body.description !== 'string') fail('description is required');
  requiredPositiveInteger(body.amount, 'amount');
  const categoryId = body.categoryId == null ? 1 : requiredPositiveInteger(Number(body.categoryId), 'categoryId');
  const category = db.prepare('SELECT id FROM expense_categories WHERE id = ? AND is_active = 1').get(categoryId);
  if (!category) fail('Active expense category not found', 404);
  const result = db.prepare(`
    INSERT INTO expenses (expense_date, category_id, description, amount, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(body.expenseDate, categoryId, body.description.trim(), body.amount, body.note || null);
  reply.code(201).send(db.prepare(`
    SELECT e.*, c.name AS category_name
      FROM expenses e JOIN expense_categories c ON c.id = e.category_id
     WHERE e.id = ?
  `).get(result.lastInsertRowid));
});

const reportViews = {
  income: 'v_income_monthly',
  outcome: 'v_outcome_monthly',
  net: 'v_net_monthly',
  'profit-by-product': 'v_profit_by_product',
};
for (const [name, view] of Object.entries(reportViews)) {
  app.get(`/api/reports/${name}`, async () => db.prepare(`SELECT * FROM ${view}`).all());
}

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = error.statusCode || (error.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 500);
  reply.code(statusCode).send({ error: error.message });
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: process.env.HOST || '127.0.0.1' })
  .then(() => app.log.info(`Rezeki Makmur API listening on http://127.0.0.1:${port}`))
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
