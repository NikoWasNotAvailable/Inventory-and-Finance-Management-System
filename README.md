# Inventaris Toko Plastik — Simple Web App

Ringkasan: aplikasi inventaris sederhana berbasis browser menggunakan `localStorage` sebagai database.

Fitur yang tersedia:
- Tambah / edit / hapus barang (CRUD)
- Kategori: `utensils`, `packaging`, `others`
- Invoice Maker: buat invoice manual, total otomatis, mengurangi stok saat finalize
- Sales history: disimpan per sale dengan `type` = `customer` atau `resto`
- Ringkasan: income, outcome, clean profit

Cara menjalankan:
1. Buka file `index.html` di browser (double-click atau via Live Server extension).
2. Tambah barang lewat tombol "Tambah barang".
3. Buka "Invoice" untuk membuat penjualan — pilih barang, masukkan qty dan price.
4. Finalize invoice untuk menyimpan sales dan mengurangi stok otomatis.
5. Sales history dan summary tampil di panel kanan.

Catatan teknis:
- Data disimpan di `localStorage` pada key `inventory_app_v1`.
- Jika ingin reset data, buka DevTools > Application > Local Storage > hapus key tersebut.

Next steps:
- Tambah export/import CSV
- Filter dan pagination untuk history
- Integrasi backend (optional)

Server (optional):
1. Install dependencies and run server (requires Node.js):

```bash
cd server
npm install
npm start
```

2. Default admin credentials: `admin` / `password` (change via env `ADMIN_USER` `ADMIN_PASS`).
3. API endpoints:
 - `POST /api/auth/login` {username,password} -> {token}
 - `GET /api/items`
 - `POST /api/items` (auth)
 - `PUT /api/items/:id` (auth)
 - `DELETE /api/items/:id` (auth)
 - `GET /api/sales`
 - `POST /api/sales` (auth)

Note: Frontend currently uses `localStorage` for offline use. You can integrate the frontend to call these endpoints if you run the server.
