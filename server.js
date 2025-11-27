// server.js — Inventario Colegio Providencia
// =========================================================
// - Sesiones con express-session
// - Roles por laboratorio (admin, science, computing, library)
// - PostgreSQL (items, reservas, préstamos, historial)
// - Supabase Storage para fotos
// - /api/history para registrar y consultar movimientos
// =========================================================

const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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
  console.warn('⚠️ Falta ADMIN_EMAIL o ADMIN_PASSWORD en .env');
}
if (LAB_USERS.length === 0) {
  console.warn('⚠️ No hay usuarios de laboratorio configurados en .env');
}

const VALID_LABS = ['science', 'computing', 'library'];

// =========================================================
// DIRECTORIOS DE CONFIG (users.json, library_people.json)
// =========================================================
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CONFIG_DIR = path.join(DATA_DIR, 'config');
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

const USERS_PATH = path.join(CONFIG_DIR, 'users.json');
if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, '[]', 'utf8');

// ✅ NUEVO: archivo de personas de biblioteca (estudiantes/funcionarios)
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
  console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =========================================================
// CORS
// =========================================================
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://innova-space-edu.github.io',
      'https://innova-space-edu.github.io/inventario',
      'https://inventario-u224.onrender.com'
    ],
    credentials: true
  })
);

app.set('trust proxy', 1);

// =========================================================
// MIDDLEWARES
// =========================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    secret: 'inventario_super_secreto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// Static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/config', express.static(CONFIG_DIR));

// =========================================================
// USUARIOS (JSON + variables de entorno)
// =========================================================
function loadUsers() {
  let users = [];
  try {
    const txt = fs.readFileSync(USERS_PATH, 'utf8').trim();
    users = txt ? JSON.parse(txt) : [];
  } catch {
    users = [];
  }

  const baseUsers = [];
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    baseUsers.push({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
  }
  baseUsers.push(...LAB_USERS);

  baseUsers.forEach(u => {
    if (!u.email || !u.password) return;
    const existing = users.find(x => x.email === u.email);
    if (!existing) users.push(u);
    else {
      existing.password = u.password;
      existing.role = u.role;
    }
  });

  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
  return users;
}

function requireLogin(req, res, next) {
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
  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ message: 'Laboratorio no válido' });
  }
  if (!userCanEditLab(user.role, lab)) {
    return res.status(403).json({ message: 'No tienes permiso para editar esta sección.' });
  }
  next();
}

function canEditLibrary(req, res, next) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: 'No autenticado' });
  if (!userCanEditLab(user.role, 'library')) {
    return res.status(403).json({ message: 'No tienes permiso para editar la biblioteca.' });
  }
  next();
}

