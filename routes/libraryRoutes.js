// routes/libraryRoutes.js
const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");
const { requireAuth } = require("../auth");

/**
 * NOTA IMPORTANTE
 * ----------------
 * Este router está alineado con el front actual (/public/js/library.js) y
 * con el estilo de tu server. Devuelve formatos compatibles (id, ...data,
 * user, loanDate, returned, returnDate). Si decides montarlo:
 *
 *   const libraryRoutes = require('./routes/libraryRoutes');
 *   app.use('/api/library', libraryRoutes); // O bien: app.use('/api/library', requireAuth, libraryRoutes);
 *
 * En este archivo YA aplicamos requireAuth a todas las rutas con router.use.
 * Asegúrate de NO tener duplicadas las rutas equivalentes en server.js.
 */

// Todas las rutas de biblioteca requieren autenticación
router.use(requireAuth);

// Utilidad: obtener email de usuario autenticado de forma segura
function getUserEmail(req) {
  return req?.user?.email || "admin@colprovidencia.cl";
}

// ===============================
// POST /loan  (registrar préstamo)
// ===============================
router.post("/loan", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = getUserEmail(req);
    const loanDate = new Date();

    // Normalización de campos (compat con el front)
    const raw = { ...req.body };
    const codigo = raw.codigo || raw.bookCode || "";
    const nombre = raw.nombre || raw.borrowerName || "";
    const curso = raw.curso || raw.borrowerCourse || "";
    const observaciones = raw.observaciones || raw.notes || "";

    const personaId = raw.personaId || raw.personId || null;
    const tipoPersona = raw.tipoPersona || raw.personType || null;

    const data = {
      // campos canónicos
      codigo,
      nombre,
      curso,
      observaciones,
      personaId: personaId || undefined,
      tipoPersona: tipoPersona || undefined,
      // alias de compatibilidad
      bookCode: codigo,
      borrowerName: nombre,
      borrowerCourse: curso,
      notes: observaciones
    };

    await query(
      `
        INSERT INTO library_loans (id, data, user_email, loan_date, returned)
        VALUES ($1, $2::jsonb, $3, $4, FALSE)
      `,
      [id, JSON.stringify(data), userEmail, loanDate]
    );

    // Historial
    await query(
      `
        INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
        VALUES ($1, 'library', 'create-loan', 'loan', $2, $3, $4::jsonb)
      `,
      [uuidv4(), id, userEmail, JSON.stringify({ createdFrom: "router", ...data })]
    );

    const loan = {
      id,
      ...data,
      user: userEmail,
      loanDate,
      returned: false,
      returnDate: null
    };

    // Respuesta amigable y compatible con el front actual
    res.json({ ok: true, message: "Préstamo registrado", id, loan });
  } catch (err) {
    console.error("❌ Error POST /library/loan (router):", err);
    res.status(500).json({ error: "Error al registrar préstamo" });
  }
});

// ==================================================
// POST /return/:loanId (registrar devolución por URL)
// ==================================================
router.post("/return/:loanId", async (req, res) => {
  try {
    const loanId = req.params.loanId;
    const userEmail = getUserEmail(req);

    const result = await query(
      `
        UPDATE library_loans
        SET returned = TRUE, return_date = NOW()
        WHERE id = $1
        RETURNING id, data, user_email, loan_date, returned, return_date
      `,
      [loanId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Préstamo no encontrado" });
    }

    const row = result.rows[0];
    const data = row.data || {};

    // Historial
    await query(
      `
        INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
        VALUES ($1, 'library', 'return-loan', 'loan', $2, $3, $4::jsonb)
      `,
      [uuidv4(), loanId, userEmail, JSON.stringify({ router: "return-url" })]
    );

    const loan = {
      id: row.id,
      ...data,
      user: row.user_email || null,
      loanDate: row.loan_date,
      returned: row.returned,
      returnDate: row.return_date
    };

    res.json({ ok: true, message: "Préstamo devuelto", loan });
  } catch (err) {
    console.error("❌ Error POST /library/return/:loanId (router):", err);
    res.status(500).json({ error: "Error al registrar devolución" });
  }
});

// ======================================================
// POST /return  (compat: registrar devolución por body)
// ======================================================
router.post("/return", async (req, res) => {
  try {
    const { loanId } = req.body;
    if (!loanId) {
      return res.status(400).json({ error: "Falta loanId" });
    }
    const userEmail = getUserEmail(req);

    const result = await query(
      `
        UPDATE library_loans
        SET returned = TRUE, return_date = NOW()
        WHERE id = $1
        RETURNING id, data, user_email, loan_date, returned, return_date
      `,
      [loanId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Préstamo no encontrado" });
    }

    const row = result.rows[0];
    const data = row.data || {};

    // Historial
    await query(
      `
        INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
        VALUES ($1, 'library', 'return-loan', 'loan', $2, $3, $4::jsonb)
      `,
      [uuidv4(), loanId, userEmail, JSON.stringify({ router: "return-body" })]
    );

    const loan = {
      id: row.id,
      ...data,
      user: row.user_email || null,
      loanDate: row.loan_date,
      returned: row.returned,
      returnDate: row.return_date
    };

    res.json({ ok: true, message: "Préstamo devuelto", loan });
  } catch (err) {
    console.error("❌ Error POST /library/return (router):", err);
    res.status(500).json({ error: "Error al registrar devolución" });
  }
});

// ==========================
// GET /loans (listado limpio)
// ==========================
router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, data, user_email, loan_date, returned, return_date
        FROM library_loans
        ORDER BY loan_date DESC NULLS LAST, id
      `
    );

    const loans = result.rows.map(r => ({
      id: r.id,
      ...(r.data || {}),
      user: r.user_email || null,
      loanDate: r.loan_date,
      returned: !!r.returned,
      returnDate: r.return_date
    }));

    res.json(loans);
  } catch (err) {
    console.error("❌ Error GET /library/loans (router):", err);
    res.status(500).json({ error: "Error al obtener préstamos" });
  }
});

// =============================================
// GET /overdue (préstamos no devueltos > 7 días)
// =============================================
router.get("/overdue", async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, data, user_email, loan_date, returned, return_date
        FROM library_loans
        WHERE returned = FALSE
          AND loan_date < NOW() - INTERVAL '7 days'
        ORDER BY loan_date ASC, id
      `
    );

    const rows = result.rows.map(r => ({
      id: r.id,
      ...(r.data || {}),
      user: r.user_email || null,
      loanDate: r.loan_date,
      returned: !!r.returned,
      returnDate: r.return_date
    }));

    res.json(rows);
  } catch (err) {
    console.error("❌ Error GET /library/overdue (router):", err);
    res.status(500).json({ error: "Error al obtener préstamos atrasados" });
  }
});

module.exports = router;
