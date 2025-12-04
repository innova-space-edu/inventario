// routes/scienceRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");
const { requireAuth } = require("../auth");

// Configuración de Multer para fotos
const upload = multer({ dest: "public/uploads/" });

// Aplica autenticación a todas las rutas de ciencias
router.use(requireAuth);

// Helper para obtener el correo del usuario autenticado
function getUserEmail(req) {
  return req.user?.email || null;
}

// ========================================
//      AGREGAR MATERIAL DE CIENCIAS
// ========================================
router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;
    const userEmail = getUserEmail(req) || "admin@colprovidencia.cl";

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
      [uuidv4(), id, userEmail, data]
    );

    res.json({ ok: true, item: { id, ...data, photo } });
  } catch (err) {
    console.error("❌ Error POST /science/items:", err);
    res.status(500).json({ error: "Error al agregar material" });
  }
});

// ========================================
//      EDITAR MATERIAL DE CIENCIAS
// ========================================
// Permite actualizar datos y opcionalmente la foto.
// Si no se envía foto nueva, se mantiene la anterior.
router.put("/items/:id", upload.single("photo"), async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = getUserEmail(req) || "admin@colprovidencia.cl";

    // Traer registro actual para conservar foto si no se envía nueva
    const current = await query(
      `SELECT data, photo FROM items WHERE id=$1 AND lab='science'`,
      [id]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ message: "Material de ciencias no encontrado" });
    }

    const prevData = current.rows[0].data || {};
    const prevPhoto = current.rows[0].photo || null;

    const newData = {
      codigo: req.body.codigo ?? prevData.codigo,
      nombre: req.body.nombre ?? prevData.nombre,
      descripcion: req.body.descripcion ?? prevData.descripcion,
      categoria: req.body.categoria ?? prevData.categoria,
      cantidad:
        typeof req.body.cantidad !== "undefined"
          ? Number(req.body.cantidad)
          : prevData.cantidad,
      fecha: req.body.fecha ?? prevData.fecha
    };

    const newPhoto = req.file ? `/uploads/${req.file.filename}` : prevPhoto;

    await query(
      `
      UPDATE items
      SET data = $1,
          photo = $2
      WHERE id = $3
        AND lab = 'science'
      `,
      [newData, newPhoto, id]
    );

    // Historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'science', 'editar', 'material', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, newData]
    );

    res.json({ ok: true, item: { id, ...newData, photo: newPhoto } });
  } catch (err) {
    console.error("❌ Error PUT /science/items/:id:", err);
    res.status(500).json({ error: "Error al editar material" });
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
    const userEmail = getUserEmail(req) || "admin@colprovidencia.cl";

    await query(`DELETE FROM items WHERE id=$1 AND lab='science'`, [id]);

    // Registrar historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email)
      VALUES ($1, 'science', 'eliminar', 'material', $2, $3)
      `,
      [uuidv4(), id, userEmail]
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
    const userEmail = getUserEmail(req) || "admin@colprovidencia.cl";

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
      [id, data, userEmail]
    );

    // Historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'science', 'reserva', 'reserva', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, data]
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

// ========================================
//     PRÉSTAMOS LABORATORIO CIENCIAS
//     (tabla science_loans)
// ========================================

// Registrar préstamo de material de ciencias
router.post("/loans", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = getUserEmail(req) || "admin@colprovidencia.cl";

    const data = {
      codigo: req.body.codigo,
      nombre: req.body.nombre,          // persona que pide
      curso: req.body.curso,
      tipoPersona: req.body.tipoPersona, // estudiante / funcionario (opcional)
      personaId: req.body.personaId,     // id de la persona si lo usas (opcional)
      observaciones: req.body.observaciones || ""
    };

    await query(
      `
      INSERT INTO science_loans (id, data, user_email, loan_date, returned)
      VALUES ($1, $2, $3, NOW(), FALSE)
      `,
      [id, data, userEmail]
    );

    // Historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'science', 'prestamo', 'loan', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, data]
    );

    res.json({ ok: true, id, loan: { id, ...data, returned: false } });
  } catch (err) {
    console.error("❌ Error POST /science/loans:", err);
    res.status(500).json({ error: "Error al registrar préstamo de ciencias" });
  }
});

// Listar préstamos de ciencias
router.get("/loans", async (req, res) => {
  try {
    const { returned } = req.query;

    let sql = `
      SELECT *
      FROM science_loans
      ORDER BY loan_date DESC
    `;
    const params = [];

    // Filtro opcional por estado
    if (returned === "yes") {
      sql = `
        SELECT *
        FROM science_loans
        WHERE returned = TRUE
        ORDER BY loan_date DESC
      `;
    } else if (returned === "no") {
      sql = `
        SELECT *
        FROM science_loans
        WHERE returned = FALSE
        ORDER BY loan_date DESC
      `;
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /science/loans:", err);
    res.status(500).json({ error: "Error al obtener préstamos de ciencias" });
  }
});

// Registrar devolución de préstamo de ciencias
router.post("/loans/:id/return", async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = getUserEmail(req) || "admin@colprovidencia.cl";

    const result = await query(
      `
      UPDATE science_loans
      SET returned = TRUE,
          return_date = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Préstamo de ciencias no encontrado" });
    }

    const loan = result.rows[0];

    // Historial
    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'science', 'devolucion', 'loan', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, loan.data || {}]
    );

    res.json({ ok: true, loan });
  } catch (err) {
    console.error("❌ Error POST /science/loans/:id/return:", err);
    res.status(500).json({ error: "Error al registrar devolución de ciencias" });
  }
});

module.exports = router;
