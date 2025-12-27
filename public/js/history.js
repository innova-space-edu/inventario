// /public/js/history.js
// Historial + análisis en tab Historial.
// Espera GET /api/history?lab=science|computing|library&limit=100
// Respuesta: array de logs. Campos típicos aceptados:
// { lab/module, action/action_type, entityType/entity_type, entityId/entity_id, user/created_by, createdAt/created_at, data/details/payload }

// ✅ ACTUALIZACIÓN (sobre tu archivo):
// - Lazy render de gráficos por panel (collapsible) => carga más rápida
// - Donuts futuristas para TODOS los gráficos (no barras simples)
// - Normalización robusta action/entityType (ES/EN + variantes) => arregla datos que no aparecen
// - Explicaciones automáticas por bloque (sin IA externa; fácil de escalar a IA después)

document.addEventListener("DOMContentLoaded", () => {
  const historyTableBody = document.querySelector("#historyTable tbody");
  const labFilter = document.getElementById("historyLabFilter");
  const limitFilter = document.getElementById("historyLimit");

  // --- IDs reales en tu HTML (Análisis) ---
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

  // --- (Opcional) IDs para explicación/insights (si existen en tu HTML) ---
  const elExplainGlobal = document.getElementById("explainAnalyticsGlobal");
  const elExplainPersonType = document.getElementById("explainLoansByPersonType");
  const elExplainRoom = document.getElementById("explainLoansByRoom");
  const elExplainDuration = document.getElementById("explainLoanDuration");
  const elExplainModule = document.getElementById("explainHistoryByModule");

  // Charts instances
  let chartLoansByPersonType = null;
  let chartLoansByRoom = null;
  let chartLoanDuration = null;
  let chartHistoryByModule = null;

  if (!historyTableBody) return;

  // Helper: guardedFetch o fetch normal
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  // Cache para no recalcular todo al abrir/cerrar paneles
  let logsCache = [];
  let statsCache = null;

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

  function formatDetails(data) {
    if (!data) return "";
    try {
      const str = JSON.stringify(data);
      return str.length > 160 ? str.slice(0, 160) + "..." : str;
    } catch {
      return safeText(data);
    }
  }

  function normalizeLab(v) {
    const lab = (v || "").toString().trim().toLowerCase();
    if (!lab) return "sin-módulo";
    return lab;
  }

  function prettyLab(lab) {
    const x = normalizeLab(lab);
    if (x === "computing" || x === "computacion" || x === "computación") return "Sala de Computación";
    if (x === "science" || x === "ciencias") return "Laboratorio de Ciencias";
    if (x === "library" || x === "biblioteca") return "Biblioteca";
    if (x === "sin-módulo") return "Sin módulo";
    return x.charAt(0).toUpperCase() + x.slice(1);
  }

  function getDataObj(log) {
    const d = log.data || log.details || log.payload || log.meta || null;
    return d && typeof d === "object" ? d : null;
  }

  // -----------------------
  // NORMALIZACIÓN ROBUSTA
  // -----------------------
  function normalizeEntityType(raw) {
    const x = (raw || "").toString().trim().toLowerCase();

    // préstamos
    if (x === "loan" || x.includes("prest") || x.includes("prést") || x.includes("prueba_prestamo")) return "loan";
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
    ) return "create";

    // return / devolver / devuelto / entregado / cerrar
    if (
      x === "return" ||
      x === "returned" ||
      x.includes("devol") ||
      x.includes("entreg") ||
      x.includes("cerr") ||
      x.includes("final")
    ) return "return";

    // update / editar / modificar / cambio
    if (
      x === "update" ||
      x === "updated" ||
      x.includes("edit") ||
      x.includes("modif") ||
      x.includes("cambi") ||
      x.includes("actualiz")
    ) return "update";

    return x;
  }

  function inferEntityType(log) {
    const raw = (log.entityType || log.entity_type || "").toString().trim().toLowerCase();
    if (raw) return normalizeEntityType(raw);

    const d = getDataObj(log);
    const fallback =
      (d?.entityType || d?.entity_type || d?.tipoEntidad || d?.tipo_entidad || d?.tipo || "")
        .toString()
        .trim()
        .toLowerCase();

    return normalizeEntityType(fallback || "");
  }

  function inferAction(log) {
    const raw = (log.action || log.action_type || "").toString().trim().toLowerCase();
    if (raw) return normalizeAction(raw);

    const d = getDataObj(log);
    const fallback =
      (d?.action || d?.action_type || d?.accion || d?.tipoAccion || "")
        .toString()
        .trim()
        .toLowerCase();

    return normalizeAction(fallback || "");
  }

  function inferEntityId(log) {
    const raw = (log.entityId || log.entity_id || "").toString().trim();
    if (raw) return raw;

    const d = getDataObj(log);
    const fallback =
      (d?.entityId || d?.entity_id || d?.id || d?.loanId || d?.loan_id || "")
        .toString()
        .trim();

    return fallback || "";
  }

  function inferCreatedAt(log) {
    const raw = log.createdAt || log.created_at || null;
    if (raw) return raw;

    const d = getDataObj(log);
    return d?.createdAt || d?.created_at || d?.fecha || null;
  }

  function inferReturnedAt(log) {
    const d = getDataObj(log);
    return d?.returnedAt || d?.returned_at || d?.returnAt || d?.return_at || d?.fechaDevolucion || null;
  }

  // ====== STATS ======
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
      ).toString().trim();
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
      ).toString().trim().toLowerCase();

      if (raw.includes("estud") || raw.includes("alumn")) return "estudiante";
      if (raw.includes("func") || raw.includes("doc") || raw.includes("prof") || raw.includes("staff") || raw.includes("asist")) return "funcionario";
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

  // ====== RENDER NUMBERS ======
  function renderSummary(stats) {
    if (elTotalLoans) elTotalLoans.textContent = String(stats.totalLoans || 0);
    if (elStudentLoans) elStudentLoans.textContent = String(stats.loansByPersonType?.estudiante || 0);
    if (elStaffLoans) elStaffLoans.textContent = String(stats.loansByPersonType?.funcionario || 0);

    if (elAvgLoanDays) {
      elAvgLoanDays.textContent =
        stats.avgLoanDays && stats.avgLoanDays > 0 ? stats.avgLoanDays.toFixed(1) : "0";
    }

    if (elTopRoom) elTopRoom.textContent = stats.topRoom || "—";
    if (elTopModule) elTopModule.textContent = stats.topModule || "—";

    // explicación global (si existe)
    if (elExplainGlobal) {
      const txt = [];
      txt.push(`Se analizaron ${stats.totalLogs || 0} movimientos.`);
      if ((stats.totalLoans || 0) === 0) {
        txt.push("Aún no hay préstamos CREATE reconocidos (revisa action/entityType en los logs).");
      } else {
        txt.push(`Hay ${stats.totalLoans} préstamos creados. Promedio de duración: ${stats.avgLoanDays ? stats.avgLoanDays.toFixed(1) : "0"} días (solo con devoluciones detectadas).`);
      }
      txt.push(`Módulo con más movimientos: ${stats.topModule || "—"}.`);
      elExplainGlobal.textContent = txt.join(" ");
    }
  }

  // ====== CHARTS ======
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

  function explain(el, text) {
    if (!el) return;
    el.textContent = text || "";
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
      explain(
        elExplainPersonType,
        `Distribución de préstamos por tipo de persona. Estudiantes: ${pe}%, Funcionarios: ${pf}%. ` +
          (data[2] > 0 ? "Hay registros sin tipo (Desconocido): revisa que el formulario envíe tipoPersona." : "")
      );
    } else {
      explain(elExplainPersonType, "Aún no hay préstamos CREATE detectados para calcular distribución.");
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

    // Top 8 + Otros para que sea legible en donut
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
      explain(
        elExplainRoom,
        `Uso por sala/curso (Top + Otros). Sala/curso más activo: "${stats.topRoom || "—"}". ` +
          `Si aparece "Sin curso/sala", revisa que el payload incluya curso/sala (ej: d.curso o d.sala).`
      );
    } else {
      explain(elExplainRoom, "Aún no hay préstamos CREATE con curso/sala para graficar.");
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
      explain(
        elExplainDuration,
        "Duración de préstamos: aún no hay devoluciones detectadas (RETURN/UPDATE o returnedAt). " +
          "Cuando empiecen a registrar devoluciones, aparecerá la distribución por rangos."
      );
    } else {
      explain(
        elExplainDuration,
        `Duración de préstamos por rangos (solo préstamos con devolución detectada). Promedio: ${stats.avgLoanDays ? stats.avgLoanDays.toFixed(1) : "0"} días.`
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

    // Donut: Top 6 + Otros
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
      explain(
        elExplainModule,
        `Movimientos por módulo (Top + Otros). Módulo más activo: ${stats.topModule || "—"}.`
      );
    } else {
      explain(elExplainModule, "No hay movimientos suficientes para mostrar distribución por módulo.");
    }

    const ctx = cvHistoryByModule.getContext("2d");
    chartHistoryByModule = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, borderWidth: 2, hoverOffset: 6 }] },
      options: doughnutOptions("Movimientos por módulo"),
    });
  }

  // Renderiza SOLO lo que corresponde al panel abierto (lazy render)
  function renderChartsForCard(card) {
    if (!statsCache) return;
    if (!card) return;

    // si Chart no está cargado, salimos (no rompe)
    if (typeof Chart === "undefined") return;

    if (cvLoansByPersonType && card.contains(cvLoansByPersonType)) renderChartPersonType(statsCache);
    if (cvLoansByRoom && card.contains(cvLoansByRoom)) renderChartRoom(statsCache);
    if (cvLoanDuration && card.contains(cvLoanDuration)) renderChartDuration(statsCache);
    if (cvHistoryByModule && card.contains(cvHistoryByModule)) renderChartModule(statsCache);
  }

  // Render ALL (por si no usas collapsibles)
  function renderChartsAll(stats) {
    renderChartPersonType(stats);
    renderChartRoom(stats);
    renderChartDuration(stats);
    renderChartModule(stats);
  }

  // ====== LOAD HISTORY ======
  async function loadHistory() {
    const lab = labFilter ? labFilter.value : "all";
    const limit = limitFilter ? limitFilter.value : "100";

    const params = [];
    if (lab && lab !== "all") params.push(`lab=${encodeURIComponent(lab)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);
    const qs = params.length ? `?${params.join("&")}` : "";

    try {
      const resp = await apiFetch(`/api/history${qs}`);
      if (!resp.ok) {
        console.error("Error al cargar historial:", resp.status);
        return;
      }

      const logs = await resp.json();
      if (!Array.isArray(logs)) return;

      logsCache = logs;

      // Tabla (rápida)
      historyTableBody.innerHTML = "";

      logsCache
        .slice()
        .sort((a, b) => {
          const da = new Date(a.createdAt || a.created_at || 0).getTime();
          const db = new Date(b.createdAt || b.created_at || 0).getTime();
          return db - da;
        })
        .forEach((log) => {
          const tr = document.createElement("tr");

          const labText = safeText(log.lab || log.module || "");
          const actionText = safeText(log.action || log.action_type || "");
          const entityType = safeText(log.entityType || log.entity_type || "");
          const entityId = safeText(log.entityId || log.entity_id || "");
          const user = safeText(
            log.user || log.user_email || log.performed_by || log.created_by || ""
          );

          const createdAt = formatDate(log.createdAt || log.created_at);
          const details = formatDetails(log.data || log.details || log.payload || log.meta);

          tr.innerHTML = `
            <td>${createdAt}</td>
            <td>${labText}</td>
            <td>${actionText}</td>
            <td>${entityType}</td>
            <td>${entityId}</td>
            <td>${user}</td>
            <td>${details}</td>
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
      renderSummary(statsCache);

      // ✅ Lazy: NO renderiza todo al tiro si hay collapsibles (mejor rendimiento)
      // Si NO tienes collapsibles, renderizamos todo (para que no quede vacío)
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

  // Hook: al abrir un panel, renderiza SOLO lo de ese panel
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".collapse-toggle");
    if (!btn) return;

    const card = btn.closest(".collapsible-card");
    if (!card) return;

    // Espera breve a que collapsibles.js actualice data-collapsed
    window.setTimeout(() => {
      const isOpen = card.dataset.collapsed === "false";
      if (isOpen) renderChartsForCard(card);
    }, 60);
  });

  if (labFilter) labFilter.addEventListener("change", loadHistory);
  if (limitFilter) limitFilter.addEventListener("change", loadHistory);

  loadHistory();
});
