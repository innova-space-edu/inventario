// db.js
const { Pool } = require('pg');

// En local usamos dotenv para cargar DATABASE_URL desde .env
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
    console.log('dotenv cargado (entorno no producción)');
  } catch (e) {
    console.warn('No se pudo cargar dotenv. Asegúrate de tenerlo instalado si lo necesitas en local.');
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está definida. ' +
      'Configúrala en .env (local) o en las variables de entorno del servicio (por ejemplo, Render).'
  );
}

// Render Postgres / Supabase requieren SSL.
// Dejamos ssl: { rejectUnauthorized: false } siempre.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ejecutar consultas normales
function query(text, params) {
  return pool.query(text, params);
}

// Crear tablas si no existen (lo llamamos desde server.js)
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

  try {
    // Pequeña prueba de conexión rápida
    await pool.query('SELECT NOW()');
    console.log('Conexión a la base de datos establecida correctamente ✅');

    // Crear/verificar tablas
    await pool.query(createItems);
    await pool.query(createReservations);
    await pool.query(createLoans);

    console.log('Tablas verificadas/creadas correctamente ✅');
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err);
    // Re-lanzamos para que Render muestre el fallo y no parezca que todo está OK
    throw err;
  }
}

module.exports = {
  query,
  initDb
};
