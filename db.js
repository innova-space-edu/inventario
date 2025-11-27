// db.js
const { Pool } = require('pg');

// dotenv solo en entornos locales
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
    console.log('dotenv cargado (modo local)');
  } catch (err) {
    console.warn('No se pudo cargar dotenv (modo local)');
  }
}

// Validación DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está definida. Configúrala en las variables de entorno o en tu archivo .env'
  );
}

// Control opcional de SSL (útil para local dev)
// - Por defecto, SSL activo (Render/Supabase lo requieren)
// - Puedes desactivar con DISABLE_SSL=true en .env SOLO para localhost
const useSSL = String(process.env.DISABLE_SSL || '').toLowerCase() !== 'true';

// Pool de conexión
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// Query genérica
function query(text, params) {
  return pool.query(text, params);
}

// Inicialización de BD
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

  const createLoans = `
    CREATE TABLE IF NOT EXISTS library_loans (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      user_email TEXT,
      loan_date TIMESTAMPTZ,
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
      data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Índices recomendados
  const indexes = [
    // items
    `CREATE INDEX IF NOT EXISTS idx_items_lab ON items(lab);`,
    `CREATE INDEX IF NOT EXISTS idx_items_lab_codigo ON items ((data->>'codigo')) WHERE lab = 'library';`,
    // reservations
    `CREATE INDEX IF NOT EXISTS idx_reservations_lab ON reservations(lab);`,
    // loans
    `CREATE INDEX IF NOT EXISTS idx_library_loans_returned_loandate ON library_loans(returned, loan_date);`,
    `CREATE INDEX IF NOT EXISTS idx_library_loans_bookcode ON library_loans ((data->>'codigo'));`,
    // history
    `CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at);`,
    `CREATE INDEX IF NOT EXISTS idx_history_lab ON history(lab);`,
    `CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id);`
  ];

  try {
    await pool.query('SELECT NOW()');
    console.log('Conexión OK');

    await pool.query(createItems);
    await pool.query(createReservations);
    await pool.query(createLoans);
    await pool.query(createHistory);

    for (const sql of indexes) {
      await pool.query(sql);
    }

    console.log('Tablas e índices listos ✅');
  } catch (err) {
    console.error('Error al inicializar DB ❌:', err);
    throw err;
  }
}

module.exports = { pool, query, initDb };
