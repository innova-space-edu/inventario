// /public/js/history.js
// Historial + análisis en tab Historial.
// Espera GET /api/history?lab=science|computing|library&limit=100
// Respuesta: array de logs. Campos típicos aceptados:
// { lab/module, action/action_type, entityType/entity_type, entityId/entity_id, user/created_by, createdAt/created_at, data/details/payload }

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

  let chartLoansByPersonType = null;
  let chartLoansByRoom = null;
  let chartLoanDuration = null;
  let chartHistoryByModule = null;

  if (!historyTableBody) return;

  // Helper: guardedFetch o fetch normal
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  function formatDate(dateValue) {
    if (!dateValue) return "";
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("es-CL");
  }

  function formatDetails(data) {
    if (!data) return "";
    try {
      const str = JSON.stringify(data);
      return str.length > 140 ? str.slice(0, 140) + "..." : str;
    } catch {
      return String(data);
    }
  }

  function normalizeLab(v) {
    const lab = (v || "").toString().trim().toLowerCase();
    if (!lab) return "sin-módulo";
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

  // ====== STATS ======
  function computeStats(logs) {
    const movementsByModule = {}; // total logs por módulo (para gráfico)
    const loansByPersonType = { estudiante: 0, funcionario: 0, desconocido: 0 };
    const loansByRoom = {}; // curso/ubicación/room
    const loanDurations = []; // array de días
    const loanPairs = new Map(); // key: module|entityId -> { created, returned }

    // Para "Top room" y "Top module"
    let topRoom = null;
    let topRoomCount = 0;

    // Heurística para sacar "room/curso":
    // - log.data.curso
    // - log.data.room
    // - log.data.ubicacion
    // - log.data.grupo
    const getRoomFromLog = (log) => {
      const d = log.data || log.details || log.payload || log.meta || null;
      if (!d || typeof d !== "object") return "";
      return (
        d.curso ||
        d.room ||
        d.sala ||
        d.ubicacion ||
        d.grupo ||
        d.location ||
        ""
      ).toString().trim();
    };

    // Heurística persona tipo (loan):
    // - log.data.tipoPersona
    // - log.data.tipo_persona
    // - log.data.personType
    const getPersonTypeFromLog = (log) => {
      const d = log.data || log.details || log.payload || log.meta || null;
      if (!d || typeof d !== "object") return "";
      return (
        d.tipoPersona ||
        d.tipo_persona ||
        d.personType ||
        d.person_type ||
        ""
      ).toString().trim().toLowerCase();
    };

    logs.forEach((log) => {
      const lab = normalizeLab(log.lab || log.module);
      const action = (log.action || log.action_type || "").toString().toLowerCase();
      const entityType = (log.entityType || log.entity_type || "").toString().toLowerCase();
      const entityId = (log.entityId || log.entity_id || "").toString();

      const createdAtRaw = log.createdAt || log.created_at;
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;

      movementsByModule[lab] = (movementsByModule[lab] || 0) + 1;

      // --- Conteo de préstamos por tipo de persona ---
      if (entityType === "loan" && action === "create") {
        const personType = getPersonTypeFromLog(log);
        if (personType === "estudiante") loansByPersonType.estudiante += 1;
        else if (personType === "funcionario") loansByPersonType.funcionario += 1;
        else loansByPersonType.desconocido += 1;

        // --- Conteo por sala/curso ---
        const room = getRoomFromLog(log);
        const keyRoom = room || "Sin curso/sala";
        loansByRoom[keyRoom] = (loansByRoom[keyRoom] || 0) + 1;

        if (loansByRoom[keyRoom] > topRoomCount) {
          topRoomCount = loansByRoom[keyRoom];
          topRoom = keyRoom;
        }
      }

      // --- Duración de préstamos (si hay create + return/update) ---
      if (entityType === "loan" && createdAt && !Number.isNaN(createdAt.getTime())) {
        const key = `${lab}|${entityId}`;
        let rec = loanPairs.get(key);
        if (!rec) rec = { created: null, returned: null };

        if (action === "create") {
          if (!rec.created || createdAt < rec.created) rec.created = createdAt;
        } else if (action === "return" || action === "update") {
          if (!rec.returned || createdAt > rec.returned) rec.returned = createdAt;
        }

        loanPairs.set(key, rec);
      }
    });

    // calcular duraciones
    loanPairs.forEach((rec) => {
      if (rec.created && rec.returned) {
        const diffDays = (rec.returned - rec.created) / (1000 * 60 * 60 * 24);
        if (!Number.isNaN(diffDays) && diffDays >= 0) loanDurations.push(diffDays);
      }
    });

    const totalLoans =
      loansByPersonType.estudiante +
      loansByPersonType.funcionario +
      loansByPersonType.desconocido;

    const avgLoanDays =
      loanDurations.length > 0
        ? loanDurations.reduce((a, b) => a + b, 0) / loanDurations.length
        : 0;

    // top module por movimientos
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
  }

  // ====== CHARTS (Chart.js opcional) ======
  function destroyChart(instance) {
    try {
      if (instance) instance.destroy();
    } catch {}
    return null;
  }

  function renderCharts(stats) {
    if (typeof Chart === "undefined") return; // Si no está Chart.js, no hacemos nada

    // ---- 1) Préstamos por tipo persona (pie/doughnut) ----
    if (cvLoansByPersonType) {
      chartLoansByPersonType = destroyChart(chartLoansByPersonType);
      const ctx = cvLoansByPersonType.getContext("2d");

      const labels = ["Estudiante", "Funcionario", "Desconocido"];
      const data = [
        stats.loansByPersonType.estudiante || 0,
        stats.loansByPersonType.funcionario || 0,
        stats.loansByPersonType.desconocido || 0,
      ];

      chartLoansByPersonType = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{ data }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: "#e5e7eb" } },
          },
        },
      });
    }

    // ---- 2) Uso por sala/curso (bar) ----
    if (cvLoansByRoom) {
      chartLoansByRoom = destroyChart(chartLoansByRoom);
      const ctx = cvLoansByRoom.getContext("2d");

      // Top 10 para que no explote si hay muchos cursos
      const entries = Object.entries(stats.loansByRoom || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const labels = entries.map(([k]) => k);
      const data = entries.map(([, v]) => v);

      chartLoansByRoom = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{ label: "Préstamos", data, borderRadius: 12 }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: "#e5e7eb" } },
          },
          scales: {
            x: { ticks: { color: "#cbd5f5" }, grid: { color: "rgba(148,163,184,0.12)" } },
            y: { beginAtZero: true, ticks: { color: "#cbd5f5" }, grid: { color: "rgba(148,163,184,0.18)" } },
          },
        },
      });
    }

    // ---- 3) Duración de préstamos (histogram-like bar) ----
    if (cvLoanDuration) {
      chartLoanDuration = destroyChart(chartLoanDuration);
      const ctx = cvLoanDuration.getContext("2d");

      // bucket simple: 0-1,1-3,3-7,7-14,14+
      const buckets = [
        { label: "0-1", min: 0, max: 1 },
        { label: "1-3", min: 1, max: 3 },
        { label: "3-7", min: 3, max: 7 },
        { label: "7-14", min: 7, max: 14 },
        { label: "14+", min: 14, max: Infinity },
      ];
      const counts = buckets.map(b => 0);

      (stats.loanDurations || []).forEach(d => {
        const days = Number(d);
        if (Number.isNaN(days)) return;
        const idx = buckets.findIndex(b => days >= b.min && days < b.max);
        if (idx >= 0) counts[idx] += 1;
      });

      chartLoanDuration = new Chart(ctx, {
        type: "bar",
        data: {
          labels: buckets.map(b => b.label),
          datasets: [{ label: "Cantidad de préstamos", data: counts, borderRadius: 12 }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: "#e5e7eb" } },
          },
          scales: {
            x: { ticks: { color: "#cbd5f5" }, grid: { color: "rgba(148,163,184,0.12)" } },
            y: { beginAtZero: true, ticks: { color: "#cbd5f5" }, grid: { color: "rgba(148,163,184,0.18)" } },
          },
        },
      });
    }

    // ---- 4) Movimientos por módulo (bar) ----
    if (cvHistoryByModule) {
      chartHistoryByModule = destroyChart(chartHistoryByModule);
      const ctx = cvHistoryByModule.getContext("2d");

      const entries = Object.entries(stats.movementsByModule || {}).sort((a, b) => b[1] - a[1]);
      const labels = entries.map(([lab]) => prettyLab(lab));
      const data = entries.map(([, v]) => v);

      chartHistoryByModule = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{ label: "Movimientos", data, borderRadius: 12 }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: "#e5e7eb" } },
          },
          scales: {
            x: { ticks: { color: "#cbd5f5" }, grid: { color: "rgba(148,163,184,0.12)" } },
            y: { beginAtZero: true, ticks: { color: "#cbd5f5" }, grid: { color: "rgba(148,163,184,0.18)" } },
          },
        },
      });
    }
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

      historyTableBody.innerHTML = "";

      logs
        .slice()
        .sort((a, b) => {
          const da = new Date(a.createdAt || a.created_at || 0).getTime();
          const db = new Date(b.createdAt || b.created_at || 0).getTime();
          return db - da;
        })
        .forEach((log) => {
          const tr = document.createElement("tr");

          const labText = log.lab || log.module || "";
          const actionText = log.action || log.action_type || "";
          const entityType = log.entityType || log.entity_type || "";
          const entityId = log.entityId || log.entity_id || "";
          const user =
            log.user ||
            log.user_email ||
            log.performed_by ||
            log.created_by ||
            "";

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

      const stats = computeStats(logs);
      renderSummary(stats);
      renderCharts(stats);
    } catch (err) {
      console.error("Error al cargar historial:", err);
    }
  }

  if (labFilter) labFilter.addEventListener("change", loadHistory);
  if (limitFilter) limitFilter.addEventListener("change", loadHistory);

  loadHistory();
});
