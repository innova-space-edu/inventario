// routes/computingRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

const upload = multer({ dest: "public/uploads/" });

// Helper: actualizar cantidad del item (por idEquip o código)
async function updateItemQuantityByIdEquipOrCodigo({ itemId, codigo, delta }) {
  try {
    if (!itemId && !codigo) return;

    const result = await query(
      `
      SELECT id, data
      FROM items
      WHERE lab = 'computing'
        AND (
          ($1 <> '' AND data->>'idEquip' = $1)
          OR
          ($2 <> '' AND data->>'codigo' = $2)
        )
      LIMIT 1
      `,
      [itemId || "", codigo || ""]
    );

    if (result.rows.length === 0) {
      return;
    }

    const row = result.rows[0];
    const data = row.data || {};
    const current =
      typeof data.cantidad !== "undefined"
        ? Number(data.cantidad)
        : typeof data.stock !== "undefined"
        ? Number(data.stock)
        : 0;

    let newQty = current + delta;
    if (Number.isNaN(newQty)) newQty = 0;
    if (newQty < 0) newQty = 0;

    const newData = {
      ...data,
      cantidad: newQty,
      stock: newQty
    };

    await query(
      `
      UPDATE items
      SET data = $1
      WHERE id = $2 AND lab = 'computing'
      `,
      [newData, row.id]
    );
  } catch (err) {
    console.error("❌ Error actualizando cantidad de item (computing):", err);
  }
}

