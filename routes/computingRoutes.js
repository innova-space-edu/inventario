// routes/computingRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");
const upload = multer({ dest: "public/uploads/" });

// Helper: actualizar cantidad del item
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
    if (result.rows.length === 0) return;

    const row = result.rows[0];
    const data = row.data || {};
    const current = Number(data.cantidad || data.stock || 0);
    let newQty = current + delta;
    if (newQty < 0) newQty = 0;

    const newData = { ...data, cantidad: newQty, stock: newQty };

    await query(
      `UPDATE items SET data = $1 WHERE id = $2 AND lab = 'computing'`,
      [newData, row.id]
    );
  } catch (err) {
    console.error("Error actualizando cantidad de item (computing):", err);
  }
}

// === ITEMS ===
router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;
    const data = { ...req.body, cantidad: Number(req.body.cantidad) || 1 };

    await query(
      `INSERT INTO items (id, lab, data, photo) VALUES ($1, 'computing', $2, $3)`,
      [id, data, photo]
    );

    await query(
      `INSERT INTO history (id, lab, action, entity_type, entity_id, user_email, data)
       VALUES ($1, 'computing', 'agregar', 'equipo', $2, $3, $4)`,
      [uuidv4(), id, req.session?.email || "admin", data]
    );

    res.json({ ok: true, item: { id, ...data, photo } });
  } catch (err) {
    console.error("Error POST /computing/items:", err);
    res.status(500).json({ message: "Error al agregar equipo" });
  }
});

router.get("/items", async (req, res) => {
  try {
    const result = await query(`SELECT * FROM items WHERE lab='computing' ORDER BY id DESC`);
    const items = result.rows.map(r => ({ id: r.id, ...(r.data || {}), photo: r.photo || null }));
    res.json(items);
  } catch (err) {
    console.error("Error GET /computing/items:", err);
    res.status(500).json({ message: "Error al obtener equipos" });
  }
});

// === RESERVAS ===
router.post("/reservations", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin";
    const data = { ...req.body };

    await query(
      `INSERT INTO reservations (id, lab, data, user_email) VALUES ($1, 'computing', $2, $3)`,
      [id, data, userEmail]
    );

    res.json({ ok: true, reservation: { id, ...data, user: userEmail } });
  } catch (err) {
    console.error("Error POST /computing/reservations:", err);
    res.status(500).json({ message: "Error al registrar reserva" });
  }
});

router.get("/reservations", async (req, res) => {
  try {
    const result = await query(`SELECT * FROM reservations WHERE lab='computing' ORDER BY id DESC`);
    const reservations = result.rows.map(r => ({ id: r.id, ...(r.data || {}), user: r.user_email }));
    res.json(reservations);
  } catch (err) {
    console.error("Error GET /computing/reservations:", err);
    res.status(500).json({ message: "Error al obtener reservas" });
  }
});

// === PRÉSTAMOS (computing_loans) ===
router.post("/loans", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin";
    const today = new Date().toISOString().split("T")[0];
    const data = {
      itemId: req.body.itemId,
      codigo: req.body.codigo || null,
      tipoPersona: req.body.tipoPersona || null,
      persona: req.body.persona,
      curso: req.body.curso || "",
      fecha_prestamo: req.body.fecha_prestamo || today,
      fecha_devolucion: null,
      observaciones: req.body.observaciones || "",
      devuelto: false,
    };

    await query(
      `INSERT INTO computing_loans (id, data, user_email, loan_date, returned)
       VALUES ($1, $2, $3, NOW(), FALSE)`,
      [id, data, userEmail]
    );

    await updateItemQuantityByIdEquipOrCodigo({
      itemId: data.itemId,
      codigo: data.codigo,
      delta: -1,
    });

    res.json({ ok: true, loan: { id, ...data } });
  } catch (err) {
    console.error("Error creando préstamo (computing):", err);
    res.status(500).json({ message: "Error al registrar préstamo" });
  }
});

router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, data, user_email, loan_date, returned, return_date
       FROM computing_loans ORDER BY loan_date DESC`
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
    console.error("Error GET /computing/loans:", err);
    res.status(500).json({ message: "Error al obtener préstamos" });
  }
});

router.post("/loans/:id/return", async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.session?.email || "admin";
    const result = await query(
      `UPDATE computing_loans SET returned = TRUE, return_date = NOW()
       WHERE id = $1 RETURNING data, itemId, codigo`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Préstamo no encontrado" });

    const { data, itemId, codigo } = result.rows[0];
    await updateItemQuantityByIdEquipOrCodigo({ itemId, codigo, delta: 1 });

    res.json({ ok: true, loan: { id, ...data, devuelto: true } });
  } catch (err) {
    console.error("Error devolviendo préstamo (computing):", err);
    res.status(500).json({ message: "Error al registrar devolución" });
  }
});

module.exports = router;
