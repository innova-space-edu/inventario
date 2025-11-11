const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin fijo
const ADMIN_EMAIL = 'Emorales@colprovidencia.cl';
const ADMIN_PASSWORD = '123456';

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'inventario_secreto',
    resave: false,
    saveUninitialized: false
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// *** NUEVO: servir la carpeta /config para que el frontend pueda cargar los *.json ***
// Esto permite que las rutas como /config/library_items.json funcionen en el navegador.
app.use('/config', express.static(path.join(__dirname, 'config')));

// Configure file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Simple user database (JSON file)
const usersDBPath = path.join(__dirname, 'config', 'users.json');

function loadUsers() {
    if (!fs.existsSync(usersDBPath)) return [];

    try {
        const data = fs.readFileSync(usersDBPath);
        const users = JSON.parse(data);

        // Aseguramos que el admin fijo esté también en el archivo si quieres
        const hasAdmin = users.some(u => u.email === ADMIN_EMAIL);
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

// Middleware to check if user is logged in
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    next();
}

// Routes
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // 1) Validar admin fijo
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        req.session.user = { email: ADMIN_EMAIL, role: 'admin' };
        return res.redirect('/');
    }

    // 2) Buscar en users.json (para otros usuarios si quieres)
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        req.session.user = user;
        return res.redirect('/');
    } else {
        // Respuesta simple (puedes mejorarla más adelante)
        return res.send('Usuario o contraseña incorrectos. <a href="/login.html">Volver</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// API endpoints for adding and removing items
app.post('/api/:lab/items', requireLogin, upload.single('photo'), (req, res) => {
    const lab = req.params.lab; // 'science', 'computing', 'library'
    const itemsFile = path.join(__dirname, 'config', `${lab}_items.json`);
    const items = fs.existsSync(itemsFile) ? JSON.parse(fs.readFileSync(itemsFile)) : [];

    const newItem = {
        id: Date.now().toString(),
        ...req.body,
        photo: req.file ? req.file.filename : null
    };
    items.push(newItem);
    fs.writeFileSync(itemsFile, JSON.stringify(items, null, 2));
    res.json({ message: 'Item agregado', item: newItem });
});

app.delete('/api/:lab/items/:id', requireLogin, (req, res) => {
    const lab = req.params.lab;
    const itemsFile = path.join(__dirname, 'config', `${lab}_items.json`);
    const items = fs.existsSync(itemsFile) ? JSON.parse(fs.readFileSync(itemsFile)) : [];
    const itemIndex = items.findIndex(i => i.id === req.params.id);
    if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item no encontrado' });
    }
    const [removed] = items.splice(itemIndex, 1);
    fs.writeFileSync(itemsFile, JSON.stringify(items, null, 2));
    res.json({ message: 'Item eliminado', item: removed });
});

// Endpoint for scheduling/reservations
app.post('/api/:lab/reservations', requireLogin, (req, res) => {
    const lab = req.params.lab;
    const reservationsFile = path.join(__dirname, 'config', `${lab}_reservations.json`);
    const reservations = fs.existsSync(reservationsFile) ? JSON.parse(fs.readFileSync(reservationsFile)) : [];
    const newReservation = {
        id: Date.now().toString(),
        ...req.body,
        user: req.session.user.email
    };
    reservations.push(newReservation);
    fs.writeFileSync(reservationsFile, JSON.stringify(reservations, null, 2));
    res.json({ message: 'Reserva creada', reservation: newReservation });
});

// API to manage library loans
app.post('/api/library/loan', requireLogin, (req, res) => {
    const loansFile = path.join(__dirname, 'config', 'library_loans.json');
    const loans = fs.existsSync(loansFile) ? JSON.parse(fs.readFileSync(loansFile)) : [];
    const newLoan = {
        id: Date.now().toString(),
        user: req.session.user.email,
        ...req.body,
        loanDate: new Date().toISOString(),
        returned: false
    };
    loans.push(newLoan);
    fs.writeFileSync(loansFile, JSON.stringify(loans, null, 2));
    res.json({ message: 'Préstamo registrado', loan: newLoan });
});

app.post('/api/library/return/:loanId', requireLogin, (req, res) => {
    const loansFile = path.join(__dirname, 'config', 'library_loans.json');
    const loans = fs.existsSync(loansFile) ? JSON.parse(fs.readFileSync(loansFile)) : [];
    const loan = loans.find(l => l.id === req.params.loanId);
    if (!loan) {
        return res.status(404).json({ message: 'Préstamo no encontrado' });
    }
    loan.returned = true;
    loan.returnDate = new Date().toISOString();
    fs.writeFileSync(loansFile, JSON.stringify(loans, null, 2));
    res.json({ message: 'Préstamo devuelto', loan });
});

// Start server
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
