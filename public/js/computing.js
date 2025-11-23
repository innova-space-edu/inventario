// public/js/computing.js
document.addEventListener('DOMContentLoaded', () => {
  const computingForm = document.getElementById('computingForm');
  const computingTableBody = document.querySelector('#computingTable tbody');
  const computingReservationForm = document.getElementById('computingReservationForm');
  const computingReservationsBody = document.querySelector('#computingReservationsTable tbody');

  // ---- helper para historial ----
  async function logHistory(entry) {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'computing',
          ...entry
        })
      });
    } catch (err) {
      console.error('Error registrando historial (computing):', err);
    }
  }

  // ========== ITEMS ==========
  // Cargar items desde API
  fetch('/api/computing/items')
    .then(resp => resp.json())
    .then(items => items.forEach(addRow))
    .catch(err => console.error('Error cargando equipos:', err));

  // Agregar equipo
  if (computingForm) {
    computingForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(computingForm);
      const response = await fetch('/api/computing/items', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result && result.item) {
        addRow(result.item);

        await logHistory({
          action: 'create',
          type: 'item',
          entityId: result.item.id,
          detail: `Ingresado equipo de computación: ${result.item.marca || ''} ${result.item.modelo || ''} (código ${result.item.codigo || ''})`
        });
      }

      computingForm.reset();
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

      const resp = await fetch(`/api/computing/items/${item.id}`, { method: 'DELETE' });
      if (resp.ok) {
        tr.remove();
        await logHistory({
          action: 'delete',
          type: 'item',
          entityId: item.id,
          detail: `Eliminado equipo de computación: ${item.marca || ''} ${item.modelo || ''} (código ${item.codigo || ''})`
        });
      } else {
        alert('Error al eliminar el equipo.');
      }
    });

    computingTableBody.appendChild(tr);
  }

  // ========== RESERVAS ==========
  async function loadReservations() {
    try {
      const resp = await fetch('/api/computing/reservations');
      const reservations = await resp.json();
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

      const data = Object.fromEntries(new FormData(computingReservationForm));
      const resp = await fetch('/api/computing/reservations', {
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
          detail: `Reserva sala de computación para ${result.reservation.curso || ''} – ${result.reservation.solicitante || ''}`
        });
      }

      alert('Reserva registrada');
      computingReservationForm.reset();
    });
  }

  loadReservations();
});
