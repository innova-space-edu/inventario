// db.js
const { Pool } = require('pg');

// En local puedes usar dotenv para leer DATABASE_URL desde .env
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // si no existe dotenv no pasa nada
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// Función para ejecutar consultas normales
function query(text, params) {
  return pool.query(text, params);
}

// 🔹 Función que crea las tablas si no existen (se llama desde server.js)
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

  await pool.query(createItems);
  await pool.query(createReservations);
  await pool.query(createLoans);

  console.log('Tablas verificadas/creadas correctamente ✅');
}

module.exports = {
  query,
  initDb
};
