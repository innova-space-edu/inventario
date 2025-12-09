// server.js — Inventario Colegio Providencia
// =========================================================
// - Sesiones con express-session + bcrypt
// - Roles por laboratorio (admin, science, computing, library)
// - PostgreSQL (items, reservas, préstamos, historial)
// - Supabase Storage para fotos
// - Rutas modulares (routes/)
// - Migración automática de JSONs legacy
// =========================================================

const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'); // ← NUEVO: seguridad de contraseñas
const db = require('./db');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================
// VARIABLES DE ENTORNO (ADMIN + ROLES)
// =========================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

let LAB_USERS = [
  { email: process.env.SCIENCE_EMAIL, password: process.env.SCIENCE_PASSWORD, role: 'science' },
  { email: process.env.COMPUTING_EMAIL, password: process.env.COMPUTING_PASSWORD, role: 'computing' },
  { email: process.env.LIBRARY_EMAIL, password: process.env.LIBRARY_PASSWORD, role: 'library' }
];
LAB_USERS = LAB_USERS.filter(u => u.email && u.password);

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn('Falta ADMIN_EMAIL o ADMIN_PASSWORD en .env');
}
if (LAB_USERS.length === 0) {
  console.warn('No hay usuarios de laboratorio configurados en .env');
}

const VALID_LABS = ['science', 'computing', 'library'];

// =========================================================
// DIRECTORIOS DE CONFIG
// =========================================================
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CONFIG_DIR = path.join(DATA_DIR, 'config');
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

const USERS_PATH = path.join(CONFIG_DIR, 'users.json');
if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, '[]', 'utf8');

const LIBRARY_PEOPLE_PATH = path.join(CONFIG_DIR, 'library_people.json');
if (!fs.existsSync(LIBRARY_PEOPLE_PATH)) {
  fs.writeFileSync(LIBRARY_PEOPLE_PATH, '[]', 'utf8');
}

// Helpers para personas biblioteca
function loadLibraryPeople() {
  try {
    const txt = fs.readFileSync(LIBRARY_PEOPLE_PATH, 'utf8').trim();
    return txt ? JSON.parse(txt) : [];
  } catch (err) {
    console.error('Error leyendo library_people.json:', err);
    return [];
  }
}
function saveLibraryPeople(people) {
  try {
    fs.writeFileSync(LIBRARY_PEOPLE_PATH, JSON.stringify(people, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando library_people.json:', err);
  }
}

// =========================================================
// SUPABASE
// =========================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || 'inventario-fotos';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =========================================================
// CORS
// =========================================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://innova-space-edu.github.io',
  'https://innova-space-edu.github.io/inventario',
  'https://inventario-u224.onrender.com'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.set('trust proxy', 1);

// =========================================================
// MIDDLEWARES
// =========================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'inventario_super_secreto',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/config', express.static(CONFIG_DIR));

// =========================================================
// CARGA DE USUARIOS + HASH DE CONTRASEÑAS
// =========================================================
async function loadUsers() {
  let users = [];
  try {
    const txt = fs.readFileSync(USERS_PATH, 'utf8').trim();
    users = txt ? JSON.parse(txt) : [];
  } catch (err) {
    console.warn('No se pudo leer users.json, se creará uno nuevo');
    users = [];
  }

  const baseUsers = [];
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    baseUsers.push({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
  }
  baseUsers.push(...LAB_USERS);

  for (const u of baseUsers) {
    if (!u.email || !u.password) continue;

    const existing = users.find(x => x.email === u.email);
    if (!existing) {
      // Hashear contraseña nueva
      const hashed = await bcrypt.hash(u.password, 10);
      users.push({ email: u.email, password: hashed, role: u.role || 'viewer' });
    } else {
      // Si ya existe pero contraseña en texto plano → hashear
      if (!existing.password.startsWith('$2a$')) {
        existing.password = await bcrypt.hash(u.password, 10);
        existing.role = u.role || existing.role;
      }
    }
  }

  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
  return users;
}

// =========================================================
// AUTENTICACIÓN Y PERMISOS
// =========================================================
async function requireLogin(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ message: 'No autenticado' });
  }
  return res.redirect('/login.html');
}

function userCanEditLab(role, lab) {
  if (role === 'admin') return true;
  return role === lab;
}

function canEditLab(req, res, next) {
  const user = req.session.user;
  const lab = req.params.lab;
  if (!user) return res.status(401).json({ message: 'No autenticado' });
  if (!VALID_LABS.includes(lab)) return res.status(400).json({ message: 'Laboratorio no válido' });
  if (!userCanEditLab(user.role, lab)) {
    return res.status(403).json({ message: 'No tienes permiso para editar esta sección.' });
  }
  next();
}

