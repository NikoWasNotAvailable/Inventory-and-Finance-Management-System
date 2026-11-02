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

app.get('/transaction.html', async (_request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(publicDir, 'transaction.html')));
});

app.get('/payment.html', async (_request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(publicDir, 'payment.html')));
});

app.get('/payment.css', async (_request, reply) => {
  reply.type('text/css').send(fs.readFileSync(path.join(publicDir, 'payment.css')));
});

app.get('/transaction.css', async (_request, reply) => {
  reply.type('text/css').send(fs.readFileSync(path.join(publicDir, 'transaction.css')));
});

app.get('/income.html', async (_request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(publicDir, 'income.html')));
});

app.get('/income.css', async (_request, reply) => {
  reply.type('text/css').send(fs.readFileSync(path.join(publicDir, 'income.css')));
});

app.get('/styles.css', async (_request, reply) => {
  reply.type('text/css').send(fs.readFileSync(path.join(publicDir, 'styles.css')));
});

app.get('/app.js', async (_request, reply) => {
  reply.type('application/javascript').send(fs.readFileSync(path.join(publicDir, 'app.js')));
});

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const paymentMethods = new Set(['cash', 'transfer', 'other']);
const periodPattern = /^\d{4}-\d{2}(-\d{2})?$/;

function profitBoardRows(bucket) {
  return db.prepare(`
    WITH buckets AS (
      SELECT ${bucket('invoice_date')} AS period,
             SUM(total_amount - paid_amount) AS piutang, 0 AS collected,
             0 AS hutang, 0 AS hutang_paid, 0 AS others
        FROM invoices
       WHERE is_void = 0 AND total_amount > paid_amount
       GROUP BY period
      UNION ALL
      SELECT ${bucket('paid_at')}, 0, SUM(profit), 0, 0, 0
        FROM v_income_events GROUP BY 1
      UNION ALL
      SELECT ${bucket('purchase_date')}, 0, 0, SUM(total_amount - paid_amount), 0, 0
        FROM purchases WHERE total_amount > paid_amount GROUP BY 1
      UNION ALL
      SELECT ${bucket('paid_at')}, 0, 0, 0, SUM(amount), 0
        FROM purchase_payments GROUP BY 1
      UNION ALL
      SELECT ${bucket('expense_date')}, 0, 0, 0, 0, SUM(amount)
        FROM expenses GROUP BY 1
    )
    SELECT period,
           COALESCE(SUM(piutang), 0)     AS piutang,
           COALESCE(SUM(collected), 0)   AS collected,
           COALESCE(SUM(piutang), 0) + COALESCE(SUM(collected), 0) AS income,
           COALESCE(SUM(hutang), 0)      AS hutang,
           COALESCE(SUM(hutang_paid), 0) AS hutang_paid,
           COALESCE(SUM(others), 0)      AS others,
           COALESCE(SUM(hutang), 0) + COALESCE(SUM(hutang_paid), 0)
             + COALESCE(SUM(others), 0)  AS outcome,
           COALESCE(SUM(piutang), 0) + COALESCE(SUM(collected), 0)
             - COALESCE(SUM(hutang), 0) - COALESCE(SUM(hutang_paid), 0)
             - COALESCE(SUM(others), 0)  AS profit
      FROM buckets
     GROUP BY period
     ORDER BY period
  `).all();
}

