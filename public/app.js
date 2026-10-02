const state = { purchases: [], stores: [], products: [], stock: [] };
let editingPurchaseId = null;
let invoiceLines = [];
const $ = (selector) => document.querySelector(selector);
const rupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const api = async (url, options) => {
  const requestOptions = { ...options };
  if (requestOptions.body) {
    requestOptions.headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
  }
  const response = await fetch(url, requestOptions);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};

function renderStores() {
  if (!$('#storeFilter')) return;
  const options = state.stores.map((store) => `<option value="${store.id}">${escapeHtml(store.name)}</option>`).join('');
  $('#storeFilter').innerHTML = '<option value="">All stores</option>' + options;
}

function renderRows() {
  if (!$('#purchaseRows')) return;
  const search = $('#searchInput').value.toLowerCase().trim();
  const date = $('#dateFilter').value;
  const storeId = $('#storeFilter').value;
  const rows = state.purchases.filter((purchase) => {
    const textMatch = !search || `${purchase.product_name} ${purchase.store_name}`.toLowerCase().includes(search);
    return textMatch && (!date || purchase.purchase_date === date) && (!storeId || String(purchase.store_id) === storeId);
  });
  $('#lotCount').textContent = rows.length;
  $('#unitsOnHand').textContent = rows.reduce((sum, row) => sum + row.qty_remaining, 0).toLocaleString('id-ID');
  $('#unpaidBalance').textContent = rupiah(rows.filter((row) => row.status !== 'paid').reduce((sum, row) => sum + row.balance, 0));
  $('#purchaseRows').innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.store_name)}</td><td>${formatDate(row.purchase_date)}</td>
      <td><strong>${escapeHtml(row.product_name)}</strong></td><td>${row.qty_remaining} ${escapeHtml(row.unit)}</td>
      <td>${rupiah(row.unit_price)}</td><td>${rupiah(row.total_amount)}</td>
      <td><span class="status-badge ${row.status}">${row.status}</span></td>
      <td><div class="action-set"><button class="action-button edit-purchase" title="Edit item" type="button" data-id="${row.id}">✎</button><button class="action-button delete-purchase" title="Delete item" type="button" data-id="${row.id}">⌫</button></div></td>
    </tr>`).join('') : '<tr><td class="empty-state" colspan="8">No purchase lots found.</td></tr>';
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function formatDate(value) { return new Intl.DateTimeFormat('en-GB').format(new Date(`${value}T00:00:00`)); }
function today() { return new Date().toISOString().slice(0, 10); }
function parseMoneyInput(value) { return Number(String(value).replace(/[^0-9]/g, '')) || 0; }

function renderInvoiceLines() {
  const stockByProduct = new Map(state.stock.map((product) => [product.product_id, product]));
  $('#invoiceItems').innerHTML = invoiceLines.map((line, index) => `
    <div class="invoice-line" data-index="${index}">
      <label class="quantity-with-unit"><input class="invoice-quantity" type="number" min="1" max="${line.maxQuantity || ''}" step="1" value="${line.quantity || ''}" placeholder="Qty" aria-label="Quantity"><span>${escapeHtml(line.unit || 'PCK')}</span></label>
      <input class="invoice-product" list="invoiceProductOptions" value="${escapeHtml(line.productName)}" placeholder="Search product" aria-label="Product">
      <input class="invoice-price" type="text" inputmode="numeric" value="${line.unitPrice || ''}" placeholder="50000" aria-label="Unit price">
      <strong class="invoice-line-total">${rupiah(line.quantity * line.unitPrice)}</strong>
      <button class="remove-line" type="button" data-index="${index}" title="Remove line" aria-label="Remove line">×</button>
    </div>`).join('');
  if (!$('#invoiceProductOptions')) {
    const dataList = document.createElement('datalist');
    dataList.id = 'invoiceProductOptions';
    document.body.appendChild(dataList);
  }
  $('#invoiceProductOptions').innerHTML = state.products.filter((product) => (stockByProduct.get(product.id)?.qty_on_hand || 0) > 0).map((product) => {
    const stock = stockByProduct.get(product.id);
    const quantity = stock?.qty_on_hand || 0;
    return `<option value="${escapeHtml(product.name)}" label="${quantity} ${escapeHtml(product.unit)} available"></option>`;
  }).join('');
  $('#invoiceTotal').textContent = rupiah(invoiceLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
}

function resetInvoice() {
  $('#invoiceForm').reset();
  $('#invoiceDate').value = today();
  invoiceLines = [{ quantity: 0, productId: null, productName: '', unit: 'PCK', maxQuantity: 0, unitPrice: 0 }];
  $('#invoiceError').textContent = '';
  renderInvoiceLines();
}

async function downloadInvoicePdf(invoiceId) {
  const response = await fetch(`/api/invoices/${invoiceId}/pdf`);
  if (!response.ok) throw new Error('Invoice created, but PDF could not be generated');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `invoice-${invoiceId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readInvoiceLine(element) {
  const row = element.closest('.invoice-line');
  const index = Number(row.dataset.index);
  const productInput = row.querySelector('.invoice-product');
  const selectedProduct = state.products.find((product) => product.name.toLowerCase() === productInput.value.trim().toLowerCase());
  const stock = selectedProduct && state.stock.find((item) => item.product_id === selectedProduct.id);
  const selectedStock = Number(stock?.qty_on_hand || 0);
  invoiceLines[index] = {
    productId: selectedProduct?.id || null,
    quantity: Number(row.querySelector('.invoice-quantity').value) || 0,
    productName: selectedProduct?.name || productInput.value,
    unit: selectedProduct?.unit || 'PCK',
    maxQuantity: selectedStock,
    unitPrice: parseMoneyInput(row.querySelector('.invoice-price').value),
  };
  row.querySelector('.quantity-with-unit span').textContent = invoiceLines[index].unit;
  row.querySelector('.invoice-quantity').max = selectedStock || '';
  row.querySelector('.invoice-line-total').textContent = rupiah(invoiceLines[index].quantity * invoiceLines[index].unitPrice);
  $('#invoiceTotal').textContent = rupiah(invoiceLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
}

function showPage(page) {
  document.querySelectorAll('[data-page-view]').forEach((view) => { view.hidden = view.dataset.pageView !== page; });
  document.querySelectorAll('.nav-item[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  document.title = page === 'invoice' ? 'Makmur | Invoice' : 'Makmur | Product';
  if (page === 'invoice' && !invoiceLines.length) resetInvoice();
}

async function loadData() {
  [state.purchases, state.stores, state.products, state.stock] = await Promise.all([api('/api/purchases'), api('/api/stores'), api('/api/products'), api('/api/stock')]);
  renderStores(); renderRows();
  if ($('#invoiceItems')) renderInvoiceLines();
}

function openDialog() {
  editingPurchaseId = null;
  $('#dialogEyebrow').textContent = 'NEW STOCK LOT';
  $('#dialogTitle').textContent = 'Add Item';
  $('#saveItemButton').textContent = 'Save item';
  $('#addItemForm').reset();
  $('#itemDate').value = today();
  $('#itemUnit').value = 'PCK';
  $('#formError').textContent = '';
  $('#addItemDialog').showModal();
}
function closeDialog() { $('#addItemDialog').close(); }

function openEditDialog(purchase) {
  editingPurchaseId = purchase.id;
  $('#dialogEyebrow').textContent = 'EDIT STOCK LOT';
  $('#dialogTitle').textContent = 'Edit Item';
  $('#saveItemButton').textContent = 'Save changes';
  $('#itemStore').value = purchase.store_name;
  $('#itemProduct').value = purchase.product_name;
  $('#itemDate').value = purchase.purchase_date;
  $('#itemUnit').value = purchase.unit;
  $('#itemQuantity').value = purchase.quantity;
  $('#itemPrice').value = purchase.unit_price;
  $('#itemNote').value = purchase.note || '';
  $('#formError').textContent = '';
  $('#addItemDialog').showModal();
}

$('#addItemButton')?.addEventListener('click', openDialog);
$('#closeDialog')?.addEventListener('click', closeDialog);
$('#cancelDialog')?.addEventListener('click', closeDialog);
['searchInput', 'dateFilter', 'storeFilter'].forEach((id) => $(`#${id}`)?.addEventListener('input', renderRows));
$('#purchaseRows')?.addEventListener('click', async (event) => {
  const action = event.target.closest('.edit-purchase, .delete-purchase');
  if (!action) return;
  const purchase = state.purchases.find((row) => row.id === Number(action.dataset.id));
  if (!purchase) return;
  if (action.classList.contains('edit-purchase')) {
    openEditDialog(purchase);
    return;
  }
  if (!window.confirm(`Delete ${purchase.product_name} from ${purchase.store_name}?`)) return;
  try {
    await api(`/api/purchases/${purchase.id}`, { method: 'DELETE' });
    await loadData();
  } catch (error) {
    window.alert(error.message);
  }
});
$('#addItemForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#formError').textContent = '';
  try {
    const payload = {
      storeName: $('#itemStore').value.trim(), productName: $('#itemProduct').value.trim(),
      unit: $('#itemUnit').value.trim(), purchaseDate: $('#itemDate').value,
      quantity: Number($('#itemQuantity').value),
      unitPrice: Number($('#itemPrice').value), note: $('#itemNote').value || null,
    };
    await api(editingPurchaseId ? `/api/purchases/${editingPurchaseId}` : '/api/purchases', {
      method: editingPurchaseId ? 'PATCH' : 'POST', body: JSON.stringify(payload),
    });
    event.target.reset(); closeDialog(); await loadData();
  } catch (error) { $('#formError').textContent = error.message; }
});

loadData().catch((error) => {
  if ($('#purchaseRows')) $('#purchaseRows').innerHTML = `<tr><td class="empty-state" colspan="8">${escapeHtml(error.message)}</td></tr>`;
});

$('#addInvoiceLine')?.addEventListener('click', () => {
  invoiceLines.push({ quantity: 0, productId: null, productName: '', unit: 'PCK', maxQuantity: 0, unitPrice: 0 });
  renderInvoiceLines();
});
$('#invoiceItems')?.addEventListener('input', (event) => readInvoiceLine(event.target));
$('#invoiceItems')?.addEventListener('change', (event) => readInvoiceLine(event.target));
$('#invoiceItems')?.addEventListener('click', (event) => {
  if (!event.target.classList.contains('remove-line')) return;
  invoiceLines.splice(Number(event.target.dataset.index), 1);
  if (!invoiceLines.length) invoiceLines.push({ quantity: 0, productId: null, productName: '', unit: 'PCK', maxQuantity: 0, unitPrice: 0 });
  renderInvoiceLines();
});
$('#resetInvoice')?.addEventListener('click', resetInvoice);
$('#invoiceForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#invoiceError').textContent = '';
  try {
    const payload = {
      invoiceDate: $('#invoiceDate').value,
      storeName: $('#invoiceCustomer').value.trim(),
      address: $('#invoiceAddress').value.trim() || null,
      receiverName: $('#invoiceReceiver').value.trim() || null,
      poNumber: $('#invoiceNotes').value.trim() || null,
      doNumber: $('#invoiceDoNumber').value.trim() || undefined,
      items: invoiceLines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })),
    };
    if (invoiceLines.some((line) => !line.productId || line.quantity < 1 || line.quantity > line.maxQuantity || line.unitPrice < 0)) {
      throw new Error('Choose a stocked product and enter a quantity within available stock');
    }
    const requested = new Map();
    for (const line of invoiceLines) requested.set(line.productId, (requested.get(line.productId) || 0) + line.quantity);
    for (const [productId, quantity] of requested) {
      const stock = state.stock.find((item) => item.product_id === productId);
      if (!stock || quantity > stock.qty_on_hand) throw new Error(`Stock available for ${stock?.product_name || 'product'}: ${stock?.qty_on_hand || 0} ${stock?.unit || ''}`);
    }
    const numberCheck = await api(`/api/invoices/validate-numbers?doNumber=${encodeURIComponent(payload.doNumber || '')}&poNumber=${encodeURIComponent(payload.poNumber || '')}`);
    if (numberCheck.duplicateDo) throw new Error('D/O number already exists');
    if (numberCheck.duplicatePo) throw new Error('PO customer number already exists');
    const invoice = await api('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
    await downloadInvoicePdf(invoice.id);
    window.alert(`Invoice ${invoice.do_number} created and downloaded as PDF`);
    resetInvoice();
    await loadData();
  } catch (error) { $('#invoiceError').textContent = error.message; }
});

