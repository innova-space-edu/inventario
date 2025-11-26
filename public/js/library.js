// /public/js/library.js
document.addEventListener('DOMContentLoaded', () => {
  const libraryForm = document.getElementById('libraryForm');
  const libraryTableBody = document.querySelector('#libraryTable tbody');

  const loanForm = document.getElementById('loanForm');
  const returnForm = document.getElementById('returnForm');
  const loansTableBody = document.querySelector('#loansTable tbody');

  const overdueBanner = document.getElementById('libraryOverdueBanner');

  // NUEVO: referencias para buscador y filtros avanzados (si existen en el HTML)
  const librarySearchInput = document.getElementById('librarySearch');
  const libraryFilterMode = document.getElementById('libraryFilterMode');
  const libraryFilterCategoria = document.getElementById('libraryFilterCategoria');
  const libraryFilterYearFrom = document.getElementById('libraryFilterYearFrom');
  const libraryFilterYearTo = document.getElementById('libraryFilterYearTo');
  const libraryFilterHasPhoto = document.getElementById('libraryFilterHasPhoto');

  const loansSearchInput = document.getElementById('loansSearch');
  const loansFilterMode = document.getElementById('loansFilterMode');
  const loansFilterReturned = document.getElementById('loansFilterReturned');
  const loansFilterDateFrom = document.getElementById('loansFilterDateFrom');
  const loansFilterDateTo = document.getElementById('loansFilterDateTo');

  // NUEVO: referencias para personas de biblioteca
  const loanPersonaSelect = document.getElementById('loanPersonaSelect');
  const loanTipoPersonaInput = document.getElementById('loanTipoPersona');

  const peopleForm = document.getElementById('peopleForm');
  const peopleFormSubmit = document.getElementById('peopleFormSubmit');
  const peopleFormCancel = document.getElementById('peopleFormCancel');
  const peopleTableBody = document.querySelector('#peopleTable tbody');

  // Helper unificado para API
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, { credentials: 'include', ...options }));

  if (!libraryForm || !libraryTableBody) {
    // No estamos en la pestaña de biblioteca
    return;
  }

  // ================== ESTADO LOCAL ==================
  let libraryItems = [];
  let libraryLoans = [];
  // NUEVO: personas de biblioteca
  let libraryPeople = [];
  let editingPersonId = null;

  // ==================================================
  // ============= INVENTARIO DE BIBLIOTECA ===========
  // ==================================================

  async function loadLibraryItems() {
    try {
      const resp = await apiFetch('/api/library/items');
      if (!resp.ok) {
        console.error('Error al cargar libros:', resp.status);
        return;
      }
      const items = await resp.json();
      libraryItems = Array.isArray(items) ? items : [];
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
        <td>${item.id}</td>
        <td>${item.codigo || ''}</td>
        <td>${item.titulo || ''}</td>
        <td>${item.autor || ''}</td>
        <td>${item.anio || ''}</td>
        <td>${item.serie || ''}</td>
        <td>${item.categoria || ''}</td>
        <td>${item.cantidad || ''}</td>
        <td>${item.descripcion || ''}</td>
        <td>${item.photo ? `<img src="${item.photo}" width="50" alt="Foto libro">` : ''}</td>
        <td>
          <button type="button" class="delete-button" data-id="${item.id}">Eliminar</button>
        </td>
      `;

      const deleteBtn = tr.querySelector('.delete-button');
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que deseas eliminar este libro del inventario?')) return;

        // motivo obligatorio al eliminar (para historial y reportes)
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
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ motivo: motivo.trim() })
          });

          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || 'No se pudo eliminar el libro.');
            return;
          }

          // Eliminamos del arreglo local y re-renderizamos con filtros
          libraryItems = libraryItems.filter(it => it.id !== item.id);
          renderLibraryTable();
        } catch (err) {
          console.error('Error al eliminar libro:', err);
          alert('Ocurrió un error al eliminar el libro.');
        }
      });

      libraryTableBody.appendChild(tr);
    });
  }

  // Función de filtrado combinando buscador + filtros avanzados
  function getFilteredLibraryItems() {
    let items = [...libraryItems];

    const mode = libraryFilterMode ? libraryFilterMode.value : 'both';
    const text = librarySearchInput ? librarySearchInput.value.trim().toLowerCase() : '';

    // Filtro de texto (modo simple o both)
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
        return values.some(
          v => v && String(v).toLowerCase().includes(text)
        );
      });
    }

    // Filtros avanzados
    if (mode === 'advanced' || mode === 'both' || !libraryFilterMode) {
      const cat = libraryFilterCategoria ? libraryFilterCategoria.value : 'all';
      const yearFrom = libraryFilterYearFrom ? parseInt(libraryFilterYearFrom.value, 10) : NaN;
      const yearTo = libraryFilterYearTo ? parseInt(libraryFilterYearTo.value, 10) : NaN;
      const mustHavePhoto = libraryFilterHasPhoto ? libraryFilterHasPhoto.checked : false;

      if (cat && cat !== 'all') {
        items = items.filter(it => (it.categoria || '').toLowerCase() === cat.toLowerCase());
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

  // Listeners para buscador y filtros de inventario
  function attachLibraryFiltersListeners() {
    if (librarySearchInput) {
      librarySearchInput.addEventListener('input', () => {
        renderLibraryTable();
      });
    }
    if (libraryFilterMode) {
      libraryFilterMode.addEventListener('change', () => {
        // Mostrar/ocultar paneles según modo (si usas clases en el HTML)
        const simpleGroup = document.querySelector('[data-library-filters="simple"]');
        const advancedGroup = document.querySelector('[data-library-filters="advanced"]');
        const mode = libraryFilterMode.value;

        if (simpleGroup) {
          simpleGroup.style.display =
            mode === 'simple' || mode === 'both' ? 'flex' : 'none';
        }
        if (advancedGroup) {
          advancedGroup.style.display =
            mode === 'advanced' || mode === 'both' ? 'flex' : 'none';
        }

        renderLibraryTable();
      });
    }
    if (libraryFilterCategoria) {
      libraryFilterCategoria.addEventListener('change', renderLibraryTable);
    }
    if (libraryFilterYearFrom) {
      libraryFilterYearFrom.addEventListener('input', renderLibraryTable);
    }
    if (libraryFilterYearTo) {
      libraryFilterYearTo.addEventListener('input', renderLibraryTable);
    }
    if (libraryFilterHasPhoto) {
      libraryFilterHasPhoto.addEventListener('change', renderLibraryTable);
    }
  }

  // Envío del formulario de libros
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
        alert(data.message || 'No se pudo guardar el libro.');
        return;
      }

      const result = await resp.json();
      if (result && result.item) {
        libraryItems.push(result.item);
        renderLibraryTable();
      }

      libraryForm.reset();
    } catch (err) {
      console.error('Error al guardar libro:', err);
      alert('Ocurrió un error al guardar el libro.');
    }
  });

  // ==================================================
  // ============= PRÉSTAMOS DE BIBLIOTECA ============
  // ==================================================

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
      renderLoansTable();
    } catch (err) {
      console.error('Error cargando préstamos:', err);
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CL');
  }

  function getFilteredLoans() {
    let loans = [...libraryLoans];

    const mode = loansFilterMode ? loansFilterMode.value : 'both';
    const text = loansSearchInput ? loansSearchInput.value.trim().toLowerCase() : '';

    // Buscador simple (ID, código, nombre, curso, observaciones)
    if (text && (mode === 'simple' || mode === 'both' || !loansFilterMode)) {
      loans = loans.filter(loan => {
        const codigo = loan.codigo || loan.bookCode || '';
        const nombre = loan.nombre || loan.borrowerName || '';
        const curso = loan.curso || loan.borrowerCourse || '';
        const obs = loan.observaciones || loan.notes || '';
        const id = loan.id || '';

        return [id, codigo, nombre, curso, obs].some(v =>
          v && String(v).toLowerCase().includes(text)
        );
      });
    }

    // Filtros avanzados
    if (mode === 'advanced' || mode === 'both' || !loansFilterMode) {
      // Filtro por devuelto / no devuelto
      if (loansFilterReturned && loansFilterReturned.value !== 'all') {
        const val = loansFilterReturned.value;
        loans = loans.filter(loan => {
          const returned = !!loan.returned;
          if (val === 'yes') return returned;
          if (val === 'no') return !returned;
          return true;
        });
      }

      // Filtro por fechas
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
        <td>${loanId}</td>
        <td>${codigo}</td>
        <td>${nombre}</td>
        <td>${curso}</td>
        <td>${formatDate(loan.loanDate)}</td>
        <td>${loan.returned ? 'Sí' : 'No'}</td>
        <td>${formatDate(loan.returnDate)}</td>
        <td>${observaciones}</td>
        <td>
          ${loan.returned
            ? ''
            : `<button type="button" class="return-button" data-id="${loanId}">Marcar devuelto</button>`}
          <button type="button" class="delete-loan-button" data-id="${loanId}">Eliminar</button>
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
          } catch (err) {
            console.error('Error al registrar devolución:', err);
            alert('Ocurrió un error al registrar la devolución.');
          }
        });
      }

      const deleteBtn = tr.querySelector('.delete-loan-button');
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que deseas eliminar este préstamo del registro?')) return;

        // Motivo de eliminación también para préstamos
        const motivo = prompt(
          'Indica el motivo de eliminación del préstamo (por ejemplo: "error de registro", "anulado", etc.):'
        );
        if (!motivo || !motivo.trim()) {
          alert('Debes indicar un motivo para poder eliminar el préstamo.');
          return;
        }

        try {
          const resp = await apiFetch(`/api/library/loan/${loanId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ motivo: motivo.trim() })
          });

          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || 'No se pudo eliminar el préstamo.');
            return;
          }

          libraryLoans = libraryLoans.filter(l => l.id !== loanId);
          renderLoansTable();
        } catch (err) {
          console.error('Error al eliminar préstamo:', err);
          alert('Ocurrió un error al eliminar el préstamo.');
        }
      });

      loansTableBody.appendChild(tr);
    });
  }

  // Listeners de filtros de préstamos
  function attachLoansFiltersListeners() {
    if (loansSearchInput) {
      loansSearchInput.addEventListener('input', renderLoansTable);
    }
    if (loansFilterMode) {
      loansFilterMode.addEventListener('change', () => {
        const simpleGroup = document.querySelector('[data-loans-filters="simple"]');
        const advancedGroup = document.querySelector('[data-loans-filters="advanced"]');
        const mode = loansFilterMode.value;

        if (simpleGroup) {
          simpleGroup.style.display =
            mode === 'simple' || mode === 'both' ? 'flex' : 'none';
        }
        if (advancedGroup) {
          advancedGroup.style.display =
            mode === 'advanced' || mode === 'both' ? 'flex' : 'none';
        }

        renderLoansTable();
      });
    }
    if (loansFilterReturned) {
      loansFilterReturned.addEventListener('change', renderLoansTable);
    }
    if (loansFilterDateFrom) {
      loansFilterDateFrom.addEventListener('input', renderLoansTable);
    }
    if (loansFilterDateTo) {
      loansFilterDateTo.addEventListener('input', renderLoansTable);
    }
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
        }

        loanForm.reset();
        // Si hay selector de persona y campo tipo, los limpiamos también
        if (loanPersonaSelect) loanPersonaSelect.value = '';
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
        returnForm.reset();
      } catch (err) {
        console.error('Error al registrar devolución:', err);
        alert('Ocurrió un error al registrar la devolución.');
      }
    });
  }

  // ==================================================
  // ==== PERSONAS BIBLIOTECA (estudiantes/func.) =====
  // ==================================================

  async function loadLibraryPeople() {
    // Si no hay nada en la interfaz relacionado, no hacemos nada
    if (!peopleTableBody && !loanPersonaSelect) return;

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
    if (!loanPersonaSelect) return;

    loanPersonaSelect.innerHTML = '<option value="">-- Seleccionar desde lista --</option>';

    libraryPeople.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const etiquetaCurso = p.curso ? ` – ${p.curso}` : '';
      opt.textContent = `${p.nombre}${etiquetaCurso}`;
      loanPersonaSelect.appendChild(opt);
    });
  }

  function renderPeopleTable() {
    if (!peopleTableBody) return;
    peopleTableBody.innerHTML = '';

    libraryPeople.forEach(person => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${person.id}</td>
        <td>${person.nombre || ''}</td>
        <td>${person.tipo || ''}</td>
        <td>${person.curso || ''}</td>
        <td>
          <button type="button" class="edit-person-button" data-id="${person.id}">Editar</button>
          <button type="button" class="delete-person-button" data-id="${person.id}">Eliminar</button>
        </td>
      `;

      const editBtn = tr.querySelector('.edit-person-button');
      const deleteBtn = tr.querySelector('.delete-person-button');

      if (editBtn && peopleForm) {
        editBtn.addEventListener('click', () => {
          const p = libraryPeople.find(x => x.id === person.id);
          if (!p) return;

          editingPersonId = p.id;
          // Rellenar formulario
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

          const motivo = prompt(
            'Opcional: indica el motivo de eliminación (por ejemplo, "egresado", "baja", etc.):'
          ) || '';

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
          // Actualizar existente
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
          // Crear nueva persona
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

  if (loanPersonaSelect && loanForm) {
    loanPersonaSelect.addEventListener('change', () => {
      const personId = loanPersonaSelect.value;
      if (!personId) {
        if (loanTipoPersonaInput) loanTipoPersonaInput.value = '';
        return;
      }

      const person = libraryPeople.find(p => p.id === personId);
      if (!person) return;

      const nombreInput = loanForm.elements['nombre'];
      const cursoInput = loanForm.elements['curso'];

      if (nombreInput && !nombreInput.value) {
        nombreInput.value = person.nombre || '';
      }
      if (cursoInput && !cursoInput.value) {
        cursoInput.value = person.curso || '';
      }
      if (loanTipoPersonaInput) {
        loanTipoPersonaInput.value = person.tipo || '';
      }
    });
  }

  // ==================================================
  // ALERTA DE PRÉSTAMOS VENCIDOS (> 7 DÍAS)
  // ==================================================

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

        // Voz: intentamos usar innovaSpeak, o speak si existiera
        const speakFn = window.innovaSpeak || window.speak;
        if (typeof speakFn === 'function') {
          speakFn(
            `Atención. Hay ${overdue.length} préstamos con más de siete días sin devolución en la biblioteca.`
          );
        }
      } else {
        overdueBanner.style.display = 'none';
        overdueBanner.textContent = '';
      }
    } catch (err) {
      console.error('Error al comprobar préstamos vencidos:', err);
    }
  }

  // ================== INICIALIZACIÓN ==================
  loadLibraryItems();
  loadLoans();
  checkOverdueLoans();
  attachLibraryFiltersListeners();
  attachLoansFiltersListeners();
  // NUEVO: cargar personas para combo y panel
  loadLibraryPeople();
});
