// db.js — Conexión y inicialización de PostgreSQL
// =======================================================
// - Pool con SSL configurable
// - Creación de tablas + índices
// - Migración automática de JSONs legacy (config/*.json)
// - Exporta pool, query e initDb
// =======================================================

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Cargar .env solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
    console.log('dotenv cargado (modo local)');
  } catch (err) {
    console.warn('No se pudo cargar dotenv (modo local)');
  }
}

// Validación crítica
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está definida. Configúrala en las variables de entorno o en tu archivo .env'
  );
}

// SSL: activado por defecto (necesario en Render/Supabase), desactivable con DISABLE_SSL=true
const useSSL = String(process.env.DISABLE_SSL || '').toLowerCase() !== 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// Query genérica
function query(text, params) {
  return pool.query(text, params);
}

// =======================================================
// INICIALIZACIÓN DE BASE DE DATOS + MIGRACIÓN LEGACY
// =======================================================
async function initDb() {
  console.log('Inicializando base de datos...');

  const createItems = `
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      lab TEXT NOT NULL,
      data JSONB NOT NULL,
      photo TEXT
    );
  `;

  const createReservations = `
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      lab TEXT NOT NULL,
      data JSONB NOT NULL,
      user_email TEXT
    );
  `;

  const createLibraryLoans = `
    CREATE TABLE IF NOT EXISTS library_loans (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      user_email TEXT,
      loan_date TIMESTAMPTZ DEFAULT NOW(),
      returned BOOLEAN DEFAULT FALSE,
      return_date TIMESTAMPTZ
    );
  `;

  const createScienceLoans = `
    CREATE TABLE IF NOT EXISTS science_loans (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      user_email TEXT,
      loan_date TIMESTAMPTZ DEFAULT NOW(),
      returned BOOLEAN DEFAULT FALSE,
      return_date TIMESTAMPTZ
    );
  `;

  const createComputingLoans = `
    CREATE TABLE IF NOT EXISTS computing_loans (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      user_email TEXT,
      loan_date TIMESTAMPTZ DEFAULT NOW(),
      returned BOOLEAN DEFAULT FALSE,
      return_date TIMESTAMPTZ
    );
  `;

  const createHistory = `
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      lab TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      user_email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      data JSONB
    );
  `;

  // Índices optimizados
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_items_lab ON items(lab);`,
    `CREATE INDEX IF NOT EXISTS idx_items_codigo ON items((data->>'codigo'));`,
    `CREATE INDEX IF NOT EXISTS idx_reservations_lab ON reservations(lab);`,

    // Library loans
    `CREATE INDEX IF NOT EXISTS idx_library_loans_returned ON library_loans(returned);`,
    `CREATE INDEX IF NOT EXISTS idx_library_loans_date ON library_loans(loan_date);`,
    `CREATE INDEX IF NOT EXISTS idx_library_loans_codigo ON library_loans((data->>'codigo'));`,

    // Science loans
    `CREATE INDEX IF NOT EXISTS idx_science_loans_returned ON science_loans(returned);`,
    `CREATE INDEX IF NOT EXISTS idx_science_loans_date ON science_loans(loan_date);`,
    `CREATE INDEX IF NOT EXISTS idx_science_loans_codigo ON science_loans((data->>'codigo'));`,

    // Computing loans
    `CREATE INDEX IF NOT EXISTS idx_computing_loans_returned ON computing_loans(returned);`,
    `CREATE INDEX IF NOT EXISTS idx_computing_loans_date ON computing_loans(loan_date);`,
    `CREATE INDEX IF NOT EXISTS idx_computing_loans_codigo ON computing_loans((data->>'codigo'));`,

    // History
    `CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_history_lab ON history(lab);`,
    `CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id);`
  ];

  try {
    await pool.query('SELECT NOW()');
    console.log('Conexión a PostgreSQL exitosa');

    // Crear tablas
    await pool.query(createItems);
    await pool.query(createReservations);
    await pool.query(createLibraryLoans);
    await pool.query(createScienceLoans);
    await pool.query(createComputingLoans);
    await pool.query(createHistory);

    // Crear índices
    for (const idx of indexes) {
      await pool.query(idx);
    }

    console.log('Tablas e índices creados/actualizados');

    // MIGRACIÓN AUTOMÁTICA DE JSONs LEGACY
    await migrateLegacyData();

    console.log('Base de datos lista');
  } catch (err) {
    console.error('Error crítico al inicializar la base de datos:', err);
    throw err;
  }
}

// =======================================================
// MIGRACIÓN AUTOMÁTICA DE ARCHIVOS JSON LEGACY
// =======================================================
async function migrateLegacyData() {
  console.log('Iniciando migración de datos legacy (JSON → PostgreSQL)...');

  const configDir = path.join(__dirname, 'config');

  // Mapeo: archivo → tabla
  const migrations = [
    { file: 'computing_loans.json', table: 'computing_loans' },
    { file: 'library_loans.json',   table: 'library_loans' },
    { file: 'science_loans.json',   table: 'science_loans' }
  ];

  let totalMigrados = 0;

  for (const { file, table } of migrations) {
    const filePath = path.join(configDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Archivo no encontrado (se omite): ${file}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const items = JSON.parse(raw);

      if (!Array.isArray(items) || items.length === 0) {
        console.log(`Archivo vacío o inválido: ${file}`);
        continue;
      }

      let count = 0;
      for (const item of items) {
        const id = item.id?.toString() || uuidv4();
        const fechaPrestamo = item.fecha_prestamo || item.fechaPrestamo || new Date();
        const devuelto = !!item.devuelto || !!item.returned || false;

        await query(`
          INSERT INTO ${table} (id, data, user_email, loan_date, returned)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [
          id,
          item,
          item.user || 'legacy@import',
          fechaPrestamo,
          devuelto
        ]);
        count++;
      }

      totalMigrados += count;
      console.log(`${count} registros migrados desde ${file} → ${table}`);
    } catch (err) {
      console.error(`Error migrando ${file}:`, err.message);
    }
  }

  console.log(`Migración completada: ${totalMigrados} registros importados en total`);
}

module.exports = {
  pool,
  query,
  initDb
};
