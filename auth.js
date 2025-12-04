// auth.js
// ------------------------------------------------------
// Autenticación y gestión de sesión para el inventario
// ------------------------------------------------------
//
// - POST /login        → valida credenciales, crea cookie JWT y redirige a "/"
// - GET  /logout       → elimina cookie y redirige a "/login.html"
// - POST /logout       → elimina cookie y responde JSON { ok: true }
// - GET  /api/session  → devuelve { email, role, name } si hay sesión
// - requireAuth        → middleware para proteger rutas /api/*
//
// Configuración por variables de entorno:
//
//  ADMIN_EMAIL      (recomendado) → correo admin (rol "admin")
//  SCIENCE_EMAIL    (opcional)    → correo laboratorio ciencias (rol "science")
//  COMPUTING_EMAIL  (opcional)    → correo sala computación (rol "computing")
//  LIBRARY_EMAIL    (opcional)    → correo biblioteca (rol "library")
//
//  ADMIN_PASSWORD       (opcional)
//  SCIENCE_PASSWORD     (opcional)
//  COMPUTING_PASSWORD   (opcional)
//  LIBRARY_PASSWORD     (opcional)
//  DEFAULT_PASSWORD     (fallback si no se definen las anteriores)
//
//  JWT_SECRET       → clave secreta para firmar el token (muy importante en producción)
// ------------------------------------------------------

const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Nombre de la cookie donde guardaremos el token
const TOKEN_COOKIE_NAME = 'inventario_token';

// Secreto para firmar el JWT
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto-super-seguro';

// Duración de la sesión (en horas)
const TOKEN_EXPIRES_HOURS = 8;

// ------------------------------------------------------
// Definición de usuarios y roles desde variables de entorno
// ------------------------------------------------------

/**
 * USERS será un mapa: { email: { role, name } }
 * Ejemplo:
 *   {
 *     "admin@colprovidencia.cl": {
 *       role: "admin",
 *       name: "Administrador"
 *     },
 *     "ciencias@colprovidencia.cl": {
 *       role: "science",
 *       name: "Laboratorio Ciencias"
 *     }
 *   }
 */
const USERS = {};

/**
 * Helper para registrar usuarios desde variables de entorno.
 */
function addUserFromEnv(envKey, defaultEmail, role, displayName) {
  const email = (process.env[envKey] || defaultEmail || '').toLowerCase().trim();
  if (!email) return;
  USERS[email] = { role, name: displayName || email };
}

// Admin (obligatorio si quieres tener alguien con permisos totales)
addUserFromEnv(
  'ADMIN_EMAIL',
  'admin@colprovidencia.cl',
  'admin',
  'Administrador'
);

// Cuentas por área (opcionales)
addUserFromEnv(
  'SCIENCE_EMAIL',
  '',
  'science',
  'Laboratorio de Ciencias'
);
addUserFromEnv(
  'COMPUTING_EMAIL',
  '',
  'computing',
  'Sala de Computación'
);
addUserFromEnv(
  'LIBRARY_EMAIL',
  '',
  'library',
  'Biblioteca'
);

/**
 * Devuelve la contraseña esperada para un rol dado.
 * Si no se define una específica, usa DEFAULT_PASSWORD
 * y si tampoco está definida, cae en "inventario2025".
 */
function getPasswordForRole(role) {
  const defaultPass = process.env.DEFAULT_PASSWORD || 'inventario2025';

  switch (role) {
    case 'admin':
      return process.env.ADMIN_PASSWORD || defaultPass;
    case 'science':
      return process.env.SCIENCE_PASSWORD || defaultPass;
    case 'computing':
      return process.env.COMPUTING_PASSWORD || defaultPass;
    case 'library':
      return process.env.LIBRARY_PASSWORD || defaultPass;
    default:
      return defaultPass;
  }
}

/**
 * Busca un usuario a partir de email y password.
 * Retorna { email, role, name } si es válido, o null en caso contrario.
 */
function validateCredentials(email, password) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const userConfig = USERS[normalizedEmail];
  if (!userConfig) return null;

  const expectedPassword = getPasswordForRole(userConfig.role);
  if (!expectedPassword || password !== expectedPassword) {
    return null;
  }

  return {
    email: normalizedEmail,
    role: userConfig.role,
    name: userConfig.name
  };
}

// ------------------------------------------------------
// Middleware: requireAuth
// ------------------------------------------------------

function requireAuth(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Guardamos usuario en req.user para que otras rutas puedan usarlo
    req.user = {
      email: payload.email,
      role: payload.role,
      name: payload.name
    };
    next();
  } catch (err) {
    console.error('Error verificando token:', err);
    return res.status(401).json({ message: 'Token inválido' });
  }
}

// ------------------------------------------------------
// POST /login – proceso de inicio de sesión
// ------------------------------------------------------

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const { email, password } = req.body || {};

  // Pequeño log de auditoría (solo correo, nunca contraseña)
  if (email) {
    console.log(`[AUTH] Intento de inicio de sesión para: ${email}`);
  }

  const user = validateCredentials(email, password);
  if (!user) {
    // Puedes cambiar esto por un render de una vista si quieres
    return res
      .status(401)
      .send('Credenciales inválidas. Verifica tu correo y contraseña.');
  }

  const token = jwt.sign(
    {
      email: user.email,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: `${TOKEN_EXPIRES_HOURS}h` }
  );

  res
    .cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: TOKEN_EXPIRES_HOURS * 60 * 60 * 1000
    })
    .redirect('/'); // Dashboard principal (index.html)
});

// ------------------------------------------------------
// LOGOUT – GET y POST
// ------------------------------------------------------

router.get('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE_NAME);
  // Volvemos a la página de login
  return res.redirect('/login.html');
});

router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE_NAME);
  return res.json({ ok: true });
});

// ------------------------------------------------------
// GET /api/session
// ------------------------------------------------------
// Usado por public/js/roleGuard.js para saber email y rol del usuario.
// NO va protegido por requireAuth en server.js; aquí mismo verificamos el token.

router.get('/api/session', (req, res) => {
  const token = req.cookies?.[TOKEN_COOKIE_NAME];
  if (!token) {
    // Respondemos 200 con objeto vacío para que roleGuard simplemente no haga nada
    return res.status(200).json({});
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({
      email: payload.email,
      role: payload.role,
      name: payload.name
    });
  } catch (err) {
    console.error('Error en /api/session verificando token:', err);
    // Si el token es inválido o expiró, devolvemos objeto vacío
    return res.status(200).json({});
  }
});

// ------------------------------------------------------
// Exportar router y middleware
// ------------------------------------------------------

module.exports = {
  authRouter: router,
  requireAuth
};
