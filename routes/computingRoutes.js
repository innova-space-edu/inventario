// routes/computingRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

const upload = multer({ dest: "public/uploads/" });

/**
 * Helper: actualizar cantidad del item (por idEquip o código)
 */
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

    const current = Number(
      typeof data.cantidad !== "undefined"
        ? data.cantidad
        : typeof data.stock !== "undefined"
        ? data.stock
        : 0
    );

    let newQty = current + delta;
    if (Number.isNaN(newQty) || newQty < 0) newQty = 0;

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

// ========================================================
//                       ITEMS
// ========================================================
router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    // Estructuramos explícitamente los campos que esperamos, para no guardar basura
    const data = {
      // Identificación básica
      idEquip: req.body.idEquip || "",       // lo puedes usar como código corto
      codigo: req.body.codigo || "",
      categoria: req.body.categoria || null, // si algún día agregas categoría
      tipoActivo: req.body.tipoActivo || null,   // hardware / software / otros-activos
      subtipo: req.body.subtipo || null,         // computadoras / perifericos / ...

      detalleTipo: req.body.detalleTipo || null,
      cantidad: req.body.cantidad ? Number(req.body.cantidad) : 1,

      // Hardware principal
      marca: req.body.marca || "",
      modelo: req.body.modelo || "",
      serie: req.body.serie || "",
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
      licenciaNumero: req.body.licenciaNumero || null,
      licenciaVencimiento: req.body.licenciaVencimiento || null,

      // Otros
      descripcionOtros: req.body.descripcionOtros || null,

      // Ubicación y mantenimiento
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

    // Historial
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
    res.status(500).json({ message: "Error al agregar equipo" });
  }
});

router.get("/items", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM items WHERE lab='computing' ORDER BY id DESC`
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      ...(row.data || {}),
      photo: row.photo || null
    }));
    res.json(items);
  } catch (err) {
    console.error("❌ Error GET /computing/items:", err);
    res.status(500).json({ message: "Error al obtener equipos" });
  }
});

router.put("/items/:id", upload.single("photo"), async (req, res) => {
  try {
    const id = req.params.id;

    const result = await query(
      `SELECT data, photo FROM items WHERE id = $1 AND lab = 'computing'`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Equipo no encontrado" });
    }

    const current = result.rows[0];
    const currentData = current.data || {};
    const newPhoto = req.file ? `/uploads/${req.file.filename}` : current.photo || null;

    const data = {
      ...currentData,
      idEquip: req.body.idEquip ?? currentData.idEquip ?? "",
      codigo: req.body.codigo ?? currentData.codigo ?? "",
      tipoActivo: req.body.tipoActivo ?? currentData.tipoActivo ?? null,
      subtipo: req.body.subtipo ?? currentData.subtipo ?? null,
      detalleTipo: req.body.detalleTipo ?? currentData.detalleTipo ?? null,
      cantidad: req.body.cantidad
        ? Number(req.body.cantidad)
        : currentData.cantidad ?? 1,

      marca: req.body.marca ?? currentData.marca ?? "",
      modelo: req.body.modelo ?? currentData.modelo ?? "",
      serie: req.body.serie ?? currentData.serie ?? "",
      cpu: req.body.cpu ?? currentData.cpu ?? null,
      memoriaRam: req.body.memoriaRam ?? currentData.memoriaRam ?? null,
      sistemaOperativo:
        req.body.sistemaOperativo ?? currentData.sistemaOperativo ?? null,
      fechaCompra: req.body.fechaCompra ?? currentData.fechaCompra ?? null,
      estado: req.body.estado ?? currentData.estado ?? null,

      soTipo: req.body.soTipo ?? currentData.soTipo ?? null,
      soVersion: req.body.soVersion ?? currentData.soVersion ?? null,
      appNombre: req.body.appNombre ?? currentData.appNombre ?? null,
      appVersion: req.body.appVersion ?? currentData.appVersion ?? null,
      appFechaInstalacion:
        req.body.appFechaInstalacion ?? currentData.appFechaInstalacion ?? null,
      licenciaTipo: req.body.licenciaTipo ?? currentData.licenciaTipo ?? null,
      licenciaNumero:
        req.body.licenciaNumero ?? currentData.licenciaNumero ?? null,
      licenciaVencimiento:
        req.body.licenciaVencimiento ??
        currentData.licenciaVencimiento ??
        null,

      descripcionOtros:
        req.body.descripcionOtros ?? currentData.descripcionOtros ?? null,

      ubicacion: req.body.ubicacion ?? currentData.ubicacion ?? null,
      fechaActualizacion:
        req.body.fechaActualizacion ?? currentData.fechaActualizacion ?? null,
      mantenimientoNotas:
        req.body.mantenimientoNotas ?? currentData.mantenimientoNotas ?? null,

      descripcion: req.body.descripcion ?? currentData.descripcion ?? null
    };

    await query(
      `
      UPDATE items
      SET data = $1, photo = $2
      WHERE id = $3 AND lab = 'computing'
      `,
      [data, newPhoto, id]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'editar', 'equipo', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", data]
    );

    res.json({ ok: true, item: { id, ...data, photo: newPhoto } });
  } catch (err) {
    console.error("❌ Error PUT /computing/items/:id:", err);
    res.status(500).json({ message: "Error al actualizar equipo" });
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    const id = req.params.id;

    await query(
      `DELETE FROM items WHERE id=$1 AND lab='computing'`,
      [id]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email)
      VALUES ($1, 'computing', 'eliminar', 'equipo', $2, $3)
      `,
      [uuidv4(), id, req.session?.email || "admin"]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error DELETE /computing/items/:id:", err);
    res.status(500).json({ message: "Error al eliminar equipo" });
  }
});