if (document.querySelector('[data-page-view]')) {
  showPage(window.location.hash === '#invoice' ? 'invoice' : 'product');
} else if ($('#invoiceForm')) {
  resetInvoice();
}

async function loadTransactions() {
  if (!$('#transactionRows')) return;
  const history = new URLSearchParams(window.location.search).get('history') === '1';
  const detailId = new URLSearchParams(window.location.search).get('id');
  if (detailId) { $('#transactionListView').hidden = true; $('#transactionDetailView').hidden = false; await renderTransactionDetail(Number(detailId)); return; }
  const invoices = await api(`/api/invoices?status=${history ? 'paid' : 'unpaid'}`);
  $('#transactionTitle').textContent = history ? 'History' : 'Transaction Page';
  document.querySelectorAll('.transaction-tab').forEach((tab) => tab.classList.toggle('active', history === tab.href.includes('history=1')));
  $('#transactionRows').innerHTML = invoices.length ? invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.store_name)}</td><td>${formatDate(invoice.invoice_date)}</td><td>${escapeHtml(invoice.do_number)}</td><td>${escapeHtml(invoice.po_number || '-')}</td><td>${rupiah(invoice.total_amount)}</td><td><span class="transaction-status ${history ? 'paid' : 'unpaid'}">${history ? 'PAID' : invoice.status}</span></td><td><div class="transaction-actions"><button class="transaction-action download-pdf" type="button" data-id="${invoice.id}" title="Download PDF" aria-label="Download PDF">⤓</button><a class="transaction-action" title="Open detail" href="/transaction.html?id=${invoice.id}">◉</a></div></td></tr>`).join('') : '<tr><td class="empty-state" colspan="7">No transactions found.</td></tr>';
  $('#transactionSearch')?.addEventListener('input', (event) => { const query = event.target.value.toLowerCase().trim(); document.querySelectorAll('#transactionRows tr').forEach((row) => { row.hidden = query && !row.textContent.toLowerCase().includes(query); }); });
}

async function renderTransactionDetail(invoiceId) {
  const invoice = await api(`/api/invoices/${invoiceId}`);
  $('#transactionDetail').innerHTML = `<div class="detail-head"><div class="detail-brand"><h2>REZEKI MAKMUR</h2><p>Plastics and Other Resto Supplies<br>Jl. Prepedan Dalam No.9 Kel. Kamal, Jakarta Barat</p></div><div class="detail-meta"><div><strong>TGL.</strong>${formatDate(invoice.invoice_date)}</div><div><strong>D/O NO.</strong>${escapeHtml(invoice.do_number)}</div><div><strong>Kepada YTH.</strong>${escapeHtml(invoice.store_name)}</div><div><strong>PO CUST.</strong>${escapeHtml(invoice.po_number || '-')}</div></div></div><table class="detail-items"><thead><tr><th>QNT</th><th>Name</th><th>Price</th><th>Total Price</th></tr></thead><tbody>${invoice.items.map((item) => `<tr><td>${item.quantity} ${escapeHtml(item.unit)}</td><td>${escapeHtml(item.product_name)}</td><td>${rupiah(item.sell_price)}</td><td>${rupiah(item.line_total)}</td></tr>`).join('')}</tbody></table><div class="detail-total"><span>Total Rp.</span><strong>${rupiah(invoice.total_amount)}</strong></div><p id="detailError" class="detail-error"></p><div class="detail-footer"><div><span>Yang menerima.</span><div class="detail-signature">${escapeHtml(invoice.receiver_name || '')}</div></div><button id="markPaidButton" class="paid-button" type="button">PAID</button><div><span>Hormat kami.</span><div class="detail-signature"></div></div></div>`;
  $('#transactionDetail').insertAdjacentHTML('beforeend', '<div class="detail-actions"><button id="wrongInputButton" class="secondary-button" type="button">Wrong input</button><button id="deleteInvoiceButton" class="danger-button" type="button">Delete</button></div>');
  $('#markPaidButton').addEventListener('click', async () => { if (!window.confirm('Confirm this invoice as fully paid?')) return; try { await api(`/api/invoices/${invoice.id}/payments`, { method: 'POST', body: JSON.stringify({ amount: invoice.balance, method: 'cash' }) }); window.location.href = '/transaction.html?history=1'; } catch (error) { $('#detailError').textContent = error.message; } });
  const removeInvoice = async (message, destination) => { if (!window.confirm(message)) return; try { await api(`/api/invoices/${invoice.id}`, { method: 'DELETE' }); window.location.href = destination; } catch (error) { $('#detailError').textContent = error.message; } };
  $('#wrongInputButton').addEventListener('click', () => removeInvoice('This invoice is wrong input. Delete it and return stock?', '/invoice.html'));
  $('#deleteInvoiceButton').addEventListener('click', () => removeInvoice('Delete this invoice permanently?', '/transaction.html'));
  $('#downloadTransactionPdf')?.addEventListener('click', () => downloadInvoicePdf(invoice.id).catch((error) => window.alert(error.message)));
}

loadTransactions().catch((error) => { if ($('#transactionRows')) $('#transactionRows').innerHTML = `<tr><td class="empty-state" colspan="7">${escapeHtml(error.message)}</td></tr>`; if ($('#transactionDetail')) $('#transactionDetail').innerHTML = `<p class="detail-error">${escapeHtml(error.message)}</p>`; });

document.addEventListener('click', (event) => {
  const downloadButton = event.target.closest('.download-pdf');
  if (!downloadButton) return;
  downloadInvoicePdf(Number(downloadButton.dataset.id)).catch((error) => window.alert(error.message));
});

async function loadPayments() {
  if (!$('#paymentRows')) return;
  const history = new URLSearchParams(window.location.search).get('history') === '1';
  const purchases = await api(`/api/purchases?status=${history ? 'paid' : 'unpaid'}`);
  $('#paymentTitle').textContent = history ? 'History' : 'Payment Page';
  document.querySelectorAll('.payment-tab').forEach((tab) => {
    tab.classList.toggle('active', history === tab.href.includes('history=1'));
  });
  const stores = [...new Map(purchases.map((purchase) => [purchase.store_id, purchase.store_name])).entries()];
  $('#paymentStore').innerHTML = '<option value="">All stores</option>' + stores.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
  const render = () => { const search = $('#paymentSearch').value.toLowerCase().trim(); const storeId = $('#paymentStore').value; const rows = purchases.filter((purchase) => (!storeId || String(purchase.store_id) === storeId) && (!search || `${purchase.store_name} ${purchase.product_name}`.toLowerCase().includes(search))); $('#paymentRows').innerHTML = rows.length ? rows.map((purchase) => `<tr><td>${escapeHtml(purchase.store_name)}</td><td>${formatDate(purchase.purchase_date)}</td><td>${escapeHtml(purchase.product_name)}</td><td>${purchase.quantity} ${escapeHtml(purchase.unit)}</td><td>${rupiah(purchase.unit_price)}</td><td>${rupiah(purchase.total_amount)}</td><td>${rupiah(purchase.balance)}</td><td><span class="payment-status ${purchase.status}">${purchase.status}</span></td><td>${history ? '' : `<button class="pay-button" type="button" data-id="${purchase.id}" data-balance="${purchase.balance}">Pay</button>`}</td></tr>`).join('') : '<tr><td class="payment-empty" colspan="9">No payments found.</td></tr>'; };
  render(); $('#paymentSearch').addEventListener('input', render); $('#paymentStore').addEventListener('change', render); $('#paymentRows').addEventListener('click', async (event) => { const button = event.target.closest('.pay-button'); if (!button) return; if (!window.confirm('Mark this purchase debt as paid?')) return; try { await api(`/api/purchases/${button.dataset.id}/payments`, { method: 'POST', body: JSON.stringify({ amount: Number(button.dataset.balance), method: 'cash' }) }); window.location.href = '/payment.html?history=1'; } catch (error) { window.alert(error.message); } });
}

loadPayments().catch((error) => { if ($('#paymentRows')) $('#paymentRows').innerHTML = `<tr><td class="payment-empty" colspan="9">${escapeHtml(error.message)}</td></tr>`; });

const incomeState = { board: null, expenses: [], categories: [] };
const incomeMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const incomeColors = { piutang: '#2f9b6a', collected: '#f5c542', hutang: '#b34f45', hutang_paid: '#e0a58f', others: '#6f7c93' };
const compactMoney = (value) => new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
const monthTitle = (period) => `${incomeMonths[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

function renderBarChart(container, points, { signed = false, labelEvery = 1, empty = 'No data yet.' } = {}) {
  if (!container) return;
  if (!points.length) { container.innerHTML = `<p class="chart-empty">${escapeHtml(empty)}</p>`; return; }
  const width = 320;
  const height = 190;
  const pad = { top: 20, right: 6, bottom: 20, left: 6 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const totals = points.map((point) => (signed ? point.value : point.segments.reduce((sum, segment) => sum + segment.value, 0)));
  const max = Math.max(0, ...totals);
  const min = Math.min(0, ...totals);
  const range = max - min || 1;
  const top = max === min ? 1 : max;
  const scale = (value) => pad.top + (top - value) / range * innerHeight;
  const slot = innerWidth / points.length;
  const barWidth = Math.max(3, Math.min(26, slot * 0.58));
  const guides = [...new Set(signed ? [max, 0, min] : [max, max / 2, 0])];
  const grid = guides.map((value) => `<line class="${value === 0 ? 'chart-axis' : 'chart-grid'}" x1="${pad.left}" y1="${scale(value).toFixed(1)}" x2="${width - pad.right}" y2="${scale(value).toFixed(1)}"></line>`
    + `<text class="chart-label" x="${pad.left}" y="${(scale(value) - 3).toFixed(1)}">${compactMoney(value)}</text>`).join('');
  const bars = points.map((point, index) => {
    const x = pad.left + slot * index + (slot - barWidth) / 2;
    let cursor = 0;
    const segments = point.segments.map((segment) => {
      if (segment.value === 0 || (!signed && segment.value < 0)) return '';
      const from = scale(signed ? 0 : cursor);
      const to = scale(signed ? segment.value : cursor + segment.value);
      if (!signed) cursor += segment.value;
      return `<rect x="${x.toFixed(1)}" y="${Math.min(from, to).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(to - from)).toFixed(1)}" rx="2" fill="${segment.color}"></rect>`;
    }).join('');
    const label = index % labelEvery === 0 || index === points.length - 1
      ? `<text class="chart-label" x="${(x + barWidth / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeHtml(point.label)}</text>` : '';
    const value = point.value ? `<text class="chart-value" x="${(x + barWidth / 2).toFixed(1)}" y="${(scale(point.value) + (point.value < 0 ? 10 : -5)).toFixed(1)}" text-anchor="middle">${compactMoney(point.value)}</text>` : '';
    return `<g><title>${escapeHtml(point.title || point.label)}: ${rupiah(point.value)}</title>${segments}${value}${label}</g>`;
  }).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(empty)}">${grid}${bars}</svg>`;
}

const emptyRow = () => ({ piutang: 0, collected: 0, income: 0, hutang: 0, hutang_paid: 0, others: 0, outcome: 0, profit: 0 });
const sumRows = (rows) => rows.reduce((total, row) => ({
  piutang: total.piutang + row.piutang, collected: total.collected + row.collected,
  hutang: total.hutang + row.hutang, hutang_paid: total.hutang_paid + row.hutang_paid, others: total.others + row.others,
}), emptyRow());
const rowWithTotals = (row) => ({ ...row, income: row.piutang + row.collected, outcome: row.hutang + row.hutang_paid + row.others, profit: row.piutang + row.collected - row.hutang - row.hutang_paid - row.others });
const profitPoints = (items) => items.map((item) => ({
  label: item.label, title: item.period, value: item.row.profit,
  segments: [{ value: item.row.profit, color: item.row.profit < 0 ? '#b34f45' : '#2f9b6a' }],
}));

function renderIncomePage() {
  if (!$('#incomeChart') || !incomeState.board) return;
  const { year, month, monthly, daily } = incomeState.board;
  const byPeriod = (rows, period) => rowWithTotals(rows.find((row) => row.period === period) || emptyRow());
  const yearRows = incomeMonths.map((name, index) => {
    const period = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { period, label: name, row: byPeriod(monthly, period) };
  });
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const dayRows = Array.from({ length: daysInMonth }, (_, index) => {
    const period = `${year}-${month}-${String(index + 1).padStart(2, '0')}`;
    return { period, label: String(index + 1), row: byPeriod(daily, period) };
  });
  const monthTotal = sumRows(dayRows.map((day) => day.row));
  monthTotal.income = monthTotal.piutang + monthTotal.collected;
  monthTotal.outcome = monthTotal.hutang + monthTotal.hutang_paid + monthTotal.others;
  monthTotal.profit = monthTotal.income - monthTotal.outcome;

  $('#incomeKpi').textContent = rupiah(monthTotal.income);
  $('#outcomeKpi').textContent = rupiah(monthTotal.outcome);
  const profitKpi = $('#netKpi');
  profitKpi.textContent = rupiah(monthTotal.profit);
  profitKpi.className = monthTotal.profit < 0 ? 'negative' : 'positive';
  $('#monthProfitCaption').textContent = `${monthTitle(`${year}-${month}`)} - ${rupiah(monthTotal.profit)}`;
  $('#yearProfitCaption').textContent = `${year} - ${rupiah(yearRows.reduce((sum, item) => sum + item.row.profit, 0))}`;

  renderBarChart($('#monthProfitChart'), profitPoints(dayRows), { signed: true, labelEvery: 5, empty: 'No profit recorded in this month yet.' });
  renderBarChart($('#yearProfitChart'), profitPoints(yearRows), { signed: true, empty: 'No profit recorded in this year yet.' });
  renderBarChart($('#incomeChart'), yearRows.map((item) => ({
    label: item.label, title: item.period, value: item.row.income,
    segments: [{ value: item.row.piutang, color: incomeColors.piutang }, { value: item.row.collected, color: incomeColors.collected }],
  })), { empty: 'No income recorded in this year yet.' });
  renderBarChart($('#outcomeChart'), yearRows.map((item) => ({
    label: item.label, title: item.period, value: item.row.outcome,
    segments: [{ value: item.row.hutang, color: incomeColors.hutang }, { value: item.row.hutang_paid, color: incomeColors.hutang_paid }, { value: item.row.others, color: incomeColors.others }],
  })), { empty: 'No outcome recorded in this year yet.' });
  renderBarChart($('#profitChart'), profitPoints(yearRows), { signed: true, empty: 'No profit recorded in this year yet.' });
  renderOthers(year, month);
}

function renderOthers(year, month) {
  const prefix = `${year}-${month}`;
  const rows = incomeState.expenses.filter((expense) => String(expense.expense_date).startsWith(prefix));
  $('#othersList').innerHTML = rows.length ? rows.map((expense) => `
    <li><time>${formatDate(expense.expense_date)}</time><span>${escapeHtml(expense.description)}</span>
      <strong>${rupiah(expense.amount)}</strong>
      <button class="others-remove" type="button" data-id="${expense.id}" title="Delete cost" aria-label="Delete cost">&times;</button></li>`).join('')
    : '<li class="others-empty">No Others cost in this month.</li>';
}

async function loadIncomePage() {
  if (!$('#incomeChart')) return;
  const now = new Date();
  incomeState.board = await api(`/api/reports/profit-board?year=${now.getFullYear()}&month=${String(now.getMonth() + 1).padStart(2, '0')}`);
  [incomeState.expenses, incomeState.categories] = await Promise.all([api('/api/expenses'), api('/api/expense-categories')]);
  const years = [...new Set([String(now.getFullYear()), ...incomeState.board.monthly.map((row) => row.period.slice(0, 4))])].sort().reverse();
  $('#incomeYear').innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
  $('#incomeYear').value = incomeState.board.year;
  $('#incomeMonth').innerHTML = incomeMonths.map((name, index) => `<option value="${String(index + 1).padStart(2, '0')}">${name}</option>`).join('');
  $('#incomeMonth').value = incomeState.board.month;
  $('#othersDate').value = today();
  $('#othersCategory').innerHTML = incomeState.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
  renderIncomePage();
}

const reloadIncomePage = async () => {
  incomeState.board = await api(`/api/reports/profit-board?year=$('#incomeYear').value}&month=$('#incomeMonth').value}`);
  incomeState.expenses = await api('/api/expenses');
  renderIncomePage();
};

$('#incomeYear')?.addEventListener('change', () => { reloadIncomePage().catch((error) => window.alert(error.message)); });
$('#incomeMonth')?.addEventListener('change', () => { reloadIncomePage().catch((error) => window.alert(error.message)); });
$('#addOthersButton')?.addEventListener('click', () => {
  $('#othersForm').reset();
  $('#othersError').textContent = '';
  $('#othersDate').value = `${$('#incomeYear').value}-${$('#incomeMonth').value}-01`;
  $('#othersCategory').innerHTML = incomeState.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
  $('#othersDialog').showModal();
});
$('#closeOthersDialog')?.addEventListener('click', () => $('#othersDialog').close());
$('#cancelOthersDialog')?.addEventListener('click', () => $('#othersDialog').close());
$('#othersForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#othersError').textContent = '';
  try {
    await api('/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        expenseDate: $('#othersDate').value, categoryId: Number($('#othersCategory').value),
        description: $('#othersDescription').value.trim(), amount: parseMoneyInput($('#othersAmount').value),
        note: $('#othersNote').value.trim() || null,
      }),
    });
    $('#othersDialog').close();
    await reloadIncomePage();
  } catch (error) { $('#othersError').textContent = error.message; }
});
$('#othersList')?.addEventListener('click', async (event) => {
  const button = event.target.closest('.others-remove');
  if (!button || !window.confirm('Delete this operational cost?')) return;
  try {
    await api(`/api/expenses/${button.dataset.id}`, { method: 'DELETE' });
    await reloadIncomePage();
  } catch (error) { window.alert(error.message); }
});

loadIncomePage().catch((error) => { if ($('#incomeChart')) $('#incomeChart').innerHTML = `<p class="chart-empty">${escapeHtml(error.message)}</p>`; });
