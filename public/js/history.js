// /public/js/history.js
// Historial + análisis en tab "Historial".
// Espera GET /api/history?lab=science|computing|library|reservations&limit=100
// Respuesta: array de logs. Campos típicos aceptados:
// { lab/module, action/action_type, entityType/entity_type, entityId/entity_id, user/created_by, createdAt/created_at, data/details/payload }
//
// ✅ Incluye:
// - Lazy render de gráficos por panel (collapsible) => carga más rápida
// - Donuts para TODOS los gráficos
// - Normalización robusta action/entityType (ES/EN + variantes)
// - Explicaciones automáticas por bloque (sin IA externa)
// - Botones: "Copiar" y "Generar informe" (local, sin API)
// - ✅ "Historial sí o sí" (cola local + auto-flush al cargar)
// - ✅ Indicador de cola pendiente en narrativa + AI report
//
// ✅ ACTUALIZADO (sin quitar funciones):
// - Tabla HTML ahora tiene 14 columnas: se renderiza completo (no 7)
// - Filtros: lab + action + search (si existen en index) + limit
// - Mejor inferencia de campos: código, tipoPersona, curso/sala, cantidad, stock antes/después, ip/device
// - Soporta lab "reservations" también (y “reservas”)

document.addEventListener("DOMContentLoaded", () => {
  const historyTableBody = document.querySelector("#historyTable tbody");
  const labFilter = document.getElementById("historyLabFilter");
  const actionFilter = document.getElementById("historyActionFilter");
  const searchInput = document.getElementById("historySearch");
  const limitFilter = document.getElementById("historyLimit");

  // --- IDs reales en tu HTML (Resumen rápido) ---
  const elTotalLoans = document.getElementById("analyticsTotalLoans");
  const elStudentLoans = document.getElementById("analyticsStudentLoans");
  const elStaffLoans = document.getElementById("analyticsStaffLoans");
  const elAvgLoanDays = document.getElementById("analyticsAvgLoanDays");
  const elTopRoom = document.getElementById("analyticsTopRoom");
  const elTopModule = document.getElementById("analyticsTopModule");

  // --- Canvas reales en tu HTML ---
  const cvLoansByPersonType = document.getElementById("chartLoansByPersonType");
  const cvLoansByRoom = document.getElementById("chartLoansByRoom");
  const cvLoanDuration = document.getElementById("chartLoanDuration");
  const cvHistoryByModule = document.getElementById("chartHistoryByModule");

  // --- Narrativas reales en tu HTML ---
  const elNarrativeSummary = document.getElementById("analyticsNarrativeSummary");
  const elNarrativePersonType = document.getElementById("analyticsNarrativePersonType");
  const elNarrativeRoom = document.getElementById("analyticsNarrativeRoom");
  const elNarrativeDuration = document.getElementById("analyticsNarrativeDuration");
  const elNarrativeModule = document.getElementById("analyticsNarrativeModule");

  // --- Panel “Asistente – Explicación automática” (opcional) ---
  const elAIReport = document.getElementById("analyticsAIReport");
  const btnGenerateAIReport = document.getElementById("btnGenerateAIReport");
  const btnCopyAIReport = document.getElementById("btnCopyAIReport");

  // Chart instances
  let chartLoansByPersonType = null;
  let chartLoansByRoom = null;
  let chartLoanDuration = null;
  let chartHistoryByModule = null;

  if (!historyTableBody) return;

  // Helper: guardedFetch o fetch normal
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  // Cache
  let logsCache = [];
  let logsFilteredCache = [];
  let statsCache = null;

  // ✅ Cola local: si el backend falla al registrar history desde otros módulos
  const HISTORY_QUEUE_KEY = "inv_history_queue_v1";

  function getQueuedHistoryCount() {
    try {
      const raw = localStorage.getItem(HISTORY_QUEUE_KEY);
      const q = raw ? JSON.parse(raw) : [];
      return Array.isArray(q) ? q.length : 0;
    } catch {
      return 0;
    }
  }

  async function flushHistoryQueue() {
    // Intenta subir al backend lo pendiente
    let queue = [];
    try {
      const raw = localStorage.getItem(HISTORY_QUEUE_KEY);
      queue = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(queue) || queue.length === 0) return { flushed: 0, remaining: 0 };
    } catch {
      return { flushed: 0, remaining: 0 };
    }

    let flushed = 0;
    const remaining = [];

    for (const ev of queue) {
      try {
        const resp = await apiFetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ev),
        });
        if (!resp.ok) throw new Error("history post failed");
        flushed += 1;
      } catch {
        remaining.push(ev);
      }
    }

    try {
      localStorage.setItem(HISTORY_QUEUE_KEY, JSON.stringify(remaining));
    } catch {}

    return { flushed, remaining: remaining.length };
  }

  // -----------------------
  // Helpers UI
  // -----------------------
  function formatDate(dateValue) {
    if (!dateValue) return "";
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("es-CL");
  }

  function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function escapeHTML(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDetails(data) {
    if (!data) return "";
    try {
      const str = JSON.stringify(data);
      return str.length > 220 ? str.slice(0, 220) + "..." : str;
    } catch {
      return safeText(data);
    }
  }

  function normalizeLab(v) {
    const lab = (v || "").toString().trim().toLowerCase();
    if (!lab) return "sin-módulo";
    if (lab === "computación" || lab === "computacion") return "computing";
    if (lab === "ciencias") return "science";
    if (lab === "biblioteca") return "library";
    if (lab === "reservas" || lab === "reserva" || lab === "reservation" || lab === "reservations") return "reservations";
    return lab;
  }

  function prettyLab(lab) {
    const x = normalizeLab(lab);
    if (x === "computing") return "Sala de Computación";
    if (x === "science") return "Laboratorio de Ciencias";
    if (x === "library") return "Biblioteca";
    if (x === "reservations") return "Reservas";
    if (x === "sin-módulo") return "Sin módulo";
    return x.charAt(0).toUpperCase() + x.slice(1);
  }

  function setNarrative(el, text) {
    if (!el) return;
    el.innerHTML = `<p class="section-description">${escapeHTML(text || "")}</p>`;
  }

  function getDataObj(log) {
    const d = log?.data || log?.details || log?.payload || log?.meta || null;
    return d && typeof d === "object" ? d : null;
  }

  // -----------------------
  // Normalización robusta
  // -----------------------
  function normalizeEntityType(raw) {
    const x = (raw || "").toString().trim().toLowerCase();
    if (!x) return "";

    if (x === "loan" || x.includes("prest") || x.includes("prést")) return "loan";
    if (x === "reservation" || x.includes("reserv")) return "reservation";
    if (x === "inventory" || x.includes("invent")) return "inventory";

    return x;
  }

  function normalizeAction(raw) {
    const x = (raw || "").toString().trim().toLowerCase();
    if (!x) return "";

    if (
      x === "create" ||
      x === "created" ||
      x.includes("crear") ||
      x.includes("creado") ||
      x.includes("alta") ||
      x.includes("nuevo") ||
      x.includes("nueva") ||
      x.includes("registr")
    )
      return "create";

    if (
      x === "return" ||
      x === "returned" ||
      x.includes("devol") ||
      x.includes("entreg") ||
      x.includes("cerr") ||
      x.includes("final")
    )
      return "return";

    if (
      x === "update" ||
      x === "updated" ||
      x.includes("edit") ||
      x.includes("modif") ||
      x.includes("cambi") ||
      x.includes("actualiz")
    )
      return "update";

    if (x === "delete" || x === "deleted" || x.includes("elimin") || x.includes("borr")) return "delete";

    if (x.includes("cancel") && x.includes("reserv")) return "cancel_reserve";

    // si viene “loan” como acción (algunos backends)
    if (x === "loan" || x.includes("prest")) return "loan";

    // si viene “reserve” como acción
    if (x === "reserve" || (x.includes("reserv") && !x.includes("cancel"))) return "reserve";

    return x;
  }

  function inferEntityType(log) {
    const raw = (log.entityType || log.entity_type || "").toString().trim().toLowerCase();
    if (raw) return normalizeEntityType(raw);

    const d = getDataObj(log);
    const fallback = (
      d?.entityType ||
      d?.entity_type ||
      d?.tipoEntidad ||
      d?.tipo_entidad ||
      d?.tipo ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    return normalizeEntityType(fallback || "");
  }

  function inferAction(log) {
    const raw = (log.action || log.action_type || "").toString().trim().toLowerCase();
    if (raw) return normalizeAction(raw);

    const d = getDataObj(log);
    const fallback = (
      d?.action ||
      d?.action_type ||
      d?.accion ||
      d?.tipoAccion ||
      d?.tipo_accion ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    return normalizeAction(fallback || "");
  }

  function inferEntityId(log) {
    const raw = (log.entityId || log.entity_id || "").toString().trim();
    if (raw) return raw;

    const d = getDataObj(log);
    const fallback = (
      d?.entityId ||
      d?.entity_id ||
      d?.id ||
      d?.loanId ||
      d?.loan_id ||
      d?.itemId ||
      d?.item_id ||
      ""
    )
      .toString()
      .trim();

    return fallback || "";
  }

  function inferCreatedAt(log) {
    const raw = log.createdAt || log.created_at || null;
    if (raw) return raw;
    const d = getDataObj(log);
    return d?.createdAt || d?.created_at || d?.fecha || d?.date || null;
  }

  function inferReturnedAt(log) {
    const d = getDataObj(log);
    return (
      d?.returnedAt ||
      d?.returned_at ||
      d?.returnAt ||
      d?.return_at ||
      d?.fechaDevolucion ||
      d?.fecha_devolucion ||
      null
    );
  }

  function inferUser(log) {
    return (
      log.user ||
      log.user_email ||
      log.performed_by ||
      log.created_by ||
      log.createdBy ||
      log.performedBy ||
      ""
    );
  }

  function inferCode(log) {
    const d = getDataObj(log);
    return (
      log.code ||
      log.codigo ||
      d?.codigo ||
      d?.code ||
      d?.itemCode ||
      d?.item_code ||
      d?.bookCode ||
      d?.book_code ||
      ""
    );
  }

  function inferPersonType(log) {
    const d = getDataObj(log);
    const raw = (
      d?.tipoPersona ||
      d?.tipo_persona ||
      d?.personType ||
      d?.person_type ||
      d?.rol ||
      d?.role ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    if (!raw) return "";
    if (raw.includes("estud") || raw.includes("alumn")) return "estudiante";
    if (raw.includes("func") || raw.includes("doc") || raw.includes("prof") || raw.includes("staff") || raw.includes("asist"))
      return "funcionario";
    return raw;
  }

  function inferCursoSala(log) {
    const d = getDataObj(log);
    const lab = normalizeLab(log.lab || log.module || d?.lab || d?.module || "");
    // reservas suelen tener "space"/"sala"
    const space = (d?.space || d?.espacio || d?.sala || d?.room || d?.classroom || "").toString().trim();
    const curso = (d?.curso || d?.course || d?.grupo || d?.group || d?.location || d?.ubicacion || d?.ubicación || "").toString().trim();
    if (lab === "reservations") return space || curso || "";
    return curso || space || "";
  }

  function inferCantidad(log) {
    const d = getDataObj(log);
    const n =
      d?.cantidad ??
      d?.qty ??
      d?.quantity ??
      d?.amount ??
      d?.units ??
      log.cantidad ??
      log.qty ??
      "";
    const val = Number(n);
    return Number.isFinite(val) ? val : "";
  }

  function inferStockBeforeAfter(log) {
    const d = getDataObj(log);
    const before =
      d?.stockBefore ??
      d?.stock_before ??
      d?.stockAntes ??
      d?.stock_antes ??
      d?.beforeStock ??
      d?.before_stock ??
      "";
    const after =
      d?.stockAfter ??
      d?.stock_after ??
      d?.stockDespues ??
      d?.stock_despues ??
      d?.afterStock ??
      d?.after_stock ??
      "";
    const b = Number(before);
    const a = Number(after);
    return {
      before: Number.isFinite(b) ? b : (before === 0 ? 0 : ""),
      after: Number.isFinite(a) ? a : (after === 0 ? 0 : ""),
    };
  }

  function inferIPDevice(log) {
    const d = getDataObj(log);
    const ip =
      log.ip ||
      d?.ip ||
      d?.ipAddress ||
      d?.ip_address ||
      "";
    const dev =
      log.device ||
      d?.device ||
      d?.userAgent ||
      d?.user_agent ||
      "";
    const out = [ip, dev].filter(Boolean).join(" | ");
    return out;
  }

  function prettyAction(action) {
    const a = normalizeAction(action);
    if (a === "create") return "Ingreso/Creación";
    if (a === "update") return "Edición";
    if (a === "delete") return "Eliminación";
    if (a === "loan") return "Préstamo";
    if (a === "return") return "Devolución";
    if (a === "reserve") return "Reserva";
    if (a === "cancel_reserve") return "Cancelación reserva";
    return action || a || "";
  }

  // -----------------------
  // Stats
  // -----------------------
  function computeStats(logs) {
    const movementsByModule = {};
    const loansByPersonType = { estudiante: 0, funcionario: 0, desconocido: 0 };
    const loansByRoom = {};
    const loanDurations = [];
    const loanPairs = new Map();

    let topRoom = null;
    let topRoomCount = 0;

    const getRoomFromLog = (log) => {
      const room = inferCursoSala(log);
      return (room || "").toString().trim();
    };

    const getPersonTypeFromLog = (log) => inferPersonType(log);

    logs.forEach((log) => {
      const lab = normalizeLab(log.lab || log.module || getDataObj(log)?.lab || getDataObj(log)?.module);
      const action = inferAction(log);
      const entityType = inferEntityType(log);
      const entityId = inferEntityId(log);

      const createdAtRaw = inferCreatedAt(log);
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;

      movementsByModule[lab] = (movementsByModule[lab] || 0) + 1;

      // --- préstamos por tipo persona ---
      if (entityType === "loan" && action === "create") {
        const personType = getPersonTypeFromLog(log);

        if (personType === "estudiante") loansByPersonType.estudiante += 1;
        else if (personType === "funcionario") loansByPersonType.funcionario += 1;
        else loansByPersonType.desconocido += 1;

        const room = getRoomFromLog(log);
        const keyRoom = room || "Sin curso/sala";
        loansByRoom[keyRoom] = (loansByRoom[keyRoom] || 0) + 1;

        if (loansByRoom[keyRoom] > topRoomCount) {
          topRoomCount = loansByRoom[keyRoom];
          topRoom = keyRoom;
        }
      }

      // --- duración préstamos ---
      if (entityType === "loan" && createdAt && !Number.isNaN(createdAt.getTime())) {
        const key = `${lab}|${entityId || "sin-id"}`;
        let rec = loanPairs.get(key);
        if (!rec) rec = { created: null, returned: null };

        if (action === "create") {
          if (!rec.created || createdAt < rec.created) rec.created = createdAt;
        } else if (action === "return" || action === "update") {
          if (!rec.returned || createdAt > rec.returned) rec.returned = createdAt;
        }

        const returnedAtRaw = inferReturnedAt(log);
        if (returnedAtRaw) {
          const r = new Date(returnedAtRaw);
          if (!Number.isNaN(r.getTime())) {
            if (!rec.returned || r > rec.returned) rec.returned = r;
          }
        }

        loanPairs.set(key, rec);
      }
    });

    loanPairs.forEach((rec) => {
      if (rec.created && rec.returned) {
        const diffDays = (rec.returned - rec.created) / (1000 * 60 * 60 * 24);
        if (!Number.isNaN(diffDays) && diffDays >= 0) loanDurations.push(diffDays);
      }
    });

    const totalLoans =
      (loansByPersonType.estudiante || 0) +
      (loansByPersonType.funcionario || 0) +
      (loansByPersonType.desconocido || 0);

    const avgLoanDays =
      loanDurations.length > 0
        ? loanDurations.reduce((a, b) => a + b, 0) / loanDurations.length
        : 0;

    let topModule = null;
    let topModuleCount = 0;
    Object.entries(movementsByModule).forEach(([lab, count]) => {
      if (count > topModuleCount) {
        topModuleCount = count;
        topModule = lab;
      }
    });

    return {
      movementsByModule,
      loansByPersonType,
      loansByRoom,
      loanDurations,
      totalLoans,
      avgLoanDays,
      topRoom: topRoom || "—",
      topModule: topModule ? prettyLab(topModule) : "—",
      totalLogs: Array.isArray(logs) ? logs.length : 0,
    };
  }

  // -----------------------
  // Render summary
  // -----------------------
  function renderSummary(stats, queueInfo = null) {
    if (elTotalLoans) elTotalLoans.textContent = String(stats.totalLoans || 0);
    if (elStudentLoans) elStudentLoans.textContent = String(stats.loansByPersonType?.estudiante || 0);
    if (elStaffLoans) elStaffLoans.textContent = String(stats.loansByPersonType?.funcionario || 0);

    if (elAvgLoanDays) {
      elAvgLoanDays.textContent =
        stats.avgLoanDays && stats.avgLoanDays > 0 ? stats.avgLoanDays.toFixed(1) : "0";
    }

    if (elTopRoom) elTopRoom.textContent = stats.topRoom || "—";
    if (elTopModule) elTopModule.textContent = stats.topModule || "—";

    const txt = [];
    txt.push(`Se analizaron ${stats.totalLogs || 0} movimientos del sistema.`);

    const qCount = getQueuedHistoryCount();
    if (queueInfo && (queueInfo.flushed > 0 || queueInfo.remaining >= 0)) {
      txt.push(
        `Cola local (historial sin conexión): se enviaron ${queueInfo.flushed} y quedan ${queueInfo.remaining} pendientes.`
      );
    } else if (qCount > 0) {
      txt.push(`Cola local (historial sin conexión): hay ${qCount} eventos pendientes por sincronizar.`);
    } else {
      txt.push(`Cola local (historial sin conexión): 0 pendientes.`);
    }

    if ((stats.totalLoans || 0) === 0) {
      txt.push(
        "Aún no se detectan préstamos (CREATE) en los logs. Si ya existen préstamos, revisa que entityType sea “loan” y action sea “create/crear/registrar”."
      );
    } else {
      txt.push(
        `Se detectaron ${stats.totalLoans} préstamos creados. Promedio de duración: ${
          stats.avgLoanDays ? stats.avgLoanDays.toFixed(1) : "0"
        } días (solo préstamos donde se detectó devolución).`
      );
    }
    txt.push(`Módulo con más movimientos: ${stats.topModule || "—"}.`);
    setNarrative(elNarrativeSummary, txt.join(" "));
  }

  // -----------------------
  // Charts
  // -----------------------
  function destroyChart(instance) {
    try {
      if (instance) instance.destroy();
    } catch {}
    return null;
  }

  function ensureCanvasHeight(canvas) {
    const parent = canvas?.parentElement;
    if (!parent) return;
    const h = parseFloat(getComputedStyle(parent).height || "0");
    if (!h || h < 260) parent.style.height = "320px";
  }

  function doughnutOptions(titleText) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: "#e5e7eb",
            boxWidth: 14,
            boxHeight: 14,
            padding: 14,
            font: { size: 12, weight: "600" },
          },
        },
        title: {
          display: !!titleText,
          text: titleText,
          color: "#e5e7eb",
          font: { size: 13, weight: "700" },
          padding: { bottom: 10 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || "";
              const val = ctx.parsed || 0;
              return ` ${label}: ${val}`;
            },
          },
        },
      },
    };
  }

  function renderChartPersonType(stats) {
    if (typeof Chart === "undefined") return;
    if (!cvLoansByPersonType) return;

    ensureCanvasHeight(cvLoansByPersonType);
    chartLoansByPersonType = destroyChart(chartLoansByPersonType);

    const labels = ["Estudiante", "Funcionario", "Desconocido"];
    const data = [
      stats.loansByPersonType?.estudiante || 0,
      stats.loansByPersonType?.funcionario || 0,
      stats.loansByPersonType?.desconocido || 0,
    ];

    const total = data.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const pe = Math.round((data[0] / total) * 100);
      const pf = Math.round((data[1] / total) * 100);
      setNarrative(
        elNarrativePersonType,
        `Distribución de préstamos por tipo de persona: Estudiantes ${pe}%, Funcionarios ${pf}%. ${
          data[2] > 0
            ? "Hay registros “Desconocido”: conviene asegurar que el formulario envíe tipoPersona."
            : ""
        }`
      );
    } else {
      setNarrative(elNarrativePersonType, "Aún no hay préstamos (CREATE) detectados para calcular esta distribución.");
    }

    const ctx = cvLoansByPersonType.getContext("2d");
    chartLoansByPersonType = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, borderWidth: 2, hoverOffset: 6 }] },
      options: doughnutOptions("Préstamos por tipo de persona"),
    });
  }

  function renderChartRoom(stats) {
    if (typeof Chart === "undefined") return;
    if (!cvLoansByRoom) return;

    ensureCanvasHeight(cvLoansByRoom);
    chartLoansByRoom = destroyChart(chartLoansByRoom);

    const entries = Object.entries(stats.loansByRoom || {}).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 8);
    const rest = entries.slice(8);

    const labels = top.map(([k]) => k);
    const data = top.map(([, v]) => v);

    if (rest.length) {
      labels.push("Otros");
      data.push(rest.reduce((acc, [, v]) => acc + v, 0));
    }

    const total = data.reduce((a, b) => a + b, 0);
    if (total > 0) {
      setNarrative(
        elNarrativeRoom,
        `Uso por sala/curso (Top + Otros). Sala/curso más activo: “${stats.topRoom || "—"}”. ` +
          `Si aparece “Sin curso/sala”, revisa que el préstamo guarde curso/sala en el payload (ej: data.curso o data.sala).`
      );
    } else {
      setNarrative(elNarrativeRoom, "Aún no hay préstamos (CREATE) con curso/sala para graficar.");
    }

    const ctx = cvLoansByRoom.getContext("2d");
    chartLoansByRoom = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, borderWidth: 2, hoverOffset: 6 }] },
      options: doughnutOptions("Uso por sala / curso"),
    });
  }

  function renderChartDuration(stats) {
    if (typeof Chart === "undefined") return;
    if (!cvLoanDuration) return;

    ensureCanvasHeight(cvLoanDuration);
    chartLoanDuration = destroyChart(chartLoanDuration);

    const buckets = [
      { label: "0-1", min: 0, max: 1 },
      { label: "1-3", min: 1, max: 3 },
      { label: "3-7", min: 3, max: 7 },
      { label: "7-14", min: 7, max: 14 },
      { label: "14+", min: 14, max: Infinity },
    ];
    const counts = buckets.map(() => 0);

    (stats.loanDurations || []).forEach((d) => {
      const days = Number(d);
      if (Number.isNaN(days)) return;
      const idx = buckets.findIndex((b) => days >= b.min && days < b.max);
      if (idx >= 0) counts[idx] += 1;
    });

    if ((stats.loanDurations || []).length === 0) {
      setNarrative(
        elNarrativeDuration,
        "Duración de préstamos: aún no hay devoluciones detectadas (RETURN/UPDATE o returnedAt). " +
          "Cuando registren devoluciones, aparecerá esta distribución."
      );
    } else {
      setNarrative(
        elNarrativeDuration,
        `Duración de préstamos por rangos (solo préstamos con devolución detectada). Promedio: ${
          stats.avgLoanDays ? stats.avgLoanDays.toFixed(1) : "0"
        } días.`
      );
    }

    const ctx = cvLoanDuration.getContext("2d");
    chartLoanDuration = new Chart(ctx, {
      type: "doughnut",
      data: { labels: buckets.map((b) => b.label), datasets: [{ data: counts, borderWidth: 2, hoverOffset: 6 }] },
      options: doughnutOptions("Duración de los préstamos (días)"),
    });
  }

  function renderChartModule(stats) {
    if (typeof Chart === "undefined") return;
    if (!cvHistoryByModule) return;

    ensureCanvasHeight(cvHistoryByModule);
    chartHistoryByModule = destroyChart(chartHistoryByModule);

    const entries = Object.entries(stats.movementsByModule || {}).sort((a, b) => b[1] - a[1]);

    const top = entries.slice(0, 6);
    const rest = entries.slice(6);

    const labels = top.map(([lab]) => prettyLab(lab));
    const data = top.map(([, v]) => v);

    if (rest.length) {
      labels.push("Otros");
      data.push(rest.reduce((acc, [, v]) => acc + v, 0));
    }

    const total = data.reduce((a, b) => a + b, 0);
    if (total > 0) {
      setNarrative(elNarrativeModule, `Movimientos por módulo (Top + Otros). Módulo más activo: ${stats.topModule || "—"}.`);
    } else {
      setNarrative(elNarrativeModule, "No hay movimientos suficientes para mostrar distribución por módulo.");
    }

    const ctx = cvHistoryByModule.getContext("2d");
    chartHistoryByModule = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, borderWidth: 2, hoverOffset: 6 }] },
      options: doughnutOptions("Movimientos por módulo"),
    });
  }

  function renderChartsForCard(card) {
    if (!statsCache || !card) return;
    if (typeof Chart === "undefined") return;

    if (cvLoansByPersonType && card.contains(cvLoansByPersonType)) renderChartPersonType(statsCache);
    if (cvLoansByRoom && card.contains(cvLoansByRoom)) renderChartRoom(statsCache);
    if (cvLoanDuration && card.contains(cvLoanDuration)) renderChartDuration(statsCache);
    if (cvHistoryByModule && card.contains(cvHistoryByModule)) renderChartModule(statsCache);
  }

  function renderChartsAll(stats) {
    renderChartPersonType(stats);
    renderChartRoom(stats);
    renderChartDuration(stats);
    renderChartModule(stats);
  }

  // -----------------------
  // AI report (local)
  // -----------------------
  function buildLocalReport(stats) {
    const lines = [];
    lines.push(`📌 Informe automático (sin IA externa)`);
    lines.push(`• Movimientos analizados: ${stats.totalLogs || 0}`);
    lines.push(`• Préstamos detectados (CREATE): ${stats.totalLoans || 0}`);
    lines.push(
      `• Distribución préstamos: Estudiantes ${stats.loansByPersonType?.estudiante || 0}, Funcionarios ${
        stats.loansByPersonType?.funcionario || 0
      }, Desconocido ${stats.loansByPersonType?.desconocido || 0}`
    );
    lines.push(`• Sala/curso más activo: ${stats.topRoom || "—"}`);
    lines.push(`• Módulo más activo: ${stats.topModule || "—"}`);

    const q = getQueuedHistoryCount();
    lines.push(`• Cola local (historial sin conexión): ${q} pendiente(s)`);

    if ((stats.loanDurations || []).length > 0) {
      lines.push(`• Promedio de duración (con devoluciones): ${stats.avgLoanDays.toFixed(1)} días`);
      const over7 = stats.loanDurations.filter((d) => Number(d) >= 7).length;
      lines.push(
        `• Préstamos con duración ≥ 7 días (con devolución): ${over7} ${
          over7 > 0 ? "→ recomendable reforzar alertas y recordatorios." : ""
        }`
      );
    } else {
      lines.push(
        `• Duración: no hay devoluciones detectadas aún (RETURN/returnedAt). Cuando se registren, aparecerán promedios y rangos.`
      );
    }

    const rec = [];
    if ((stats.loansByPersonType?.desconocido || 0) > 0) rec.push("Asegurar que el formulario envíe tipoPersona (estudiante/funcionario).");
    if ((stats.totalLoans || 0) > 0 && (stats.loanDurations || []).length === 0) rec.push("Registrar devoluciones (RETURN o returnedAt) para medir tiempos reales.");
    if (q > 0) rec.push("Revisar conexión/servidor: hay eventos en cola local pendientes por sincronizar.");
    rec.push("Usar el Top de salas/cursos para planificar reposición y mantención.");

    lines.push("");
    lines.push("✅ Recomendaciones:");
    rec.forEach((r) => lines.push(`- ${r}`));

    return lines.join("\n");
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }

  if (btnGenerateAIReport) {
    btnGenerateAIReport.addEventListener("click", () => {
      if (!elAIReport) return;
      if (!statsCache) {
        elAIReport.textContent = "Informe: (pendiente) — primero carga el historial para generar el informe.";
        return;
      }
      const report = buildLocalReport(statsCache);
      elAIReport.textContent = report;
    });
  }

  if (btnCopyAIReport) {
    btnCopyAIReport.addEventListener("click", async () => {
      if (!elAIReport) return;
      const text = elAIReport.textContent || "";
      if (!text.trim()) return;

      const ok = await copyTextToClipboard(text);
      btnCopyAIReport.textContent = ok ? "Copiado ✅" : "No se pudo copiar";
      setTimeout(() => (btnCopyAIReport.textContent = "Copiar"), 900);
    });
  }

  // -----------------------
  // Filtrado local (UI)
  // -----------------------
  function applyLocalFilters(logs) {
    let out = Array.isArray(logs) ? logs.slice() : [];

    const labVal = labFilter ? normalizeLab(labFilter.value) : "all";
    if (labVal && labVal !== "all") {
      out = out.filter((l) => normalizeLab(l.lab || l.module || getDataObj(l)?.lab || getDataObj(l)?.module) === labVal);
    }

    const actVal = actionFilter ? (actionFilter.value || "all") : "all";
    if (actVal && actVal !== "all") {
      out = out.filter((l) => inferAction(l) === actVal);
    }

    const q = (searchInput?.value || "").toString().trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const d = getDataObj(l);
        const hay = [
          safeText(inferCreatedAt(l)),
          safeText(l.lab || l.module || d?.lab || d?.module),
          safeText(l.action || l.action_type || d?.action || d?.accion),
          safeText(l.entityType || l.entity_type || d?.entityType || d?.tipoEntidad),
          safeText(inferEntityId(l)),
          safeText(inferCode(l)),
          safeText(inferUser(l)),
          safeText(inferPersonType(l)),
          safeText(inferCursoSala(l)),
          safeText(inferCantidad(l)),
          safeText(d?.detalle || d?.detail || d?.descripcion || d?.description || ""),
          safeText(formatDetails(d)),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // orden desc por fecha
    out.sort((a, b) => {
      const da = new Date(inferCreatedAt(a) || 0).getTime();
      const db = new Date(inferCreatedAt(b) || 0).getTime();
      return db - da;
    });

    return out;
  }

  // -----------------------
  // Render tabla (14 columnas)
  // -----------------------
  function renderHistoryTable(logs) {
    historyTableBody.innerHTML = "";

    const rows = Array.isArray(logs) ? logs : [];
    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `
        <td colspan="14" style="text-align:center; opacity:0.8;">
          No hay movimientos registrados para los filtros seleccionados.
        </td>
      `;
      historyTableBody.appendChild(emptyRow);
      return;
    }

    rows.forEach((log) => {
      const d = getDataObj(log) || {};

      const labRaw = safeText(log.lab || log.module || d.lab || d.module || "");
      const lab = prettyLab(labRaw);

      const actionRaw = safeText(log.action || log.action_type || d.action || d.accion || "");
      const actionPretty = prettyAction(actionRaw);

      const entityTypeRaw = safeText(log.entityType || log.entity_type || d.entityType || d.tipoEntidad || "");
      const entityTypeNorm = normalizeEntityType(entityTypeRaw);
      const tipo = entityTypeNorm || entityTypeRaw;

      const entityId = safeText(inferEntityId(log));
      const codigo = safeText(inferCode(log));
      const usuario = safeText(inferUser(log));

      const tipoPersona = safeText(inferPersonType(log));
      const cursoSala = safeText(inferCursoSala(log));

      const cantidad = inferCantidad(log);
      const { before, after } = inferStockBeforeAfter(log);

      const detalle = formatDetails(d);
      const ipDev = safeText(inferIPDevice(log));

      const createdAt = formatDate(inferCreatedAt(log));

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(createdAt)}</td>
        <td>${escapeHTML(lab)}</td>
        <td>${escapeHTML(actionPretty)}</td>
        <td>${escapeHTML(tipo)}</td>
        <td>${escapeHTML(entityId)}</td>
        <td>${escapeHTML(codigo)}</td>
        <td>${escapeHTML(usuario)}</td>
        <td>${escapeHTML(tipoPersona)}</td>
        <td>${escapeHTML(cursoSala)}</td>
        <td>${escapeHTML(cantidad === "" ? "" : String(cantidad))}</td>
        <td>${escapeHTML(before === "" ? "" : String(before))}</td>
        <td>${escapeHTML(after === "" ? "" : String(after))}</td>
        <td>${escapeHTML(detalle)}</td>
        <td>${escapeHTML(ipDev)}</td>
      `;
      historyTableBody.appendChild(tr);
    });
  }

  // -----------------------
  // Load history (backend + cola local)
  // -----------------------
  async function loadHistory() {
    const lab = labFilter ? labFilter.value : "all";
    const limit = limitFilter ? limitFilter.value : "100";

    const params = [];
    if (lab && lab !== "all") params.push(`lab=${encodeURIComponent(lab)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    const qs = params.length ? `?${params.join("&")}` : "";

    try {
      // ✅ Primero sincroniza cola local (historial sí o sí)
      const queueInfo = await flushHistoryQueue();

      const resp = await apiFetch(`/api/history${qs}`);
      if (!resp.ok) {
        console.error("Error al cargar historial:", resp.status);
        // si ya hay stats, al menos actualiza narrativa con cola
        if (statsCache) renderSummary(statsCache, queueInfo);
        return;
      }

      const logs = await resp.json();
      if (!Array.isArray(logs)) return;

      logsCache = logs;

      // aplica filtros UI (action/search) sobre lo que viene del backend
      logsFilteredCache = applyLocalFilters(logsCache);

      // tabla
      renderHistoryTable(logsFilteredCache);

      // stats SIEMPRE desde logs filtrados (más coherente con vista)
      statsCache = computeStats(logsFilteredCache);
      renderSummary(statsCache, queueInfo);

      // si no hay collapsibles, renderiza todo
      const hasCollapsibles = document.querySelector(".collapsible-card");
      if (!hasCollapsibles) {
        renderChartsAll(statsCache);
        return;
      }

      // si hay un panel abierto por defecto, renderiza ese
      const opened = document.querySelector('.collapsible-card[data-collapsed="false"]');
      if (opened) renderChartsForCard(opened);
    } catch (err) {
      console.error("Error al cargar historial:", err);
    }
  }

  // Refiltrado sin volver al backend
  function refreshFromCacheOnly() {
    if (!Array.isArray(logsCache)) return;
    logsFilteredCache = applyLocalFilters(logsCache);
    renderHistoryTable(logsFilteredCache);

    statsCache = computeStats(logsFilteredCache);
    renderSummary(statsCache);

    // si hay algún panel abierto, refresca su chart
    const opened = document.querySelector('.collapsible-card[data-collapsed="false"]');
    if (opened) renderChartsForCard(opened);
  }

  // Hook: al abrir un panel, renderiza SOLO lo del panel abierto
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".collapse-toggle");
    if (!btn) return;

    const card = btn.closest(".collapsible-card");
    if (!card) return;

    window.setTimeout(() => {
      const isOpen = card.dataset.collapsed === "false";
      if (isOpen) renderChartsForCard(card);
    }, 60);
  });

  if (labFilter) labFilter.addEventListener("change", loadHistory);
  if (limitFilter) limitFilter.addEventListener("change", loadHistory);

  // filtros UI locales (no piden al backend)
  if (actionFilter) actionFilter.addEventListener("change", refreshFromCacheOnly);
  if (searchInput) {
    let t = null;
    searchInput.addEventListener("input", () => {
      window.clearTimeout(t);
      t = window.setTimeout(refreshFromCacheOnly, 120);
    });
  }

  loadHistory();
});
