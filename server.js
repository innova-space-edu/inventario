const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const db = require('./db'); // conexión a PostgreSQL (query, initDb)
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ================== ADMIN FIJO ==================
const ADMIN_EMAIL = 'Emorales@colprovidencia.cl';
const ADMIN_PASSWORD = '123456';

// ================== SUPABASE STORAGE ==================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'inventario-fotos';

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log('Supabase Storage habilitado para fotos ✅');
} else {
  console.warn(
    '⚠️ SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos. ' +
      'Se usarán solo uploads locales en /uploads.'
  );
}

// ================== DIRECTORIOS DE DATOS ==================
// Usamos DATA_DIR para JSON de usuarios y uploads. Aunque items/reservas/préstamos van a BD,
// mantenemos estos directorios para compatibilidad y para las fotos.
const DATA_DIR = process.env.DATA_DIR || __dirname;

const CONFIG_DIR = path.join(DATA_DIR, 'config');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Crear carpetas si no existen
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

// Carpeta de uploads (persistente si DATA_DIR apunta a un Disk)
app.use('/uploads', express.static(UPLOADS_DIR));

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

// ================== UPLOADS (multer) ==================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Laboratorios válidos
const VALID_LABS = ['science', 'computing', 'library'];

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

      if (row.photo) {
        // Si es URL completa (Supabase, http/https), la mandamos tal cual.
        if (/^https?:\/\//i.test(row.photo)) {
          item.photo = row.photo;
        } else {
          // Compatibilidad con fotos guardadas en disco local
          const photoPath = path.join(UPLOADS_DIR, row.photo);
          if (fs.existsSync(photoPath)) {
            item.photo = row.photo;
          } else {
            item.photo = null;
          }
        }
      } else {
        item.photo = null;
      }

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
  let photo = null;

  try {
    // 1) Guardamos el archivo en disco (como siempre)
    if (req.file) {
      const localFilename = req.file.filename;
      photo = localFilename; // valor por defecto (compatibilidad local)

      // 2) Si Supabase está configurado, subimos el archivo a Storage
      if (supabase) {
        try {
          const localPath = path.join(UPLOADS_DIR, localFilename);
          const fileBuffer = fs.readFileSync(localPath);
          const ext = path.extname(localFilename) || '';
          const supaName = `${lab}/${uuidv4()}${ext}`;

          const { error: uploadError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .upload(supaName, fileBuffer, {
              contentType: req.file.mimetype,
              upsert: false
            });

          if (uploadError) {
            console.error('Error al subir imagen a Supabase:', uploadError);
          } else {
            const { data: publicData } = supabase.storage
              .from(SUPABASE_BUCKET)
              .getPublicUrl(supaName);

            if (publicData && publicData.publicUrl) {
              photo = publicData.publicUrl; // guardamos la URL pública en BD
            }
          }
        } catch (e) {
          console.error('Error leyendo archivo local para subirlo a Supabase:', e);
        }
      }
    }

    await db.query(
      'INSERT INTO items (id, lab, data, photo) VALUES ($1, $2, $3::jsonb, $4)',
      [id, lab, JSON.stringify(data), photo]
    );

    const newItem = { id, ...data, photo };
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
