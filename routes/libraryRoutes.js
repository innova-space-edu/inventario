// routes/libraryRoutes.js
const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

// Registrar libro, préstamo, devolución…

router.post("/loan", async (req, res) => {
  try {
    const id = uuidv4();
    const { codigo, nombre, curso, observaciones } = req.body;

    const data = {
      codigo,
      nombre,
      curso,
      observaciones
    };

    await query(
      `
      INSERT INTO library_loans (id, data, user_email, loan_date)
      VALUES ($1, $2, $3, NOW())
      `,
      [id, data, req.session.email]
    );

    // Registrar en historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'library', 'préstamo', 'libro', $2, $3, $4)
      `,
      [uuidv4(), id, req.session.email, data]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error("❌ Error POST /library/loan:", err);
    res.status(500).json({ error: "Error al registrar préstamo" });
  }
});

// Registrar devolución
router.post("/return", async (req, res) => {
  try {
    const { loanId } = req.body;

    await query(
      `
      UPDATE library_loans
      SET returned = TRUE, return_date = NOW()
      WHERE id = $1
      `,
      [loanId]
    );

    // Historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email)
      VALUES ($1, 'library', 'devolución', 'libro', $2, $3)
      `,
      [uuidv4(), loanId, req.session.email]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error POST /library/return:", err);
    res.status(500).json({ error: "Error al registrar devolución" });
  }
});

// Listado de préstamos
router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM library_loans ORDER BY loan_date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /library/loans:", err);
    res.status(500).json({ error: "Error al obtener préstamos" });
  }
});

// ⚠️ /overdue → libros atrasados
router.get("/overdue", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT *
      FROM library_loans
      WHERE returned = FALSE
      AND loan_date <= NOW() - INTERVAL '7 days'
      ORDER BY loan_date ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /library/overdue:", err);
    res.status(500).json({ error: "Error al obtener préstamos atrasados" });
  }
});

module.exports = router;
