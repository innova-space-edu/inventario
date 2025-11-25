// routes/historyRoutes.js
const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

// Registrar movimiento
router.post("/", async (req, res) => {
  try {
    const id = uuidv4();
    const { lab, action, entity_type, entity_id, user_email, data } = req.body;

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [id, lab, action, entity_type, entity_id, user_email, data || {}]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error("❌ Error POST /api/history:", err);
    res.status(500).json({ error: "Error al registrar historial" });
  }
});

// Obtener historial
router.get("/", async (req, res) => {
  try {
    const { lab, limit = 100 } = req.query;

    let sql = `
      SELECT *
      FROM history
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const params = [limit];

    if (lab && lab !== "all") {
      sql = `
        SELECT *
        FROM history
        WHERE lab = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      params.unshift(lab);
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /api/history:", err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

module.exports = router;
