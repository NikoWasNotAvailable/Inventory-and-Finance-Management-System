// Shared storage and utilities
const STORAGE_KEY = 'inventory_app_v1';
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return {items:[], sales:[]};
  try{ return JSON.parse(raw); }catch(e){ return {items:[], sales:[]}; }
}
function saveState(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmtRp(n){ return 'Rp ' + Number(n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

// helpers for summary
function computeSummary(state){
  const sales = state.sales || [];
  let income=0, outcome=0;
  sales.forEach(s=>{ income += s.total; s.lines.forEach(l=> outcome += (l.cost||0)*l.qty); });
  return { income, outcome, profit: income - outcome };
}

// ensure state exists
let state = loadState();
if(!state.items) state.items = [];
if(!state.sales) state.sales = [];

// Navbar / Offcanvas sidebar: when logo is clicked, toggle left sidebar
document.addEventListener('DOMContentLoaded', ()=>{
  const logo = document.querySelector('.navbar-brand');
  const sidebarEl = document.getElementById('sidebarMenu');
  if(logo && sidebarEl && window.bootstrap){
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', (e)=>{
      e.preventDefault();
      const off = new bootstrap.Offcanvas(sidebarEl);
      off.toggle();
    });
  }
  // highlight active link in sidebar
  try{
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const links = Array.from(document.querySelectorAll('#sidebarMenu .list-group a'));
    links.forEach(a=>{
      try{
        const hrefFile = (new URL(a.getAttribute('href'), location.href).pathname.split('/').pop() || '').toLowerCase();
        if(hrefFile === current || (current === '' && (hrefFile === 'index.html' || hrefFile === ''))){
          a.classList.add('active');
          a.setAttribute('aria-current','page');
        } else {
          a.classList.remove('active');
          a.removeAttribute('aria-current');
        }
      }catch(e){}
    });
  }catch(e){}
});
