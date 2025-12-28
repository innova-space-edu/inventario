// /public/js/history.js
// Historial + análisis en tab "Historial".
// Espera GET /api/history?lab=science|computing|library&limit=100
// Respuesta: array de logs. Campos típicos aceptados:
// { lab/module, action/action_type, entityType/entity_type, entityId/entity_id, user/created_by, createdAt/created_at, data/details/payload }
//
// ✅ Incluye:
// - Lazy render de gráficos por panel (collapsible) => carga más rápida
// - Donuts para TODOS los gráficos
// - Normalización robusta action/entityType (ES/EN + variantes)
// - Explicaciones automáticas por bloque (sin IA externa)
// - Botones: "Copiar" y "Generar informe" (local, sin API)
// - ✅ NUEVO: "Historial sí o sí" (cola local + auto-flush al cargar)
// - ✅ NUEVO: indicador de cola pendiente en narrativa + AI report

document.addEventListener("DOMContentLoaded", () => {
  const historyTableBody = document.querySelector("#historyTable tbody");
  const labFilter = document.getElementById("historyLabFilter");
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

  // --- Narrativas reales en tu HTML (✅ estos SÍ existen en tu index) ---
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
      return str.length > 180 ? str.slice(0, 180) + "..." : str;
    } catch {
      return safeText(data);
    }
  }

  function normalizeLab(v) {
    const lab = (v || "").toString().trim().toLowerCase();
    if (!lab) return "sin-módulo";
    // normaliza tildes comunes
    if (lab === "computación" || lab === "computacion") return "computing";
    if (lab === "ciencias") return "science";
    if (lab === "biblioteca") return "library";
    return lab;
  }

  function prettyLab(lab) {
    const x = normalizeLab(lab);
    if (x === "computing") return "Sala de Computación";
    if (x === "science") return "Laboratorio de Ciencias";
    if (x === "library") return "Biblioteca";
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

    // préstamos
    if (x === "loan" || x.includes("prest") || x.includes("prést")) return "loan";
    // reservas
    if (x === "reservation" || x.includes("reserv")) return "reservation";
    // inventario
    if (x === "inventory" || x.includes("invent")) return "inventory";

    return x;
  }

  function normalizeAction(raw) {
    const x = (raw || "").toString().trim().toLowerCase();
    if (!x) return "";

    // create / crear / alta
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

    // return / devolver / devuelto / entregado / cerrar
    if (
      x === "return" ||
      x === "returned" ||
      x.includes("devol") ||
      x.includes("entreg") ||
      x.includes("cerr") ||
      x.includes("final")
    )
      return "return";

    // update / editar / modificar / cambio
    if (
      x === "update" ||
      x === "updated" ||
      x.includes("edit") ||
      x.includes("modif") ||
      x.includes("cambi") ||
      x.includes("actualiz")
    )
      return "update";

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
      const d = getDataObj(log);
      if (!d) return "";
      return (
        d.curso ||
        d.room ||
        d.sala ||
        d.ubicacion ||
        d.ubicación ||
        d.grupo ||
        d.location ||
        d.classroom ||
        d.course ||
        ""
      )
        .toString()
        .trim();
    };

    const getPersonTypeFromLog = (log) => {
      const d = getDataObj(log);
      if (!d) return "";
      const raw = (
        d.tipoPersona ||
        d.tipo_persona ||
        d.personType ||
        d.person_type ||
        d.rol ||
        d.role ||
        ""
      )
        .toString()
        .trim()
        .toLowerCase();

      if (raw.includes("estud") || raw.includes("alumn")) return "estudiante";
      if (raw.includes("func") || raw.includes("doc") || raw.includes("prof") || raw.includes("staff") || raw.includes("asist"))
        return "funcionario";

      return raw || "";
    };

    logs.forEach((log) => {
      const lab = normalizeLab(log.lab || log.module);
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

        // returnedAt explícito dentro de data
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

    // narrativa global
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

    // Top 8 + Otros
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

    // Top 6 + Otros
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
      setNarrative(
        elNarrativeModule,
        `Movimientos por módulo (Top + Otros). Módulo más activo: ${stats.topModule || "—"}.`
      );
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

  // Lazy: renderiza SOLO lo del card abierto
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
      lines.push(`• Préstamos con duración ≥ 7 días (con devolución): ${over7} ${over7 > 0 ? "→ recomendable reforzar alertas y recordatorios." : ""}`);
    } else {
      lines.push(`• Duración: no hay devoluciones detectadas aún (RETURN/returnedAt). Cuando se registren, aparecerán promedios y rangos.`);
    }

    // Recomendaciones simples
    const rec = [];
    if ((stats.loansByPersonType?.desconocido || 0) > 0) {
      rec.push("Asegurar que el formulario envíe tipoPersona (estudiante/funcionario).");
    }
    if ((stats.totalLoans || 0) > 0 && (stats.loanDurations || []).length === 0) {
      rec.push("Registrar devoluciones (RETURN o returnedAt) para medir tiempos reales.");
    }
    if (q > 0) {
      rec.push("Revisar conexión/servidor: hay eventos en cola local pendientes por sincronizar.");
    }
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
  // Load history
  // -----------------------
  async function loadHistory() {
    const lab = labFilter ? labFilter.value : "all";
    const limit = limitFilter ? limitFilter.value : "100";

    const params = [];
    if (lab && lab !== "all") params.push(`lab=${encodeURIComponent(lab)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    const qs = params.length ? `?${params.join("&")}` : "";

    try {
      // ✅ Primero intentamos sincronizar cola local (historial sí o sí)
      const queueInfo = await flushHistoryQueue();

      const resp = await apiFetch(`/api/history${qs}`);
      if (!resp.ok) {
        console.error("Error al cargar historial:", resp.status);
        // aun así, muestra cola en narrativa si puedes
        if (statsCache) renderSummary(statsCache, queueInfo);
        return;
      }

      const logs = await resp.json();
      if (!Array.isArray(logs)) return;

      logsCache = logs;

      // Tabla
      historyTableBody.innerHTML = "";

      logsCache
        .slice()
        .sort((a, b) => {
          const da = new Date(inferCreatedAt(a) || 0).getTime();
          const db = new Date(inferCreatedAt(b) || 0).getTime();
          return db - da;
        })
        .forEach((log) => {
          const tr = document.createElement("tr");

          const labText = safeText(log.lab || log.module || "");
          const actionText = safeText(log.action || log.action_type || "");
          const entityType = safeText(log.entityType || log.entity_type || "");
          const entityId = safeText(log.entityId || log.entity_id || "");
          const user = safeText(log.user || log.user_email || log.performed_by || log.created_by || "");

          const createdAt = formatDate(inferCreatedAt(log));
          const details = formatDetails(log.data || log.details || log.payload || log.meta);

          tr.innerHTML = `
            <td>${escapeHTML(createdAt)}</td>
            <td>${escapeHTML(labText)}</td>
            <td>${escapeHTML(actionText)}</td>
            <td>${escapeHTML(entityType)}</td>
            <td>${escapeHTML(entityId)}</td>
            <td>${escapeHTML(user)}</td>
            <td>${escapeHTML(details)}</td>
          `;

          historyTableBody.appendChild(tr);
        });

      if (!historyTableBody.children.length) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `
          <td colspan="7" style="text-align:center; opacity:0.8;">
            No hay movimientos registrados para los filtros seleccionados.
          </td>
        `;
        historyTableBody.appendChild(emptyRow);
      }

      // Stats + números
      statsCache = computeStats(logsCache);
      renderSummary(statsCache, queueInfo);

      // Si no hay collapsibles, renderiza todo
      const hasCollapsibles = document.querySelector(".collapsible-card");
      if (!hasCollapsibles) {
        renderChartsAll(statsCache);
        return;
      }

      // Si hay un panel ya abierto por defecto, renderiza ese
      const opened = document.querySelector('.collapsible-card[data-collapsed="false"]');
      if (opened) renderChartsForCard(opened);
    } catch (err) {
      console.error("Error al cargar historial:", err);
    }
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

  loadHistory();
});
