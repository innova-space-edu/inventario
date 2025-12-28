// /public/js/reports.js
// Reportes Dirección/UTP en pantalla + export PDF/XLSX.
// Usa /api/history y/o /api/loans (si existe). Si no, usa history para todo.
// ✅ Crea UI dentro del tab Historial si no existe.

document.addEventListener("DOMContentLoaded", () => {
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  const HISTORY_QUEUE_KEY = "inv_history_queue_v1";

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

  function getDataObj(log) {
    const d = log?.data || log?.details || log?.payload || log?.meta || null;
    return d && typeof d === "object" ? d : null;
  }

  function inferAction(log) {
    const raw = (log.action || log.action_type || "").toString().trim().toLowerCase();
    return raw || "";
  }

  function inferEntityType(log) {
    const raw = (log.entityType || log.entity_type || "").toString().trim().toLowerCase();
    return raw || "";
  }

  function inferCreatedAt(log) {
    return log.createdAt || log.created_at || getDataObj(log)?.createdAt || getDataObj(log)?.fecha || null;
  }

  function queueLen() {
    try {
      const raw = localStorage.getItem(HISTORY_QUEUE_KEY);
      const q = raw ? JSON.parse(raw) : [];
      return Array.isArray(q) ? q.length : 0;
    } catch {
      return 0;
    }
  }

  async function getHistory(lab = "all", limit = 500) {
    const params = [];
    if (lab && lab !== "all") params.push(`lab=${encodeURIComponent(lab)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    const qs = params.length ? `?${params.join("&")}` : "";

    const resp = await apiFetch(`/api/history${qs}`);
    if (!resp.ok) throw new Error("history load failed");
    const logs = await resp.json();
    if (!Array.isArray(logs)) return [];
    return logs;
  }

  // ---------- UI ----------
  function ensureReportsUI() {
    const historyPanel = document.getElementById("tab-history");
    if (!historyPanel) return null;

    let container = document.getElementById("reportsPanel");
    if (container) return container;

    container = document.createElement("div");
    container.id = "reportsPanel";
    container.className = "panel-block";
    container.innerHTML = `
      <div class="collapsible-card" data-collapsed="true" id="reports-card">
        <div class="collapsible-header">
          <h3>Reportes para Dirección / UTP</h3>
          <button type="button" class="collapse-toggle" aria-expanded="false">
            <span class="collapse-icon">⌄</span> Mostrar
          </button>
        </div>
        <div class="collapsible-body">

          <div class="filters-row" style="gap:12px; flex-wrap:wrap;">
            <label>
              Módulo
              <select id="repLab">
                <option value="all">Todos</option>
                <option value="science">Ciencias</option>
                <option value="computing">Computación</option>
                <option value="library">Biblioteca</option>
              </select>
            </label>

            <label>
              Desde
              <input type="date" id="repFrom"/>
            </label>

            <label>
              Hasta
              <input type="date" id="repTo"/>
            </label>

            <button type="button" class="btn-secondary" id="btnRepRefresh">Actualizar</button>
            <button type="button" class="btn-secondary" id="btnRepPDF">Descargar PDF</button>
            <button type="button" class="btn-secondary" id="btnRepXLSX">Descargar XLSX</button>
          </div>

          <div class="analytics-summary-grid" style="margin-top:12px;">
            <div class="analytics-card">
              <span class="analytics-label">Movimientos (rango)</span>
              <span class="analytics-value" id="repMovs">0</span>
            </div>
            <div class="analytics-card">
              <span class="analytics-label">Préstamos creados</span>
              <span class="analytics-value" id="repLoans">0</span>
            </div>
            <div class="analytics-card">
              <span class="analytics-label">Devoluciones detectadas</span>
              <span class="analytics-value" id="repReturns">0</span>
            </div>
            <div class="analytics-card">
              <span class="analytics-label">Pendientes (estimado)</span>
              <span class="analytics-value" id="repPending">0</span>
            </div>
            <div class="analytics-card">
              <span class="analytics-label">Cola historial local</span>
              <span class="analytics-value" id="repQueue">0</span>
            </div>
            <div class="analytics-card">
              <span class="analytics-label">Módulo más activo</span>
              <span class="analytics-value" id="repTopMod">—</span>
            </div>
          </div>

          <div class="panel-grid" style="margin-top:12px;">
            <div class="panel-block">
              <div class="chart-card">
                <h4>Top 10 Cursos / Salas (por préstamos)</h4>
                <div class="table-wrapper">
                  <table class="inventory-table" id="repTopRoomsTable">
                    <thead><tr><th>Curso/Sala</th><th>Préstamos</th></tr></thead>
                    <tbody></tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="panel-block">
              <div class="chart-card">
                <h4>Top 10 Personas (por préstamos)</h4>
                <div class="table-wrapper">
                  <table class="inventory-table" id="repTopPeopleTable">
                    <thead><tr><th>Persona</th><th>Préstamos</th></tr></thead>
                    <tbody></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div class="info-box" id="repNarrative" style="margin-top:10px; min-height:72px;">
            Aquí aparecerá un resumen interpretativo para Dirección/UTP.
          </div>

        </div>
      </div>
    `;

    // Insertamos arriba del historial
    const firstBlock = historyPanel.querySelector(".panel-block");
    historyPanel.insertBefore(container, firstBlock || null);
    return container;
  }

  function getUI() {
    return {
      lab: document.getElementById("repLab"),
      from: document.getElementById("repFrom"),
      to: document.getElementById("repTo"),
      btnRefresh: document.getElementById("btnRepRefresh"),
      btnPDF: document.getElementById("btnRepPDF"),
      btnXLSX: document.getElementById("btnRepXLSX"),
      repMovs: document.getElementById("repMovs"),
      repLoans: document.getElementById("repLoans"),
      repReturns: document.getElementById("repReturns"),
      repPending: document.getElementById("repPending"),
      repQueue: document.getElementById("repQueue"),
      repTopMod: document.getElementById("repTopMod"),
      topRoomsBody: document.querySelector("#repTopRoomsTable tbody"),
      topPeopleBody: document.querySelector("#repTopPeopleTable tbody"),
      narrative: document.getElementById("repNarrative"),
    };
  }

  function inRange(dateObj, fromStr, toStr) {
    if (!dateObj || Number.isNaN(dateObj.getTime())) return false;
    const t = dateObj.getTime();
    if (fromStr) {
      const f = new Date(fromStr + "T00:00:00").getTime();
      if (!Number.isNaN(f) && t < f) return false;
    }
    if (toStr) {
      const e = new Date(toStr + "T23:59:59").getTime();
      if (!Number.isNaN(e) && t > e) return false;
    }
    return true;
  }

  function computeReport(logs, { lab, from, to }) {
    const byRoom = {};
    const byPerson = {};
    const movementsByModule = {};
    let movs = 0;
    let loans = 0;
    let returns = 0;

    // Para estimar pendientes: contamos create vs return por loanId
    const loanState = new Map();

    for (const log of logs) {
      const l = normalizeLab(log.lab || log.module);
      if (lab !== "all" && l !== lab) continue;

      const createdAtRaw = inferCreatedAt(log);
      const d = createdAtRaw ? new Date(createdAtRaw) : null;
      if (!inRange(d, from, to)) continue;

      movs++;
      movementsByModule[l] = (movementsByModule[l] || 0) + 1;

      const action = inferAction(log);
      const entityType = inferEntityType(log);
      const data = getDataObj(log) || {};
      const entityId = safeText(log.entityId || log.entity_id || data.loanId || data.id || "");

      // préstamos
      if (entityType.includes("loan") && action.includes("create")) {
        loans++;

        const room = safeText(data.curso || data.sala || data.room || "Sin curso/sala");
        const person = safeText(data.persona || data.nombre || data.solicitante || "Sin persona");

        byRoom[room] = (byRoom[room] || 0) + 1;
        byPerson[person] = (byPerson[person] || 0) + 1;

        if (entityId) loanState.set(entityId, "out");
      }

      // devoluciones
      if (entityType.includes("loan") && (action.includes("return") || action.includes("returned") || action.includes("devol"))) {
        returns++;
        if (entityId) loanState.set(entityId, "in");
      }
    }

    const pending = Array.from(loanState.values()).filter((s) => s === "out").length;

    // top module
    let topMod = "—";
    let topCount = 0;
    Object.entries(movementsByModule).forEach(([k, v]) => {
      if (v > topCount) {
        topCount = v;
        topMod = prettyLab(k);
      }
    });

    const topRooms = Object.entries(byRoom).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topPeople = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const narrative = [
      `Resumen del rango: ${movs} movimientos.`,
      `Préstamos creados: ${loans}. Devoluciones detectadas: ${returns}. Pendientes estimados: ${pending}.`,
      `Módulo más activo: ${topMod}.`,
      `Recomendación: si sube “pendientes”, reforzar recordatorios y política de devolución; si aparecen muchos “Sin curso/sala”, mejorar registro en formularios.`,
    ].join(" ");

    return { movs, loans, returns, pending, topMod, topRooms, topPeople, narrative };
  }

  function renderTopTable(tbody, entries) {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!entries || entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; opacity:.8;">Sin datos</td></tr>`;
      return;
    }
    for (const [name, count] of entries) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${safeText(name)}</td><td>${safeText(count)}</td>`;
      tbody.appendChild(tr);
    }
  }

  function renderReportUI(report) {
    const ui = getUI();
    if (!ui.repMovs) return;

    ui.repMovs.textContent = String(report.movs || 0);
    ui.repLoans.textContent = String(report.loans || 0);
    ui.repReturns.textContent = String(report.returns || 0);
    ui.repPending.textContent = String(report.pending || 0);
    ui.repQueue.textContent = String(queueLen());
    ui.repTopMod.textContent = report.topMod || "—";

    renderTopTable(ui.topRoomsBody, report.topRooms);
    renderTopTable(ui.topPeopleBody, report.topPeople);

    if (ui.narrative) ui.narrative.textContent = report.narrative || "";
  }

  function exportPDF(report, filters) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) return;

    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(14);
    doc.text("Reporte Dirección / UTP – Innova Space Track", 14, 14);

    doc.setFontSize(10);
    doc.text(`Módulo: ${filters.lab === "all" ? "Todos" : prettyLab(filters.lab)}`, 14, 22);
    doc.text(`Rango: ${filters.from || "—"} a ${filters.to || "—"}`, 14, 28);

    doc.autoTable({
      startY: 34,
      head: [["Indicador", "Valor"]],
      body: [
        ["Movimientos (rango)", String(report.movs || 0)],
        ["Préstamos creados", String(report.loans || 0)],
        ["Devoluciones detectadas", String(report.returns || 0)],
        ["Pendientes (estimado)", String(report.pending || 0)],
        ["Módulo más activo", String(report.topMod || "—")],
      ],
      styles: { fontSize: 10 },
    });

    let y = doc.lastAutoTable.finalY + 8;
    doc.text("Top 10 Cursos/Salas", 14, y);
    y += 3;

    doc.autoTable({
      startY: y,
      head: [["Curso/Sala", "Préstamos"]],
      body: (report.topRooms || []).map(([k, v]) => [String(k), String(v)]),
      styles: { fontSize: 9 },
    });

    y = doc.lastAutoTable.finalY + 8;
    doc.text("Top 10 Personas", 14, y);
    y += 3;

    doc.autoTable({
      startY: y,
      head: [["Persona", "Préstamos"]],
      body: (report.topPeople || []).map(([k, v]) => [String(k), String(v)]),
      styles: { fontSize: 9 },
    });

    y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.text("Resumen interpretativo:", 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.text(String(report.narrative || ""), 14, y, { maxWidth: 180 });

    doc.save(`reporte_utp_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function exportXLSX(report, filters) {
    if (typeof XLSX === "undefined") return;

    const wb = XLSX.utils.book_new();

    const summary = [
      { Indicador: "Módulo", Valor: filters.lab === "all" ? "Todos" : prettyLab(filters.lab) },
      { Indicador: "Desde", Valor: filters.from || "" },
      { Indicador: "Hasta", Valor: filters.to || "" },
      { Indicador: "Movimientos", Valor: report.movs || 0 },
      { Indicador: "Préstamos creados", Valor: report.loans || 0 },
      { Indicador: "Devoluciones", Valor: report.returns || 0 },
      { Indicador: "Pendientes", Valor: report.pending || 0 },
      { Indicador: "Módulo más activo", Valor: report.topMod || "—" },
      { Indicador: "Narrativa", Valor: report.narrative || "" },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Resumen");

    const rooms = (report.topRooms || []).map(([k, v]) => ({ Curso_Sala: k, Prestamos: v }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rooms), "Top_Cursos_Salas");

    const people = (report.topPeople || []).map(([k, v]) => ({ Persona: k, Prestamos: v }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people), "Top_Personas");

    XLSX.writeFile(wb, `reporte_utp_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  let lastReport = null;
  let lastFilters = null;

  async function refresh() {
    ensureReportsUI();
    const ui = getUI();
    const filters = {
      lab: (ui.lab?.value || "all").toLowerCase(),
      from: safeText(ui.from?.value || ""),
      to: safeText(ui.to?.value || ""),
    };

    try {
      const logs = await getHistory(filters.lab, 2000); // grande para UTP
      const report = computeReport(logs, filters);
      lastReport = report;
      lastFilters = filters;
      renderReportUI(report);
    } catch {
      renderReportUI({
        movs: 0,
        loans: 0,
        returns: 0,
        pending: 0,
        topMod: "—",
        topRooms: [],
        topPeople: [],
        narrative: "No se pudo cargar el historial desde el servidor. Verifica /api/history.",
      });
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target?.id === "btnRepRefresh") refresh();
    if (e.target?.id === "btnRepPDF" && lastReport && lastFilters) exportPDF(lastReport, lastFilters);
    if (e.target?.id === "btnRepXLSX" && lastReport && lastFilters) exportXLSX(lastReport, lastFilters);
  });

  ensureReportsUI();
  refresh();
});
