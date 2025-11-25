// server.js — Inventario Colegio Providencia
// =========================================================
// SISTEMA ACTUALIZADO Y CORREGIDO
// =========================================================
// - Manejo de sesiones
// - Roles por laboratorio
// - PostgreSQL (items, reservas, préstamos)
// - Subida de fotos a Supabase Storage
// - Middlewares corregidos
// - Rutas totalmente funcionales
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

// Filtrar configuraciones incompletas
LAB_USERS = LAB_USERS.filter(u => u.email && u.password);

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn('⚠️ Falta ADMIN_EMAIL o ADMIN_PASSWORD en .env');
}

if (LAB_USERS.length === 0) {
  console.warn('⚠️ No hay usuarios de laboratorio configurados');
}

// =========================================================
// DIRECTORIOS DE CONFIG (para users.json)
// =========================================================
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CONFIG_DIR = path.join(DATA_DIR, 'config');

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

// Asegurar archivos mínimos
const jsonFiles = ['users.json'];
jsonFiles.forEach(f => {
  const p = path.join(CONFIG_DIR, f);
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]');
});

// =========================================================
// SUPABASE
// =========================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || 'inventario-fotos';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Falta configuración de Supabase');
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

// PUBLIC
app.use(express.static(path.join(__dirname, 'public')));
app.use('/config', express.static(CONFIG_DIR));

// =========================================================
// SISTEMA DE USUARIOS
// =========================================================
const USERS_PATH = path.join(CONFIG_DIR, 'users.json');

function loadUsers() {
  let users = [];

  try {
    users = JSON.parse(fs.readFileSync(USERS_PATH));
  } catch {
    users = [];
  }

  const baseUsers = [{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' }, ...LAB_USERS];

  baseUsers.forEach(u => {
    const exists = users.find(x => x.email === u.email);
    if (!exists) users.push(u);
    else {
      exists.password = u.password;
      exists.role = u.role;
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
  return role === 'admin' || role === lab;
}

function canEditLab(req, res, next) {
  const lab = req.params.lab;
  const user = req.session.user;

  if (!user) return res.status(401).json({ message: 'No autenticado' });
  if (!['science', 'computing', 'library'].includes(lab)) {
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
    return res.status(403).json({ message: 'No tienes permiso para editar biblioteca.' });
  }
  next();
}

// =========================================================
// LOGIN / LOGOUT
// =========================================================
app.get('/', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = loadUsers();

  const user = users.find(u => u.email === email && u.password === password);

  if (!user) return res.send('Credenciales incorrectas <a href="/login.html">Volver</a>');

  req.session.user = { email: user.email, role: user.role };
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// =========================================================
// API - SESSION INFO
// =========================================================
app.get('/api/session', (req, res) => {
  if (!req.session.user) return res.json({ email: null, role: null });
  res.json(req.session.user);
});

// =========================================================
// FOTO A SUPABASE
// =========================================================
const upload = multer({ storage: multer.memoryStorage() });

async function uploadToSupabase(file, lab) {
  if (!file) return null;

  const name = `${lab}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;

  const { error } = await supabase.storage
    .from(supabaseBucket)
    .upload(name, file.buffer, { contentType: file.mimetype });

  if (error) {
    console.error('Supabase upload error:', error);
    return null;
  }

  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(name);
  return data.publicUrl;
}

// =========================================================
// API - ITEMS (PGSQL)
// =========================================================
app.get('/api/:lab/items', requireLogin, async (req, res) => {
  const lab = req.params.lab;

  try {
    const { rows } = await db.query(`SELECT id, data, photo FROM items WHERE lab=$1 ORDER BY id`, [lab]);

    const items = rows.map(r => ({ id: r.id, ...r.data, photo: r.photo }));
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener items' });
  }
});

app.post('/api/:lab/items', requireLogin, canEditLab, upload.single('photo'), async (req, res) => {
  const lab = req.params.lab;
  const id = Date.now().toString();
  const data = { ...req.body };

  const photoUrl = await uploadToSupabase(req.file, lab);

  try {
    await db.query(`INSERT INTO items (id, lab, data, photo) VALUES ($1,$2,$3::jsonb,$4)`, [
      id,
      lab,
      JSON.stringify(data),
      photoUrl
    ]);

    res.json({ item: { id, ...data, photo: photoUrl } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al agregar item' });
  }
});

app.delete('/api/:lab/items/:id', requireLogin, canEditLab, async (req, res) => {
  try {
    const { rows } = await db.query(`DELETE FROM items WHERE id=$1 AND lab=$2 RETURNING id,data,photo`, [
      req.params.id,
      req.params.lab
    ]);

    if (!rows.length) return res.status(404).json({ message: 'Item no encontrado' });

    res.json({ item: { id: rows[0].id, ...rows[0].data, photo: rows[0].photo } });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar item' });
  }
});

// =========================================================
// API - RESERVAS
// =========================================================
app.get('/api/:lab/reservations', requireLogin, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id,data,user_email FROM reservations WHERE lab=$1 ORDER BY id`, [
      req.params.lab
    ]);

    res.json(rows.map(r => ({ id: r.id, ...r.data, user: r.user_email })));
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener reservas' });
  }
});

app.post('/api/:lab/reservations', requireLogin, canEditLab, async (req, res) => {
  const id = Date.now().toString();
  const data = { ...req.body };

  try {
    await db.query(
      `INSERT INTO reservations (id,lab,data,user_email) VALUES ($1,$2,$3::jsonb,$4)`,
      [id, req.params.lab, JSON.stringify(data), req.session.user.email]
    );

    res.json({ reservation: { id, ...data, user: req.session.user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Error al crear reserva' });
  }
});

// =========================================================
// API - PRÉSTAMOS BIBLIOTECA
// =========================================================
app.get('/api/library/loans', requireLogin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id,data,user_email,loan_date,returned,return_date FROM library_loans ORDER BY loan_date DESC NULLS LAST`
    );

    res.json(
      rows.map(r => ({
        id: r.id,
        ...r.data,
        user: r.user_email,
        loanDate: r.loan_date,
        returned: r.returned,
        returnDate: r.return_date
      }))
    );
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener préstamos' });
  }
});

app.post('/api/library/loan', requireLogin, canEditLibrary, async (req, res) => {
  const id = Date.now().toString();
  const loanDate = new Date();

  try {
    await db.query(
      `INSERT INTO library_loans (id,data,user_email,loan_date,returned)
       VALUES ($1,$2::jsonb,$3,$4,$5)`,
      [id, JSON.stringify(req.body), req.session.user.email, loanDate, false]
    );

    res.json({
      loan: { id, ...req.body, user: req.session.user.email, loanDate, returned: false }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error al registrar préstamo' });
  }
});

app.post('/api/library/return/:loanId', requireLogin, canEditLibrary, async (req, res) => {
  const returnDate = new Date();

  try {
    const { rows } = await db.query(
      `UPDATE library_loans SET returned=true, return_date=$1 WHERE id=$2 RETURNING id,data,user_email,loan_date,returned,return_date`,
      [returnDate, req.params.loanId]
    );

    if (!rows.length) return res.status(404).json({ message: 'Préstamo no encontrado' });

    const r = rows[0];
    res.json({
      loan: {
        id: r.id,
        ...r.data,
        user: r.user_email,
        loanDate: r.loan_date,
        returned: r.returned,
        returnDate: r.return_date
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error al registrar devolución' });
  }
});

// =========================================================
// INICIAR SERVIDOR
// =========================================================
db.initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Error inicializando la base de datos:', err);
    process.exit(1);
  });