app.get('/api/reports/profit-board', async (request) => {
  const now = new Date();
  const year = /^\d{4}$/.test(String(request.query.year || '')) ? String(request.query.year) : String(now.getFullYear());
  const month = /^\d{2}$/.test(String(request.query.month || '')) ? String(request.query.month) : String(now.getMonth() + 1).padStart(2, '0');
  const rows = profitBoardRows((column) => `strftime('%Y-%m', ${column})`);
  return {
    year,
    month,
    monthly: rows.filter((row) => row.period.startsWith(`${year}-`)),
    daily: profitBoardRows((column) => `date(${column})`).filter((row) => row.period.startsWith(`${year}-${month}`)),
  };
});

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
  const extraPages = [];
  const text = (x, y, size, value, bold = false) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const textOn = (target, x, y, size, value, bold = false) => {
    target.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2) => commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const lineOn = (target, x1, y1, x2, y2) => target.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const box = (x, y, width, height) => {
    line(x, y, x + width, y);
    line(x + width, y, x + width, y + height);
    line(x + width, y + height, x, y + height);
    line(x, y + height, x, y);
  };
  const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
  const date = invoice.invoice_date ? invoice.invoice_date.split('-').reverse().join('/') : '';
  const drawTotal = (target, useMainCommands = false) => {
    const drawText = useMainCommands ? text : (x, y, size, value, bold = false) => textOn(target, x, y, size, value, bold);
    const drawLine = useMainCommands ? line : (x1, y1, x2, y2) => lineOn(target, x1, y1, x2, y2);
    drawLine(115, 148, 115, 163);
    drawText(46, 153, 9, 'PO CUST.', true);
    drawText(125, 153, 8, invoice.po_number || '');
    if (useMainCommands) box(390, 148, 169, 15);
    else {
      drawLine(390, 148, 559, 148);
      drawLine(559, 148, 559, 163);
      drawLine(559, 163, 390, 163);
      drawLine(390, 163, 390, 148);
    }
    drawText(405, 153, 9, 'Total Rp.', true);
    drawText(475, 153, 9, money(invoice.total_amount), true);
    drawText(70, 135, 9, 'Yang menerima.');
    drawText(390, 135, 9, 'Hormat kami.');
    drawLine(70, 110, 170, 110);
    drawLine(390, 110, 490, 110);
    if (invoice.receiver_name) drawText(70, 103, 8, invoice.receiver_name);
  };

  const left = 36;
  const right = 559;
  text(left, 395, 16, 'REZEKI MAKMUR', true);
  text(left, 387, 8, 'Plastics and Other Resto Supplies');
  box(350, 351, 209, 55);
  line(350, 395, 559, 395);
  line(400, 395, 400, 406);
  text(360, 399, 8, 'TGL.');
  text(412, 399, 8, date);
  text(428, 385, 8, 'Kepada YTH.', true);
  line(350, 392, 559, 392);
  text(360, 371, 8, invoice.store_name);
  line(350, 378, 559, 378);
  if (invoice.store_address) text(360, 357, 8, invoice.store_address);
  line(350, 364, 559, 364);
  box(left, 358, 210, 14);
  line(115, 358, 115, 372);
  text(46, 363, 8, 'D/O NO.');
  text(125, 363, 8, invoice.do_number);
  text(45, 325, 9, 'QTY', true);
  text(145, 325, 9, 'Name', true);
  text(340, 325, 9, 'Price', true);
  text(455, 325, 9, 'Total Price', true);
  const rowHeight = 13;
  let y = 309;
  for (let index = 0; index < 12; index += 1) {
    const item = items[index];
    if (item) {
      text(45, y, 8, `${item.quantity} ${item.unit}`);
      text(145, y, 8, item.product_name);
      text(340, y, 8, money(item.sell_price));
      text(455, y, 8, money(item.line_total));
    }
    y -= rowHeight;
  }
  if (items.length <= 12) {
    box(left, 148, 325, 15);
    drawTotal(commands, true);
  } else {
    const continuation = [];
    textOn(continuation, left, 395, 16, 'REZEKI MAKMUR', true);
    textOn(continuation, left, 387, 8, 'Invoice continuation');
    textOn(continuation, left, 370, 10, `D/O NO. ${invoice.do_number}`);
    textOn(continuation, 45, 340, 9, 'QTY', true);
    textOn(continuation, 145, 340, 9, 'Name', true);
    textOn(continuation, 340, 340, 9, 'Price', true);
    textOn(continuation, 455, 340, 9, 'Total Price', true);
    let continuationY = 324;
    for (const item of items.slice(12)) {
      textOn(continuation, 45, continuationY, 8, `${item.quantity} ${item.unit}`);
      textOn(continuation, 145, continuationY, 8, item.product_name);
      textOn(continuation, 340, continuationY, 8, money(item.sell_price));
      textOn(continuation, 455, continuationY, 8, money(item.line_total));
      continuationY -= 18;
    }
    drawTotal(continuation);
    extraPages.push(continuation);
  }

  const content = commands.join('\n');
  const pageContents = [content, ...extraPages.map((page) => page.join('\n'))];
  const pageObjectStart = 3;
  const fontObjectStart = pageObjectStart + pageContents.length;
  const contentObjectStart = fontObjectStart + 2;
  const pageObjects = pageContents.map((_, index) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 421] /Resources << /Font << /F1 ${fontObjectStart} 0 R /F2 ${fontObjectStart + 1} 0 R >> >> /Contents ${contentObjectStart + index} 0 R >>`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjects.map((_, index) => `${pageObjectStart + index} 0 R`).join(' ')}] /Count ${pageObjects.length} >>`,
    ...pageObjects,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ...pageContents.map((page) => `<< /Length ${Buffer.byteLength(page, 'ascii')} >>\nstream\n${page}\nendstream`),
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

