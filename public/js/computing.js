document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('computingForm');
  const tableBody = document.querySelector('#computingTable tbody');
  const reservationForm = document.getElementById('computingReservationForm');

  const ITEMS_API = '/api/computing/items';
  const RESERVATIONS_API = '/api/computing/reservations';

  // ---- Cargar inventario desde la API (BD) ----
  fetch(ITEMS_API)
    .then(resp => resp.json())
    .then(items => {
      if (Array.isArray(items)) items.forEach(addRow);
    })
    .catch(err => {
      console.error('Error cargando items de computación:', err);
    });

  // ---- Envío de formulario (con foto) ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    try {
      const response = await fetch(ITEMS_API, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        console.error('Error al guardar item de computación');
        alert('Error al guardar el equipo.');
        return;
      }

      const result = await response.json();
      if (result && result.item) {
        addRow(result.item);
      }
      form.reset();
    } catch (err) {
      console.error('Error en la petición de guardar item de computación:', err);
      alert('Error al guardar el equipo.');
    }
  });

  // ---- Agregar fila a la tabla ----
  function addRow(item) {
    const tr = document.createElement('tr');

    const photoSrc = item.photo
      ? (item.photo.startsWith('http') ? item.photo : `/uploads/${item.photo}`)
      : '';

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
      <td>${photoSrc ? `<img src="${photoSrc}" width="50">` : ''}</td>
      <td><button class="delete-button" data-id="${item.id}">Eliminar</button></td>
    `;

    tr.querySelector('.delete-button').addEventListener('click', async () => {
      try {
        const resp = await fetch(`/api/computing/items/${item.id}`, { method: 'DELETE' });
        if (!resp.ok) {
          alert('No se pudo eliminar el equipo.');
          return;
        }
        tr.remove();
      } catch (err) {
        console.error('Error al eliminar item de computación:', err);
        alert('Error al eliminar el equipo.');
      }
    });

    tableBody.appendChild(tr);
  }

  // ---- Reservas de laboratorio (solo registrar) ----
  reservationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(reservationForm));

    try {
      const response = await fetch(RESERVATIONS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        alert('Error al registrar la reserva.');
        return;
      }

      await response.json();
      alert('Reserva de laboratorio registrada');
      reservationForm.reset();
    } catch (err) {
      console.error('Error al registrar reserva de computación:', err);
      alert('Error al registrar la reserva.');
    }
  });
});
