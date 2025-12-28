// /public/js/reservations.js
// Tabla de reservas + validación choques + export PDF/XLSX + historial SÍ O SÍ.
// Requiere en HTML (ya lo tienes):
// - Formulario ciencia: #scienceReservationForm
// - (Opcional) si creas formularios de reserva para computing/library, puedes reutilizar la misma lógica
//
// Recomendado backend:
// - GET  /api/reservations?lab=science|computing|library
// - POST /api/reservations   { lab, solicitante, curso, fechaUso, horario, observaciones }
// - DELETE /api/reservations/:id
// - GET  /api/history?...
// - POST /api/history        (para registrar logs)
//
// ✅ Fallback: si falla API de reservas o history, usa localStorage.

document.addEventListener("DOMContentLoaded", () => {
  // --- UI targets (si existen) ---
  const formScience = document.getElementById("scienceReservationForm");

  // Si no existe el form, igual dejamos soporte para la tabla en Historial/Reportes.
  const RES_LS_KEY = "inv_reservations_v1";
  const HISTORY_QUEUE_KEY = "inv_history_queue_v1";

  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  // ---------- Helpers ----------
  const nowISO = () => new Date().toISOString();

  function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function normalizeLab(lab) {
    const x = (lab || "").toString().trim().toLowerCase();
    if (x === "computación" || x === "computacion") return "computing";
    if (x === "ciencias") return "science";
    if (x === "biblioteca") return "library";
    return x || "unknown";
  }

  function prettyLab(lab) {
    const x = normalizeLab(lab);
    if (x === "science") return "Laboratorio de Ciencias";
    if (x === "computing") return "Sala de Computación";
    if (x === "library") return "Biblioteca";
    return x;
  }

  function parseTimeToMinutes(hhmm) {
    // "08:00" => 480
    const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function parseRangeToMinutes(rangeText) {
    // "08:00 - 09:30" | "08:00-09:30"
    const txt = (rangeText || "").toString().replace(/\s+/g, " ").trim();
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(txt);
    if (!m) return null;
    const a = parseTimeToMinutes(m[1]);
    const b = parseTimeToMinutes(m[2]);
    if (a === null || b === null) return null;
    if (b <= a) return null;
    return { start: a, end: b };
  }

  function rangesOverlap(r1, r2) {
    // overlap si: start < otherEnd && otherStart < end
    return r1.start < r2.end && r2.start < r1.end;
  }

  function loadReservationsLocal() {
    try {
      const raw = localStorage.getItem(RES_LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveReservationsLocal(arr) {
    try {
      localStorage.setItem(RES_LS_KEY, JSON.stringify(arr || []));
    } catch {}
  }

  function queueHistory(event) {
    try {
      const raw = localStorage.getItem(HISTORY_QUEUE_KEY);
      const q = raw ? JSON.parse(raw) : [];
      const queue = Array.isArray(q) ? q : [];
      queue.push(event);
      localStorage.setItem(HISTORY_QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }

  async function flushHistoryQueue() {
    let queue = [];
    try {
      const raw = localStorage.getItem(HISTORY_QUEUE_KEY);
      queue = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(queue) || queue.length === 0) return;
    } catch {
      return;
    }

    // intenta enviar en lote (uno a uno)
    const remaining = [];
    for (const ev of queue) {
      const ok = await logHistory(ev, { allowQueue: false });
      if (!ok) remaining.push(ev);
    }
    try {
      localStorage.setItem(HISTORY_QUEUE_KEY, JSON.stringify(remaining));
    } catch {}
  }

  async function logHistory(payload, { allowQueue = true } = {}) {
    // payload recomendado:
    // { lab, action, entityType, entityId, user, createdAt, data }
    const ev = {
      lab: normalizeLab(payload.lab),
      action: payload.action || "create",
      entityType: payload.entityType || "reservation",
      entityId: payload.entityId || "",
      user: payload.user || "",
      createdAt: payload.createdAt || nowISO(),
      data: payload.data || {},
    };

    try {
      const resp = await apiFetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
      });
      if (!resp.ok) throw new Error("history post failed");
      return true;
    } catch (e) {
      if (allowQueue) queueHistory(ev);
      return false;
    }
  }

  async function getReservationsAPI(lab = "all") {
    const qs = lab && lab !== "all" ? `?lab=${encodeURIComponent(lab)}` : "";
    const resp = await apiFetch(`/api/reservations${qs}`);
    if (!resp.ok) throw new Error(`GET reservations failed ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data)) throw new Error("Invalid reservations response");
    return data;
  }

  async function createReservationAPI(body) {
    const resp = await apiFetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`POST reservations failed ${resp.status}`);
    return await resp.json(); // idealmente devuelve el registro con id
  }

  async function deleteReservationAPI(id) {
    const resp = await apiFetch(`/api/reservations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!resp.ok) throw new Error(`DELETE reservations failed ${resp.status}`);
    return true;
  }

  // ---------- Choques ----------
  function hasCollision(newRes, existingList) {
    // choque: mismo lab + misma fechaUso + horario traslapado
    // si el horario no parsea, se considera "sin horario" => no choque por horas (pero sí se muestra advertencia)
    const lab = normalizeLab(newRes.lab);
    const date = safeText(newRes.fechaUso || newRes.fecha_uso || "").slice(0, 10);
    const newRange = parseRangeToMinutes(newRes.horario || "");

    for (const r of existingList) {
      const rLab = normalizeLab(r.lab || r.module);
      const rDate = safeText(r.fechaUso || r.fecha_uso || r.fecha || "").slice(0, 10);
      if (rLab !== lab) continue;
      if (!date || !rDate || date !== rDate) continue;

      const rRange = parseRangeToMinutes(r.horario || "");
      if (!newRange || !rRange) continue; // si no hay rango válido, no forzamos choque
      if (rangesOverlap(newRange, rRange)) return true;
    }
    return false;
  }

  // ---------- UI: Tabla (inyectada en Historial si quieres) ----------
  // Si no tienes tabla de reservas en tu HTML, la creamos dentro del tab historial arriba de la tabla de history.
  function ensureReservationsUI() {
    const historyPanel = document.getElementById("tab-history");
    if (!historyPanel) return null;

    let container = document.getElementById("reservationsPanel");
    if (container) return container;

    container = document.createElement("div");
    container.id = "reservationsPanel";
    container.className = "panel-block";
    container.innerHTML = `
      <div class="collapsible-card" data-collapsed="true" id="reservations-card">
        <div class="collapsible-header">
          <h3>Tabla de reservas (con validación de choques)</h3>
          <button type="button" class="collapse-toggle" aria-expanded="false">
            <span class="collapse-icon">⌄</span> Mostrar
          </button>
        </div>
        <div class="collapsible-body">
          <div class="filters-row" style="gap:12px; flex-wrap:wrap;">
            <label>
              Módulo
              <select id="resLabFilter">
                <option value="all">Todos</option>
                <option value="science">Ciencias</option>
                <option value="computing">Computación</option>
                <option value="library">Biblioteca</option>
              </select>
            </label>

            <label>
              Fecha
              <input type="date" id="resDateFilter"/>
            </label>

            <label style="min-width:260px;">
              Buscar
              <input type="text" id="resSearch" placeholder="Solicitante, curso, horario..."/>
            </label>

            <button type="button" class="btn-secondary" id="btnExportResPDF">Exportar PDF</button>
            <button type="button" class="btn-secondary" id="btnExportResXLSX">Exportar XLSX</button>
          </div>

          <div class="table-wrapper">
            <table class="inventory-table" id="reservationsTable">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Módulo</th>
                  <th>Fecha</th>
                  <th>Horario</th>
                  <th>Solicitante</th>
                  <th>Curso/Grupo</th>
                  <th>Observaciones</th>
                  <th>Origen</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>

          <div class="info-box" id="resHint" style="margin-top:10px;">
            Tip: la validación de choques se hace por módulo + fecha + traslape de horario.
          </div>
        </div>
      </div>
    `;

    // insertamos arriba del historial tabla
    const firstBlock = historyPanel.querySelector(".panel-block");
    historyPanel.insertBefore(container, firstBlock || null);

    return container;
  }

  let reservationsCache = [];
  let reservationsSource = "api"; // api | local

  async function loadReservations() {
    const panel = ensureReservationsUI();
    if (!panel) return;

    // primero intentamos API, si falla usamos local
    try {
      reservationsCache = await getReservationsAPI("all");
      reservationsSource = "api";
    } catch {
      reservationsCache = loadReservationsLocal();
      reservationsSource = "local";
    }

    renderReservationsTable();
    await flushHistoryQueue(); // intenta mandar lo pendiente al abrir
  }

  function getResUI() {
    return {
      tbody: document.querySelector("#reservationsTable tbody"),
      lab: document.getElementById("resLabFilter"),
      date: document.getElementById("resDateFilter"),
      search: document.getElementById("resSearch"),
      btnPDF: document.getElementById("btnExportResPDF"),
      btnXLSX: document.getElementById("btnExportResXLSX"),
    };
  }

  function filteredReservations() {
    const ui = getResUI();
    const lab = (ui.lab?.value || "all").toLowerCase();
    const date = safeText(ui.date?.value || "").slice(0, 10);
    const q = (ui.search?.value || "").toString().trim().toLowerCase();

    return (reservationsCache || []).filter((r) => {
      const rLab = normalizeLab(r.lab || r.module);
      const rDate = safeText(r.fechaUso || r.fecha_uso || r.fecha || "").slice(0, 10);

      if (lab !== "all" && rLab !== lab) return false;
      if (date && rDate !== date) return false;

      if (q) {
        const hay = [
          safeText(r.solicitante),
          safeText(r.curso),
          safeText(r.horario),
          safeText(r.observaciones),
          prettyLab(rLab),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderReservationsTable() {
    const ui = getResUI();
    if (!ui.tbody) return;

    const rows = filteredReservations()
      .slice()
      .sort((a, b) => {
        const da = new Date(a.createdAt || a.created_at || a.fechaUso || 0).getTime();
        const db = new Date(b.createdAt || b.created_at || b.fechaUso || 0).getTime();
        return db - da;
      });

    ui.tbody.innerHTML = "";

    if (rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9" style="text-align:center; opacity:.8;">No hay reservas para los filtros seleccionados.</td>`;
      ui.tbody.appendChild(tr);
      return;
    }

    rows.forEach((r) => {
      const id = safeText(r.id || r._id || r.reservationId || "");
      const lab = normalizeLab(r.lab || r.module);
      const date = safeText(r.fechaUso || r.fecha_uso || r.fecha || "").slice(0, 10);
      const horario = safeText(r.horario || "");
      const solicitante = safeText(r.solicitante || "");
      const curso = safeText(r.curso || "");
      const obs = safeText(r.observaciones || "");
      const origin = reservationsSource === "api" ? "Servidor" : "Local";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${id ? id : "—"}</td>
        <td>${prettyLab(lab)}</td>
        <td>${date || "—"}</td>
        <td>${horario || "—"}</td>
        <td>${solicitante || "—"}</td>
        <td>${curso || "—"}</td>
        <td>${obs || ""}</td>
        <td>${origin}</td>
        <td>
          <button class="btn-ghost" data-action="delete" data-id="${id}">Eliminar</button>
        </td>
      `;
      ui.tbody.appendChild(tr);
    });
  }

  async function handleDeleteReservation(id) {
    if (!id) return;

    // borra en API si se puede
    if (reservationsSource === "api") {
      try {
        await deleteReservationAPI(id);
      } catch {
        // si falla, hacemos borrado local del cache para no dejarlo pegado
      }
    }

    // borra del cache (y local si corresponde)
    reservationsCache = (reservationsCache || []).filter((x) => safeText(x.id || x._id) !== safeText(id));
    if (reservationsSource === "local") saveReservationsLocal(reservationsCache);

    // historial sí o sí
    await logHistory({
      lab: "unknown",
      action: "delete",
      entityType: "reservation",
      entityId: id,
      data: { note: "Reserva eliminada desde tabla", reservationId: id },
    });

    renderReservationsTable();
  }

  // ---------- Export ----------
  function exportReservationsPDF(rows) {
    if (!rows || rows.length === 0) return;

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) return;

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Tabla de Reservas – Innova Space Track", 14, 14);

    const body = rows.map((r) => {
      const lab = prettyLab(r.lab || r.module);
      const date = safeText(r.fechaUso || r.fecha_uso || r.fecha || "").slice(0, 10);
      return [
        safeText(r.id || r._id || ""),
        lab,
        date,
        safeText(r.horario || ""),
        safeText(r.solicitante || ""),
        safeText(r.curso || ""),
        safeText(r.observaciones || ""),
      ];
    });

    doc.autoTable({
      startY: 20,
      head: [["ID", "Módulo", "Fecha", "Horario", "Solicitante", "Curso/Grupo", "Observaciones"]],
      body,
      styles: { fontSize: 9 },
    });

    doc.save(`reservas_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function exportReservationsXLSX(rows) {
    if (!rows || rows.length === 0) return;
    if (typeof XLSX === "undefined") return;

    const data = rows.map((r) => ({
      ID: safeText(r.id || r._id || ""),
      Modulo: prettyLab(r.lab || r.module),
      Fecha: safeText(r.fechaUso || r.fecha_uso || r.fecha || "").slice(0, 10),
      Horario: safeText(r.horario || ""),
      Solicitante: safeText(r.solicitante || ""),
      Curso_Grupo: safeText(r.curso || ""),
      Observaciones: safeText(r.observaciones || ""),
      CreatedAt: safeText(r.createdAt || r.created_at || ""),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reservas");
    XLSX.writeFile(wb, `reservas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ---------- Form submit (Science) ----------
  async function handleCreateReservationFromForm(form, lab) {
    const fd = new FormData(form);
    const payload = {
      lab: normalizeLab(lab),
      solicitante: safeText(fd.get("solicitante")),
      curso: safeText(fd.get("curso")),
      fechaUso: safeText(fd.get("fechaUso")).slice(0, 10),
      horario: safeText(fd.get("horario")),
      observaciones: safeText(fd.get("observaciones")),
      createdAt: nowISO(),
    };

    // valida horario si viene
    if (payload.horario && !parseRangeToMinutes(payload.horario)) {
      alert("Horario inválido. Usa formato: 08:00 - 09:30");
      return;
    }

    // carga lista actual para validar choque (si no está cargada aún, intenta)
    if (!reservationsCache || reservationsCache.length === 0) {
      await loadReservations();
    }

    // choque
    if (hasCollision(payload, reservationsCache)) {
      alert(
        `Choque detectado.\n\nYa existe una reserva en ${prettyLab(payload.lab)} el ${payload.fechaUso} con horario traslapado.\nCambia el horario o la fecha.`
      );
      return;
    }

    // guardar (API primero, fallback local)
    let created = null;
    try {
      created = await createReservationAPI(payload);
      reservationsSource = "api";
    } catch {
      const localList = loadReservationsLocal();
      const localId = `RES-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      created = { ...payload, id: localId };
      localList.push(created);
      saveReservationsLocal(localList);
      reservationsSource = "local";
    }

    // refresca cache
    await loadReservations();

    // historial sí o sí
    await logHistory({
      lab: payload.lab,
      action: "create",
      entityType: "reservation",
      entityId: safeText(created?.id || created?._id || ""),
      data: {
        ...payload,
        note: "Reserva registrada",
      },
    });

    form.reset();
  }

  // ---------- Events ----------
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("#reservationsTable button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (action === "delete") {
      const ok = confirm("¿Eliminar esta reserva?");
      if (!ok) return;
      await handleDeleteReservation(id);
    }
  });

  document.addEventListener("input", (e) => {
    if (
      e.target?.id === "resSearch" ||
      e.target?.id === "resDateFilter" ||
      e.target?.id === "resLabFilter"
    ) {
      renderReservationsTable();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target?.id === "resLabFilter" || e.target?.id === "resDateFilter") {
      renderReservationsTable();
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target?.id === "btnExportResPDF") {
      exportReservationsPDF(filteredReservations());
    }
    if (e.target?.id === "btnExportResXLSX") {
      exportReservationsXLSX(filteredReservations());
    }
  });

  if (formScience) {
    formScience.addEventListener("submit", (e) => {
      e.preventDefault();
      handleCreateReservationFromForm(formScience, "science");
    });
  }

  // Init
  loadReservations();
});
