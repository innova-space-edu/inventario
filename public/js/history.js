// /public/js/history.js
// Muestra el historial de movimientos del inventario (altas, bajas, reservas, préstamos, etc.)
// Espera que el backend tenga un endpoint GET /api/history con parámetros opcionales:
//   ?lab=science|computing|library
//   ?limit=50|100|...
//
// Respuesta esperada: array de objetos tipo:
// {
//   id, lab, action, entityType, entityId,
//   user, createdAt, data
// }

document.addEventListener('DOMContentLoaded', () => {
  const historyTableBody = document.querySelector('#historyTable tbody');
  const labFilter = document.getElementById('historyLabFilter');
  const limitFilter = document.getElementById('historyLimit');

  // NUEVO: contenedores para análisis y gráficos
  const summaryContainer = document.getElementById('historySummary');
  const labChartCanvas = document.getElementById('historyLabChart');
  const loanDurationChartCanvas = document.getElementById('historyLoanDurationChart');

  let labChartInstance = null;
  let loanDurationChartInstance = null;

  // Si no existe la tabla de historial, salimos sin hacer nada
  if (!historyTableBody) return;

  // Helper para usar guardedFetch si existe, o fetch normal con credenciales
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, { credentials: 'include', ...options }));

  function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CL');
  }

  function formatDetails(data) {
    if (!data) return '';
    try {
      const str = JSON.stringify(data);
      if (str.length > 140) {
        return str.slice(0, 140) + '...';
      }
      return str;
    } catch {
      return String(data);
    }
  }

  // =======================
  //   CÁLCULO DE ESTADÍSTICAS
  // =======================
  function computeStats(logs) {
    const actionsByLab = {};
    const loansByLab = {};
    const reservationsByLab = {};
    const loanEvents = new Map(); // key: lab|loanId -> { lab, loanId, created, returned }

    let totalLoans = 0;
    let totalReservations = 0;

    logs.forEach((log) => {
      const lab = (log.lab || log.module || 'sin-módulo').toLowerCase();
      const action = (log.action || log.action_type || '').toLowerCase();
      const entityType = (log.entityType || log.entity_type || '').toLowerCase();
      const entityId = log.entityId || log.entity_id || '';

      const createdAtRaw = log.createdAt || log.created_at;
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;

      // Conteo general por módulo
      actionsByLab[lab] = (actionsByLab[lab] || 0) + 1;

      // Préstamos creados
      if (entityType === 'loan' && action === 'create') {
        loansByLab[lab] = (loansByLab[lab] || 0) + 1;
        totalLoans += 1;
      }

      // Reservas creadas
      if (entityType === 'reservation' && action === 'create') {
        reservationsByLab[lab] = (reservationsByLab[lab] || 0) + 1;
        totalReservations += 1;
      }

      // Eventos de préstamo (para calcular duración)
      if (entityType === 'loan' && createdAt && !Number.isNaN(createdAt.getTime())) {
        const key = `${lab}|${entityId}`;
        let rec = loanEvents.get(key);
        if (!rec) {
          rec = { lab, loanId: entityId, created: null, returned: null };
        }
        if (action === 'create') {
          if (!rec.created || createdAt < rec.created) {
            rec.created = createdAt;
          }
        } else if (action === 'update' || action === 'return') {
          if (!rec.returned || createdAt > rec.returned) {
            rec.returned = createdAt;
          }
        }
        loanEvents.set(key, rec);
      }
    });

    // Duración promedio de préstamos por lab
    const durationByLab = {};
    const durationCountByLab = {};

    loanEvents.forEach((rec) => {
      if (rec.created && rec.returned) {
        const diffMs = rec.returned - rec.created;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (!Number.isNaN(diffDays) && diffDays >= 0) {
          durationByLab[rec.lab] = (durationByLab[rec.lab] || 0) + diffDays;
          durationCountByLab[rec.lab] = (durationCountByLab[rec.lab] || 0) + 1;
        }
      }
    });

    const avgLoanDurationByLab = {};
    let totalDuration = 0;
    let totalDurationCount = 0;

    Object.keys(durationByLab).forEach((lab) => {
      const sum = durationByLab[lab];
      const count = durationCountByLab[lab] || 1;
      const avg = sum / count;
      avgLoanDurationByLab[lab] = avg;
      totalDuration += sum;
      totalDurationCount += count;
    });

    const globalAvgLoanDuration =
      totalDurationCount > 0 ? totalDuration / totalDurationCount : 0;

    // "Uso" total por módulo: préstamos + reservas
    const usageByLab = {};
    const allLabs = new Set([
      ...Object.keys(actionsByLab),
      ...Object.keys(loansByLab),
      ...Object.keys(reservationsByLab),
    ]);

    allLabs.forEach((lab) => {
      const loans = loansByLab[lab] || 0;
      const res = reservationsByLab[lab] || 0;
      usageByLab[lab] = loans + res;
    });

    return {
      totalLogs: logs.length,
      actionsByLab,
      loansByLab,
      reservationsByLab,
      usageByLab,
      avgLoanDurationByLab,
      totalLoans,
      totalReservations,
      globalAvgLoanDuration,
    };
  }

  // =======================
  //   RENDER RESUMEN NUMÉRICO
  // =======================
  function renderSummary(stats) {
    if (!summaryContainer) return;

    const {
      totalLogs,
      totalLoans,
      totalReservations,
      usageByLab,
      globalAvgLoanDuration,
    } = stats;

    // Lab más usado
    let topLab = null;
    let topLabUsage = 0;
    Object.entries(usageByLab).forEach(([lab, count]) => {
      if (count > topLabUsage) {
        topLabUsage = count;
        topLab = lab;
      }
    });

    const prettyLab = (lab) => {
      if (!lab) return 'Sin módulo';
      if (lab === 'computing') return 'Sala de Computación';
      if (lab === 'science') return 'Laboratorio de Ciencias';
      if (lab === 'library') return 'Biblioteca';
      return lab.charAt(0).toUpperCase() + lab.slice(1);
    };

    summaryContainer.innerHTML = `
      <div class="panel-grid">
        <div class="info-box">
          <strong>Total de movimientos registrados:</strong> ${totalLogs}<br>
          <span style="opacity:0.8;">(altas, bajas, reservas, préstamos, cambios, etc.)</span>
        </div>
        <div class="info-box">
          <strong>Préstamos creados:</strong> ${totalLoans}<br>
          <strong>Reservas creadas:</strong> ${totalReservations}
        </div>
        <div class="info-box">
          <strong>Duración promedio de préstamos:</strong>
          ${globalAvgLoanDuration ? globalAvgLoanDuration.toFixed(1) + ' días' : 'sin datos'}<br>
          <span style="opacity:0.8;">(solo préstamos con registro de devolución)</span>
        </div>
        <div class="info-box">
          <strong>Módulo con mayor uso:</strong>
          ${topLab ? prettyLab(topLab) : 'sin datos'}<br>
          <span style="opacity:0.8;">${topLabUsage ? topLabUsage + ' movimientos (préstamos + reservas)' : ''}</span>
        </div>
      </div>
    `;
  }

  // =======================
  //   GRÁFICAS FUTURISTAS (Chart.js)
  // =======================
  function renderCharts(stats) {
    if (typeof Chart === 'undefined') {
      // Si Chart.js no está cargado, solo mostramos el resumen numérico
      return;
    }

    const { usageByLab, avgLoanDurationByLab } = stats;

    const labelsUsage = Object.keys(usageByLab);
    const dataUsage = labelsUsage.map((lab) => usageByLab[lab]);

    const labelsDuration = Object.keys(avgLoanDurationByLab);
    const dataDuration = labelsDuration.map((lab) => avgLoanDurationByLab[lab]);

    // Colores futuristas degradados
    const baseColors = [
      'rgba(59,130,246,0.9)',   // azul
      'rgba(129,140,248,0.9)',  // índigo
      'rgba(56,189,248,0.9)',   // celeste
      'rgba(236,72,153,0.9)',   // fucsia
      'rgba(34,197,94,0.9)',    // verde
    ];
    const getColor = (i) => baseColors[i % baseColors.length];

    // ---- Gráfico de uso por módulo ----
    if (labChartCanvas) {
      const ctx = labChartCanvas.getContext('2d');
      if (labChartInstance) labChartInstance.destroy();

      labChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labelsUsage,
          datasets: [
            {
              label: 'Préstamos + Reservas',
              data: dataUsage,
              backgroundColor: labelsUsage.map((_, i) => getColor(i)),
              borderRadius: 12,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              labels: { color: '#e5e7eb' },
            },
            title: {
              display: false,
            },
          },
          scales: {
            x: {
              ticks: { color: '#cbd5f5' },
              grid: { color: 'rgba(148,163,184,0.15)' },
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#cbd5f5' },
              grid: { color: 'rgba(148,163,184,0.2)' },
            },
          },
        },
      });
    }

    // ---- Gráfico de duración promedio de préstamos ----
    if (loanDurationChartCanvas) {
      const ctx2 = loanDurationChartCanvas.getContext('2d');
      if (loanDurationChartInstance) loanDurationChartInstance.destroy();

      loanDurationChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: labelsDuration,
          datasets: [
            {
              label: 'Días promedio por préstamo',
              data: dataDuration,
              backgroundColor: labelsDuration.map((_, i) => getColor(i + 2)),
              borderRadius: 12,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              labels: { color: '#e5e7eb' },
            },
            title: {
              display: false,
            },
          },
          scales: {
            x: {
              ticks: { color: '#cbd5f5' },
              grid: { color: 'rgba(148,163,184,0.15)' },
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#cbd5f5' },
              grid: { color: 'rgba(148,163,184,0.2)' },
            },
          },
        },
      });
    }
  }

  // =======================
  //   CARGA DEL HISTORIAL
  // =======================
  async function loadHistory() {
    const lab = labFilter ? labFilter.value : 'all';
    const limit = limitFilter ? limitFilter.value : '100';

    const params = [];
    if (lab && lab !== 'all') params.push(`lab=${encodeURIComponent(lab)}`);
    if (limit) params.push(`limit=${encodeURIComponent(limit)}`);

    const qs = params.length ? `?${params.join('&')}` : '';

    try {
      const resp = await apiFetch(`/api/history${qs}`);

      if (!resp.ok) {
        console.error('Error al cargar historial:', resp.status);
        return;
      }

      const logs = await resp.json();
      if (!Array.isArray(logs)) return;

      historyTableBody.innerHTML = '';

      // Por si el backend no los ordena: ordenamos por fecha descendente (más reciente primero)
      logs
        .slice()
        .sort((a, b) => {
          const da = new Date(a.createdAt || a.created_at || 0).getTime();
          const db = new Date(b.createdAt || b.created_at || 0).getTime();
          return db - da;
        })
        .forEach((log) => {
          const tr = document.createElement('tr');

          const labText = log.lab || log.module || '';
          const actionText = log.action || log.action_type || '';
          const entityType = log.entityType || log.entity_type || '';
          const entityId = log.entityId || log.entity_id || '';
          const user =
            log.user ||
            log.user_email ||
            log.performed_by ||
            log.created_by ||
            '';
          const createdAt = formatDate(log.createdAt || log.created_at);
          const details = formatDetails(
            log.data || log.details || log.payload || log.meta
          );

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

      // Si no hay registros, mostramos una fila informativa
      if (!historyTableBody.children.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
          <td colspan="7" style="text-align:center; opacity:0.8;">
            No hay movimientos registrados para los filtros seleccionados.
          </td>
        `;
        historyTableBody.appendChild(emptyRow);
      }

      // --- NUEVO: cálculo y render de estadísticas + gráficas ---
      const stats = computeStats(logs);
      renderSummary(stats);
      renderCharts(stats);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    }
  }

  // Eventos de filtros
  if (labFilter) {
    labFilter.addEventListener('change', () => {
      loadHistory();
    });
  }

  if (limitFilter) {
    limitFilter.addEventListener('change', () => {
      loadHistory();
    });
  }

  // Carga inicial
  loadHistory();
});
