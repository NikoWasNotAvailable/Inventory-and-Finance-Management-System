const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('C:/Users/ASUS/OneDrive/ドキュメント/Web_Dev_Camp/Inventaris-RezekiMakmur/public/app.js', 'utf8');
const escapeHtml = (v) => String(v ?? '');
const formatDate = (v) => String(v);

// Build a minimal DOM fragment that looks like a rendered transaction list.
function makePage(rows, colFor) {
  const th = ['Store','Date','D/O','Cust','Total Price','Status','Actions'].map((t) => `<th>${t}</th>`).join('');
  const tbody = rows.map((r) => `<tr>${r.map((cell, i) => `<td data-sort="${colFor[i] ? colFor[i](r) : ''}">${cell}</td>`).join('')}</tr>`).join('');
  const html = `<div class="transaction-page">
    <section class="transaction-toolbar">
      <button id="d" class="filter-chip" data-sort="date" data-dir="asc" type="button">Date</button>
      <button id="p" class="filter-chip" data-sort="price" data-dir="asc" type="button">Price</button>
      <button id="n" class="filter-chip" type="button">Name</button>
    </section>
    <table><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody></table>
  </div>`;
  const root = parseDiv(html);
  return { root, toolbar: id(root, 'd').parentElement, date: id(root, 'd'), price: id(root, 'p'), tbody: root.querySelector('tbody') };
}

function parseDiv(html) {
  return { tagName: 'DIV', className: 'transaction-page', _html: html,
    querySelector(sel) { return this._engine(sel); }, querySelectorAll() { return []; }, children: [] };
}
// Keep it simple: implement a tiny element model.
class Element {
  constructor(tag, children = []) { this.tagName = tag; this.children = children; this.dataset = {}; this.classList = new Set(); this.addEventListener = () => {}; this.textContent = ''; this.innerHTML = ''; }
}
const $ = (sel, root) => root.querySelector(sel);
function id(root, id) { return root.querySelector(`#${id}`); }

// Use the vm harness with a realish DOM is too heavy; instead, extract sortTableBy logic by re-defining.
// Simpler: copy the algorithm here is fragile. Instead load app.js in vm and call sortTableBy on a hand-built DOM tree we control.

function buildDom(root, dateChip, priceChip, tbody, rows) {
  // attach a fake DOM shim to the global
}

// Build a small DOM shim sufficient for sortTableBy:
function makeShim(rows, dateCellValues, priceCellValues) {
  const ths = [Element('th', ['Store']), Element('th', ['Date']), Element('th', ['D/O']), Element('th', ['Total Price']), Element('th', ['Status'])];
  const cells = rows.map((r) => {
    const dateTd = Element('td', []);
    dateTd.dataset = { sort: r.date };
    dateTd.textContent = r.date;
    const priceTd = Element('td', []);
    priceTd.dataset = { sort: String(r.price) };
    priceTd.textContent = `Rp ${r.price}`;
    return dateTd, priceTd;
  });
  // skip — use vm approach instead
}

console.log('Harness approach replaced; using direct logic verification below.');
