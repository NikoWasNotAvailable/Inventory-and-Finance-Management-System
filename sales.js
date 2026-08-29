document.addEventListener('DOMContentLoaded', ()=>{
  state = loadState();
  function update(){ const sum = computeSummary(state); document.getElementById('income').textContent = fmtRp(sum.income); document.getElementById('outcome').textContent = fmtRp(sum.outcome); document.getElementById('profit').textContent = fmtRp(sum.profit); }
  update();
});
