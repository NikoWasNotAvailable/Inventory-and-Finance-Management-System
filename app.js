// Simple localStorage-backed inventory + invoice system
const STORAGE_KEY = 'inventory_app_v1';

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return {items:[], sales:[]};
  try{ return JSON.parse(raw); }catch(e){ return {items:[], sales:[]}; }
}
function saveState(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

// Utilities
function fmtRp(n){ return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// Render items
const itemsList = document.getElementById('itemsList');
function renderItems(){
  itemsList.innerHTML = '';
  state.items.forEach(it => {
    const row = document.createElement('div');
    row.className = 'row item-row align-items-center mx-0';
    row.innerHTML = `
      <div class="col-2 col-md-1"><span class="badge bg-light text-dark border qty-badge">${it.quantity}</span></div>
      <div class="col-6 col-md-6">${it.name}<div class="small text-muted">${it.category}</div></div>
      <div class="col-4 col-md-2 price-col">${fmtRp(it.price)}</div>
      <div class="col-12 col-md-3 text-md-end mt-2 mt-md-0">
        <button data-id="${it.id}" class="btn btn-outline-secondary btn-sm btn-icon btn-plus" title="Tambah stok"><i class="bi bi-plus-lg"></i></button>
        <button data-id="${it.id}" class="btn btn-outline-secondary btn-sm btn-icon btn-minus" title="Kurangi stok"><i class="bi bi-dash-lg"></i></button>
        <button data-id="${it.id}" class="btn btn-outline-secondary btn-sm btn-icon btn-edit" title="Edit"><i class="bi bi-pencil"></i></button>
        <button data-id="${it.id}" class="btn btn-outline-danger btn-sm ms-1 btn-delete">Hapus</button>
      </div>
    `;
    itemsList.appendChild(row);
  });
  attachItemListeners();
}

function attachItemListeners(){
  document.querySelectorAll('.btn-plus').forEach(b=>b.onclick=()=>{ const id=b.dataset.id; changeQty(id,1); });
  document.querySelectorAll('.btn-minus').forEach(b=>b.onclick=()=>{ const id=b.dataset.id; changeQty(id,-1); });
  document.querySelectorAll('.btn-edit').forEach(b=>b.onclick=()=>{ const id=b.dataset.id; openEdit(id); });
  document.querySelectorAll('.btn-delete').forEach(b=>b.onclick=()=>{ const id=b.dataset.id; deleteItem(id); });
}

function changeQty(id,delta){
  const it = state.items.find(x=>x.id===id); if(!it) return;
  it.quantity = Math.max(0,(it.quantity||0)+delta);
  saveState(state); renderItems(); updateSummary();
}

function deleteItem(id){
  if(!confirm('Hapus item ini?')) return;
  state.items = state.items.filter(x=>x.id!==id);
  saveState(state); renderItems(); updateSummary();
}

// Add / Edit item modal
const modalItem = new bootstrap.Modal(document.getElementById('modalItem'));
const formItem = document.getElementById('formItem');
const modalItemTitle = document.getElementById('modalItemTitle');

document.getElementById('btnAdd').addEventListener('click', ()=>{
  openCreate();
});

function openCreate(){
  modalItemTitle.textContent = 'Tambah Barang';
  formItem.reset(); document.getElementById('itemId').value = '';
  modalItem.show();
}
function openEdit(id){
  const it = state.items.find(x=>x.id===id); if(!it) return;
  modalItemTitle.textContent = 'Edit Barang';
  document.getElementById('itemId').value = it.id;
  document.getElementById('itemName').value = it.name;
  document.getElementById('itemCategory').value = it.category;
  document.getElementById('itemPrice').value = it.price;
  document.getElementById('itemCost').value = it.cost||0;
  document.getElementById('itemQty').value = it.quantity||0;
  modalItem.show();
}

document.getElementById('saveItem').addEventListener('click', ()=>{
  const id = document.getElementById('itemId').value;
  const name = document.getElementById('itemName').value.trim();
  const category = document.getElementById('itemCategory').value;
  const price = parseInt(document.getElementById('itemPrice').value)||0;
  const cost = parseInt(document.getElementById('itemCost').value)||0;
  const qty = parseInt(document.getElementById('itemQty').value)||0;
  if(!name){ alert('Nama harus diisi'); return; }
  if(id){
    const it = state.items.find(x=>x.id===id);
    it.name=name; it.category=category; it.price=price; it.cost=cost; it.quantity=qty;
  } else {
    state.items.push({id:uid(), name, category, price, cost, quantity:qty, date: new Date().toISOString()});
  }
  saveState(state); renderItems(); modalItem.hide(); updateSummary();
});

// Invoice maker
const modalInvoice = new bootstrap.Modal(document.getElementById('modalInvoice'));
const invLines = document.getElementById('invLines');
const invTotalEl = document.getElementById('invTotal');

document.getElementById('openInvoice').addEventListener('click', ()=>{
  openInvoice();
});

function openInvoice(){
  document.getElementById('invCustomerName').value='';
  document.getElementById('invCustomerType').value='customer';
  invLines.innerHTML=''; addInvLine(); updateInvTotal(); modalInvoice.show();
}

function addInvLine(){
  const rowId = uid();
  const div = document.createElement('div'); div.className='inv-line'; div.dataset.row=rowId;
  // item select
  const sel = document.createElement('select'); sel.className='form-select form-select-sm';
  const defaultOpt = document.createElement('option'); defaultOpt.value=''; defaultOpt.textContent='-- pilih barang --'; sel.appendChild(defaultOpt);
  state.items.forEach(it=>{ const o=document.createElement('option'); o.value=it.id; o.textContent=`${it.name} (${it.quantity})`; sel.appendChild(o); });
  const qty = document.createElement('input'); qty.type='number'; qty.min=1; qty.value=1; qty.className='form-control form-control-sm inv-qty';
  const price = document.createElement('input'); price.type='number'; price.min=0; price.value=0; price.className='form-control form-control-sm inv-price';
  const remove = document.createElement('button'); remove.className='btn btn-sm btn-outline-danger'; remove.textContent='Hapus';
  div.appendChild(sel); div.appendChild(qty); div.appendChild(price); div.appendChild(remove);
  invLines.appendChild(div);

  sel.addEventListener('change', ()=>{
    const it = state.items.find(x=>x.id===sel.value);
    price.value = it ? it.price : 0;
    updateInvTotal();
  });
  qty.addEventListener('input', updateInvTotal);
  price.addEventListener('input', updateInvTotal);
  remove.addEventListener('click', ()=>{ div.remove(); updateInvTotal(); });
}

document.getElementById('addLine').addEventListener('click', addInvLine);

function updateInvTotal(){
  let total = 0;
  invLines.querySelectorAll('.inv-line').forEach(div=>{
    const q = parseInt(div.querySelector('.inv-qty').value)||0;
    const p = parseInt(div.querySelector('.inv-price').value)||0;
    total += q*p;
  });
  invTotalEl.textContent = fmtRp(total);
}

// finalize invoice: save to sales history and reduce stock
document.getElementById('finalizeInv').addEventListener('click', ()=>{
  const customer = document.getElementById('invCustomerName').value.trim();
  const type = document.getElementById('invCustomerType').value;
  if(!customer){ alert('Isi nama customer atau resto'); return; }
  const lines = [];
  let total = 0;
  invLines.querySelectorAll('.inv-line').forEach(div=>{
    const id = div.querySelector('select').value;
    const q = parseInt(div.querySelector('.inv-qty').value)||0;
    const p = parseInt(div.querySelector('.inv-price').value)||0;
    if(!id) return;
    const it = state.items.find(x=>x.id===id);
    if(!it) return;
    // reduce stock
    it.quantity = Math.max(0, it.quantity - q);
    lines.push({id:it.id, name:it.name, qty:q, price:p, cost: it.cost||0});
    total += q*p;
  });
  if(lines.length===0){ alert('Tidak ada baris invoice'); return; }
  const sale = {id:uid(), customer, type, date:new Date().toISOString(), total, lines};
  state.sales = state.sales || [];
  state.sales.push(sale);
  saveState(state); renderItems(); modalInvoice.hide(); updateSummary(); renderHistory();
});

// Sales history
const historyList = document.getElementById('historyList');
function renderHistory(filter='all'){
  historyList.innerHTML = '';
  const items = (state.sales||[]).slice().reverse();
  items.forEach(s=>{
    if(filter!=='all' && s.type!==filter) return;
    const d = document.createElement('div'); d.className='mb-2';
    d.innerHTML = `<div><strong>${s.customer}</strong> <span class="text-muted small">${new Date(s.date).toLocaleString()}</span></div><div class="small">Total: ${fmtRp(s.total)}</div>`;
    historyList.appendChild(d);
  });
}

document.getElementById('historyFilter').addEventListener('change',(e)=> renderHistory(e.target.value));

// Summary calculations
function updateSummary(){
  const sales = state.sales || [];
  let income = 0, outcome = 0;
  sales.forEach(s=>{ income += s.total; s.lines.forEach(l=> outcome += (l.cost||0)*l.qty); });
  const profit = income - outcome;
  document.getElementById('income').textContent = fmtRp(income);
  document.getElementById('outcome').textContent = fmtRp(outcome);
  document.getElementById('profit').textContent = fmtRp(profit);
}

// initial bootstrap
renderItems(); renderHistory(); updateSummary();

// Seed with sample data if empty
if(state.items.length===0){
  state.items.push({id:uid(), name:'Nama barang A', category:'utensils', price:15000, cost:10000, quantity:12});
  state.items.push({id:uid(), name:'Nama barang B', category:'packaging', price:20000, cost:12000, quantity:8});
  state.items.push({id:uid(), name:'Nama barang C', category:'others', price:30000, cost:18000, quantity:5});
  saveState(state); renderItems();
}
