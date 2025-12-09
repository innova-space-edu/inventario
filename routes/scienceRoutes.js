// routes/scienceRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");
const upload = multer({ dest: "public/uploads/" });

router.post("/items", upload.single("photo"), async (req, res) => {
  try {
    const id = uuidv4();
    const photo = req.file ? `/uploads/${req.file.filename}` : null;
    const userEmail = req.session?.email || "admin@colprovidencia.cl";
    const data = { ...req.body, cantidad: Number(req.body.cantidad) || 1 };

    await query(
      `INSERT INTO items (id, lab, data, photo) VALUES ($1, 'science', $2, $3)`,
      [id, data, photo]
    );

    res.json({ ok: true, item: { id, ...data, photo } });
  } catch (err) {
    console.error("Error POST /science/items:", err);
    res.status(500).json({ error: "Error al agregar material" });
  }
});

router.get("/items", async (req, res) => {
  try {
    const result = await query(`SELECT * FROM items WHERE lab='science' ORDER BY id DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /science/items:", err);
    res.status(500).json({ error: "Error al obtener items" });
  }
});

router.post("/loans", async (req, res) => {
  try {
    const id = uuidv4();
    const userEmail = req.session?.email || "admin@colprovidencia.cl";
    const data = { ...req.body };

    await query(
      `INSERT INTO science_loans (id, data, user_email, loan_date, returned)
       VALUES ($1, $2, $3, NOW(), FALSE)`,
      [id, data, userEmail]
    );

    res.json({ ok: true, loan: { id, ...data } });
  } catch (err) {
    console.error("Error POST /science/loans:", err);
    res.status(500).json({ error: "Error al registrar préstamo" });
  }
});

router.get("/loans", async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM science_loans ORDER BY loan_date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /science/loans:", err);
    res.status(500).json({ error: "Error al obtener préstamos" });
  }
});

router.post("/loans/:id/return", async (req, res) => {
  try {
    const id = req.params.id;
    await query(
      `UPDATE science_loans SET returned = TRUE, return_date = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Error devolviendo préstamo ciencias:", err);
    res.status(500).json({ error: "Error al registrar devolución" });
  }
});

module.exports = router;
