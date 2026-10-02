const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const databasePath = path.join(dataDir, 'makmur.sqlite');
const schemaPath = path.join(rootDir, 'makmur_schema.sql');

fs.mkdirSync(dataDir, { recursive: true });

const isNewDatabase = !fs.existsSync(databasePath);
const db = new Database(databasePath);

db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
// Keep the local database in one portable file. WAL sidecar files are not
// convenient when the user copies or opens the SQLite file directly.
db.pragma('journal_mode = DELETE');

db.defaultSafeIntegers(false);

if (isNewDatabase) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

// D/O is unique in the table definition; PO customer needs the same rule.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_po_number_unique
    ON invoices (po_number COLLATE NOCASE)
   WHERE po_number IS NOT NULL AND trim(po_number) <> '';
`);

module.exports = { db, databasePath };
