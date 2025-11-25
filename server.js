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
// DIRECTORIOS DE CONFIG (users.json)
// =========================================================
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CONFIG_DIR = path.join(DATA_DIR, 'config');
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

const USERS_PATH = path.join(CONFIG_DIR, 'users.json');
if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, '[]', 'utf8');

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
// API: PRÉSTAMOS BIBLIOTECA (PostgreSQL)
// =========================================================

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

// Registrar préstamo
app.post('/api/library/loan', requireLogin, canEditLibrary, async (req, res) => {
  const id = Date.now().toString();
  const data = { ...req.body };
  const userEmail = req.session.user ? req.session.user.email : null;
  const loanDate = new Date();

  try {
    await db.query(
      'INSERT INTO library_loans (id, data, user_email, loan_date, returned) VALUES ($1,$2::jsonb,$3,$4,$5)',
      [id, JSON.stringify(data), userEmail, loanDate, false]
    );

    const newLoan = {
      id,
      ...data,
      user: userEmail,
      loanDate,
      returned: false
    };

    await addHistory({
      lab: 'library',
      action: 'create-loan',
      entityType: 'loan',
      entityId: id,
      userEmail,
      data: newLoan
    });

    res.json({ message: 'Préstamo registrado', loan: newLoan });
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

    if (bookCode !== undefined) data.bookCode = bookCode;
    if (borrowerName !== undefined) data.borrowerName = borrowerName;
    if (borrowerCourse !== undefined) data.borrowerCourse = borrowerCourse;
    if (notes !== undefined) data.notes = notes;

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

// Registrar devolución
app.post(
  '/api/library/return/:loanId',
  requireLogin,
  canEditLibrary,
  async (req, res) => {
    const loanId = req.params.loanId;
    const returnDate = new Date();

    try {
      const { rows } = await db.query(
        'UPDATE library_loans SET returned = TRUE, return_date = $1 WHERE id = $2 RETURNING id, data, user_email, loan_date, returned, return_date',
        [returnDate, loanId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Préstamo no encontrado' });
      }

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
        userEmail: req.session.user.email,
        data: loan
      });

      res.json({ message: 'Préstamo devuelto', loan });
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
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
