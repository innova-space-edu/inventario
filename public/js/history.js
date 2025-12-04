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
        .forEach(log => {
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
