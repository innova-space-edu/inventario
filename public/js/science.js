// /public/js/science.js
// Laboratorio de Ciencias – Inventario + Préstamos + Personas (solo lectura)

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Referencias base ----------
  const scienceForm = document.getElementById('scienceForm');
  const scienceFormSubmit = document.getElementById('scienceFormSubmit');
  const scienceFormCancelEdit = document.getElementById('scienceFormCancelEdit');

  const sciIdInput = document.getElementById('sciId');
  const sciCodeInput = document.getElementById('sciCode');
  const sciNameInput = document.getElementById('sciName');
  const sciDescInput = document.getElementById('sciDescription');
  const sciCatSelect = document.getElementById('sciCategory');
  const sciQtyInput = document.getElementById('sciQuantity');
  const sciDateInput = document.getElementById('sciDate');
  // foto se maneja solo en alta o si el usuario decide cambiarla
  const scienceTableBody = document.querySelector('#scienceTable tbody');
  const scienceSearchInput = document.getElementById('scienceSearch');

  const loanForm = document.getElementById('scienceLoanForm');
  const loansTableBody = document.querySelector('#scienceLoansTable tbody');
  const loansSearchInput = document.getElementById('scienceLoansSearch');
  const returnForm = document.getElementById('scienceReturnForm');
  const returnIdInput = document.getElementById('scienceReturnId');

  const loanPersonSelect = document.getElementById('sciLoanPersonSelect');
  const loanNombreInput = document.getElementById('sciLoanNombre');
  const loanCursoInput = document.getElementById('sciLoanCurso');
  const loanTipoPersonaInput = document.getElementById('sciLoanTipoPersona');

  const peopleTableBody = document.querySelector('#sciencePeopleTable tbody');

  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: 'include', ...options }));

  if (!scienceForm || !scienceTableBody) return; // seguridad

  // ---------- Estado ----------
  let scienceItems = [];
  let scienceLoans = [];
  let sciencePeople = [];
  let editingItemId = null; // para saber si estamos editando

  // ---------- Utils ----------
  const debounce = (fn, wait = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const safe = v => (v == null ? '' : String(v));

  const formatDate = d => {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-CL');
  };

  // pequeño helper de historial (opcional)
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
      console.warn('No se pudo registrar historial (science):', err);
    }
  }

  // ================== INVENTARIO ==================
  async function loadScienceItems() {
    try {
      const resp = await apiFetch('/api/science/items');
      if (!resp.ok) {
        console.error('Error al cargar inventario de ciencias:', resp.status);
        return;
      }
      const items = await resp.json();
      // Suponemos que el backend ya devuelve objetos planos
      scienceItems = Array.isArray(items) ? items : [];
      renderScienceTable();
    } catch (err) {
      console.error('Error cargando materiales de ciencias:', err);
    }
  }

  function getFilteredItems() {
    const text = (scienceSearchInput?.value || '').trim().toLowerCase();
    if (!text) return [...scienceItems];

    return scienceItems.filter(item => {
      const vals = [
        item.id,
        item.codigo,
        item.nombre,
        item.descripcion,
        item.categoria,
        item.fecha
      ];
      return vals.some(v => v && String(v).toLowerCase().includes(text));
    });
  }

  function renderScienceTable() {
    scienceTableBody.innerHTML = '';

    const items = getFilteredItems();
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safe(item.id)}</td>
        <td>${safe(item.codigo)}</td>
        <td>${safe(item.nombre)}</td>
        <td>${safe(item.descripcion)}</td>
        <td>${safe(item.categoria)}</td>
        <td>${safe(item.cantidad)}</td>
        <td>${safe(item.fecha)}</td>
        <td>
          ${
            item.photo
              ? `<img src="${item.photo}" width="50" alt="Foto material" />`
              : ''
          }
        </td>
        <td>
          <button
            type="button"
            class="btn-ghost sci-edit-item"
            data-id="${item.id}"
          >
            Editar
          </button>
          <button
            type="button"
            class="btn-ghost sci-delete-item"
            data-id="${item.id}"
          >
            Eliminar
          </button>
        </td>
      `;

      // botón Editar
      const editBtn = tr.querySelector('.sci-edit-item');
      editBtn.addEventListener('click', () => {
        enterEditMode(item);
      });

      // botón Eliminar
      const delBtn = tr.querySelector('.sci-delete-item');
      delBtn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que deseas eliminar este material de ciencias?')) return;

        try {
          const resp = await apiFetch(`/api/science/items/${item.id}`, {
            method: 'DELETE'
          });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || 'No se pudo eliminar el material.');
            return;
          }
          scienceItems = scienceItems.filter(it => it.id !== item.id);
          renderScienceTable();

          await logHistory({
            action: 'delete',
            type: 'item',
            entityId: item.id,
            detail: `Eliminado material de ciencias "${item.nombre || ''}" (código ${item.codigo || ''})`
          });
        } catch (err) {
          console.error('Error al eliminar material de ciencias:', err);
          alert('Ocurrió un error al eliminar el material.');
        }
      });

      scienceTableBody.appendChild(tr);
    });
  }

  function enterEditMode(item) {
    editingItemId = item.id || null;
    if (!editingItemId) return;

    if (sciIdInput) sciIdInput.value = item.id || '';
    if (sciCodeInput) sciCodeInput.value = item.codigo || '';
    if (sciNameInput) sciNameInput.value = item.nombre || '';
    if (sciDescInput) sciDescInput.value = item.descripcion || '';
    if (sciCatSelect) sciCatSelect.value = item.categoria || 'instrumento';
    if (sciQtyInput) sciQtyInput.value = item.cantidad || '';
    if (sciDateInput) sciDateInput.value = item.fecha || '';

    if (scienceFormSubmit) scienceFormSubmit.textContent = 'Actualizar material';
    if (scienceFormCancelEdit) scienceFormCancelEdit.style.display = 'inline-block';
  }

  function resetEditMode() {
    editingItemId = null;
    if (scienceForm) scienceForm.reset();
    if (sciIdInput) sciIdInput.value = '';
    if (scienceFormSubmit) scienceFormSubmit.textContent = 'Guardar';
    if (scienceFormCancelEdit) scienceFormCancelEdit.style.display = 'none';
  }

  if (scienceFormCancelEdit) {
    scienceFormCancelEdit.addEventListener('click', () => {
      resetEditMode();
    });
  }

  scienceForm.addEventListener('submit', async e => {
    e.preventDefault();

    // Usamos FormData para permitir cambiar foto también en edición
    const formData = new FormData(scienceForm);

    try {
      let resp;
      if (editingItemId) {
        // EDITAR (PUT)
        resp = await apiFetch(`/api/science/items/${encodeURIComponent(editingItemId)}`, {
          method: 'PUT',
          body: formData
        });
      } else {
        // CREAR (POST)
        resp = await apiFetch('/api/science/items', {
          method: 'POST',
          body: formData
        });
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || 'No se pudo guardar el material.');
        return;
      }

      const result = await resp.json();

      if (result && result.item) {
        const item = result.item;

        if (editingItemId) {
          // actualizar en el arreglo local
          const idx = scienceItems.findIndex(i => i.id === editingItemId);
          if (idx >= 0) {
            scienceItems[idx] = item;
          }
          await logHistory({
            action: 'update',
            type: 'item',
            entityId: item.id,
            detail: `Actualizado material de ciencias "${item.nombre || ''}" (código ${item.codigo || ''})`
          });
        } else {
          scienceItems.push(item);
          await logHistory({
            action: 'create',
            type: 'item',
            entityId: item.id,
            detail: `Ingresado material de ciencias "${item.nombre || ''}" (código ${item.codigo || ''})`
          });
        }

        renderScienceTable();
      }

      resetEditMode();
    } catch (err) {
      console.error('Error al guardar material de ciencias:', err);
      alert('Ocurrió un error al guardar.');
    }
  });

  if (scienceSearchInput) {
    scienceSearchInput.addEventListener(
      'input',
      debounce(() => renderScienceTable(), 200)
    );
  }

  // ================== PRÉSTAMOS ==================
  async function loadScienceLoans() {
    if (!loansTableBody) return;
    try {
      const resp = await apiFetch('/api/science/loans');
      if (!resp.ok) {
        console.error('Error al cargar préstamos de ciencias:', resp.status);
        return;
      }
      const loans = await resp.json();
      scienceLoans = Array.isArray(loans) ? loans : [];
      renderLoansTable();
    } catch (err) {
      console.error('Error cargando préstamos de ciencias:', err);
    }
  }

  function getFilteredLoans() {
    const text = (loansSearchInput?.value || '').trim().toLowerCase();
    if (!text) return [...scienceLoans];

    return scienceLoans.filter(loan => {
      const vals = [
        loan.id,
        loan.codigo || loan.itemCode,
        loan.nombre || loan.borrowerName,
        loan.curso || loan.borrowerCourse,
        loan.observaciones || loan.notes
      ];
      return vals.some(v => v && String(v).toLowerCase().includes(text));
    });
  }

  function renderLoansTable() {
    if (!loansTableBody) return;
    loansTableBody.innerHTML = '';

    const loans = getFilteredLoans();
    loans.forEach(loan => {
      const loanId = loan.id || '';
      const codigo = loan.codigo || loan.itemCode || '';
      const nombre = loan.nombre || loan.borrowerName || '';
      const curso = loan.curso || loan.borrowerCourse || '';
      const observaciones = loan.observaciones || loan.notes || '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safe(loanId)}</td>
        <td>${safe(codigo)}</td>
        <td>${safe(nombre)}</td>
        <td>${safe(curso)}</td>
        <td>${formatDate(loan.loanDate)}</td>
        <td>${loan.returned ? 'Sí' : 'No'}</td>
        <td>${formatDate(loan.returnDate)}</td>
        <td>${safe(observaciones)}</td>
        <td>
          ${
            loan.returned
              ? ''
              : `<button type="button" class="btn-ghost sci-return-btn" data-id="${loanId}">
                   Marcar devuelto
                 </button>`
          }
        </td>
      `;

      const retBtn = tr.querySelector('.sci-return-btn');
      if (retBtn) {
        retBtn.addEventListener('click', async () => {
          if (!confirm('¿Marcar este préstamo como devuelto?')) return;
          await doReturnLoan(loanId);
        });
      }

      loansTableBody.appendChild(tr);
    });
  }

  async function doReturnLoan(loanId) {
    try {
      const resp = await apiFetch(`/api/science/return/${loanId}`, {
        method: 'POST'
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo registrar la devolución.');
        return;
      }

      await loadScienceLoans();
      await loadScienceItems();

      await logHistory({
        action: 'update',
        type: 'loan',
        entityId: loanId,
        detail: `Préstamo de ciencias ${loanId} marcado como devuelto`
      });
    } catch (err) {
      console.error('Error al devolver préstamo de ciencias:', err);
      alert('Ocurrió un error al registrar la devolución.');
    }
  }

  if (loanForm) {
    loanForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(loanForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const resp = await apiFetch('/api/science/loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar el préstamo.');
          return;
        }

        const result = await resp.json();
        if (result && result.loan) {
          scienceLoans.unshift(result.loan);
          renderLoansTable();

          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo de ciencias creado (ID ${result.loan.id}) para ${result.loan.nombre || ''}`
          });
        }

        loanForm.reset();
        if (loanPersonSelect) loanPersonSelect.value = '';
        if (loanTipoPersonaInput) loanTipoPersonaInput.value = '';
      } catch (err) {
        console.error('Error al registrar préstamo de ciencias:', err);
        alert('Ocurrió un error al registrar el préstamo.');
      }
    });
  }

  if (returnForm && returnIdInput) {
    returnForm.addEventListener('submit', async e => {
      e.preventDefault();
      const loanId = returnIdInput.value.trim();
      if (!loanId) {
        alert('Debes indicar el ID del préstamo.');
        return;
      }
      await doReturnLoan(loanId);
      returnForm.reset();
    });
  }

  if (loansSearchInput) {
    loansSearchInput.addEventListener(
      'input',
      debounce(() => renderLoansTable(), 200)
    );
  }

  // ================== PERSONAS (compartidas con Biblioteca) ==================
  async function loadSciencePeople() {
    try {
      const resp = await apiFetch('/api/library/people');
      if (!resp.ok) {
        console.error('Error al cargar personas para Ciencias:', resp.status);
        return;
      }
      const data = await resp.json();
      sciencePeople = Array.isArray(data) ? data : [];

      renderPeopleTable();
      fillLoanPersonSelect();
    } catch (err) {
      console.error('Error cargando personas para Ciencias:', err);
    }
  }

  function renderPeopleTable() {
    if (!peopleTableBody) return;
    peopleTableBody.innerHTML = '';

    sciencePeople.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safe(p.id)}</td>
        <td>${safe(p.nombre)}</td>
        <td>${safe(p.tipo)}</td>
        <td>${safe(p.curso)}</td>
      `;
      peopleTableBody.appendChild(tr);
    });
  }

  function fillLoanPersonSelect() {
    if (!loanPersonSelect) return;

    loanPersonSelect.innerHTML =
      '<option value="">-- Seleccionar desde lista --</option>';

    const estudiantes = sciencePeople.filter(
      p => (p.tipo || '').toLowerCase() === 'estudiante'
    );
    const funcionarios = sciencePeople.filter(
      p => (p.tipo || '').toLowerCase() === 'funcionario'
    );

    if (estudiantes.length) {
      const og = document.createElement('optgroup');
      og.label = 'Estudiantes';
      estudiantes.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const extra = p.curso ? ` (${p.curso})` : '';
        opt.textContent = `${p.nombre}${extra}`;
        og.appendChild(opt);
      });
      loanPersonSelect.appendChild(og);
    }

    if (funcionarios.length) {
      const og = document.createElement('optgroup');
      og.label = 'Funcionarios';
      funcionarios.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const extra = p.curso ? ` (${p.curso})` : '';
        opt.textContent = `${p.nombre}${extra}`;
        og.appendChild(opt);
      });
      loanPersonSelect.appendChild(og);
    }
  }

  if (loanPersonSelect) {
    loanPersonSelect.addEventListener('change', () => {
      const id = loanPersonSelect.value;
      const p = sciencePeople.find(x => x.id === id);
      if (!p) return;

      if (loanNombreInput && !loanNombreInput.value) {
        loanNombreInput.value = p.nombre || '';
      }
      if (loanCursoInput && !loanCursoInput.value) {
        loanCursoInput.value = p.curso || '';
      }
      if (loanTipoPersonaInput) {
        loanTipoPersonaInput.value = p.tipo || '';
      }
    });
  }

  // ================== INICIALIZACIÓN ==================
  loadScienceItems();
  loadScienceLoans();
  loadSciencePeople();
});
