// /public/js/computing.js

document.addEventListener('DOMContentLoaded', () => {
  const computingForm = document.getElementById('computingForm');
  const computingTableBody = document.querySelector('#computingTable tbody');
  const computingReservationForm = document.getElementById(
    'computingReservationForm'
  );
  const computingReservationsBody = document.querySelector(
    '#computingReservationsTable tbody'
  );

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
          lab: 'computing',
          action: entry.action,
          entityType: entry.type,
          entityId: entry.entityId,
          data: { detail: entry.detail }
        })
      });
    } catch (err) {
      console.error('Error registrando historial (computing):', err);
    }
  }

  // ================== ITEMS ==================

  async function loadItems() {
    if (!computingTableBody) return;

    try {
      const resp = await apiFetch('/api/computing/items');
      if (!resp.ok) {
        console.error('Error cargando equipos:', resp.status);
        return;
      }
      const items = await resp.json();
      if (!Array.isArray(items)) return;

      computingTableBody.innerHTML = '';
      items.forEach(addRow);
    } catch (err) {
      console.error('Error cargando equipos:', err);
    }
  }

  // Agregar equipo
  if (computingForm && computingTableBody) {
    computingForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const formData = new FormData(computingForm);
        const response = await apiFetch('/api/computing/items', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          alert('Error al guardar el equipo');
          return;
        }

        const result = await response.json();
        if (result && result.item) {
          addRow(result.item);

          await logHistory({
            action: 'create',
            type: 'item',
            entityId: result.item.id,
            detail: `Ingresado equipo de computación: ${
              result.item.marca || ''
            } ${result.item.modelo || ''} (código ${
              result.item.codigo || ''
            })`
          });
        }

        computingForm.reset();
      } catch (err) {
        console.error('Error al guardar equipo:', err);
        alert('Error al guardar el equipo');
      }
    });
  }

  function addRow(item) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.idEquip || ''}</td>
      <td>${item.codigo || ''}</td>
      <td>${item.marca || ''}</td>
      <td>${item.modelo || ''}</td>
      <td>${item.anio || ''}</td>
      <td>${item.serie || ''}</td>
      <td>${item.categoria || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.photo ? `<img src="${item.photo}" width="50">` : ''}</td>
      <td><button data-id="${item.id}" class="delete-button btn-ghost">Eliminar</button></td>
    `;

    const deleteBtn = tr.querySelector('.delete-button');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('¿Seguro que deseas eliminar este equipo?')) return;

      try {
        const resp = await apiFetch(`/api/computing/items/${item.id}`, {
          method: 'DELETE'
        });
        if (resp.ok) {
          tr.remove();
          await logHistory({
            action: 'delete',
            type: 'item',
            entityId: item.id,
            detail: `Eliminado equipo de computación: ${
              item.marca || ''
            } ${item.modelo || ''} (código ${item.codigo || ''})`
          });
        } else {
          alert('Error al eliminar el equipo.');
        }
      } catch (err) {
        console.error('Error al eliminar equipo:', err);
        alert('Error al eliminar el equipo.');
      }
    });

    computingTableBody.appendChild(tr);
  }

  // ================== RESERVAS ==================

  async function loadReservations() {
    if (!computingReservationsBody) return;

    try {
      const resp = await apiFetch('/api/computing/reservations');
      if (!resp.ok) {
        console.error(
          'Error cargando reservas de computación:',
          resp.status
        );
        return;
      }
      const reservations = await resp.json();
      if (!Array.isArray(reservations)) return;

      computingReservationsBody.innerHTML = '';
      reservations.forEach(addReservationRow);
    } catch (err) {
      console.error('Error cargando reservas de computación:', err);
    }
  }

  function addReservationRow(res) {
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
    computingReservationsBody.appendChild(tr);
  }

  if (computingReservationForm) {
    computingReservationForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const data = Object.fromEntries(
          new FormData(computingReservationForm)
        );
        const resp = await apiFetch('/api/computing/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          alert('Error al registrar reserva');
          return;
        }

        const result = await resp.json();
        if (result && result.reservation && computingReservationsBody) {
          addReservationRow(result.reservation);

          await logHistory({
            action: 'create',
            type: 'reservation',
            entityId: result.reservation.id,
            detail: `Reserva sala de computación para ${
              result.reservation.curso || ''
            } – ${result.reservation.solicitante || ''}`
          });
        }

        alert('Reserva registrada');
        computingReservationForm.reset();
      } catch (err) {
        console.error('Error al registrar reserva:', err);
        alert('Error al registrar reserva');
      }
    });
  }

  // Carga inicial
  loadItems();
  loadReservations();
});
