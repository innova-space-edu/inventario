// routes/historyRoutes.js
const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");
const { requireAuth } = require("../auth"); // ⬅️ usamos el middleware de autenticación

// Aplica requireAuth a todas las rutas de historial
// (si ya montas requireAuth desde server.js, esto no rompe nada; solo refuerza)
router.use(requireAuth);

// Helper para asegurar un límite numérico razonable
function parseLimit(value, fallback = 100) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return Math.min(n, 1000); // máximo 1000 por seguridad
}

// Registrar movimiento
router.post("/", async (req, res) => {
  try {
    const id = uuidv4();

    const {
      lab,
      action,
      entity_type,
      entity_id,
      user_email, // puede venir del cliente, pero preferimos el de la sesión
      data
    } = req.body || {};

    // Validaciones mínimas
    if (!lab || !action) {
      return res
        .status(400)
        .json({ error: "Campos 'lab' y 'action' son obligatorios" });
    }

    // Tomar email desde la sesión si existe (más confiable que el body)
    const sessionEmail = req.user?.email || null;
    const finalUserEmail = sessionEmail || user_email || null;

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        lab,
        action,
        entity_type || null,
        entity_id || null,
        finalUserEmail,
        data || {}
      ]
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
    const { lab, limit } = req.query;

    const safeLimit = parseLimit(limit, 100);

    let sql = `
      SELECT *
      FROM history
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const params = [safeLimit];

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
