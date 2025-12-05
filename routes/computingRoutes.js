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
      stock: newQty,
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

    // Datos antiguos + nuevos campos del inventario de computación
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
      tipoActivo: req.body.tipoActivo || null, // hardware / software / otros
      subtipo: req.body.subtipo || null, // computadoras / periféricos / red, etc.
      detalleTipo: req.body.detalleTipo || null, // PC escritorio, router, mesa, etc.
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
      licenciaNumero: req.body.licenciaNumero || null,
      licenciaVencimiento: req.body.licenciaVencimiento || null,

      // Otros activos
      descripcionOtros: req.body.descripcionOtros || null,

      // Estado, ubicación y mantenimiento
      ubicacion: req.body.ubicacion || null,
      fechaActualizacion: req.body.fechaActualizacion || null,
      mantenimientoNotas: req.body.mantenimientoNotas || null,

      // Descripción general
      descripcion: req.body.descripcion || null,
    };

    await query(
      `
      INSERT INTO items (id, lab, data, photo)
      VALUES ($1, 'computing', $2, $3)
      `,
      [id, data, photo]
    );

    // Registrar historial directo (además del /api/history del frontend)
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

// ========================================
//      LISTAR EQUIPOS
// ========================================
router.get("/items", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM items WHERE lab='computing' ORDER BY id DESC`
    );

    // Transformar a formato que espera el frontend:
    // { id, ...data, photo }
    const items = result.rows.map((row) => ({
      id: row.id,
      ...(row.data || {}),
      photo: row.photo || null,
    }));

    res.json(items);
  } catch (err) {
    console.error("❌ Error GET /computing/items:", err);
    res.status(500).json({ message: "Error al obtener equipos" });
  }
});

// ========================================
//      ACTUALIZAR EQUIPO
// ========================================
router.put("/items/:id", upload.single("photo"), async (req, res) => {
  try {
    const id = req.params.id;

    const existing = await query(
      `
      SELECT data, photo
      FROM items
      WHERE id = $1 AND lab = 'computing'
      `,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Equipo no encontrado" });
    }

    const currentData = existing.rows[0].data || {};
    const currentPhoto = existing.rows[0].photo || null;

    // Si llega nueva foto, la actualizamos; si no, se mantiene la anterior
    const photo = req.file ? `/uploads/${req.file.filename}` : currentPhoto;

    const updatedData = {
      ...currentData,
      // Solo sobreescribimos campos que vengan en el body
      idEquip:
        typeof req.body.idEquip !== "undefined"
          ? req.body.idEquip
          : currentData.idEquip || null,
      codigo:
        typeof req.body.codigo !== "undefined"
          ? req.body.codigo
          : currentData.codigo || null,
      marca:
        typeof req.body.marca !== "undefined"
          ? req.body.marca
          : currentData.marca || null,
      modelo:
        typeof req.body.modelo !== "undefined"
          ? req.body.modelo
          : currentData.modelo || null,
      anio:
        typeof req.body.anio !== "undefined"
          ? req.body.anio
          : currentData.anio || null,
      serie:
        typeof req.body.serie !== "undefined"
          ? req.body.serie
          : currentData.serie || null,
      categoria:
        typeof req.body.categoria !== "undefined"
          ? req.body.categoria
          : currentData.categoria || null,

      tipoActivo:
        typeof req.body.tipoActivo !== "undefined"
          ? req.body.tipoActivo
          : currentData.tipoActivo || null,
      subtipo:
        typeof req.body.subtipo !== "undefined"
          ? req.body.subtipo
          : currentData.subtipo || null,
      detalleTipo:
        typeof req.body.detalleTipo !== "undefined"
          ? req.body.detalleTipo
          : currentData.detalleTipo || null,
      cantidad:
        typeof req.body.cantidad !== "undefined"
          ? Number(req.body.cantidad)
          : typeof currentData.cantidad !== "undefined"
          ? Number(currentData.cantidad)
          : 1,

      cpu:
        typeof req.body.cpu !== "undefined" ? req.body.cpu : currentData.cpu || null,
      memoriaRam:
        typeof req.body.memoriaRam !== "undefined"
          ? req.body.memoriaRam
          : currentData.memoriaRam || null,
      sistemaOperativo:
        typeof req.body.sistemaOperativo !== "undefined"
          ? req.body.sistemaOperativo
          : currentData.sistemaOperativo || null,
      fechaCompra:
        typeof req.body.fechaCompra !== "undefined"
          ? req.body.fechaCompra
          : currentData.fechaCompra || null,
      estado:
        typeof req.body.estado !== "undefined"
          ? req.body.estado
          : currentData.estado || null,

      soTipo:
        typeof req.body.soTipo !== "undefined"
          ? req.body.soTipo
          : currentData.soTipo || null,
      soVersion:
        typeof req.body.soVersion !== "undefined"
          ? req.body.soVersion
          : currentData.soVersion || null,
      appNombre:
        typeof req.body.appNombre !== "undefined"
          ? req.body.appNombre
          : currentData.appNombre || null,
      appVersion:
        typeof req.body.appVersion !== "undefined"
          ? req.body.appVersion
          : currentData.appVersion || null,
      appFechaInstalacion:
        typeof req.body.appFechaInstalacion !== "undefined"
          ? req.body.appFechaInstalacion
          : currentData.appFechaInstalacion || null,
      licenciaTipo:
        typeof req.body.licenciaTipo !== "undefined"
          ? req.body.licenciaTipo
          : currentData.licenciaTipo || null,
      licenciaNumero:
        typeof req.body.licenciaNumero !== "undefined"
          ? req.body.licenciaNumero
          : currentData.licenciaNumero || null,
      licenciaVencimiento:
        typeof req.body.licenciaVencimiento !== "undefined"
          ? req.body.licenciaVencimiento
          : currentData.licenciaVencimiento || null,

      descripcionOtros:
        typeof req.body.descripcionOtros !== "undefined"
          ? req.body.descripcionOtros
          : currentData.descripcionOtros || null,

      ubicacion:
        typeof req.body.ubicacion !== "undefined"
          ? req.body.ubicacion
          : currentData.ubicacion || null,
      fechaActualizacion:
        typeof req.body.fechaActualizacion !== "undefined"
          ? req.body.fechaActualizacion
          : currentData.fechaActualizacion || null,
      mantenimientoNotas:
        typeof req.body.mantenimientoNotas !== "undefined"
          ? req.body.mantenimientoNotas
          : currentData.mantenimientoNotas || null,

      descripcion:
        typeof req.body.descripcion !== "undefined"
          ? req.body.descripcion
          : currentData.descripcion || null,
    };

    await query(
      `
      UPDATE items
      SET data = $1, photo = $2
      WHERE id = $3 AND lab = 'computing'
      `,
      [updatedData, photo, id]
    );

    await query(
      `
      INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
      VALUES ($1, 'computing', 'actualizar', 'equipo', $2, $3, $4)
      `,
      [uuidv4(), id, req.session?.email || "admin", updatedData]
    );

    res.json({ ok: true, item: { id, ...updatedData, photo } });
  } catch (err) {
    console.error("❌ Error PUT /computing/items/:id:", err);
    res.status(500).json({ message: "Error al actualizar equipo" });
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
    res.status(500).json({ message: "Error al eliminar equipo" });
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
      observaciones: req.body.observaciones,
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

    // Devolvemos la reserva completa como espera el frontend
    res.json({
      ok: true,
      reservation: {
        id,
        ...data,
        user: userEmail,
      },
    });
  } catch (err) {
    console.error("❌ Error POST /computing/reservations:", err);
    res.status(500).json({ message: "Error al registrar reserva" });
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

    // Normalizamos para el frontend: { id, ...data, user }
    const reservations = result.rows.map((row) => ({
      id: row.id,
      ...(row.data || {}),
      user: row.user_email || null,
    }));

    res.json(reservations);
  } catch (err) {
    console.error("❌ Error GET /computing/reservations:", err);
    res.status(500).json({ message: "Error al obtener reservas" });
  }
});

// ========================================
//           PRÉSTAMOS DE EQUIPOS
// ========================================

// Handler reutilizable para crear préstamo (lo usamos en /loan y /loans)
async function createLoanHandler(req, res) {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin";

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const fechaPrestamo =
      req.body.fechaPrestamo || req.body.fecha_prestamo || todayStr;

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
      devuelto: false,
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

    // Descontar cantidad del inventario (si se encuentra el item)
    await updateItemQuantityByIdEquipOrCodigo({
      itemId: data.itemId,
      codigo: data.codigo,
      delta: -1,
    });

    // Normalizar salida para el frontend: alias returned / loanDate / returnDate
    const loanOut = {
      id,
      ...data,
      user: userEmail,
      returned: data.devuelto || false,
      loanDate: data.fechaPrestamo || data.fecha_prestamo || null,
      returnDate: data.fechaDevolucion || data.fecha_devolucion || null,
    };

    res.json({
      ok: true,
      loan: loanOut,
    });
  } catch (err) {
    console.error("❌ Error creando préstamo de computación:", err);
    res.status(500).json({ message: "Error al registrar préstamo" });
  }
}

// Registrar préstamo (ruta nueva que usa el frontend: /api/computing/loan)
router.post("/loan", createLoanHandler);

// Mantener compatibilidad con posible uso antiguo: /api/computing/loans
router.post("/loans", createLoanHandler);

// Listar préstamos
router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM loans WHERE lab='computing' ORDER BY id DESC`
    );

    const loans = result.rows.map((row) => {
      const data = row.data || {};
      return {
        id: row.id,
        ...data,
        user: row.user_email || null,
        // Alias para que el frontend pueda usar loan.returned, loanDate, returnDate
        returned: data.devuelto || false,
        loanDate: data.fechaPrestamo || data.fecha_prestamo || null,
        returnDate: data.fechaDevolucion || data.fecha_devolucion || null,
      };
    });

    res.json(loans);
  } catch (err) {
    console.error("❌ Error GET /computing/loans:", err);
    res.status(500).json({ message: "Error al obtener préstamos" });
  }
});

