const state = { purchases: [], stores: [], products: [] };
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
      <td><strong>${escapeHtml(row.product_name)}</strong></td><td>${row.quantity} ${escapeHtml(row.unit)}</td>
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
  $('#invoiceItems').innerHTML = invoiceLines.map((line, index) => `
    <div class="invoice-line" data-index="${index}">
      <input class="invoice-quantity" type="number" min="1" step="1" value="${line.quantity || ''}" placeholder="Qty" aria-label="Quantity">
      <input class="invoice-product" type="text" value="${escapeHtml(line.productName)}" placeholder="Product name" aria-label="Product name">
      <input class="invoice-unit" type="text" value="${escapeHtml(line.unit || 'PCK')}" aria-label="Unit" readonly>
      <input class="invoice-price" type="text" inputmode="numeric" value="${line.unitPrice || ''}" placeholder="50000" aria-label="Unit price">
      <strong class="invoice-line-total">${rupiah(line.quantity * line.unitPrice)}</strong>
      <button class="remove-line" type="button" data-index="${index}" title="Remove line" aria-label="Remove line">×</button>
    </div>`).join('');
  $('#invoiceTotal').textContent = rupiah(invoiceLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
}

function resetInvoice() {
  $('#invoiceForm').reset();
  $('#invoiceDate').value = today();
  invoiceLines = [{ quantity: 0, productName: '', unit: 'PCK', unitPrice: 0 }];
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
  invoiceLines[index] = {
    quantity: Number(row.querySelector('.invoice-quantity').value) || 0,
    productName: row.querySelector('.invoice-product').value,
    unit: row.querySelector('.invoice-unit').value,
    unitPrice: parseMoneyInput(row.querySelector('.invoice-price').value),
  };
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
  [state.purchases, state.stores, state.products] = await Promise.all([api('/api/purchases'), api('/api/stores'), api('/api/products')]);
  renderStores(); renderRows();
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
  invoiceLines.push({ quantity: 0, productName: '', unit: 'PCK', unitPrice: 0 });
  renderInvoiceLines();
});
$('#invoiceItems')?.addEventListener('input', (event) => readInvoiceLine(event.target));
$('#invoiceItems')?.addEventListener('click', (event) => {
  if (!event.target.classList.contains('remove-line')) return;
  invoiceLines.splice(Number(event.target.dataset.index), 1);
  if (!invoiceLines.length) invoiceLines.push({ quantity: 0, productName: '', unit: 'PCK', unitPrice: 0 });
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
      items: invoiceLines.map((line) => ({ productName: line.productName.trim(), unit: line.unit.trim(), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })),
    };
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
