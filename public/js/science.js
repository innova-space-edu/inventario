document.addEventListener('DOMContentLoaded', () => {
  const scienceForm = document.getElementById('scienceForm');
  const scienceTableBody = document.querySelector('#scienceTable tbody');
  const scienceReservationForm = document.getElementById('scienceReservationForm');

  const ITEMS_API = '/api/science/items';
  const RESERVATIONS_API = '/api/science/reservations';

  // -------- Cargar inventario desde BD --------
  fetch(ITEMS_API)
    .then(resp => resp.json())
    .then(items => {
      if (Array.isArray(items)) items.forEach(addRow);
    })
    .catch(err => {
      console.error('Error cargando items de ciencias:', err);
    });

  // -------- Envío del formulario (con foto) --------
  scienceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(scienceForm);

    try {
      const response = await fetch(ITEMS_API, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        alert('Error al guardar el producto de ciencias.');
        return;
      }

      const result = await response.json();
      if (result && result.item) {
        addRow(result.item);
      }
      scienceForm.reset();
    } catch (err) {
      console.error('Error al guardar producto de ciencias:', err);
      alert('Error al guardar el producto.');
    }
  });

  // -------- Agregar fila a la tabla --------
  function addRow(item) {
    const tr = document.createElement('tr');

    const photoSrc = item.photo
      ? (item.photo.startsWith('http') ? item.photo : `/uploads/${item.photo}`)
      : '';

    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.codigo || ''}</td>
      <td>${item.nombre || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.categoria || ''}</td>
      <td>${item.cantidad || ''}</td>
      <td>${item.fecha || ''}</td>
      <td>${photoSrc ? `<img src="${photoSrc}" width="50">` : ''}</td>
      <td><button data-id="${item.id}" class="delete-button">Eliminar</button></td>
    `;

    tr.querySelector('.delete-button').addEventListener('click', async () => {
      try {
        const resp = await fetch(`/api/science/items/${item.id}`, { method: 'DELETE' });
        if (!resp.ok) {
          alert('No se pudo eliminar el producto.');
          return;
        }
        tr.remove();
      } catch (err) {
        console.error('Error al eliminar producto de ciencias:', err);
        alert('Error al eliminar el producto.');
      }
    });

    scienceTableBody.appendChild(tr);
  }

  // -------- Reservas de laboratorio --------
  scienceReservationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(scienceReservationForm));

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
      alert('Reserva creada con éxito');
      scienceReservationForm.reset();
    } catch (err) {
      console.error('Error al registrar reserva de ciencias:', err);
      alert('Error al registrar la reserva.');
    }
  });
});