// Handler reutilizable para marcar devolución
async function returnLoanHandler(req, res) {
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
      return res.status(404).json({ message: "Préstamo no encontrado" });
    }

    const row = result.rows[0];
    const data = row.data || {};

    if (data.devuelto) {
      // Ya estaba devuelto, devolvemos el mismo registro normalizado
      const loanOut = {
        id,
        ...data,
        user: row.user_email || null,
        returned: data.devuelto || false,
        loanDate: data.fechaPrestamo || data.fecha_prestamo || null,
        returnDate: data.fechaDevolucion || data.fecha_devolucion || null,
      };
      return res.json({ ok: true, loan: loanOut });
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
      fecha_devolucion: todayStr,
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

    // Sumar cantidad al inventario si se encuentra el item
    await updateItemQuantityByIdEquipOrCodigo({
      itemId: updated.itemId,
      codigo: updated.codigo,
      delta: 1,
    });

    const loanOut = {
      id,
      ...updated,
      user: userEmail,
      returned: true,
      loanDate: updated.fechaPrestamo || updated.fecha_prestamo || null,
      returnDate: updated.fechaDevolucion || updated.fecha_devolucion || null,
    };

    res.json({ ok: true, loan: loanOut });
  } catch (err) {
    console.error("❌ Error marcando devolución de préstamo de computación:", err);
    res.status(500).json({ message: "Error al registrar devolución" });
  }
}

// Ruta nueva que usa el frontend: /api/computing/return/:id
router.post("/return/:id", returnLoanHandler);

// Mantener compatibilidad con ruta antigua: /api/computing/loans/:id/return
router.post("/loans/:id/return", returnLoanHandler);

module.exports = router;
