document.addEventListener('DOMContentLoaded', ()=>{
  state = loadState();
  const invLines = document.getElementById('invLines');
  const invTotalEl = document.getElementById('invTotal');

  function addInvLine(){
    const rowId = uid();
    const div = document.createElement('div'); div.className='inv-line d-flex gap-2 mb-2'; div.dataset.row=rowId;
    const sel = document.createElement('select'); sel.className='form-select form-select-sm flex-grow-1'; const defaultOpt = document.createElement('option'); defaultOpt.value=''; defaultOpt.textContent='-- pilih barang --'; sel.appendChild(defaultOpt);
    state.items.forEach(it=>{ const o=document.createElement('option'); o.value=it.id; o.textContent=`${it.name} (${it.quantity})`; sel.appendChild(o); });
    const qty = document.createElement('input'); qty.type='number'; qty.min=1; qty.value=1; qty.className='form-control form-control-sm inv-qty'; qty.style.width='80px';
    const price = document.createElement('input'); price.type='number'; price.min=0; price.value=0; price.className='form-control form-control-sm inv-price'; price.style.width='120px';
    const remove = document.createElement('button'); remove.className='btn btn-sm btn-outline-danger'; remove.textContent='Hapus';
    div.appendChild(sel); div.appendChild(qty); div.appendChild(price); div.appendChild(remove); invLines.appendChild(div);
    sel.addEventListener('change', ()=>{ const it = state.items.find(x=>x.id===sel.value); price.value = it ? it.price : 0; updateInvTotal(); }); qty.addEventListener('input', updateInvTotal); price.addEventListener('input', updateInvTotal); remove.addEventListener('click', ()=>{ div.remove(); updateInvTotal(); });
  }

  function updateInvTotal(){ let total=0; invLines.querySelectorAll('.inv-line').forEach(div=>{ const q=parseInt(div.querySelector('.inv-qty').value)||0; const p=parseInt(div.querySelector('.inv-price').value)||0; total += q*p; }); invTotalEl.textContent = fmtRp(total); }

  document.getElementById('addLine').addEventListener('click', addInvLine);

  document.getElementById('finalizeInv').addEventListener('click', ()=>{
    const customer = document.getElementById('invCustomerName').value.trim(); const type = document.getElementById('invCustomerType').value; if(!customer){ alert('Isi nama customer atau resto'); return; }
    const lines=[]; let total=0; invLines.querySelectorAll('.inv-line').forEach(div=>{ const id = div.querySelector('select').value; const q = parseInt(div.querySelector('.inv-qty').value)||0; const p = parseInt(div.querySelector('.inv-price').value)||0; if(!id) return; const it = state.items.find(x=>x.id===id); if(!it) return; it.quantity = Math.max(0, it.quantity - q); lines.push({id:it.id, name:it.name, qty:q, price:p, cost: it.cost||0}); total += q*p; }); if(lines.length===0){ alert('Tidak ada baris invoice'); return; }
    const sale = {id:uid(), customer, type, date:new Date().toISOString(), total, lines}; state.sales = state.sales || []; state.sales.push(sale); saveState(state); alert('Sale saved'); window.location.href='index.html';
  });

  // initial
  addInvLine(); updateInvTotal();
});