app.get('/api/invoices/validate-numbers', async (request) => {
  const doNumber = String(request.query.doNumber || '').trim();
  const poNumber = String(request.query.poNumber || '').trim();
  const duplicateDo = doNumber !== '' && Boolean(db.prepare('SELECT 1 FROM invoices WHERE do_number = ? COLLATE NOCASE LIMIT 1').get(doNumber));
  const duplicatePo = poNumber !== '' && Boolean(db.prepare('SELECT 1 FROM invoices WHERE po_number = ? COLLATE NOCASE LIMIT 1').get(poNumber));
  return { duplicateDo, duplicatePo };
});

app.get('/api/invoices/:id', async (request) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const invoice = db.prepare('SELECT * FROM v_invoices WHERE id = ?').get(id);
  if (!invoice) fail('Invoice not found', 404);
  return {
    ...invoice,
    items: db.prepare(`
      SELECT c.*, ii.unit
        FROM v_invoice_item_cost c
        JOIN invoice_items ii ON ii.id = c.invoice_item_id
       WHERE c.invoice_id = ?
       ORDER BY c.invoice_item_id
    `).all(id),
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

app.delete('/api/invoices/:id', async (request) => {
  const invoiceId = requiredPositiveInteger(Number(request.params.id), 'id');
  return db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) fail('Invoice not found', 404);
    if (invoice.paid_amount > 0 || invoice.is_void) fail('Paid or void invoices cannot be deleted', 409);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
    return { deleted: true, id: invoiceId };
  })();
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
  const doNumber = String(body.doNumber || `${nextSequence}/${invoiceDate.slice(5, 7)}${invoiceDate.slice(2, 4)}`).trim();
  const poNumber = String(body.poNumber || '').trim() || null;
  if (db.prepare('SELECT 1 FROM invoices WHERE do_number = ? COLLATE NOCASE LIMIT 1').get(doNumber)) fail('D/O number already exists', 409);
  if (poNumber && db.prepare('SELECT 1 FROM invoices WHERE po_number = ? COLLATE NOCASE LIMIT 1').get(poNumber)) fail('PO customer number already exists', 409);
  const invoiceResult = db.prepare(`
    INSERT INTO invoices (do_number, invoice_date, store_id, po_number, receiver_name, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(doNumber, invoiceDate, store.id, poNumber, body.receiverName || null, body.notes || null);
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

app.get('/api/expense-categories', async () => db.prepare(`
  SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY id
`).all());

app.get('/api/expenses', async () => db.prepare(`
  SELECT e.*, c.name AS category_name
    FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id
   ORDER BY e.expense_date DESC, e.id DESC
`).all());

app.delete('/api/expenses/:id', async (request) => {
  const id = requiredPositiveInteger(Number(request.params.id), 'id');
  const expense = db.prepare('SELECT id FROM expenses WHERE id = ?').get(id);
  if (!expense) fail('Expense not found', 404);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return { deleted: true, id };
});

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
