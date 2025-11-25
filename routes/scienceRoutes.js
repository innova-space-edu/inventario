// routes/scienceRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

// Configuración de Multer para fotos
const upload = multer({ dest: "public/uploads/" });

// ========================================
//      AGREGAR MATERIAL DE CIENCIAS
// ========================================
router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    const data = {
      codigo: req.body.codigo,
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      categoria: req.body.categoria,
      cantidad: Number(req.body.cantidad),
      fecha: req.body.fecha
    };

    await query(
      `
      INSERT INTO items (id, lab, data, photo)
      VALUES ($1, 'science', $2, $3)
      `,
      [id, data, photo]
    );

    // Registrar historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'science', 'agregar', 'material', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", data]
    );

    res.json({ ok: true, item: { id, ...data, photo } });
  } catch (err) {
    console.error("❌ Error POST /science/items:", err);
    res.status(500).json({ error: "Error al agregar material" });
  }
});

// ========================================
//        LISTAR MATERIALES
// ========================================
router.get("/items", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM items WHERE lab='science' ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /science/items:", err);
    res.status(500).json({ error: "Error al obtener items" });
  }
});

// ========================================
//         ELIMINAR MATERIAL
// ========================================
router.delete("/items/:id", async (req, res) => {
  try {
    const id = req.params.id;

    await query(`DELETE FROM items WHERE id=$1 AND lab='science'`, [id]);

    // Registrar historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email)
      VALUES ($1, 'science', 'eliminar', 'material', $2, $3)
      `,
      [uuidv4(), id, req.session?.email || "admin"]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error DELETE /science/items:", err);
    res.status(500).json({ error: "Error al eliminar material" });
  }
});

// ========================================
//        REGISTRAR RESERVA
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
      VALUES ($1, 'science', $2, $3)
      `,
      [id, data, req.session?.email || "admin"]
    );

    // Historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'science', 'reserva', 'reserva', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", data]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error("❌ Error POST /science/reservations:", err);
    res.status(500).json({ error: "Error al registrar reserva" });
  }
});

// ========================================
//     LISTAR RESERVAS
// ========================================
router.get("/reservations", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM reservations WHERE lab='science' ORDER BY id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /science/reservations:", err);
    res.status(500).json({ error: "Error al obtener reservas" });
  }
});

module.exports = router;