// ========================================================
//                       RESERVAS
// ========================================================
router.post("/reservations", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin";

    const data = {
      solicitante: req.body.solicitante,
      curso: req.body.curso,
      fechaUso: req.body.fechaUso,
      horario: req.body.horario,
      observaciones: req.body.observaciones || ""
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
      reservation: { id, ...data, user: userEmail }
    });
  } catch (err) {
    console.error("❌ Error POST /computing/reservations:", err);
    res.status(500).json({ message: "Error al registrar reserva" });
  }
});

router.get("/reservations", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM reservations WHERE lab='computing' ORDER BY id DESC`
    );
    const reservations = result.rows.map((row) => ({
      id: row.id,
      ...(row.data || {}),
      user: row.user_email || null
    }));
    res.json(reservations);
  } catch (err) {
    console.error("❌ Error GET /computing/reservations:", err);
    res.status(500).json({ message: "Error al obtener reservas" });
  }
});

// ========================================================
//                       PRÉSTAMOS
//   (usa la MISMA tabla loans que ciencias y biblioteca)
// ========================================================
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
      tipoPersona: req.body.tipoPersona || null, // estudiante / funcionario
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

    // Descontar stock
    await updateItemQuantityByIdEquipOrCodigo({
      itemId: data.itemId,
      codigo: data.codigo,
      delta: -1
    });

    res.json({
      ok: true,
      loan: { id, ...data }
    });
  } catch (err) {
    console.error("❌ Error POST /computing/loans:", err);
    res.status(500).json({ message: "Error al registrar préstamo" });
  }
});

router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT id, data, user_email, created_at
      FROM loans
      WHERE lab = 'computing'
      ORDER BY created_at DESC, id DESC
      `
    );

    const loans = result.rows.map((row) => ({
      id: row.id,
      ...(row.data || {}),
      user: row.user_email || null
    }));

    res.json(loans);
  } catch (err) {
    console.error("❌ Error GET /computing/loans:", err);
    res.status(500).json({ message: "Error al obtener préstamos de computación" });
  }
});

router.post("/loans/:id/return", async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.session?.email || "admin";

    const result = await query(
      `
      SELECT data
      FROM loans
      WHERE id = $1 AND lab = 'computing'
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Préstamo no encontrado" });
    }

    const row = result.rows[0];
    const data = row.data || {};

    if (data.devuelto) {
      // ya estaba devuelto
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

    // Devolución → sumar stock
    await updateItemQuantityByIdEquipOrCodigo({
      itemId: updated.itemId,
      codigo: updated.codigo,
      delta: 1
    });

    res.json({ ok: true, loan: { id, ...updated } });
  } catch (err) {
    console.error("❌ Error POST /computing/loans/:id/return:", err);
    res.status(500).json({ message: "Error al registrar devolución" });
  }
});

module.exports = router;
