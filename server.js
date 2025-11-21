// server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const db = require('./db'); // conexión a PostgreSQL (query, initDb)
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ================== ADMIN FIJO ==================
const ADMIN_EMAIL = 'Emorales@colprovidencia.cl';
const ADMIN_PASSWORD = '123456';

// ================== DIRECTORIOS DE DATOS (SOLO JSON, NO FOTOS) ==================
// Usamos DATA_DIR para JSON de usuarios y configuración.
// Las FOTOS ya NO se guardan en disco: se suben directo a Supabase Storage.
const DATA_DIR = process.env.DATA_DIR || __dirname;

const CONFIG_DIR = path.join(DATA_DIR, 'config');

// Crear carpeta de config si no existe
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Archivos JSON obligatorios (los de inventario ya no se usan, pero los dejamos)
const defaultJsonFiles = [
  'users.json',
  'science_items.json',
  'computing_items.json',
  'library_items.json',
  'science_reservations.json',
  'computing_reservations.json',
  'library_reservations.json',
  'library_loans.json'
];

defaultJsonFiles.forEach((fileName) => {
  const fullPath = path.join(CONFIG_DIR, fileName);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, '[]', 'utf8');
  } else {
    const data = fs.readFileSync(fullPath, 'utf8').trim();
    if (data === '') {
      fs.writeFileSync(fullPath, '[]', 'utf8');
    }
  }
});

// ================== SUPABASE (Postgres + Storage) ==================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || 'inventario-fotos';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ================== CORS ==================
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://innova-space-edu.github.io',
  'https://innova-space-edu.github.io/inventario',
  'https://inventario-u224.onrender.com'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  })
);

app.set('trust proxy', 1);

// ================== MIDDLEWARES BÁSICOS ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'inventario_secreto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// Archivos estáticos del frontend (HTML, CSS, JS de la app)
app.use(express.static(path.join(__dirname, 'public')));

// Servir también /config para casos donde el front lo use
app.use('/config', express.static(CONFIG_DIR));

// ================== USERS (LOGIN / REGISTRO) ==================
const usersDBPath = path.join(CONFIG_DIR, 'users.json');

function loadUsers() {
  if (!fs.existsSync(usersDBPath)) return [];

  try {
    const data = fs.readFileSync(usersDBPath, 'utf8').trim();
    const users = data ? JSON.parse(data) : [];
    const hasAdmin = users.some((u) => u.email === ADMIN_EMAIL);
    if (!hasAdmin) {
      users.push({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
      fs.writeFileSync(usersDBPath, JSON.stringify(users, null, 2));
    }
    return users;
  } catch (err) {
    console.error('Error leyendo users.json:', err);
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersDBPath, JSON.stringify(users, null, 2));
}

// Helpers viejos para JSON (se quedan por compatibilidad, aunque ya no los usamos para inventario)
function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = fs.readFileSync(filePath, 'utf8').trim();
    if (data === '') return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error leyendo archivo JSON:', filePath, err);
    return [];
  }
}

function writeJsonArray(filePath, arr) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo archivo JSON:', filePath, err);
  }
}

// ================== MIDDLEWARE LOGIN ==================
function requireLogin(req, res, next) {
  if (req.session.user) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  return res.redirect('/login.html');
}