// =========================================================
// RUTAS DE PÁGINAS + SESIÓN
// =========================================================
app.get('/', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
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
  res.json(req.session.user);
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
/** HISTORIAL: helper + rutas /api/history */
// =========================================================

// ✅ NUEVO: garantizar que exista la tabla history
async function ensureHistoryTable() {
  try {
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
    console.log('Tabla history verificada/creada ✅');
  } catch (err) {
    console.error('❌ Error creando/verificando tabla history:', err);
    throw err;
  }
}

// Helper para insertar en tabla "history"
// Tabla esperada:
//  id (text PK) | lab (text) | action (text) | entity_type (text)
//  entity_id (text) | user_email (text) | created_at (timestamptz) | data (jsonb)
async function addHistory({ lab, action, entityType, entityId, userEmail, data }) {
  try {
    const id = Date.now().toString();
    const createdAt = new Date();

    await db.query(
      `INSERT INTO history (
        id, lab, action, entity_type, entity_id, user_email, created_at, data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [id, lab || null, action || null, entityType || null, entityId || null, userEmail || null, createdAt, JSON.stringify(data || {})]
    );
  } catch (err) {
    console.error('Error guardando historial:', err);
  }
}

// ✅ helper para cliente transaccional (usa db.pool)
function getPgClient() {
  if (!db.pool || typeof db.pool.connect !== 'function') {
    console.warn('⚠️ db.pool no está disponible. Asegúrate que db.js exporte el Pool de pg como "pool".');
    return null;
  }
  return db.pool.connect();
}

// GET /api/history?lab=&limit=
app.get('/api/history', requireLogin, async (req, res) => {
  const { lab, limit } = req.query;

  const params = [];
  let where = '';
  if (lab && lab !== 'all') {
    where = 'WHERE lab = $1';
    params.push(lab);
  }

  let sql =
    'SELECT id, lab, action, entity_type, entity_id, user_email, created_at, data FROM history ' +
    where +
    ' ORDER BY created_at DESC, id DESC';

  const lim = parseInt(limit, 10);
  if (!Number.isNaN(lim) && lim > 0 && lim <= 1000) {
    sql += ` LIMIT ${lim}`;
  } else {
    sql += ' LIMIT 100';
  }

  try {
    const { rows } = await db.query(sql, params);
    const logs = rows.map(r => ({
      id: r.id,
      lab: r.lab,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      user: r.user_email,
      createdAt: r.created_at,
      data: r.data
    }));
    res.json(logs);
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ message: 'Error al obtener historial' });
  }
});

// POST /api/history  (para logs manuales desde el front si quieres)
app.post('/api/history', requireLogin, async (req, res) => {
  const userEmail = req.session.user ? req.session.user.email : null;
  const {
    module,
    lab,
    action,
    type,
    entityType,
    entity_id,
    entityId,
    detail,
    ...rest
  } = req.body;

  const finalLab = lab || module || null;
  const finalEntityType = entityType || type || null;
  const finalEntityId = entityId || entity_id || null;

  await addHistory({
    lab: finalLab,
    action: action || null,
    entityType: finalEntityType,
    entityId: finalEntityId,
    userEmail,
    data: { detail, ...rest }
  });

  res.json({ message: 'Historial registrado' });
});

// =========================================================
// API: ITEMS (PostgreSQL)
// =========================================================
app.get('/api/:lab/items', requireLogin, async (req, res) => {
  const lab = req.params.lab;
  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ message: 'Laboratorio no válido' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, data, photo FROM items WHERE lab = $1 ORDER BY id',
      [lab]
    );

    const items = rows.map(r => ({ id: r.id, ...r.data, photo: r.photo || null }));
    res.json(items);
  } catch (err) {
    console.error('Error al obtener items de', lab, err);
    res.status(500).json({ message: 'Error al obtener items' });
  }
});

app.post(
  '/api/:lab/items',
  requireLogin,
  canEditLab,
  upload.single('photo'),
  async (req, res) => {
    const lab = req.params.lab;
    if (!VALID_LABS.includes(lab)) {
      return res.status(400).json({ message: 'Laboratorio no válido' });
    }

    const id = Date.now().toString();
    const data = { ...req.body };
    let photoUrl = null;

    try {
      photoUrl = await uploadToSupabase(req.file, lab);
    } catch (err) {
      console.error('Error en uploadToSupabase:', err);
    }

    try {
      await db.query(
        'INSERT INTO items (id, lab, data, photo) VALUES ($1,$2,$3::jsonb,$4)',
        [id, lab, JSON.stringify(data), photoUrl]
      );

      const newItem = { id, ...data, photo: photoUrl };

      // Historial
      await addHistory({
        lab,
        action: 'create-item',
        entityType: 'item',
        entityId: id,
        userEmail: req.session.user.email,
        data: newItem
      });

      res.json({ message: 'Item agregado', item: newItem });
    } catch (err) {
      console.error('Error al agregar item en', lab, err);
      res.status(500).json({ message: 'Error al agregar item' });
    }
  }
);

app.delete('/api/:lab/items/:id', requireLogin, canEditLab, async (req, res) => {
  const lab = req.params.lab;
  const id = req.params.id;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ message: 'Laboratorio no válido' });
  }

  try {
    const { rows } = await db.query(
      'DELETE FROM items WHERE id = $1 AND lab = $2 RETURNING id, data, photo',
      [id, lab]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Item no encontrado' });
    }

    const row = rows[0];
    const removed = { id: row.id, ...row.data, photo: row.photo || null };

    await addHistory({
      lab,
      action: 'delete-item',
      entityType: 'item',
      entityId: id,
      userEmail: req.session.user.email,
      data: removed
    });

    res.json({ message: 'Item eliminado', item: removed });
  } catch (err) {
    console.error('Error al eliminar item de', lab, err);
    res.status(500).json({ message: 'Error al eliminar item' });
  }
});

// =========================================================
// API: RESERVAS (PostgreSQL)
// =========================================================
app.get('/api/:lab/reservations', requireLogin, async (req, res) => {
  const lab = req.params.lab;
  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ message: 'Laboratorio no válido' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, data, user_email FROM reservations WHERE lab = $1 ORDER BY id',
      [lab]
    );

    const reservations = rows.map(r => ({
      id: r.id,
      ...r.data,
      user: r.user_email || null
    }));

    res.json(reservations);
  } catch (err) {
    console.error('Error al obtener reservas de', lab, err);
    res.status(500).json({ message: 'Error al obtener reservas' });
  }
});

app.post('/api/:lab/reservations', requireLogin, canEditLab, async (req, res) => {
  const lab = req.params.lab;
  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ message: 'Laboratorio no válido' });
  }

  const id = Date.now().toString();
  const data = { ...req.body };
  const userEmail = req.session.user ? req.session.user.email : null;

  try {
    await db.query(
      'INSERT INTO reservations (id, lab, data, user_email) VALUES ($1,$2,$3::jsonb,$4)',
      [id, lab, JSON.stringify(data), userEmail]
    );

    const newRes = { id, ...data, user: userEmail };

    await addHistory({
      lab,
      action: 'create-reservation',
      entityType: 'reservation',
      entityId: id,
      userEmail,
      data: newRes
    });

    res.json({ message: 'Reserva creada', reservation: newRes });
  } catch (err) {
    console.error('Error al crear reserva en', lab, err);
    res.status(500).json({ message: 'Error al crear reserva' });
  }
});

// =========================================================
// API: PERSONAS BIBLIOTECA (JSON library_people.json)
// =========================================================

// Obtener todas las personas (estudiantes/funcionarios)
app.get('/api/library/people', requireLogin, (req, res) => {
  const people = loadLibraryPeople();
  res.json(people);
});

// Crear persona
app.post('/api/library/people', requireLogin, canEditLibrary, async (req, res) => {
  const { id: rawId, nombre, tipo, curso } = req.body;

  if (!nombre || !tipo) {
    return res.status(400).json({ message: 'Nombre y tipo son obligatorios.' });
  }

  let id = rawId && rawId.trim() ? rawId.trim() : null;
  const people = loadLibraryPeople();

  // Si no se entrega ID, generamos uno automático
  if (!id) {
    const prefix = tipo === 'funcionario' ? 'FUNC' : 'STU';
    let counter = 1;
    do {
      id = `${prefix}-${String(counter).padStart(3, '0')}`;
      counter += 1;
    } while (people.some(p => p.id === id));
  } else {
    // Si se entrega ID y ya existe, error
    if (people.some(p => p.id === id)) {
      return res.status(409).json({ message: 'Ya existe una persona con ese ID.' });
    }
  }

  const person = {
    id,
    nombre: nombre.trim(),
    tipo: tipo.trim(),
    curso: (curso || '').trim()
  };

  people.push(person);
  saveLibraryPeople(people);

  await addHistory({
    lab: 'library',
    action: 'create-person',
    entityType: 'person',
    entityId: id,
    userEmail: req.session.user.email,
    data: person
  });

  res.json({ message: 'Persona creada', person });
});

// Actualizar persona
app.put('/api/library/people/:id', requireLogin, canEditLibrary, async (req, res) => {
  const { id } = req.params;
  const { nombre, tipo, curso } = req.body;

  const people = loadLibraryPeople();
  const index = people.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ message: 'Persona no encontrada.' });
  }

  if (nombre !== undefined) people[index].nombre = nombre.trim();
  if (tipo !== undefined) people[index].tipo = tipo.trim();
  if (curso !== undefined) people[index].curso = curso.trim();

  saveLibraryPeople(people);

  await addHistory({
    lab: 'library',
    action: 'update-person',
    entityType: 'person',
    entityId: id,
    userEmail: req.session.user.email,
    data: people[index]
  });

  res.json({ message: 'Persona actualizada', person: people[index] });
});

// Eliminar persona
app.delete('/api/library/people/:id', requireLogin, canEditLibrary, async (req, res) => {
  const { id } = req.params;
  const people = loadLibraryPeople();
  const index = people.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ message: 'Persona no encontrada.' });
  }

  const removed = people.splice(index, 1)[0];
  saveLibraryPeople(people);

  await addHistory({
    lab: 'library',
    action: 'delete-person',
    entityType: 'person',
    entityId: id,
    userEmail: req.session.user.email,
    data: removed
  });

  res.json({ message: 'Persona eliminada', person: removed });
});

// =========================================================
// API: PRÉSTAMOS BIBLIOTECA (PostgreSQL)
// =========================================================

// ✅ NUEVO: préstamos vencidos (> 7 días) para el banner
app.get('/api/library/overdue', requireLogin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `
      SELECT id, data, user_email, loan_date, returned, return_date
      FROM library_loans
      WHERE returned = FALSE
        AND loan_date < NOW() - INTERVAL '7 days'
      ORDER BY loan_date ASC, id
      `
    );

    const overdue = rows.map(r => ({
      id: r.id,
      ...r.data,
      user: r.user_email || null,
      loanDate: r.loan_date,
      returned: r.returned,
      returnDate: r.return_date
    }));

    res.json(overdue);
  } catch (err) {
    console.error('Error al obtener préstamos vencidos de biblioteca:', err);
    res.status(500).json({ message: 'Error al obtener préstamos vencidos' });
  }
});

// GET préstamos
app.get('/api/library/loans', requireLogin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, data, user_email, loan_date, returned, return_date FROM library_loans ORDER BY loan_date DESC NULLS LAST, id'
    );

    const loans = rows.map(r => ({
      id: r.id,
      ...r.data,
      user: r.user_email || null,
      loanDate: r.loan_date,
      returned: r.returned,
      returnDate: r.return_date
    }));

    res.json(loans);
  } catch (err) {
    console.error('Error al obtener préstamos de biblioteca:', err);
    res.status(500).json({ message: 'Error al obtener préstamos' });
  }
});

// ⬇️⬇️⬇️ REEMPLAZO — Registrar préstamo (con control de stock, transacción)
app.post('/api/library/loan', requireLogin, canEditLibrary, async (req, res) => {
  const id = Date.now().toString();
  const raw = { ...req.body };
  const userEmail = req.session.user ? req.session.user.email : null;
  const loanDate = new Date();

  try {
    // Normalización de campos
    let codigo = (raw.codigo || raw.bookCode || '').trim();
    let nombre = (raw.nombre || raw.borrowerName || '').trim();
    let curso = (raw.curso || raw.borrowerCourse || '').trim();
    let observaciones = (raw.observaciones || raw.notes || '').trim();

    const personaId = raw.personaId || raw.personId || null;
    let tipoPersona = raw.tipoPersona || raw.personType || null;

    // Si viene personaId y faltan nombre/curso, completamos desde library_people.json
    if (personaId && (!nombre || !curso || !tipoPersona)) {
      const people = loadLibraryPeople();
      const found = people.find(p => p.id === personaId);
      if (found) {
        if (!nombre) nombre = found.nombre || nombre;
        if (!curso) curso = found.curso || curso;
        if (!tipoPersona) tipoPersona = found.tipo || tipoPersona;
      }
    }

    if (!codigo) {
      return res.status(400).json({ message: 'Falta el código del libro/material.' });
    }

    // Construimos el objeto de datos
    const data = {
      codigo,
      nombre,
      curso,
      observaciones,
      personaId: personaId || undefined,
      tipoPersona: tipoPersona || undefined,
      // alias compatibilidad
      bookCode: codigo,
      borrowerName: nombre,
      borrowerCourse: curso,
      notes: observaciones
    };

    // Transacción para controlar stock
    const client = await getPgClient();
    if (!client) {
      // Fallback sin transacción (no recomendado, deja aviso):
      console.warn('⚠️ Préstamo sin transacción: db.pool no disponible, no se ajustará stock automáticamente.');
      await db.query(
        'INSERT INTO library_loans (id, data, user_email, loan_date, returned) VALUES ($1,$2::jsonb,$3,$4,$5)',
        [id, JSON.stringify(data), userEmail, loanDate, false]
      );

      const newLoan = { id, ...data, user: userEmail, loanDate, returned: false };
      await addHistory({
        lab: 'library',
        action: 'create-loan',
        entityType: 'loan',
        entityId: id,
        userEmail,
        data: newLoan
      });
      return res.json({ message: 'Préstamo registrado (sin control de stock)', loan: newLoan });
    }

    try {
      await client.query('BEGIN');

      // 1) Buscar item por código (lab=library)
      const qItem = await client.query(
        `SELECT id, data, photo
         FROM items
         WHERE lab='library' AND data->>'codigo' = $1
         FOR UPDATE`,
        [codigo]
      );
      if (qItem.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: `No existe un item en Biblioteca con código "${codigo}".` });
      }

      const itemRow = qItem.rows[0];
      const itemData = itemRow.data || {};
      const cant = parseInt(itemData.cantidad, 10);
      if (Number.isNaN(cant) || cant <= 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `Sin stock disponible para el código "${codigo}".` });
      }

      // 2) Descontar 1 del stock
      const nuevaCant = cant - 1;
      itemData.cantidad = nuevaCant;
      await client.query(
        `UPDATE items
         SET data = $1::jsonb
         WHERE id = $2 AND lab='library'`,
        [JSON.stringify(itemData), itemRow.id]
      );

      // 3) Crear préstamo
      await client.query(
        `INSERT INTO library_loans (id, data, user_email, loan_date, returned)
         VALUES ($1, $2::jsonb, $3, $4, FALSE)`,
        [id, JSON.stringify(data), userEmail, loanDate]
      );

      // 4) Historial
      await addHistory({
        lab: 'library',
        action: 'create-loan',
        entityType: 'loan',
        entityId: id,
        userEmail,
        data: { ...data, linkedItemId: itemRow.id }
      });

      await client.query('COMMIT');

      const newLoan = { id, ...data, user: userEmail, loanDate, returned: false };
      res.json({ message: 'Préstamo registrado', loan: newLoan });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error al registrar préstamo (tx):', err);
      res.status(500).json({ message: 'Error al registrar préstamo' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error al registrar préstamo de biblioteca:', err);
    res.status(500).json({ message: 'Error al registrar préstamo' });
  }
});

// Actualizar préstamo (datos, no estado devuelto)
app.put('/api/library/loan/:loanId', requireLogin, canEditLibrary, async (req, res) => {
  const loanId = req.params.loanId;
  const { bookCode, borrowerName, borrowerCourse, notes } = req.body;

  try {
    const { rows } = await db.query(
      'SELECT id, data, user_email, loan_date, returned, return_date FROM library_loans WHERE id = $1',
      [loanId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Préstamo no encontrado' });
    }

    const row = rows[0];
    const data = row.data || {};

    if (bookCode !== undefined) {
      data.bookCode = bookCode;
      data.codigo = bookCode;
    }
    if (borrowerName !== undefined) {
      data.borrowerName = borrowerName;
      data.nombre = borrowerName;
    }
    if (borrowerCourse !== undefined) {
      data.borrowerCourse = borrowerCourse;
      data.curso = borrowerCourse;
    }
    if (notes !== undefined) {
      data.notes = notes;
      data.observaciones = notes;
    }

    await db.query('UPDATE library_loans SET data = $1::jsonb WHERE id = $2', [
      JSON.stringify(data),
      loanId
    ]);

    const updatedLoan = {
      id: row.id,
      ...data,
      user: row.user_email || null,
      loanDate: row.loan_date,
      returned: row.returned,
      returnDate: row.return_date
    };

    await addHistory({
      lab: 'library',
      action: 'update-loan',
      entityType: 'loan',
      entityId: loanId,
      userEmail: req.session.user.email,
      data: updatedLoan
    });

    res.json({ message: 'Préstamo actualizado', loan: updatedLoan });
  } catch (err) {
    console.error('Error al actualizar préstamo de biblioteca:', err);
    res.status(500).json({ message: 'Error al actualizar préstamo' });
  }
});

// ⬇️⬇️⬇️ REEMPLAZO — Registrar devolución (suma stock, transacción)
app.post(
  '/api/library/return/:loanId',
  requireLogin,
  canEditLibrary,
  async (req, res) => {
    const loanId = req.params.loanId;
    const userEmail = req.session.user ? req.session.user.email : null;
    const returnDate = new Date();

    try {
      const client = await getPgClient();
      if (!client) {
        // Fallback sin transacción (no recomendado, deja aviso y no suma stock):
        console.warn('⚠️ Devolución sin transacción: db.pool no disponible, no se ajustará stock automáticamente.');
        const { rows } = await db.query(
          'UPDATE library_loans SET returned = TRUE, return_date = $1 WHERE id = $2 RETURNING id, data, user_email, loan_date, returned, return_date',
          [returnDate, loanId]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Préstamo no encontrado' });

        const row = rows[0];
        const data = row.data || {};
        const loan = {
          id: row.id,
          ...data,
          user: row.user_email || null,
          loanDate: row.loan_date,
          returned: row.returned,
          returnDate: row.return_date
        };

        await addHistory({
          lab: 'library',
          action: 'return-loan',
          entityType: 'loan',
          entityId: loanId,
          userEmail,
          data: loan
        });

        return res.json({ message: 'Préstamo devuelto (sin ajuste de stock)', loan });
      }

      try {
        await client.query('BEGIN');

        // 1) Leer préstamo
        const qLoan = await client.query(
          `SELECT id, data, user_email, loan_date, returned, return_date
           FROM library_loans WHERE id = $1 FOR UPDATE`,
          [loanId]
        );
        if (qLoan.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: 'Préstamo no encontrado' });
        }
        const loanRow = qLoan.rows[0];
        const loanData = loanRow.data || {};
        const codigo = (loanData.codigo || loanData.bookCode || '').trim();

        // 2) Marcar devuelto
        await client.query(
          `UPDATE library_loans
           SET returned = TRUE, return_date = $1
           WHERE id = $2`,
          [returnDate, loanId]
        );

        // 3) Sumar stock si existe el ítem
        if (codigo) {
          const qItem = await client.query(
            `SELECT id, data
             FROM items
             WHERE lab='library' AND data->>'codigo' = $1
             FOR UPDATE`,
            [codigo]
          );
          if (qItem.rows.length > 0) {
            const itemRow = qItem.rows[0];
            const itemData = itemRow.data || {};
            const cant = parseInt(itemData.cantidad, 10) || 0;
            itemData.cantidad = cant + 1;

            await client.query(
              `UPDATE items
               SET data = $1::jsonb
               WHERE id = $2 AND lab='library'`,
              [JSON.stringify(itemData), itemRow.id]
            );
          }
        }

        // 4) Historial
        await addHistory({
          lab: 'library',
          action: 'return-loan',
          entityType: 'loan',
          entityId: loanId,
          userEmail,
          data: { codigo }
        });

        await client.query('COMMIT');

        // Responder en el formato que espera el front:
        const loan = {
          id: loanRow.id,
          ...loanData,
          user: loanRow.user_email || null,
          loanDate: loanRow.loan_date,
          returned: true,
          returnDate
        };
        res.json({ message: 'Préstamo devuelto', loan });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al registrar devolución (tx):', err);
        res.status(500).json({ message: 'Error al registrar devolución' });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Error al registrar devolución de préstamo:', err);
      res.status(500).json({ message: 'Error al registrar devolución' });
    }
  }
);

// Eliminar préstamo
app.delete(
  '/api/library/loan/:loanId',
  requireLogin,
  canEditLibrary,
  async (req, res) => {
    const loanId = req.params.loanId;

    try {
      const { rows } = await db.query(
        'DELETE FROM library_loans WHERE id = $1 RETURNING id, data, user_email, loan_date, returned, return_date',
        [loanId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Préstamo no encontrado' });
      }

      const row = rows[0];
      const data = row.data || {};

      const removed = {
        id: row.id,
        ...data,
        user: row.user_email || null,
        loanDate: row.loan_date,
        returned: row.returned,
        returnDate: row.return_date
      };

      await addHistory({
        lab: 'library',
        action: 'delete-loan',
        entityType: 'loan',
        entityId: loanId,
        userEmail: req.session.user.email,
        data: removed
      });

      res.json({ message: 'Préstamo eliminado', loan: removed });
    } catch (err) {
      console.error('Error al eliminar préstamo de biblioteca:', err);
      res.status(500).json({ message: 'Error al eliminar préstamo' });
    }
  }
);

// =========================================================
// INICIAR SERVIDOR
// =========================================================
db.initDb()
  .then(async () => {
    // ✅ Nos aseguramos también aquí de que history exista
    await ensureHistoryTable();

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
