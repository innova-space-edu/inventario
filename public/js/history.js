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

      logs.forEach(log => {
        const tr = document.createElement('tr');

        const labText = log.lab || '';
        const actionText = log.action || '';
        const entityType = log.entityType || '';
        const entityId = log.entityId || '';
        const user = log.user || log.user_email || '';
        const createdAt = formatDate(log.createdAt || log.created_at);
        const details = formatDetails(log.data || log.details);

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
