// public/js/science.js
document.addEventListener('DOMContentLoaded', () => {
  const scienceForm = document.getElementById('scienceForm');
  const scienceTableBody = document.querySelector('#scienceTable tbody');
  const scienceReservationForm = document.getElementById('scienceReservationForm');
  const scienceReservationsBody = document.querySelector('#scienceReservationsTable tbody');

  // ---- helper para historial ----
  async function logHistory(entry) {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'science',
          ...entry
        })
      });
    } catch (err) {
      console.error('Error registrando historial (science):', err);
    }
  }

  // ========== ITEMS ==========
  // Cargar items desde API
  fetch('/api/science/items')
    .then(resp => resp.json())
    .then(items => items.forEach(addRow))
    .catch(err => console.error('Error cargando items:', err));

  // Agregar producto
  if (scienceForm) {
    scienceForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(scienceForm);
      const response = await fetch('/api/science/items', {
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
          detail: `Ingresado material de ciencias: ${result.item.nombre || ''} (código ${result.item.codigo || ''})`
        });
      }

      scienceForm.reset();
    });
  }

  // Insertar fila en tabla de items
  function addRow(item) {
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

      const resp = await fetch(`/api/science/items/${item.id}`, { method: 'DELETE' });
      if (resp.ok) {
        tr.remove();
        await logHistory({
          action: 'delete',
          type: 'item',
          entityId: item.id,
          detail: `Eliminado material de ciencias: ${item.nombre || ''} (código ${item.codigo || ''})`
        });
      } else {
        alert('Error al eliminar el material.');
      }
    });

    scienceTableBody.appendChild(tr);
  }

  // ========== RESERVAS ==========
  async function loadReservations() {
    try {
      const resp = await fetch('/api/science/reservations');
      const reservations = await resp.json();
      scienceReservationsBody.innerHTML = '';
      reservations.forEach(addReservationRow);
    } catch (err) {
      console.error('Error cargando reservas de ciencias:', err);
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
    scienceReservationsBody.appendChild(tr);
  }

  if (scienceReservationForm) {
    scienceReservationForm.addEventListener('submit', async e => {
      e.preventDefault();

      const data = Object.fromEntries(new FormData(scienceReservationForm));
      const resp = await fetch('/api/science/reservations', {
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
          detail: `Reserva de laboratorio de ciencias para ${result.reservation.curso || ''} – ${result.reservation.solicitante || ''}`
        });
      }

      alert('Reserva registrada');
      scienceReservationForm.reset();
    });
  }

  // cargar reservas al entrar
  loadReservations();
});