// ================== RUTAS DE PÁGINAS ==================
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.user = { email: ADMIN_EMAIL, role: 'admin' };
    return res.redirect('/');
  }

  const users = loadUsers();
  const user = users.find((u) => u.email === email && u.password === password);

  if (user) {
    req.session.user = user;
    return res.redirect('/');
  } else {
    return res.send('Usuario o contraseña incorrectos. <a href="/login.html">Volver</a>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

// ================== UPLOADS (multer EN MEMORIA + SUPABASE) ==================
// Ya NO guardamos archivos en disco. Solo en buffer y directo a Supabase.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Laboratorios válidos
const VALID_LABS = ['science', 'computing', 'library'];

// Helper para subir foto a Supabase Storage y devolver URL pública
async function uploadToSupabase(file, lab) {
  if (!file) return null;

  const timestamp = Date.now();
  const safeName = file.originalname.replace(/\s+/g, '_');
  const filePath = `${lab}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(supabaseBucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (uploadError) {
    console.error('Error subiendo archivo a Supabase:', uploadError);
    return null;
  }

  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
  return data.publicUrl || null;
}

// ================== API: INVENTARIO POR LABORATORIO (PostgreSQL) ==================

// GET items
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

    const items = rows.map((row) => {
      const data = row.data || {};
      const item = { id: row.id, ...data };
      item.photo = row.photo || null; // aquí ya es URL (o null)
      return item;
    });

    return res.json(items);
  } catch (err) {
    console.error('Error al obtener items de', lab, err);
    return res.status(500).json({ message: 'Error al obtener items' });
  }
});

// POST item
app.post('/api/:lab/items', requireLogin, upload.single('photo'), async (req, res) => {
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
    // Si falla la foto, seguimos guardando el item sin foto
  }

  try {
    await db.query(
      'INSERT INTO items (id, lab, data, photo) VALUES ($1, $2, $3::jsonb, $4)',
      [id, lab, JSON.stringify(data), photoUrl]
    );

    const newItem = { id, ...data, photo: photoUrl };
    res.json({ message: 'Item agregado', item: newItem });
  } catch (err) {
    console.error('Error al agregar item en', lab, err);
    res.status(500).json({ message: 'Error al agregar item' });
  }
});

// DELETE item
app.delete('/api/:lab/items/:id', requireLogin, async (req, res) => {
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
    const data = row.data || {};
    const removed = { id: row.id, ...data, photo: row.photo || null };

    // NOTA: aquí podríamos borrar también la foto en Supabase usando la ruta.
    // Como estamos guardando la URL pública, tendríamos que parsear el path.
    // Para simplificar, por ahora NO borramos el archivo del bucket.

    return res.json({ message: 'Item eliminado', item: removed });
  } catch (err) {
    console.error('Error al eliminar item de', lab, err);
    return res.status(500).json({ message: 'Error al eliminar item' });
  }
});

// ================== API: RESERVAS DE LABORATORIO (PostgreSQL) ==================

// GET reservas
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

    const reservations = rows.map((row) => {
      const data = row.data || {};
      return {
        id: row.id,
        ...data,
        user: row.user_email || null
      };
    });

    return res.json(reservations);
  } catch (err) {
    console.error('Error al obtener reservas de', lab, err);
    return res.status(500).json({ message: 'Error al obtener reservas' });
  }
});

// POST reserva
app.post('/api/:lab/reservations', requireLogin, async (req, res) => {
  const lab = req.params.lab;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ message: 'Laboratorio no válido' });
  }

  const id = Date.now().toString();
  const data = { ...req.body };
  const userEmail = req.session.user ? req.session.user.email : null;

  try {
    await db.query(
      'INSERT INTO reservations (id, lab, data, user_email) VALUES ($1, $2, $3::jsonb, $4)',
      [id, lab, JSON.stringify(data), userEmail]
    );

    const newReservation = {
      id,
      ...data,
      user: userEmail
    };

    res.json({ message: 'Reserva creada', reservation: newReservation });
  } catch (err) {
    console.error('Error al crear reserva en', lab, err);
    res.status(500).json({ message: 'Error al crear reserva' });
  }
});

// ================== API: PRÉSTAMOS BIBLIOTECA (PostgreSQL) ==================

// GET préstamos
app.get('/api/library/loans', requireLogin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, data, user_email, loan_date, returned, return_date FROM library_loans ORDER BY loan_date DESC NULLS LAST, id'
    );

    const loans = rows.map((row) => {
      const data = row.data || {};
      return {
        id: row.id,
        ...data,
        user: row.user_email || null,
        loanDate: row.loan_date,
        returned: row.returned,
        returnDate: row.return_date
      };
    });

    return res.json(loans);
  } catch (err) {
    console.error('Error al obtener préstamos de biblioteca:', err);
    return res.status(500).json({ message: 'Error al obtener préstamos' });
  }
});

// Registrar préstamo
app.post('/api/library/loan', requireLogin, async (req, res) => {
  const id = Date.now().toString();
  const data = { ...req.body };
  const userEmail = req.session.user ? req.session.user.email : null;
  const loanDate = new Date();

  try {
    await db.query(
      'INSERT INTO library_loans (id, data, user_email, loan_date, returned) VALUES ($1, $2::jsonb, $3, $4, $5)',
      [id, JSON.stringify(data), userEmail, loanDate, false]
    );

    const newLoan = {
      id,
      ...data,
      user: userEmail,
      loanDate,
      returned: false
    };

    res.json({ message: 'Préstamo registrado', loan: newLoan });
  } catch (err) {
    console.error('Error al registrar préstamo de biblioteca:', err);
    res.status(500).json({ message: 'Error al registrar préstamo' });
  }
});

// Actualizar préstamo
app.put('/api/library/loan/:loanId', requireLogin, async (req, res) => {
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

    await db.query(
      'UPDATE library_loans SET data = $1::jsonb WHERE id = $2',
      [JSON.stringify(data), loanId]
    );

    const updatedLoan = {
      id: row.id,
      ...data,
      user: row.user_email || null,
      loanDate: row.loan_date,
      returned: row.returned,
      returnDate: row.return_date
    };

    res.json({ message: 'Préstamo actualizado', loan: updatedLoan });
  } catch (err) {
    console.error('Error al actualizar préstamo de biblioteca:', err);
    res.status(500).json({ message: 'Error al actualizar préstamo' });
  }
});

// Registrar devolución
app.post('/api/library/return/:loanId', requireLogin, async (req, res) => {
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

    res.json({ message: 'Préstamo devuelto', loan });
  } catch (err) {
    console.error('Error al registrar devolución de préstamo:', err);
    res.status(500).json({ message: 'Error al registrar devolución' });
  }
});

// Eliminar préstamo
app.delete('/api/library/loan/:loanId', requireLogin, async (req, res) => {
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

    res.json({ message: 'Préstamo eliminado', loan: removed });
  } catch (err) {
    console.error('Error al eliminar préstamo de biblioteca:', err);
    res.status(500).json({ message: 'Error al eliminar préstamo' });
  }
});

// ================== START SERVER (esperando a que la BD esté lista) ==================
db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