// ========================================
//       AGREGAR EQUIPO DE CÓMPUTO
// ========================================
router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    const data = {
      // Identificación básica
      idEquip: req.body.idEquip || null,
      codigo: req.body.codigo || null,
      marca: req.body.marca || null,
      modelo: req.body.modelo || null,
      anio: req.body.anio || null,
      serie: req.body.serie || null,
      categoria: req.body.categoria || null,

      // Nueva clasificación
      tipoActivo: req.body.tipoActivo || null, // hardware / software / otros-activos
      subtipo: req.body.subtipo || null,       // computadoras / perifericos / etc
      detalleTipo: req.body.detalleTipo || null,
      cantidad: req.body.cantidad ? Number(req.body.cantidad) : 1,

      // Hardware
      cpu: req.body.cpu || null,
      memoriaRam: req.body.memoriaRam || null,
      sistemaOperativo: req.body.sistemaOperativo || null,
      fechaCompra: req.body.fechaCompra || null,
      estado: req.body.estado || null,

      // Software / licencias
      soTipo: req.body.soTipo || null,
      soVersion: req.body.soVersion || null,
      appNombre: req.body.appNombre || null,
      appVersion: req.body.appVersion || null,
      appFechaInstalacion: req.body.appFechaInstalacion || null,
      licenciaTipo: req.body.licenciaTipo || null,
      licenciaNumero: req.body.licenciaNumero || req.body.appLicencia || null,
      licenciaVencimiento: req.body.licenciaVencimiento || null,

      // Otros activos
      descripcionOtros: req.body.descripcionOtros || null,

      // Estado, ubicación y mantenimiento
      ubicacion: req.body.ubicacion || null,
      fechaActualizacion: req.body.fechaActualizacion || null,
      mantenimientoNotas: req.body.mantenimientoNotas || null,

      // Descripción general
      descripcion: req.body.descripcion || null
    };

    await query(
      `
      INSERT INTO items (id, lab, data, photo)
      VALUES ($1, 'computing', $2, $3)
      `,
      [id, data, photo]
    );

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
//      ACTUALIZAR EQUIPO
// ========================================
router.put("/items/:id", upload.single("photo"), async (req, res) => {
  try {
    const id = req.params.id;
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await query(
      `
      SELECT data, photo
      FROM items
      WHERE id = $1 AND lab = 'computing'
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    const oldData = result.rows[0].data || {};
    const oldPhoto = result.rows[0].photo || null;

    const newData = {
      ...oldData,
      idEquip: req.body.idEquip ?? oldData.idEquip ?? null,
      codigo: req.body.codigo ?? oldData.codigo ?? null,
      marca: req.body.marca ?? oldData.marca ?? null,
      modelo: req.body.modelo ?? oldData.modelo ?? null,
      anio: req.body.anio ?? oldData.anio ?? null,
      serie: req.body.serie ?? oldData.serie ?? null,
      categoria: req.body.categoria ?? oldData.categoria ?? null,

      tipoActivo: req.body.tipoActivo ?? oldData.tipoActivo ?? null,
      subtipo: req.body.subtipo ?? oldData.subtipo ?? null,
      detalleTipo: req.body.detalleTipo ?? oldData.detalleTipo ?? null,
      cantidad: req.body.cantidad
        ? Number(req.body.cantidad)
        : (typeof oldData.cantidad !== "undefined" ? Number(oldData.cantidad) : 1),

      cpu: req.body.cpu ?? oldData.cpu ?? null,
      memoriaRam: req.body.memoriaRam ?? oldData.memoriaRam ?? null,
      sistemaOperativo: req.body.sistemaOperativo ?? oldData.sistemaOperativo ?? null,
      fechaCompra: req.body.fechaCompra ?? oldData.fechaCompra ?? null,
      estado: req.body.estado ?? oldData.estado ?? null,

      soTipo: req.body.soTipo ?? oldData.soTipo ?? null,
      soVersion: req.body.soVersion ?? oldData.soVersion ?? null,
      appNombre: req.body.appNombre ?? oldData.appNombre ?? null,
      appVersion: req.body.appVersion ?? oldData.appVersion ?? null,
      appFechaInstalacion: req.body.appFechaInstalacion ?? oldData.appFechaInstalacion ?? null,
      licenciaTipo: req.body.licenciaTipo ?? oldData.licenciaTipo ?? null,
      licenciaNumero:
        req.body.licenciaNumero ??
        req.body.appLicencia ??
        oldData.licenciaNumero ??
        null,
      licenciaVencimiento:
        req.body.licenciaVencimiento ?? oldData.licenciaVencimiento ?? null,

      descripcionOtros: req.body.descripcionOtros ?? oldData.descripcionOtros ?? null,
      ubicacion: req.body.ubicacion ?? oldData.ubicacion ?? null,
      fechaActualizacion: req.body.fechaActualizacion ?? oldData.fechaActualizacion ?? null,
      mantenimientoNotas: req.body.mantenimientoNotas ?? oldData.mantenimientoNotas ?? null,
      descripcion: req.body.descripcion ?? oldData.descripcion ?? null
    };

    const finalPhoto = photo || oldPhoto;

    await query(
      `
      UPDATE items
      SET data = $1, photo = $2
      WHERE id = $3 AND lab = 'computing'
      `,
      [newData, finalPhoto, id]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'actualizar', 'equipo', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", newData]
    );

    res.json({ ok: true, item: { id, ...newData, photo: finalPhoto } });
  } catch (err) {
    console.error("❌ Error PUT /computing/items/:id:", err);
    res.status(500).json({ error: "Error al actualizar equipo" });
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

    const items = result.rows.map(row => ({
      id: row.id,
      ...(row.data || {}),
      photo: row.photo || null
    }));

    res.json(items);
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
    const userEmail = req.session?.email || "admin";

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
      [id, data, userEmail]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'reserva', 'reserva', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, data]
    );

    res.json({
      ok: true,
      reservation: {
        id,
        ...data,
        user: userEmail
      }
    });
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

    const reservations = result.rows.map(row => ({
      id: row.id,
      ...(row.data || {}),
      user: row.user_email || null
    }));

    res.json(reservations);
  } catch (err) {
    console.error("❌ Error GET /computing/reservations:", err);
    res.status(500).json({ error: "Error al obtener reservas" });
  }
});

// ========================================
//           PRÉSTAMOS DE EQUIPOS
// ========================================

// Registrar préstamo
router.post("/loans", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin";

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const fechaPrestamo =
      req.body.fechaPrestamo ||
      req.body.fecha_prestamo ||
      todayStr;

    const data = {
      itemId: req.body.itemId,
      codigo: req.body.codigo || null,
      tipoPersona: req.body.tipoPersona || null,
      persona: req.body.persona,
      curso: req.body.curso || "",
      fechaPrestamo: fechaPrestamo,
      fecha_prestamo: fechaPrestamo,
      fechaDevolucion: null,
      fecha_devolucion: null,
      observaciones: req.body.observaciones || "",
      devuelto: false
    };

    await query(
      `
      INSERT INTO loans (id, lab, data, user_email)
      VALUES ($1, 'computing', $2, $3)
      `,
      [id, data, userEmail]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'prestamo', 'prestamo', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, data]
    );

    await updateItemQuantityByIdEquipOrCodigo({
      itemId: data.itemId,
      codigo: data.codigo,
      delta: -1
    });

    res.json({
      ok: true,
      loan: {
        id,
        ...data
      }
    });
  } catch (err) {
    console.error("❌ Error POST /computing/loans:", err);
    res.status(500).json({ error: "Error al registrar préstamo" });
  }
});

// Listar préstamos
router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM loans WHERE lab='computing' ORDER BY id DESC`
    );

    const loans = result.rows.map(row => ({
      id: row.id,
      ...(row.data || {}),
      user: row.user_email || null
    }));

    res.json(loans);
  } catch (err) {
    console.error("❌ Error GET /computing/loans:", err);
    res.status(500).json({ error: "Error al obtener préstamos" });
  }
});

// Marcar devolución
router.post("/loans/:id/return", async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.session?.email || "admin";

    const result = await query(
      `
      SELECT * FROM loans
      WHERE id = $1 AND lab = 'computing'
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Préstamo no encontrado" });
    }

    const row = result.rows[0];
    const data = row.data || {};

    if (data.devuelto) {
      return res.json({ ok: true, loan: { id, ...data } });
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const updated = {
      ...data,
      devuelto: true,
      fechaDevolucion: todayStr,
      fecha_devolucion: todayStr
    };

    await query(
      `
      UPDATE loans
      SET data = $1, user_email = $2
      WHERE id = $3 AND lab = 'computing'
      `,
      [updated, userEmail, id]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'devolver', 'prestamo', $2, $3, $4)
      `,
      [uuidv4(), id, userEmail, updated]
    );

    await updateItemQuantityByIdEquipOrCodigo({
      itemId: updated.itemId,
      codigo: updated.codigo,
      delta: 1
    });

    res.json({ ok: true, loan: { id, ...updated } });
  } catch (err) {
    console.error("❌ Error POST /computing/loans/:id/return:", err);
    res.status(500).json({ error: "Error al registrar devolución" });
  }
});

module.exports = router;
