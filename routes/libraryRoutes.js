// routes/libraryRoutes.js
const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

router.post("/loan", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin@colprovidencia.cl";
    const raw = { ...req.body };
    const data = {
      codigo: raw.codigo || raw.bookCode || "",
      nombre: raw.nombre || raw.borrowerName || "",
      curso: raw.curso || raw.borrowerCourse || "",
      observaciones: raw.observaciones || raw.notes || "",
      personaId: raw.personaId || null,
      tipoPersona: raw.tipoPersona || null,
    };

    await query(
      `INSERT INTO library_loans (id, data, user_email, loan_date, returned)
       VALUES ($1, $2, $3, NOW(), FALSE)`,
      [id, data, userEmail]
    );

    res.json({ ok: true, message: "Préstamo registrado", loan: { id, ...data } });
  } catch (err) {
    console.error("Error POST /library/loan:", err);
    res.status(500).json({ error: "Error al registrar préstamo" });
  }
});

router.post("/return/:loanId", async (req, res) => {
  try {
    const loanId = req.params.loanId;
    const result = await query(
      `UPDATE library_loans SET returned = TRUE, return_date = NOW()
       WHERE id = $1 RETURNING data`,
      [loanId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Préstamo no encontrado" });

    res.json({ ok: true, message: "Préstamo devuelto", loan: result.rows[0] });
  } catch (err) {
    console.error("Error devolviendo préstamo biblioteca:", err);
    res.status(500).json({ error: "Error al registrar devolución" });
  }
});

router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, data, user_email, loan_date, returned, return_date
       FROM library_loans ORDER BY loan_date DESC`
    );
    const loans = result.rows.map(r => ({
      id: r.id,
      ...(r.data || {}),
      user: r.user_email,
      loanDate: r.loan_date,
      returned: r.returned,
      returnDate: r.return_date,
    }));
    res.json(loans);
  } catch (err) {
    console.error("Error GET /library/loans:", err);
    res.status(500).json({ error: "Error al obtener préstamos" });
  }
});

router.get("/overdue", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, data FROM library_loans
       WHERE returned = FALSE AND loan_date < NOW() - INTERVAL '7 days'`
    );
    res.json(result.rows.map(r => ({ id: r.id, ...(r.data || {}) })));
  } catch (err) {
    console.error("Error GET /library/overdue:", err);
    res.status(500).json({ error: "Error al obtener préstamos atrasados" });
  }
});

module.exports = router;
