// /public/js/science.js

document.addEventListener('DOMContentLoaded', () => {
  const scienceForm = document.getElementById('scienceForm');
  const scienceTableBody = document.querySelector('#scienceTable tbody');
  const scienceReservationForm = document.getElementById('scienceReservationForm');
  const scienceLoanForm = document.getElementById('scienceLoanForm');
  const scienceLoanTableBody = document.getElementById('scienceLoanTableBody');

  // 🔵 Referencias al modal de préstamo desde inventario
  const loanModal = document.getElementById('scienceLoanModal');
  const loanModalForm = document.getElementById('scienceLoanModalForm');
  const loanModalCodigo = document.getElementById('scienceLoanModalCodigo');
  const loanModalNombre = document.getElementById('scienceLoanModalNombre');
  const loanModalUser = document.getElementById('scienceLoanModalUser');
  const loanModalCurso = document.getElementById('scienceLoanModalCurso');
  const loanModalObs = document.getElementById('scienceLoanModalObs');
  const loanModalCancel = document.getElementById('scienceLoanModalCancel');

  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, { credentials: 'include', ...options }));

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

  // ==========================
  //  HELPERS MODAL
  // ==========================
  function openLoanModal(item) {
    if (!loanModal || !loanModalForm) return;
    const codigo = item.codigo || '';
    const nombre = item.nombre || item.descripcion || '';

    if (loanModalCodigo) loanModalCodigo.value = codigo;
    if (loanModalNombre) loanModalNombre.value = nombre;
    if (loanModalObs) loanModalObs.value = '';

    if (loanModalUser) {
      loanModalUser.selectedIndex = 0; // vuelve a "Seleccione una persona"
    }
    if (loanModalCurso) {
      loanModalCurso.value = '';
    }

    loanModal.style.display = 'flex';
    loanModal.setAttribute('aria-hidden', 'false');
  }

  function closeLoanModal() {
    if (!loanModal) return;
    loanModal.style.display = 'none';
    loanModal.setAttribute('aria-hidden', 'true');
  }

  if (loanModalCancel) {
    loanModalCancel.addEventListener('click', () => {
      closeLoanModal();
    });
  }

  // Cerrar modal clickeando fuera
  if (loanModal) {
    loanModal.addEventListener('click', ev => {
      if (ev.target === loanModal) {
        closeLoanModal();
      }
    });
  }

  // Cerrar modal con Escape
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && loanModal && loanModal.style.display === 'flex') {
      closeLoanModal();
    }
  });

  // ==========================
  //  ITEMS
  // ==========================
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
            detail: `Ingresado material de ciencias: ${result.item.nombre || ''} (código ${result.item.codigo || ''})`
          });
        }

        scienceForm.reset();
      } catch (err) {
        console.error('Error al guardar material de ciencias:', err);
        alert('Error al guardar el material.');
      }
    });
  }

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
      <td>
        <button data-id="${item.id}" class="btn-ghost prestar-button">Prestar</button>
        <button data-id="${item.id}" class="delete-button btn-ghost">Eliminar</button>
      </td>
    `;

    // Eliminar material
    const deleteBtn = tr.querySelector('.delete-button');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que deseas eliminar este material de ciencias?')) return;
        try {
          const resp = await apiFetch(`/api/science/items/${item.id}`, { method: 'DELETE' });
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
        } catch (err) {
          console.error('Error al eliminar material de ciencias:', err);
          alert('Error al eliminar el material.');
        }
      });
    }

    // Abrir modal de préstamo
    const prestarBtn = tr.querySelector('.prestar-button');
    if (prestarBtn) {
      prestarBtn.addEventListener('click', () => {
        openLoanModal(item);
      });
    }

    scienceTableBody.appendChild(tr);
  }

  // ==========================
  //  RESERVAS
  // ==========================
  async function loadReservations() {
    const body = document.getElementById('scienceReservationsTableBody');
    if (!body) return; // si no hay tabla, no hacemos nada
    try {
      const resp = await apiFetch('/api/science/reservations');
      if (!resp.ok) {
        console.error('Error cargando reservas de ciencias:', resp.status);
        return;
      }
      const reservations = await resp.json();
      if (!Array.isArray(reservations)) return;

      body.innerHTML = '';
      reservations.forEach(res => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${res.id}</td>
          <td>${res.solicitante || ''}</td>
          <td>${res.curso || ''}</td>
          <td>${res.fechaUso || res.date || ''}</td>
          <td>${res.horario || ''}</td>
          <td>${res.observaciones || res.activity || ''}</td>
          <td>${res.user || ''}</td>
        `;
        body.appendChild(tr);
      });
    } catch (err) {
      console.error('Error cargando reservas de ciencias:', err);
    }
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
          await logHistory({
            action: 'create',
            type: 'reservation',
            entityId: result.reservation.id,
            detail: `Reserva de laboratorio de ciencias para ${result.reservation.curso || ''} – ${result.reservation.solicitante || ''}`
          });
        }

        alert('Reserva registrada');
        scienceReservationForm.reset();
        loadReservations();
      } catch (err) {
        console.error('Error al registrar reserva de ciencias:', err);
        alert('Error al registrar la reserva.');
      }
    });
  }

  // ==========================
  //  PRÉSTAMOS (TABLA)
  // ==========================
  async function loadLoans() {
    if (!scienceLoanTableBody) return;
    try {
      const resp = await apiFetch('/api/science/loans');
      if (!resp.ok) return;
      const loans = await resp.json();
      if (!Array.isArray(loans)) return;

      scienceLoanTableBody.innerHTML = '';
      loans.forEach(loan => {
        const tr = document.createElement('tr');

        const codigo = loan.codigo || loan.itemCode || loan.itemId || '';
        const solicitante = loan.solicitante || loan.borrowerName || '';
        const curso = loan.curso || loan.borrowerGroup || '';
        const fecha = loan.loanDate
          ? new Date(loan.loanDate).toLocaleString('es-CL', {
              dateStyle: 'short',
              timeStyle: 'short'
            })
          : (loan.fecha || '');
        const devueltoTxt = loan.returned ? 'Sí' : 'No';

        tr.innerHTML = `
          <td>${loan.id}</td>
          <td>${codigo}</td>
          <td>${solicitante}</td>
          <td>${curso}</td>
          <td>${fecha}</td>
          <td>${devueltoTxt}</td>
          <td class="accion-cell"></td>
        `;

        const accionCell = tr.querySelector('.accion-cell');

        if (!loan.returned) {
          const btn = document.createElement('button');
          btn.className = 'btn-ghost devolver-btn';
          btn.textContent = 'Devolver';
          btn.dataset.id = loan.id;

          btn.addEventListener('click', async () => {
            if (!confirm('¿Marcar este préstamo como devuelto?')) return;
            try {
              const r = await apiFetch(`/api/science/return/${loan.id}`, {
                method: 'POST'
              });
              if (r.ok) {
                alert('Material devuelto');
                await logHistory({
                  action: 'update',
                  type: 'loan',
                  entityId: loan.id,
                  detail: `Devolución de préstamo de ciencias ID ${loan.id} (código ${codigo})`
                });
                loadLoans();
                loadScienceItems(); // actualizar stock
              } else {
                alert('Error al registrar la devolución.');
              }
            } catch (err) {
              console.error('Error devolviendo material de ciencias:', err);
              alert('Error devolviendo el material.');
            }
          });

          accionCell.appendChild(btn);
        } else {
          accionCell.textContent = '—';
        }

        scienceLoanTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error cargando préstamos:', err);
    }
  }

  // ==========================
  //  PRÉSTAMO MANUAL (FORM)
  // ==========================
  if (scienceLoanForm) {
    scienceLoanForm.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const codigoInput = document.getElementById('scienceLoanCodigo');
        const cursoInput = document.getElementById('scienceLoanCurso');
        const obsInput = document.getElementById('scienceLoanObs');
        const selectPersona = document.getElementById('scienceLoanUser');

        const codigo = (codigoInput?.value || '').trim();
        const curso = (cursoInput?.value || '').trim();
        const observaciones = (obsInput?.value || '').trim();

        if (!codigo) {
          alert('Debe ingresar el código del material.');
          return;
        }
        if (!selectPersona || !selectPersona.value) {
          alert('Debe seleccionar un solicitante.');
          return;
        }

        const personaId = selectPersona.value;
        const solicitanteTexto =
          selectPersona.options[selectPersona.selectedIndex].textContent || '';

        const payload = {
          codigo,
          solicitante: solicitanteTexto,
          curso,
          personaId,
          observaciones
        };

        const resp = await apiFetch('/api/science/loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) {
          const msg = await resp.json().catch(() => ({}));
          alert(msg.message || 'Error registrando préstamo');
          return;
        }

        const result = await resp.json();
        if (result && result.loan) {
          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo registrado ID ${result.loan.id} – ${solicitanteTexto} (código ${codigo})`
          });
        }

        alert('Préstamo registrado');
        scienceLoanForm.reset();
        loadLoans();
        loadScienceItems();
      } catch (err) {
        console.error('Error registrando préstamo:', err);
        alert('Error registrando el préstamo.');
      }
    });
  }

  // ==========================
  //  PRÉSTAMO DESDE MODAL (INVENTARIO)
  // ==========================
  if (loanModalForm) {
    loanModalForm.addEventListener('submit', async e => {
      e.preventDefault();
      const codigo = (loanModalCodigo && loanModalCodigo.value.trim()) || '';
      const curso = (loanModalCurso && loanModalCurso.value.trim()) || '';
      const observaciones = (loanModalObs && loanModalObs.value.trim()) || '';
      const selectPersona = loanModalUser;

      if (!codigo) {
        alert('Falta el código del material.');
        return;
      }
      if (!selectPersona || !selectPersona.value) {
        alert('Debes seleccionar una persona.');
        return;
      }

      const personaId = selectPersona.value;
      const solicitanteTexto =
        selectPersona.options[selectPersona.selectedIndex].textContent || '';

      try {
        const resp = await apiFetch('/api/science/loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo,
            solicitante: solicitanteTexto,
            curso,
            personaId,
            observaciones
          })
        });

        if (!resp.ok) {
          const msg = await resp.json().catch(() => ({}));
          alert(msg.message || 'Error registrando préstamo');
          return;
        }

        const result = await resp.json();
        if (result && result.loan) {
          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo desde inventario – código ${codigo} para ${solicitanteTexto}`
          });
        }

        closeLoanModal();
        loadLoans();
        loadScienceItems();
        alert('Préstamo registrado');
      } catch (err) {
        console.error('Error registrando préstamo (modal):', err);
        alert('Error registrando el préstamo.');
      }
    });
  }

  // ==========================
  //  CARGA INICIAL
  // ==========================
  loadScienceItems();
  loadReservations();
  loadLoans();
});
