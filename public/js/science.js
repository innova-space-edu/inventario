// /public/js/science.js
document.addEventListener('DOMContentLoaded', () => {
  const scienceForm = document.getElementById('scienceForm');
  const scienceTableBody = document.querySelector('#scienceTable tbody');
  const scienceReservationForm = document.getElementById('scienceReservationForm');

  if (!scienceForm || !scienceTableBody) {
    // No estamos en la pestaña de ciencias
    return;
  }

  // ================== INVENTARIO DE CIENCIAS ==================

  async function loadScienceItems() {
    try {
      const resp = await fetch('/api/science/items', {
        credentials: 'include'
      });

      if (!resp.ok) {
        console.error('Error al cargar materiales de ciencias:', resp.status);
        return;
      }

      const items = await resp.json();
      if (!Array.isArray(items)) return;

      // Limpiamos antes de cargar para evitar duplicados
      scienceTableBody.innerHTML = '';
      items.forEach(addRow);
    } catch (err) {
      console.error('Error cargando items de ciencias:', err);
    }
  }

  // Insertar fila en la tabla
  function addRow(item) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id || ''}</td>
      <td>${item.codigo || ''}</td>
      <td>${item.nombre || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.categoria || ''}</td>
      <td>${item.cantidad || ''}</td>
      <td>${item.fecha || ''}</td>
      <td>${item.photo ? `<img src="${item.photo}" width="50" alt="Foto material">` : ''}</td>
      <td>
        <button type="button" data-id="${item.id}" class="delete-button">
          Eliminar
        </button>
      </td>
    `;

    const deleteBtn = tr.querySelector('.delete-button');
    deleteBtn.addEventListener('click', async () => {
      if (!item.id) return;
      if (!confirm('¿Seguro que deseas eliminar este material de ciencias?')) return;

      try {
        const resp = await fetch(`/api/science/items/${item.id}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          alert(data.message || 'No se pudo eliminar el material.');
          return;
        }

        // El backend también registra la eliminación en el historial.
        tr.remove();
      } catch (err) {
        console.error('Error al eliminar material de ciencias:', err);
        alert('Ocurrió un error al eliminar el material.');
      }
    });

    scienceTableBody.appendChild(tr);
  }

  // Agregar material de ciencias
  scienceForm.addEventListener('submit', async e => {
    e.preventDefault();

    const formData = new FormData(scienceForm);

    try {
      const resp = await fetch('/api/science/items', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || 'No se pudo guardar el material de ciencias.');
        return;
      }

      const result = await resp.json();
      if (result && result.item) {
        addRow(result.item);
      }

      scienceForm.reset();
    } catch (err) {
      console.error('Error al guardar material de ciencias:', err);
      alert('Ocurrió un error al guardar el material.');
    }
  });

  // ================== RESERVAS LABORATORIO CIENCIAS ==================

  if (scienceReservationForm) {
    scienceReservationForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(scienceReservationForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const resp = await fetch('/api/science/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar la reserva de laboratorio.');
          return;
        }

        alert('Reserva de laboratorio de ciencias registrada correctamente.');
        scienceReservationForm.reset();
      } catch (err) {
        console.error('Error al registrar reserva de ciencias:', err);
        alert('Ocurrió un error al registrar la reserva.');
      }
    });
  }

  // ================== INICIALIZACIÓN ==================
  loadScienceItems();
});
