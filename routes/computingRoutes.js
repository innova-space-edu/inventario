// routes/computingRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

const upload = multer({ dest: "public/uploads/" });

// ========================================
//       AGREGAR EQUIPO DE CÓMPUTO
// ========================================
router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    const data = {
      idEquip: req.body.idEquip,
      codigo: req.body.codigo,
      marca: req.body.marca,
      modelo: req.body.modelo,
      anio: req.body.anio,
      serie: req.body.serie,
      categoria: req.body.categoria,
      descripcion: req.body.descripcion
    };

    await query(
      `
      INSERT INTO items (id, lab, data, photo)
      VALUES ($1, 'computing', $2, $3)
      `,
      [id, data, photo]
    );

    // Registrar historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'agregar', 'equipo', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", data]
    );

    res.json({ ok: true, item: { id, ...data, photo } });
  } catch (err) {
    console.error("❌ Error POST /computing/items:", err);
    res.status(500).json({ error: "Error al agregar equipo" });
  }
});

// ========================================
//      LISTAR EQUIPOS
// ========================================
router.get("/items", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM items WHERE lab='computing' ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /computing/items:", err);
    res.status(500).json({ error: "Error al obtener equipos" });
  }
});

// ========================================
//      ELIMINAR EQUIPO
// ========================================
router.delete("/items/:id", async (req, res) => {
  try {
    const id = req.params.id;

    await query(`DELETE FROM items WHERE id=$1 AND lab='computing'`, [id]);

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email)
      VALUES ($1, 'computing', 'eliminar', 'equipo', $2, $3)
      `,
      [uuidv4(), id, req.session?.email || "admin"]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error DELETE /computing/items:", err);
    res.status(500).json({ error: "Error al eliminar equipo" });
  }
});

// ========================================
//      REGISTRAR RESERVA SALA COMPUTACIÓN
// ========================================
router.post("/reservations", async (req, res) => {
  try {
    const id = uuidv4();

    const data = {
      solicitante: req.body.solicitante,
      curso: req.body.curso,
      fechaUso: req.body.fechaUso,
      horario: req.body.horario,
      observaciones: req.body.observaciones
    };

    await query(
      `
      INSERT INTO reservations (id, lab, data, user_email)
      VALUES ($1, 'computing', $2, $3)
      `,
      [id, data, req.session?.email || "admin"]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'reserva', 'reserva', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", data]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error("❌ Error POST /computing/reservations:", err);
    res.status(500).json({ error: "Error al registrar reserva" });
  }
});

// ========================================
//     LISTAR RESERVAS
// ========================================
router.get("/reservations", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM reservations WHERE lab='computing' ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /computing/reservations:", err);
    res.status(500).json({ error: "Error al obtener reservas" });
  }
});

module.exports = router;
