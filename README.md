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
- `DELETE /api/expenses/:id`
- `GET /api/expense-categories`
- `GET /api/stock`
- `GET /api/stock/:productId/lots`
- `GET /api/reports/income`
- `GET /api/reports/outcome`
- `GET /api/reports/net`
- `GET /api/reports/profit-by-product`
- `GET /api/reports/profit-board?year=2026&month=10`

## Halaman Income

`GET /api/reports/profit-board` mengembalikan bucket per bulan (`monthly`) dan per
hari (`daily`) dari satu tahun/bulan terpilih:

- `piutang` = sisa invoice yang belum lunas, dikelompokkan per `invoice_date`
- `collected` = clean profit dari piutang yang sudah dibayar (dari `v_income_events`, per `paid_at`)
- `hutang` = sisa pembelian yang belum lunas, per `purchase_date`
- `hutang_paid` = pembelian yang sudah dibayar, per `paid_at`
- `others` = biaya operasional dari tabel `expenses`, per `expense_date`
- `income` = piutang + collected, `outcome` = hutang + hutang_paid + others, `profit` = income - outcome

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
