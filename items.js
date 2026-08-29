// Items page logic
document.addEventListener('DOMContentLoaded', ()=>{
  state = loadState();
  const itemsList = document.getElementById('itemsList');
  const modalItem = new bootstrap.Modal(document.getElementById('modalItem'));
  const formItem = document.getElementById('formItem');
  const modalItemTitle = document.getElementById('modalItemTitle');

  // filtering state
  let currentCategory = 'all';
  let searchTerm = '';

  function renderItems(){
    itemsList.innerHTML = '';
    const filtered = state.items.filter(it=>{
      if(currentCategory !== 'all' && it.category !== currentCategory) return false;
      if(searchTerm && !it.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
    filtered.forEach(it=>{
      const row = document.createElement('div'); row.className='row item-row align-items-center mx-0';
      row.innerHTML = `
      <div class="col-2 col-md-1"><span class="badge bg-light text-dark border qty-badge">${it.quantity}</span></div>
      <div class="col-6 col-md-6">${it.name}<div class="small text-muted">${it.category}</div></div>
      <div class="col-4 col-md-2 price-col">${fmtRp(it.price)}</div>
      <div class="col-12 col-md-3 text-md-end mt-2 mt-md-0">
        <button data-id="${it.id}" class="btn btn-outline-secondary btn-sm btn-icon btn-plus" title="Tambah stok"><i class="bi bi-plus-lg"></i></button>
        <button data-id="${it.id}" class="btn btn-outline-secondary btn-sm btn-icon btn-minus" title="Kurangi stok"><i class="bi bi-dash-lg"></i></button>
        <button data-id="${it.id}" class="btn btn-outline-secondary btn-sm btn-icon btn-edit" title="Edit"><i class="bi bi-pencil"></i></button>
        <button data-id="${it.id}" class="btn btn-outline-danger btn-sm ms-1 btn-delete">Hapus</button>
      </div>`;
      itemsList.appendChild(row);
    });
    attachItemListeners();
    updateSummary(); renderHistory(currentCategory);
  }

  function attachItemListeners(){
    document.querySelectorAll('.btn-plus').forEach(b=>b.onclick=()=>{ changeQty(b.dataset.id,1); });
    document.querySelectorAll('.btn-minus').forEach(b=>b.onclick=()=>{ changeQty(b.dataset.id,-1); });
    document.querySelectorAll('.btn-edit').forEach(b=>b.onclick=()=>{ openEdit(b.dataset.id); });
    document.querySelectorAll('.btn-delete').forEach(b=>b.onclick=()=>{ deleteItem(b.dataset.id); });
  }

  function changeQty(id,delta){ const it = state.items.find(x=>x.id===id); if(!it) return; it.quantity = Math.max(0,(it.quantity||0)+delta); saveState(state); renderItems(); }
  function deleteItem(id){ if(!confirm('Hapus item ini?')) return; state.items = state.items.filter(x=>x.id!==id); saveState(state); renderItems(); }

  function openCreate(){ modalItemTitle.textContent='Tambah Barang'; formItem.reset(); document.getElementById('itemId').value=''; modalItem.show(); }
  function openEdit(id){ const it = state.items.find(x=>x.id===id); if(!it) return; modalItemTitle.textContent='Edit Barang'; document.getElementById('itemId').value=it.id; document.getElementById('itemName').value=it.name; document.getElementById('itemCategory').value=it.category; document.getElementById('itemPrice').value=it.price; document.getElementById('itemCost').value=it.cost||0; document.getElementById('itemQty').value=it.quantity||0; modalItem.show(); }

  document.getElementById('btnAdd').addEventListener('click', openCreate);
  document.getElementById('saveItem').addEventListener('click', ()=>{
    const id = document.getElementById('itemId').value; const name = document.getElementById('itemName').value.trim(); const category = document.getElementById('itemCategory').value; const price = parseInt(document.getElementById('itemPrice').value)||0; const cost = parseInt(document.getElementById('itemCost').value)||0; const qty = parseInt(document.getElementById('itemQty').value)||0;
    if(!name){ alert('Nama harus diisi'); return; }
    if(id){ const it = state.items.find(x=>x.id===id); it.name=name; it.category=category; it.price=price; it.cost=cost; it.quantity=qty; } else { state.items.push({id:uid(), name, category, price, cost, quantity:qty, date: new Date().toISOString()}); }
    saveState(state); renderItems(); modalItem.hide();
  });

  // export/import buttons reuse common functions
  document.getElementById('exportInv').addEventListener('click', ()=>{
    const header = ['id','name','category','price','cost','quantity','date'];
    const csvEscape = (v)=>{
      if(v===null||v===undefined) return '';
      const s = String(v);
      const mustQuote = /[",\r\n,]/.test(s);
      const out = s.replace(/"/g,'""');
      return mustQuote ? '"'+out+'"' : out;
    };
    const lines = [];
    lines.push(header.join(',')); // header without quotes
    // reload state at export time to ensure latest saved data
    const exportState = loadState();
    (exportState.items||[]).forEach(i=>{
      const row = [i.id, i.name, i.category, i.price||0, i.cost||0, i.quantity||0, i.date||''];
      lines.push(row.map(csvEscape).join(','));
    });
    const csv = '\uFEFF' + lines.join('\r\n'); // BOM + CRLF for Excel
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='inventory.csv'; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('exportSales').addEventListener('click', ()=>{
    const header = ['sale_id','date','customer','type','total','lines_json'];
    const csvEscape = (v)=>{
      if(v===null||v===undefined) return '';
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      const out = s.replace(/"/g,'""');
      return '"'+out+'"'; // always quote sales fields to be safe (JSON may contain commas)
    };
    const lines = [];
    lines.push(header.join(','));
    const exportState2 = loadState();
    ((exportState2.sales)||[]).forEach(s=>{
      const row = [s.id, s.date, s.customer, s.type, s.total, JSON.stringify(s.lines)];
      lines.push(row.map(csvEscape).join(','));
    });
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='sales.csv'; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('importInv').addEventListener('click', ()=> document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change',(e)=>{ const f = e.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{ const text=reader.result; const lines=text.split(/\r?\n/).filter(Boolean); if(lines.length<2) return alert('CSV kosong'); const header=lines.shift().split(',').map(h=>h.replace(/^"|"$/g,'')); const idx=k=>header.indexOf(k); lines.forEach(ln=>{ const cols=ln.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.replace(/^"|"$/g,'').replace(/""/g,'"')); const item={ id: cols[idx('id')]||uid(), name: cols[idx('name')]||'', category: cols[idx('category')]||'others', price: parseInt(cols[idx('price')])||0, cost: parseInt(cols[idx('cost')])||0, quantity: parseInt(cols[idx('quantity')])||0, date: cols[idx('date')]||new Date().toISOString() }; state.items.push(item); }); saveState(state); renderItems(); alert('Import selesai'); }; reader.readAsText(f); e.target.value=''; });

  // category bar interactions
  const categoryBar = document.getElementById('categoryBar');
  if(categoryBar){
    categoryBar.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-cat]');
      if(!btn) return;
      categoryBar.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      renderItems();
    });
  }

  // search input above items list (fallback to sidebarSearch if present)
  const itemsSearch = document.getElementById('itemsSearch') || document.getElementById('sidebarSearch');
  if(itemsSearch){
    itemsSearch.addEventListener('input', (e)=>{ searchTerm = e.target.value.trim(); renderItems(); });
  }

  // history and summary rendering (only if elements exist on the page)
  const historyList = document.getElementById('historyList');
  function renderHistory(filter='all'){ if(!historyList) return; historyList.innerHTML=''; const items=(state.sales||[]).slice().reverse(); items.forEach(s=>{ if(filter!=='all' && s.type!==filter) return; const d=document.createElement('div'); d.className='mb-2'; d.innerHTML=`<div><strong>${s.customer}</strong> <span class="text-muted small">${new Date(s.date).toLocaleString()}</span></div><div class="small">Total: ${fmtRp(s.total)}</div>`; historyList.appendChild(d); }); }
  const historyFilter = document.getElementById('historyFilter');
  if(historyFilter){ historyFilter.addEventListener('change',(e)=> renderHistory(e.target.value)); }

  function updateSummary(){ const sum = computeSummary(state); const incomeEl = document.getElementById('income'); if(incomeEl){ incomeEl.textContent = fmtRp(sum.income); const outcomeEl = document.getElementById('outcome'); const profitEl = document.getElementById('profit'); if(outcomeEl) outcomeEl.textContent = fmtRp(sum.outcome); if(profitEl) profitEl.textContent = fmtRp(sum.profit); } }

  // undo last sale (only if button exists on this page)
  const undoBtn = document.getElementById('undoLast');
  if(undoBtn){ undoBtn.addEventListener('click', ()=>{ if(!state.sales || state.sales.length===0){ alert('Tidak ada sale untuk di-undo'); return; } if(!confirm('Undo last sale? Ini akan mengembalikan stok dan menghapus sales terakhir.')) return; const last = state.sales.pop(); last.lines.forEach(l=>{ const it = state.items.find(x=>x.id===l.id); if(it) it.quantity = (it.quantity||0) + (l.qty||0); }); saveState(state); renderItems(); alert('Last sale undone and stock restored.'); }); }

  // Open invoice page
  document.getElementById('openInvoice').addEventListener('click', ()=>{ window.location.href='invoice.html'; });

  // initial render
  if(state.items.length===0){ state.items.push({id:uid(), name:'Nama barang A', category:'utensils', price:15000, cost:10000, quantity:12}); state.items.push({id:uid(), name:'Nama barang B', category:'packaging', price:20000, cost:12000, quantity:8}); state.items.push({id:uid(), name:'Nama barang C', category:'others', price:30000, cost:18000, quantity:5}); saveState(state); }
  renderItems();
});
