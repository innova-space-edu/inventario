// db.js
const { Pool } = require('pg');

// dotenv solo en entornos locales
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
    console.log("dotenv cargado (modo local)");
  } catch (err) {
    console.warn("No se pudo cargar dotenv (modo local)");
  }
}

// Validación DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL no está definida. Configúrala en las variables de entorno o en tu archivo .env"
  );
}

// Render / Supabase requieren SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Query genérica
function query(text, params) {
  return pool.query(text, params);
}

// Inicialización de BD
async function initDb() {
  console.log("Inicializando base de datos...");

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
      lab TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      user_email TEXT,
      data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  try {
    await pool.query("SELECT NOW()");
    console.log("Conexión OK");

    await pool.query(createItems);
    await pool.query(createReservations);
    await pool.query(createLoans);
    await pool.query(createHistory);

    console.log("Tablas listas ✅");
  } catch (err) {
    console.error("Error al inicializar DB ❌:", err);
    throw err;
  }
}

module.exports = { query, initDb };
