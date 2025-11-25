// /public/js/science.js
document.addEventListener('DOMContentLoaded', () => {
  const scienceForm = document.getElementById('scienceForm');
  const scienceTableBody = document.querySelector('#scienceTable tbody');
  const scienceReservationForm = document.getElementById('scienceReservationForm');
  const scienceReservationsBody = document.querySelector('#scienceReservationsTable tbody');

  // Helper para usar guardedFetch si existe, o fetch normal con credenciales
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, { credentials: 'include', ...options }));

  // ---- helper para historial ----
  async function logHistory(entry) {
    try {
      await apiFetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab: 'science',
          action: entry.action,
          entityType: entry.type,
          entityId: entry.entityId,
          data: { detail: entry.detail }
        })
      });
    } catch (err) {
      console.error('Error registrando historial (science):', err);
    }
  }

  // ========== ITEMS ==========
  async function loadScienceItems() {
    if (!scienceTableBody) return;

    try {
      const resp = await apiFetch('/api/science/items');
      if (!resp.ok) {
        console.error('Error cargando items de ciencias:', resp.status);
        return;
      }
      const items = await resp.json();
      if (!Array.isArray(items)) return;
      scienceTableBody.innerHTML = '';
      items.forEach(addRow);
    } catch (err) {
      console.error('Error cargando items:', err);
    }
  }

  // Agregar producto
  if (scienceForm) {
    scienceForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const formData = new FormData(scienceForm);
        const response = await apiFetch('/api/science/items', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          alert('Error al guardar el material de ciencias.');
          return;
        }

        const result = await response.json();
        if (result && result.item) {
          addRow(result.item);

          await logHistory({
            action: 'create',
            type: 'item',
            entityId: result.item.id,
            detail: `Ingresado material de ciencias: ${
              result.item.nombre || ''
            } (código ${result.item.codigo || ''})`
          });
        }

        scienceForm.reset();
      } catch (err) {
        console.error('Error al guardar material de ciencias:', err);
        alert('Error al guardar el material.');
      }
    });
  }

  // Insertar fila en tabla de items
  function addRow(item) {
    if (!scienceTableBody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.codigo || ''}</td>
      <td>${item.nombre || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.categoria || ''}</td>
      <td>${item.cantidad || ''}</td>
      <td>${item.fecha || ''}</td>
      <td>${item.photo ? `<img src="${item.photo}" width="50">` : ''}</td>
      <td><button data-id="${item.id}" class="delete-button btn-ghost">Eliminar</button></td>
    `;

    const deleteBtn = tr.querySelector('.delete-button');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('¿Seguro que deseas eliminar este material de ciencias?')) return;

      try {
        const resp = await apiFetch(`/api/science/items/${item.id}`, {
          method: 'DELETE'
        });
        if (resp.ok) {
          tr.remove();
          await logHistory({
            action: 'delete',
            type: 'item',
            entityId: item.id,
            detail: `Eliminado material de ciencias: ${
              item.nombre || ''
            } (código ${item.codigo || ''})`
          });
        } else {
          alert('Error al eliminar el material.');
        }
      } catch (err) {
        console.error('Error al eliminar material de ciencias:', err);
        alert('Error al eliminar el material.');
      }
    });

    scienceTableBody.appendChild(tr);
  }

  // ========== RESERVAS ==========
  async function loadReservations() {
    if (!scienceReservationsBody) return;

    try {
      const resp = await apiFetch('/api/science/reservations');
      if (!resp.ok) {
        console.error('Error cargando reservas de ciencias:', resp.status);
        return;
      }
      const reservations = await resp.json();
      if (!Array.isArray(reservations)) return;

      scienceReservationsBody.innerHTML = '';
      reservations.forEach(addReservationRow);
    } catch (err) {
      console.error('Error cargando reservas de ciencias:', err);
    }
  }

  function addReservationRow(res) {
    if (!scienceReservationsBody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${res.id}</td>
      <td>${res.solicitante || ''}</td>
      <td>${res.curso || ''}</td>
      <td>${res.fechaUso || ''}</td>
      <td>${res.horario || ''}</td>
      <td>${res.observaciones || ''}</td>
      <td>${res.user || ''}</td>
    `;
    scienceReservationsBody.appendChild(tr);
  }

  if (scienceReservationForm) {
    scienceReservationForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const data = Object.fromEntries(new FormData(scienceReservationForm));
        const resp = await apiFetch('/api/science/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          alert('Error al registrar reserva');
          return;
        }

        const result = await resp.json();
        if (result && result.reservation) {
          addReservationRow(result.reservation);

          await logHistory({
            action: 'create',
            type: 'reservation',
            entityId: result.reservation.id,
            detail: `Reserva de laboratorio de ciencias para ${
              result.reservation.curso || ''
            } – ${result.reservation.solicitante || ''}`
          });
        }

        alert('Reserva registrada');
        scienceReservationForm.reset();
      } catch (err) {
        console.error('Error al registrar reserva de ciencias:', err);
        alert('Error al registrar la reserva.');
      }
    });
  }

  // cargar datos al entrar
  loadScienceItems();
  loadReservations();
});
