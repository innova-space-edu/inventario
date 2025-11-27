// /public/js/library.js
// ===============================
// Biblioteca – Inventario + Préstamos + Personas
// Actualizado: estilos futuristas, filtros avanzados, select de personas,
// mejoras de UX, exportación (CSV / impresión a PDF vía print), alertas y
// compatibilidad con tu backend actual.
// ===============================

document.addEventListener('DOMContentLoaded', () => {
  // ------------------ Referencias base ------------------
  const libraryForm = document.getElementById('libraryForm');
  const libraryTableBody = document.querySelector('#libraryTable tbody');

  const loanForm = document.getElementById('loanForm');
  const returnForm = document.getElementById('returnForm');
  // Nota: en tu HTML la tabla se llama "loanTable", pero aquí soportamos ambos ids
  const loansTableBody =
    document.querySelector('#loansTable tbody') ||
    document.querySelector('#loanTable tbody');

  const overdueBanner = document.getElementById('libraryOverdueBanner');

  // ------------------ Filtros inventario ------------------
  const librarySearchInput = document.getElementById('librarySearch');
  const libraryFilterMode = document.getElementById('libraryFilterMode');
  const libraryFilterCategoria = document.getElementById('libraryFilterCategoria');
  const libraryFilterYearFrom = document.getElementById('libraryFilterYearFrom');
  const libraryFilterYearTo = document.getElementById('libraryFilterYearTo');
  const libraryFilterHasPhoto = document.getElementById('libraryFilterHasPhoto');

  // ------------------ Filtros préstamos ------------------
  const loansSearchInput = document.getElementById('loansSearch');
  const loansFilterMode = document.getElementById('loansFilterMode');
  const loansFilterReturned = document.getElementById('loansFilterReturned');
  const loansFilterDateFrom = document.getElementById('loansFilterDateFrom');
  const loansFilterDateTo = document.getElementById('loansFilterDateTo');

  // ------------------ Personas (estudiantes/func.) ------------------
  // En la UI: <select id="loanPersonSelect"> para auto-completar préstamo
  const loanPersonSelect = document.getElementById('loanPersonSelect');
  const loanTipoPersonaInput = document.getElementById('loanTipoPersona');

  const peopleForm = document.getElementById('peopleForm');
  const peopleFormSubmit = document.getElementById('peopleFormSubmit');
  const peopleFormCancel = document.getElementById('peopleFormCancel');
  const peopleTableBody = document.querySelector('#peopleTable tbody');

  // ------------------ Botones de reporte (si existen en tu HTML) ------------------
  const btnExportLibraryCSV = document.getElementById('btnExportLibraryCSV');
  const btnExportLoansCSV = document.getElementById('btnExportLoansCSV');
  const btnPrintLibraryReport = document.getElementById('btnPrintLibraryReport');
  const btnPrintLoansReport = document.getElementById('btnPrintLoansReport');

  // ------------------ Helper de API (con credenciales) ------------------
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: 'include', ...options }));

  // Si no estamos en la pantalla de biblioteca, salir silenciosamente
  if (!libraryForm || !libraryTableBody) return;

  // ================== Estado local ==================
  let libraryItems = [];
  let libraryLoans = [];
  let libraryPeople = [];
  let editingPersonId = null;

  // ================== Utils ==================
  function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CL');
  }

  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function safeInnerText(value) {
    return value == null ? '' : String(value);
  }

  function imageFallback(imgEl) {
    imgEl.onerror = null;
    imgEl.src = '/img/placeholder.png'; // asegúrate de tener esta imagen en /public/img
    imgEl.alt = 'Sin imagen';
  }

  // Registrar en historial (si backend lo soporta)
  async function logHistory(entry) {
    try {
      await apiFetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab: 'library',
          action: entry.action,
          entityType: entry.type,
          entityId: entry.entityId,
          data: { detail: entry.detail }
        })
      });
    } catch (err) {
      // No interrumpimos la UX si falla
      console.warn('No se pudo registrar historial (library):', err);
    }
  }

  // ================== INVENTARIO ==================
  async function loadLibraryItems() {
    try {
      const resp = await apiFetch('/api/library/items');
      if (!resp.ok) {
        console.error('Error al cargar inventario de biblioteca:', resp.status);
        return;
      }
      const items = await resp.json();
      libraryItems = Array.isArray(items) ? items : [];
      restoreInventoryFiltersFromStorage();
      renderLibraryTable();
    } catch (err) {
      console.error('Error cargando libros:', err);
    }
  }

  function renderLibraryTable() {
    libraryTableBody.innerHTML = '';

    const filtered = getFilteredLibraryItems();
    filtered.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safeInnerText(item.id)}</td>
        <td>${safeInnerText(item.codigo)}</td>
        <td>${safeInnerText(item.titulo)}</td>
        <td>${safeInnerText(item.autor)}</td>
        <td>${safeInnerText(item.anio)}</td>
        <td>${safeInnerText(item.serie)}</td>
        <td>${safeInnerText(item.categoria)}</td>
        <td>${safeInnerText(item.cantidad)}</td>
        <td>${safeInnerText(item.descripcion)}</td>
        <td>
          ${
            item.photo
              ? `<img src="${item.photo}" width="50" alt="Foto libro" onerror="(${imageFallback.toString()})(this)">`
              : ''
          }
        </td>
        <td>
          <button type="button" class="delete-button btn-ghost" data-id="${item.id}">Eliminar</button>
        </td>
      `;

      const deleteBtn = tr.querySelector('.delete-button');
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que deseas eliminar este libro del inventario?')) return;

        const motivo = prompt(
          'Indica el motivo de eliminación (por ejemplo: "daño", "pérdida", "traslado", etc.):'
        );
        if (!motivo || !motivo.trim()) {
          alert('Debes indicar un motivo para poder eliminar el libro.');
          return;
        }

        try {
          const resp = await apiFetch(`/api/library/items/${item.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo.trim() })
          });

          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || 'No se pudo eliminar el libro.');
            return;
          }

          libraryItems = libraryItems.filter(it => it.id !== item.id);
          renderLibraryTable();

          await logHistory({
            action: 'delete',
            type: 'item',
            entityId: item.id,
            detail: `Eliminado libro/material "${item.titulo || ''}" (código ${item.codigo || ''}) – Motivo: ${motivo}`
          });
        } catch (err) {
          console.error('Error al eliminar libro:', err);
          alert('Ocurrió un error al eliminar el libro.');
        }
      });

      libraryTableBody.appendChild(tr);
    });
  }

  function getFilteredLibraryItems() {
    let items = [...libraryItems];

    const mode = libraryFilterMode ? libraryFilterMode.value : 'both';
    const text = librarySearchInput ? librarySearchInput.value.trim().toLowerCase() : '';

    if (text && (mode === 'simple' || mode === 'both' || !libraryFilterMode)) {
      items = items.filter(item => {
        const values = [
          item.codigo,
          item.titulo,
          item.autor,
          item.serie,
          item.categoria,
          item.descripcion
        ];
        return values.some(v => v && String(v).toLowerCase().includes(text));
      });
    }

    if (mode === 'advanced' || mode === 'both' || !libraryFilterMode) {
      const cat = libraryFilterCategoria ? libraryFilterCategoria.value : 'all';
      const yearFrom = libraryFilterYearFrom ? parseInt(libraryFilterYearFrom.value, 10) : NaN;
      const yearTo = libraryFilterYearTo ? parseInt(libraryFilterYearTo.value, 10) : NaN;
      const mustHavePhoto = libraryFilterHasPhoto ? libraryFilterHasPhoto.checked : false;

      if (cat && cat !== 'all') {
        items = items.filter(
          it => (it.categoria || '').toLowerCase() === String(cat).toLowerCase()
        );
      }
      if (!Number.isNaN(yearFrom)) {
        items = items.filter(it => {
          const y = parseInt(it.anio, 10);
          if (Number.isNaN(y)) return false;
          return y >= yearFrom;
        });
      }
      if (!Number.isNaN(yearTo)) {
        items = items.filter(it => {
          const y = parseInt(it.anio, 10);
          if (Number.isNaN(y)) return false;
          return y <= yearTo;
        });
      }
      if (mustHavePhoto) {
        items = items.filter(it => !!it.photo);
      }
    }

    return items;
  }

  // Persistencia de filtros de inventario
  function persistInventoryFiltersToStorage() {
    try {
      const state = {
        text: librarySearchInput ? librarySearchInput.value : '',
        mode: libraryFilterMode ? libraryFilterMode.value : 'both',
        categoria: libraryFilterCategoria ? libraryFilterCategoria.value : 'all',
        from: libraryFilterYearFrom ? libraryFilterYearFrom.value : '',
        to: libraryFilterYearTo ? libraryFilterYearTo.value : '',
        hasPhoto: libraryFilterHasPhoto ? !!libraryFilterHasPhoto.checked : false
      };
      localStorage.setItem('lib_filters', JSON.stringify(state));
    } catch (_) {}
  }

  function restoreInventoryFiltersFromStorage() {
    try {
      const raw = localStorage.getItem('lib_filters');
      if (!raw) return;
      const state = JSON.parse(raw);

      if (librarySearchInput) librarySearchInput.value = state.text || '';
      if (libraryFilterMode) libraryFilterMode.value = state.mode || 'both';
      if (libraryFilterCategoria) libraryFilterCategoria.value = state.categoria || 'all';
      if (libraryFilterYearFrom) libraryFilterYearFrom.value = state.from || '';
      if (libraryFilterYearTo) libraryFilterYearTo.value = state.to || '';
      if (libraryFilterHasPhoto) libraryFilterHasPhoto.checked = !!state.hasPhoto;
    } catch (_) {}
  }

  // Envío del formulario de alta de libros/material
  libraryForm.addEventListener('submit', async e => {
    e.preventDefault();

    const formData = new FormData(libraryForm);

    try {
      const resp = await apiFetch('/api/library/items', {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || 'No se pudo guardar el libro/material.');
        return;
      }

      const result = await resp.json();
      if (result && result.item) {
        libraryItems.push(result.item);
        renderLibraryTable();

        await logHistory({
          action: 'create',
          type: 'item',
          entityId: result.item.id,
          detail: `Ingresado libro/material "${result.item.titulo || ''}" (código ${result.item.codigo || ''})`
        });
      }

      libraryForm.reset();
    } catch (err) {
      console.error('Error al guardar libro/material:', err);
      alert('Ocurrió un error al guardar.');
    }
  });

  // ================== PRÉSTAMOS ==================
  async function loadLoans() {
    if (!loansTableBody) return;
    try {
      const resp = await apiFetch('/api/library/loans');
      if (!resp.ok) {
        console.error('Error al cargar préstamos:', resp.status);
        return;
      }
      const loans = await resp.json();
      libraryLoans = Array.isArray(loans) ? loans : [];
      restoreLoanFiltersFromStorage();
      renderLoansTable();
    } catch (err) {
      console.error('Error cargando préstamos:', err);
    }
  }

  function getFilteredLoans() {
    let loans = [...libraryLoans];

    const mode = loansFilterMode ? loansFilterMode.value : 'both';
    const text = loansSearchInput ? loansSearchInput.value.trim().toLowerCase() : '';

    if (text && (mode === 'simple' || mode === 'both' || !loansFilterMode)) {
      loans = loans.filter(loan => {
        const codigo = loan.codigo || loan.bookCode || '';
        const nombre = loan.nombre || loan.borrowerName || '';
        const curso = loan.curso || loan.borrowerCourse || '';
        const obs = loan.observaciones || loan.notes || '';
        const id = loan.id || '';
        const personaId = loan.personaId || loan.personId || '';

        return [id, codigo, nombre, curso, obs, personaId].some(v =>
          v && String(v).toLowerCase().includes(text)
        );
      });
    }

    if (mode === 'advanced' || mode === 'both' || !loansFilterMode) {
      if (loansFilterReturned && loansFilterReturned.value !== 'all') {
        const val = loansFilterReturned.value;
        loans = loans.filter(loan => {
          const returned = !!loan.returned;
          if (val === 'yes') return returned;
          if (val === 'no') return !returned;
          return true;
        });
      }

      const fromStr = loansFilterDateFrom ? loansFilterDateFrom.value : '';
      const toStr = loansFilterDateTo ? loansFilterDateTo.value : '';
      const fromDate = fromStr ? new Date(fromStr + 'T00:00:00') : null;
      const toDate = toStr ? new Date(toStr + 'T23:59:59') : null;

      if (fromDate || toDate) {
        loans = loans.filter(loan => {
          if (!loan.loanDate) return false;
          const d = new Date(loan.loanDate);
          if (Number.isNaN(d.getTime())) return false;
          if (fromDate && d < fromDate) return false;
          if (toDate && d > toDate) return false;
          return true;
        });
      }
    }

    return loans;
  }

  function renderLoansTable() {
    if (!loansTableBody) return;
    loansTableBody.innerHTML = '';

    const loans = getFilteredLoans();

    loans.forEach(loan => {
      const tr = document.createElement('tr');

      const loanId = loan.id || '';
      const codigo = loan.codigo || loan.bookCode || '';
      const nombre = loan.nombre || loan.borrowerName || '';
      const curso = loan.curso || loan.borrowerCourse || '';
      const observaciones = loan.observaciones || loan.notes || '';

      tr.innerHTML = `
        <td>${safeInnerText(loanId)}</td>
        <td>${safeInnerText(codigo)}</td>
        <td>${safeInnerText(nombre)}</td>
        <td>${safeInnerText(curso)}</td>
        <td>${formatDate(loan.loanDate)}</td>
        <td>${loan.returned ? 'Sí' : 'No'}</td>
        <td>${formatDate(loan.returnDate)}</td>
        <td>${safeInnerText(observaciones)}</td>
        <td>
          ${
            loan.returned
              ? ''
              : `<button type="button" class="return-button btn-ghost" data-id="${loanId}">Marcar devuelto</button>`
          }
          <button type="button" class="delete-loan-button btn-ghost" data-id="${loanId}">Eliminar</button>
        </td>
      `;

      const returnBtn = tr.querySelector('.return-button');
      if (returnBtn) {
        returnBtn.addEventListener('click', async () => {
          if (!confirm('¿Marcar este préstamo como devuelto?')) return;

          try {
            const resp = await apiFetch(`/api/library/return/${loanId}`, {
              method: 'POST'
            });
            if (!resp.ok) {
              const data = await resp.json().catch(() => ({}));
              alert(data.message || 'No se pudo registrar la devolución.');
              return;
            }
            await loadLoans();

            await logHistory({
              action: 'update',
              type: 'loan',
              entityId: loanId,
              detail: `Préstamo ${loanId} marcado como devuelto`
            });
          } catch (err) {
            console.error('Error al registrar devolución:', err);
            alert('Ocurrió un error al registrar la devolución.');
          }
        });
      }

      const deleteBtn = tr.querySelector('.delete-loan-button');
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que deseas eliminar este préstamo del registro?')) return;

        const motivo = prompt(
          'Indica el motivo de eliminación del préstamo (por ejemplo, "error de registro", "anulado", etc.):'
        );
        if (!motivo || !motivo.trim()) {
          alert('Debes indicar un motivo para poder eliminar el préstamo.');
          return;
        }

        try {
          const resp = await apiFetch(`/api/library/loan/${loanId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo.trim() })
          });

          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || 'No se pudo eliminar el préstamo.');
            return;
          }

          libraryLoans = libraryLoans.filter(l => l.id !== loanId);
          renderLoansTable();

          await logHistory({
            action: 'delete',
            type: 'loan',
            entityId: loanId,
            detail: `Préstamo ${loanId} eliminado – Motivo: ${motivo}`
          });
        } catch (err) {
          console.error('Error al eliminar préstamo:', err);
          alert('Ocurrió un error al eliminar el préstamo.');
        }
      });

      loansTableBody.appendChild(tr);
    });
  }

  // Persistencia de filtros de préstamos
  function persistLoanFiltersToStorage() {
    try {
      const state = {
        text: loansSearchInput ? loansSearchInput.value : '',
        mode: loansFilterMode ? loansFilterMode.value : 'both',
        returned: loansFilterReturned ? loansFilterReturned.value : 'all',
        from: loansFilterDateFrom ? loansFilterDateFrom.value : '',
        to: loansFilterDateTo ? loansFilterDateTo.value : ''
      };
      localStorage.setItem('loan_filters', JSON.stringify(state));
    } catch (_) {}
  }

  function restoreLoanFiltersFromStorage() {
    try {
      const raw = localStorage.getItem('loan_filters');
      if (!raw) return;
      const state = JSON.parse(raw);

      if (loansSearchInput) loansSearchInput.value = state.text || '';
      if (loansFilterMode) loansFilterMode.value = state.mode || 'both';
      if (loansFilterReturned) loansFilterReturned.value = state.returned || 'all';
      if (loansFilterDateFrom) loansFilterDateFrom.value = state.from || '';
      if (loansFilterDateTo) loansFilterDateTo.value = state.to || '';
    } catch (_) {}
  }

  // Formularios de préstamos
  if (loanForm) {
    loanForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(loanForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const resp = await apiFetch('/api/library/loan', {
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
          libraryLoans.unshift(result.loan);
          renderLoansTable();

          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo creado (ID ${result.loan.id}) para ${result.loan.nombre || result.loan.borrowerName || ''}`
          });
        }

        loanForm.reset();
        if (loanPersonSelect) loanPersonSelect.value = '';
        if (loanTipoPersonaInput) loanTipoPersonaInput.value = '';
      } catch (err) {
        console.error('Error al registrar préstamo:', err);
        alert('Ocurrió un error al registrar el préstamo.');
      }
    });
  }

  if (returnForm) {
    returnForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(returnForm);
      const loanId = formData.get('loanId');

      if (!loanId) {
        alert('Debes indicar el ID del préstamo.');
        return;
      }

      try {
        const resp = await apiFetch(`/api/library/return/${loanId}`, {
          method: 'POST'
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar la devolución.');
          return;
        }

        await loadLoans();

        await logHistory({
          action: 'update',
          type: 'loan',
          entityId: loanId,
          detail: `Préstamo ${loanId} marcado como devuelto (formulario rápido)`
        });

        returnForm.reset();
      } catch (err) {
        console.error('Error al registrar devolución:', err);
        alert('Ocurrió un error al registrar la devolución.');
      }
    });
  }

  // ================== PERSONAS (listado) ==================
  async function loadLibraryPeople() {
    if (!peopleTableBody && !loanPersonSelect) return;

    try {
      const resp = await apiFetch('/api/library/people');
      if (!resp.ok) {
        console.error('Error al cargar personas de biblioteca:', resp.status);
        return;
      }
      const data = await resp.json();
      libraryPeople = Array.isArray(data) ? data : [];
      renderPeopleTable();
      fillLoanPersonaSelect();
    } catch (err) {
      console.error('Error cargando personas de biblioteca:', err);
    }
  }

  function fillLoanPersonaSelect() {
    if (!loanPersonSelect) return;

    loanPersonSelect.innerHTML = '<option value="">-- Seleccionar desde lista --</option>';

    libraryPeople.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const etiquetaCurso = p.curso ? ` – ${p.curso}` : '';
      opt.textContent = `${p.nombre}${etiquetaCurso}`;
      loanPersonSelect.appendChild(opt);
    });
  }

  function renderPeopleTable() {
    if (!peopleTableBody) return;
    peopleTableBody.innerHTML = '';

    libraryPeople.forEach(person => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safeInnerText(person.id)}</td>
        <td>${safeInnerText(person.nombre)}</td>
        <td>${safeInnerText(person.tipo)}</td>
        <td>${safeInnerText(person.curso)}</td>
        <td>
          <button type="button" class="edit-person-button btn-ghost" data-id="${person.id}">Editar</button>
          <button type="button" class="delete-person-button btn-ghost" data-id="${person.id}">Eliminar</button>
        </td>
      `;

      const editBtn = tr.querySelector('.edit-person-button');
      const deleteBtn = tr.querySelector('.delete-person-button');

      if (editBtn && peopleForm) {
        editBtn.addEventListener('click', () => {
          const p = libraryPeople.find(x => x.id === person.id);
          if (!p) return;

          editingPersonId = p.id;
          const idInput = peopleForm.elements['id'];
          const nombreInput = peopleForm.elements['nombre'];
          const tipoSelect = peopleForm.elements['tipo'];
          const cursoInput = peopleForm.elements['curso'];

          if (idInput) idInput.value = p.id || '';
          if (nombreInput) nombreInput.value = p.nombre || '';
          if (tipoSelect) tipoSelect.value = p.tipo || 'estudiante';
          if (cursoInput) cursoInput.value = p.curso || '';

          if (peopleFormSubmit) peopleFormSubmit.textContent = 'Actualizar persona';
          if (peopleFormCancel) peopleFormCancel.style.display = 'inline-block';
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm('¿Seguro que deseas eliminar esta persona del listado?')) return;

          const motivo =
            prompt('Opcional: indica el motivo de eliminación (por ejemplo, "egresado", "baja", etc.):') || '';

          try {
            const resp = await apiFetch(`/api/library/people/${encodeURIComponent(person.id)}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ motivo })
            });

            if (!resp.ok) {
              const d = await resp.json().catch(() => ({}));
              alert(d.message || 'No se pudo eliminar la persona.');
              return;
            }

            await loadLibraryPeople();

            await logHistory({
              action: 'delete',
              type: 'person',
              entityId: person.id,
              detail: `Persona "${person.nombre || ''}" eliminada del listado – Motivo: ${motivo || '—'}`
            });
          } catch (err) {
            console.error('Error al eliminar persona:', err);
            alert('Ocurrió un error al eliminar la persona.');
          }
        });
      }

      peopleTableBody.appendChild(tr);
    });
  }

  function resetPeopleForm() {
    if (!peopleForm) return;
    peopleForm.reset();
    editingPersonId = null;
    if (peopleFormSubmit) peopleFormSubmit.textContent = 'Guardar persona';
    if (peopleFormCancel) peopleFormCancel.style.display = 'none';
  }

  if (peopleForm) {
    peopleForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(peopleForm);
      const data = Object.fromEntries(formData.entries());

      const payload = {
        id: (data.id || '').trim(),
        nombre: (data.nombre || '').trim(),
        tipo: (data.tipo || '').trim(),
        curso: (data.curso || '').trim()
      };

      if (!payload.nombre || !payload.tipo) {
        alert('Nombre y tipo son obligatorios (estudiante/funcionario).');
        return;
      }

      try {
        let resp;
        if (editingPersonId) {
          resp = await apiFetch(`/api/library/people/${encodeURIComponent(editingPersonId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: payload.nombre,
              tipo: payload.tipo,
              curso: payload.curso
            })
          });
        } else {
          resp = await apiFetch('/api/library/people', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo guardar la persona.');
          return;
        }

        await loadLibraryPeople();
        resetPeopleForm();

        await logHistory({
          action: editingPersonId ? 'update' : 'create',
          type: 'person',
          entityId: payload.id || '(auto)',
          detail: `${editingPersonId ? 'Actualizada' : 'Creada'} persona "${payload.nombre}"`
        });
      } catch (err) {
        console.error('Error al guardar persona:', err);
        alert('Ocurrió un error al guardar la persona.');
      }
    });
  }

  if (peopleFormCancel) {
    peopleFormCancel.addEventListener('click', e => {
      e.preventDefault();
      resetPeopleForm();
    });
  }

  if (loanPersonSelect && loanForm) {
    loanPersonSelect.addEventListener('change', () => {
      const personId = loanPersonSelect.value;
      if (!personId) {
        if (loanTipoPersonaInput) loanTipoPersonaInput.value = '';
        return;
      }

      const person = libraryPeople.find(p => p.id === personId);
      if (!person) return;

      const nombreInput = loanForm.elements['nombre'];
      const cursoInput = loanForm.elements['curso'];

      if (nombreInput && !nombreInput.value) nombreInput.value = person.nombre || '';
      if (cursoInput && !cursoInput.value) cursoInput.value = person.curso || '';
      if (loanTipoPersonaInput) loanTipoPersonaInput.value = person.tipo || '';
    });
  }

  // ================== Alertas (vencidos) ==================
  async function checkOverdueLoans() {
    if (!overdueBanner) return;

    try {
      const resp = await apiFetch('/api/library/overdue');
      if (!resp.ok) return;

      const overdue = await resp.json();
      if (Array.isArray(overdue) && overdue.length > 0) {
        overdueBanner.textContent =
          `⚠️ Hay ${overdue.length} préstamo(s) con más de 7 días sin devolución. Revisa el listado.`;
        overdueBanner.style.display = 'block';

        const speakFn = window.innovaSpeak || window.speak;
        if (typeof speakFn === 'function') {
          speakFn(`Atención. Hay ${overdue.length} préstamos con más de siete días sin devolución en la biblioteca.`);
        }
      } else {
        overdueBanner.style.display = 'none';
        overdueBanner.textContent = '';
      }
    } catch (err) {
      console.error('Error al comprobar préstamos vencidos:', err);
    }
  }

  // ================== Exportaciones (CSV / Print) ==================
  function toCSVRow(values) {
    return values
      .map(v => {
        const s = v == null ? '' : String(v);
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(',');
  }

  function downloadCSV(filename, headers, rows) {
    const csv = [toCSVRow(headers), ...rows.map(r => toCSVRow(r))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportInventoryCSV() {
    const data = getFilteredLibraryItems();
    const headers = [
      'ID',
      'Código',
      'Título/Material',
      'Autor/Fabricante',
      'Año',
      'Serie',
      'Categoría',
      'Cantidad',
      'Descripción',
      'Foto'
    ];
    const rows = data.map(it => [
      it.id,
      it.codigo || '',
      it.titulo || '',
      it.autor || '',
      it.anio || '',
      it.serie || '',
      it.categoria || '',
      it.cantidad || '',
      (it.descripcion || '').replace(/\s+/g, ' ').trim(),
      it.photo || ''
    ]);
    downloadCSV(`biblioteca_inventario_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
  }

  function exportLoansCSV() {
    const data = getFilteredLoans();
    const headers = [
      'ID Préstamo',
      'Código',
      'Nombre',
      'Curso',
      'Fecha Préstamo',
      'Devuelto',
      'Fecha Devolución',
      'Observaciones'
    ];
    const rows = data.map(l => [
      l.id || '',
      l.codigo || l.bookCode || '',
      l.nombre || l.borrowerName || '',
      l.curso || l.borrowerCourse || '',
      formatDate(l.loanDate),
      l.returned ? 'Sí' : 'No',
      formatDate(l.returnDate),
      (l.observaciones || l.notes || '').replace(/\s+/g, ' ').trim()
    ]);
    downloadCSV(`biblioteca_prestamos_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
  }

  function printHTMLReport({ title, subtitle, columns, rows }) {
    const win = window.open('', '_blank');
    const styles = `
      <style>
        body { font-family: Arial, system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', sans-serif; margin: 24px; }
        h1 { margin: 0 0 8px; }
        h2 { margin: 0 0 16px; color: #666; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; font-size: 12px; vertical-align: top; }
        th { background: #0b1226; color: #fff; text-align: left; }
        tr:nth-child(even) { background: #f7f8fb; }
        .meta { margin-top: 6px; color: #777; font-size: 12px; }
      </style>
    `;
    const tableHead = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
    const tableRows = rows.map(r => `<tr>${r.map(c => `<td>${safeInnerText(c)}</td>`).join('')}</tr>`).join('');

    const html = `
      <!doctype html>
      <html>
      <head><meta charset="utf-8">${styles}<title>${title}</title></head>
      <body>
        <h1>${title}</h1>
        <h2>${subtitle}</h2>
        <div class="meta">Generado: ${formatDate(new Date())}</div>
        <table>
          <thead>${tableHead}</thead>
          <tbody>${tableRows}</tbody>
        </table>
        <script>window.onload = () => window.print();<\/script>
      </body>
      </html>
    `;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function printInventoryReport() {
    const data = getFilteredLibraryItems();
    const columns = [
      'ID',
      'Código',
      'Título/Material',
      'Autor/Fabricante',
      'Año',
      'Serie',
      'Categoría',
      'Cantidad',
      'Descripción'
    ];
    const rows = data.map(it => [
      it.id,
      it.codigo || '',
      it.titulo || '',
      it.autor || '',
      it.anio || '',
      it.serie || '',
      it.categoria || '',
      it.cantidad || '',
      (it.descripcion || '').replace(/\s+/g, ' ').trim()
    ]);
    printHTMLReport({
      title: 'Informe de Inventario – Biblioteca',
      subtitle: 'Listado filtrado',
      columns,
      rows
    });
  }

  function printLoansReport() {
    const data = getFilteredLoans();
    const columns = [
      'ID Préstamo',
      'Código',
      'Nombre',
      'Curso',
      'Fecha Préstamo',
      'Devuelto',
      'Fecha Devolución',
      'Observaciones'
    ];
    const rows = data.map(l => [
      l.id || '',
      l.codigo || l.bookCode || '',
      l.nombre || l.borrowerName || '',
      l.curso || l.borrowerCourse || '',
      formatDate(l.loanDate),
      l.returned ? 'Sí' : 'No',
      formatDate(l.returnDate),
      (l.observaciones || l.notes || '').replace(/\s+/g, ' ').trim()
    ]);
    printHTMLReport({
      title: 'Informe de Préstamos – Biblioteca',
      subtitle: 'Listado filtrado',
      columns,
      rows
    });
  }

  // Enganchar botones de reporte si existen en el DOM
  if (btnExportLibraryCSV) btnExportLibraryCSV.addEventListener('click', exportInventoryCSV);
  if (btnExportLoansCSV) btnExportLoansCSV.addEventListener('click', exportLoansCSV);
  if (btnPrintLibraryReport) btnPrintLibraryReport.addEventListener('click', printInventoryReport);
  if (btnPrintLoansReport) btnPrintLoansReport.addEventListener('click', printLoansReport);

  // ================== Listeners de filtros ==================
  function attachLibraryFiltersListeners() {
    if (librarySearchInput) {
      librarySearchInput.addEventListener('input', debounce(() => {
        persistInventoryFiltersToStorage();
        renderLibraryTable();
      }, 200));
    }
    if (libraryFilterMode) {
      libraryFilterMode.addEventListener('change', () => {
        const simpleGroup = document.querySelector('[data-library-filters="simple"]');
        const advancedGroup = document.querySelector('[data-library-filters="advanced"]');
        const mode = libraryFilterMode.value;

        if (simpleGroup) {
          simpleGroup.style.display = mode === 'simple' || mode === 'both' ? 'flex' : 'none';
        }
        if (advancedGroup) {
          advancedGroup.style.display = mode === 'advanced' || mode === 'both' ? 'flex' : 'none';
        }

        persistInventoryFiltersToStorage();
        renderLibraryTable();
      });
    }
    if (libraryFilterCategoria) {
      libraryFilterCategoria.addEventListener('change', () => {
        persistInventoryFiltersToStorage();
        renderLibraryTable();
      });
    }
    if (libraryFilterYearFrom) {
      libraryFilterYearFrom.addEventListener('input', () => {
        persistInventoryFiltersToStorage();
        renderLibraryTable();
      });
    }
    if (libraryFilterYearTo) {
      libraryFilterYearTo.addEventListener('input', () => {
        persistInventoryFiltersToStorage();
        renderLibraryTable();
      });
    }
    if (libraryFilterHasPhoto) {
      libraryFilterHasPhoto.addEventListener('change', () => {
        persistInventoryFiltersToStorage();
        renderLibraryTable();
      });
    }
  }

  function attachLoansFiltersListeners() {
    if (loansSearchInput) {
      loansSearchInput.addEventListener('input', debounce(() => {
        persistLoanFiltersToStorage();
        renderLoansTable();
      }, 200));
    }
    if (loansFilterMode) {
      loansFilterMode.addEventListener('change', () => {
        const simpleGroup = document.querySelector('[data-loans-filters="simple"]');
        const advancedGroup = document.querySelector('[data-loans-filters="advanced"]');
        const mode = loansFilterMode.value;

        if (simpleGroup) {
          simpleGroup.style.display = mode === 'simple' || mode === 'both' ? 'flex' : 'none';
        }
        if (advancedGroup) {
          advancedGroup.style.display = mode === 'advanced' || mode === 'both' ? 'flex' : 'none';
        }

        persistLoanFiltersToStorage();
        renderLoansTable();
      });
    }
    if (loansFilterReturned) {
      loansFilterReturned.addEventListener('change', () => {
        persistLoanFiltersToStorage();
        renderLoansTable();
      });
    }
    if (loansFilterDateFrom) {
      loansFilterDateFrom.addEventListener('input', () => {
        persistLoanFiltersToStorage();
        renderLoansTable();
      });
    }
    if (loansFilterDateTo) {
      loansFilterDateTo.addEventListener('input', () => {
        persistLoanFiltersToStorage();
        renderLoansTable();
      });
    }
  }

  // ================== Inicialización ==================
  loadLibraryItems();
  loadLoans();
  checkOverdueLoans();
  attachLibraryFiltersListeners();
  attachLoansFiltersListeners();
  loadLibraryPeople();
});
