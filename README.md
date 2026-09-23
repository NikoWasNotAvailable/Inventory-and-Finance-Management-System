# Inventaris Rezeki Makmur

Backend lokal Node.js untuk inventory, FIFO stock, piutang, income, dan outcome.

## Menjalankan

```bash
npm install
npm start
```

API tersedia di `http://127.0.0.1:3000`.
Database dibuat otomatis di `data/makmur.sqlite` pada first run menggunakan `makmur_schema.sql`.

Untuk development dengan restart otomatis:

```bash
npm run dev
```

## Endpoint utama

- `GET /api/health`
- `GET|POST /api/products`
- `GET|POST /api/stores`
- `GET|POST /api/purchases`
- `POST /api/purchases/:id/payments`
- `GET|POST /api/invoices`
- `GET /api/invoices/:id`
- `GET /api/invoices/:id/pdf`
- `POST /api/invoices/:id/payments`
- `POST /api/invoices/:id/void`
- `GET|POST /api/expenses`
- `GET /api/stock`
- `GET /api/stock/:productId/lots`
- `GET /api/reports/income`
- `GET /api/reports/outcome`
- `GET /api/reports/net`
- `GET /api/reports/profit-by-product`

## Contoh payload

Buat produk:

```json
{
  "name": "Plastik 1",
  "unit": "PCK",
  "defaultBuyPrice": 40000,
  "defaultSellPrice": 50000
}
```

Buat invoice:

```json
{
  "invoiceDate": "2026-09-19",
  "storeId": 2,
  "items": [
    {
      "productId": 1,
      "quantity": 10,
      "unitPrice": 50000
    }
  ]
}
```

Invoice dan seluruh item diproses dalam satu transaksi. FIFO, total invoice, HPP, dan stok ditangani schema SQLite.
