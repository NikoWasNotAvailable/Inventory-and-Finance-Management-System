document.addEventListener('DOMContentLoaded', ()=>{
  state = loadState();
  const historyList = document.getElementById('historyList');
  function renderHistory(filter='all'){ historyList.innerHTML=''; const items=(state.sales||[]).slice().reverse(); items.forEach(s=>{ if(filter!=='all' && s.type!==filter) return; const d=document.createElement('div'); d.className='mb-2'; d.innerHTML=`<div><strong>${s.customer}</strong> <span class="text-muted small">${new Date(s.date).toLocaleString()}</span></div><div class="small">Total: ${fmtRp(s.total)}</div>`; historyList.appendChild(d); }); }
  document.getElementById('historyFilter').addEventListener('change',(e)=> renderHistory(e.target.value));
  document.getElementById('undoLast').addEventListener('click', ()=>{ if(!state.sales || state.sales.length===0){ alert('Tidak ada sale untuk di-undo'); return; } if(!confirm('Undo last sale?')) return; const last = state.sales.pop(); last.lines.forEach(l=>{ const it = state.items.find(x=>x.id===l.id); if(it) it.quantity = (it.quantity||0) + (l.qty||0); }); saveState(state); renderHistory(); alert('Last sale undone'); });
  renderHistory();
});
