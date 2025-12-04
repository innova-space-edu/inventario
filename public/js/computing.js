// /public/js/computing.js

document.addEventListener('DOMContentLoaded', () => {
  const computingForm = document.getElementById('computingForm');
  const computingTableBody = document.querySelector('#computingTable tbody');
  const computingReservationForm = document.getElementById('computingReservationForm');
  const computingReservationsBody = document.querySelector('#computingReservationsTable tbody');
  const loanForm = document.getElementById('computingLoanForm');
  const loanTableBody = document.getElementById('computingLoanTableBody');
  const loanDebtorsList = document.getElementById('computingLoanDebtorsList');
  const computingSearchInput = document.getElementById('computingSearch');

  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: 'include', ...options }));

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
          // Añadimos la fila al vuelo
          addRow(result.item);

          await logHistory({
            action: 'create',
            type: 'item',
            entityId: result.item.id,
            detail: `Ingresado equipo de computación: ${result.item.marca || ''} ${result.item.modelo || ''} (código ${result.item.codigo || ''})`
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
    // Compatibilidad con datos antiguos y nuevos:
    const tipo = item.tipoActivo || (item.categoria ? 'hardware' : '') || '';
    const subtipo = item.subtipo || item.categoria || '';
    const detalle = item.detalleTipo || '';

    const cpu = item.cpu || '';
    const ram = item.memoriaRam || '';
    const so = item.sistemaOperativo || '';

    const versionSOuApp = item.soVersion || item.appVersion || '';
    const cantidad = item.cantidad ?? item.stock ?? '';
    const ubicacion = item.ubicacion || '';
    const estado = item.estado || '';

    // Si antes se usaba "anio" para el año, lo mostramos como parte de fechaCompra si no existe otra
    const fechaCompra =
      item.fechaCompra ||
      (item.anio ? String(item.anio) : '');

    const fechaActualizacion = item.fechaActualizacion || '';
    const descripcionGeneral = item.descripcion || item.descripcionOtros || '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.idEquip || ''}</td>
      <td>${item.codigo || ''}</td>
      <td>${tipo}</td>
      <td>${subtipo}</td>
      <td>${detalle}</td>
      <td>${item.marca || ''}</td>
      <td>${item.modelo || ''}</td>
      <td>${cpu}</td>
      <td>${ram}</td>
      <td>${so}</td>
      <td>${versionSOuApp}</td>
      <td>${item.serie || ''}</td>
      <td>${cantidad}</td>
      <td>${ubicacion}</td>
      <td>${estado}</td>
      <td>${fechaCompra}</td>
      <td>${fechaActualizacion}</td>
      <td>${descripcionGeneral}</td>
      <td>${item.photo ? `<img src="${item.photo}" width="50" alt="Foto equipo">` : ''}</td>
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
            detail: `Eliminado equipo de computación: ${item.marca || ''} ${item.modelo || ''} (código ${item.codigo || ''})`
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

  // Búsqueda en el listado de equipos (por código, marca, modelo, etc.)
  if (computingSearchInput && computingTableBody) {
    computingSearchInput.addEventListener('input', () => {
      const term = computingSearchInput.value.toLowerCase();
      const rows = computingTableBody.querySelectorAll('tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    });
  }

  // ================== RESERVAS ==================

  async function loadReservations() {
    if (!computingReservationsBody) return;

    try {
      const resp = await apiFetch('/api/computing/reservations');
      if (!resp.ok) {
        console.error('Error cargando reservas de computación:', resp.status);
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
        const data = Object.fromEntries(new FormData(computingReservationForm));
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
            detail: `Reserva sala de computación para ${result.reservation.curso || ''} – ${result.reservation.solicitante || ''}`
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

  // ================== PRÉSTAMOS ==================

  async function loadLoans() {
    if (!loanTableBody) return;

    try {
      const resp = await apiFetch('/api/computing/loans');
      if (!resp.ok) {
        console.error('Error al cargar préstamos de computación:', resp.status);
        return;
      }
      const loans = await resp.json();
      if (!Array.isArray(loans)) return;

      loanTableBody.innerHTML = '';
      loans.forEach(addLoanRow);
      renderLoanDebtors(loans);
    } catch (err) {
      console.error('Error cargando préstamos de computación:', err);
    }
  }

  function addLoanRow(loan) {
    const fechaPrestamo = loan.fecha_prestamo || loan.fechaPrestamo || '';
    const fechaDevolucion = loan.fecha_devolucion || loan.fechaDevolucion || '';
    const devuelto = !!loan.devuelto;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${loan.id}</td>
      <td>${loan.itemId || ''}</td>
      <td>${loan.codigo || ''}</td>
      <td>${loan.tipoPersona || ''}</td>
      <td>${loan.persona || ''}</td>
      <td>${loan.curso || ''}</td>
      <td>${fechaPrestamo}</td>
      <td>${fechaDevolucion}</td>
      <td>${devuelto ? 'Sí' : 'No'}</td>
      <td>${devuelto ? '' : '<button class="devolver-btn btn-small" data-id="' + loan.id + '">Devolver</button>'}</td>
    `;

    const btn = tr.querySelector('.devolver-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          const resp = await apiFetch(`/api/computing/loans/${loan.id}/return`, {
            method: 'POST'
          });
          if (resp.ok) {
            await logHistory({
              action: 'update',
              type: 'loan',
              entityId: loan.id,
              detail: `Devolución registrada para préstamo de equipo ${loan.itemId || loan.codigo || ''}`
            });
            await loadLoans();
          } else {
            alert('Error al registrar devolución');
          }
        } catch (err) {
          console.error('Error al devolver equipo:', err);
          alert('Error al devolver equipo');
        }
      });
    }

    loanTableBody.appendChild(tr);
  }

  function renderLoanDebtors(loans) {
    if (!loanDebtorsList) return;
    loanDebtorsList.innerHTML = '';

    const pendientes = loans.filter(l => !l.devuelto);
    pendientes.forEach(l => {
      const li = document.createElement('li');
      const fechaPrestamo = l.fecha_prestamo || l.fechaPrestamo || '';
      li.textContent = `${l.persona || ''} (${l.tipoPersona || ''}) – Equipo: ${l.itemId || l.codigo || ''} – Fecha préstamo: ${fechaPrestamo}`;
      loanDebtorsList.appendChild(li);
    });
  }

  if (loanForm) {
    loanForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const data = Object.fromEntries(new FormData(loanForm));

        // Si el backend maneja la fecha, esto es opcional, pero si se quiere enviar:
        if (!data.fechaPrestamo && !data.fecha_prestamo) {
          const hoy = new Date();
          const yyyy = hoy.getFullYear();
          const mm = String(hoy.getMonth() + 1).padStart(2, '0');
          const dd = String(hoy.getDate()).padStart(2, '0');
          data.fechaPrestamo = `${yyyy}-${mm}-${dd}`;
        }

        const resp = await apiFetch('/api/computing/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          alert('Error al registrar préstamo');
          return;
        }

        const result = await resp.json();
        if (result && result.loan) {
          // Añadimos la fila al vuelo
          addLoanRow(result.loan);

          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo de equipo ${result.loan.itemId || result.loan.codigo || ''} a ${result.loan.persona || ''}`
          });
        }

        alert('Préstamo registrado');
        loanForm.reset();

        // Recargar lista completa para asegurar sincronización con deudores
        await loadLoans();
      } catch (err) {
        console.error('Error al registrar préstamo:', err);
        alert('Error al registrar préstamo');
      }
    });
  }

  // ================== WIZARD DRAGGABLE (ventanas que se pueden mover) ==================

  const wizardPanels = document.querySelectorAll('.wizard-panel[data-draggable="true"]');
  if (wizardPanels.length > 0) {
    wizardPanels.forEach(panel => {
      panel.style.position = panel.style.position || 'relative';
      panel.style.cursor = panel.style.cursor || 'grab';

      let isDragging = false;
      let startY = 0;
      let startOffset = 0;

      panel.addEventListener('mousedown', e => {
        // Evitamos conflicto al hacer clic dentro de los selects
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;

        isDragging = true;
        panel.style.cursor = 'grabbing';
        startY = e.clientY;
        startOffset = parseInt(panel.dataset.offsetY || '0', 10);
        panel.classList.add('dragging');
      });

      document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        const newOffset = startOffset + deltaY;
        panel.dataset.offsetY = String(newOffset);
        panel.style.transform = `translateY(${newOffset}px)`;
      });

      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.cursor = 'grab';
        panel.classList.remove('dragging');
      });
    });
  }

  // Carga inicial
  loadItems();
  loadReservations();
  loadLoans();
});
