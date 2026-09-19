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

Run locally as a packaged app (one-step)
- Windows: double-click `start-server.bat` in the repo root. This will install server deps if needed, open your browser at `http://localhost:3000`, and start the server.
- PowerShell: run `start-server.ps1` (may require execution policy change: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`).

Create a Desktop shortcut (Windows)
1. Run the helper script to create a Desktop shortcut that launches the app:

```powershell
.\create-desktop-shortcut.ps1
```

2. A shortcut named `RezekiMakmur Inventory` will appear on your Desktop. Double-clicking it will open the app in your browser and start the local server.

Distributing via GitHub
- Push this repository to GitHub.
- Users can `git clone <repo>` and run `start-server.bat` (Windows) or the PowerShell script.

Optional: single-binary server (advanced)
- You can bundle the server into a single executable using `pkg` so non-Node users can run it without installing Node:
	```bash
	npm install -g pkg
	cd server
	pkg . --targets node18-win-x64 --output ../inventaris-server.exe
	```
	This produces `inventaris-server.exe` in the repo root which you can distribute (note: include `data.db` and static files alongside it).

Build a Windows distributable (includes portable Node + app)
1. Run the included PowerShell builder (this will download Node and create a zip):

```powershell
.\create-dist.ps1
```

2. The script produces `RezekiMakmur-Inventory-win.zip` in the repo root. Extract to test, or distribute the zip as-is.

3. (Installer) If you want a graphical installer, use your preferred installer builder (NSIS, Inno Setup, or commercial tools). The package produced by `create-dist.ps1` is a self-contained zip you can distribute.

Notes about the distributable
- The builder downloads the official Node Windows zip and puts `node.exe` into the package, so end users do not need Node installed.
- The bundled server `node_modules` are copied into the `server` folder in the package; this makes the distributable larger but self-contained.
- If you want a single-file exe instead, I can attempt a `pkg` build, but native modules like `better-sqlite3` can make that approach fragile.