function canEditScience(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'No autenticado' });
  if (!userCanEditLab(req.session.user.role, 'science')) {
    return res.status(403).json({ message: 'No tienes permiso para editar Ciencias.' });
  }
  next();
}

function canEditComputing(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'No autenticado' });
  if (!userCanEditLab(req.session.user.role, 'computing')) {
    return res.status(403).json({ message: 'No tienes permiso para editar Computación.' });
  }
  next();
}

function canEditLibrary(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'No autenticado' });
  if (!userCanEditLab(req.session.user.role, 'library')) {
    return res.status(403).json({ message: 'No tienes permiso para editar Biblioteca.' });
  }
  next();
}

// =========================================================
// RUTAS DE PÁGINAS + SESIÓN
// =========================================================
app.get('/', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await loadUsers();
  const user = users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.send('Usuario o contraseña incorrectos. <a href="/login.html">Volver</a>');
  }

  req.session.user = { email: user.email, role: user.role || 'viewer' };
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

app.get('/api/session', (req, res) => {
  if (!req.session.user) return res.json({ email: null, role: null });
  res.json({
    email: req.session.user.email,
    role: req.session.user.role,
    name: req.session.user.name || 'Usuario'  // opcional, para el banner
  });
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: true });
  } catch (err) {
    console.error('Healthcheck DB error:', err);
    res.status(500).json({ status: 'error', db: false });
  }
});

// =========================================================
// SUBIDA DE FOTOS A SUPABASE
// =========================================================
const upload = multer({ storage: multer.memoryStorage() });

async function uploadToSupabase(file, lab) {
  if (!file) return null;
  const filePath = `${lab}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
  const { error } = await supabase.storage
    .from(supabaseBucket)
    .upload(filePath, file.buffer, { contentType: file.mimetype });
  if (error) {
    console.error('Error subiendo archivo a Supabase:', error);
    return null;
  }
  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
  return data.publicUrl || null;
}

// =========================================================
// HISTORIAL
// =========================================================
async function ensureHistoryTable() {
  await db.query(`
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
  `);
}

async function addHistory({ lab, action, entityType, entityId, userEmail, data }) {
  try {
    const id = Date.now().toString();
    await db.query(
      `INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [id, lab || null, action || null, entityType || null, entityId || null, userEmail || null, JSON.stringify(data || {})]
    );
  } catch (err) {
    console.error('Error guardando historial:', err);
  }
}

function getPgClient() {
  if (!db.pool || typeof db.pool.connect !== 'function') {
    console.warn('db.pool no disponible');
    return null;
  }
  return db.pool.connect();
}

// =========================================================
// MONTAR ROUTERS MODULARES (¡ELIMINA TODA LA DUPLICACIÓN!)
// =========================================================
const computingRoutes = require('./routes/computingRoutes');
const libraryRoutes    = require('./routes/libraryRoutes');
const scienceRoutes    = require('./routes/scienceRoutes');
const historyRoutes    = require('./routes/historyRoutes');

app.use('/api/computing', requireLogin, computingRoutes);
app.use('/api/library',    requireLogin, libraryRoutes);
app.use('/api/science',    requireLogin, scienceRoutes);
app.use('/api/history',    requireLogin, historyRoutes);

// =========================================================
// MIGRACIÓN AUTOMÁTICA DE JSONs LEGACY
// =========================================================
async function migrateLegacyData() {
  console.log('Migrando datos legacy (JSON → PostgreSQL)...');
  const configDir = path.join(__dirname, 'config');
  const mappings = [
    { file: 'computing_loans.json', table: 'computing_loans' },
    { file: 'library_loans.json',   table: 'library_loans' },
    { file: 'science_loans.json',   table: 'science_loans' }
  ];

  for (const { file, table } of mappings) {
    const filePath = path.join(configDir, file);
    if (!fs.existsSync(filePath)) continue;

    const raw = fs.readFileSync(filePath, 'utf8');
    const items = JSON.parse(raw);

    for (const item of items) {
      await db.query(`
        INSERT INTO ${table} (id, data, user_email, loan_date, returned)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [
        item.id?.toString() || Date.now().toString(),
        item,
        item.user || 'legacy@import',
        item.fecha_prestamo || new Date(),
        !!item.devuelto
      ]);
    }
  }
  console.log('Migración completada');
}

// =========================================================
// INICIAR SERVIDOR
// =========================================================
db.initDb()
  .then(async () => {
    await ensureHistoryTable();
    await migrateLegacyData(); // ← ¡NUEVO!
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    app.listen(PORT);
  })
  .catch(err => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
