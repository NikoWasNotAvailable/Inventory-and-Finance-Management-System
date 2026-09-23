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
db.pragma('journal_mode = WAL');

db.defaultSafeIntegers(false);

if (isNewDatabase) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

module.exports = { db, databasePath };
