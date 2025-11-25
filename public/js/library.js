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

  // 🔹 NUEVO: referencias para listado de personas (estudiantes / funcionarios)
  const loanPersonSelect = document.getElementById('loanPerson'); // <select>
  const loanNameInput = loanForm ? loanForm.querySelector('input[name="nombre"]') : null;
  const loanCourseInput = loanForm ? loanForm.querySelector('input[name="curso"]') : null;

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
  // 🔹 NUEVO: personas para préstamos
  let libraryPeople = [];

  // ================== INVENTARIO DE BIBLIOTECA ==================

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

        // NUEVO: motivo obligatorio al eliminar (para historial y reportes)
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

  // ================== PRÉSTAMOS DE BIBLIOTECA ==================

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

      // 🔹 NUEVO: si hay select de persona y se eligió alguien,
      // sobrescribimos nombre/curso y agregamos campos extra
      if (loanPersonSelect && loanPersonSelect.value) {
        const selected = libraryPeople.find(p => p.id === loanPersonSelect.value);
        if (selected) {
          data.nombre = selected.nombre;
          data.curso = selected.curso;
          data.personaId = selected.id;
          data.tipoPersona = selected.tipo;
        }
      }

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

  // ================== ALERTA DE PRÉSTAMOS VENCIDOS (> 7 DÍAS) ==================

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

  // 🔹 NUEVO: cargar personas de biblioteca
  async function loadLibraryPeople() {
    if (!loanPersonSelect) return; // si el select no existe en el HTML, no hacemos nada

    try {
      const resp = await fetch('/config/library_people.json');
      if (!resp.ok) {
        console.warn('No se pudo cargar library_people.json');
        return;
      }

      const people = await resp.json();
      libraryPeople = Array.isArray(people) ? people : [];

      // Poblar el select
      loanPersonSelect.innerHTML = '<option value="">Seleccione estudiante/funcionario...</option>';

      libraryPeople.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nombre} — ${p.tipo} (${p.curso})`;
        loanPersonSelect.appendChild(opt);
      });

      // Al cambiar la persona seleccionada, rellenamos nombre y curso
      loanPersonSelect.addEventListener('change', () => {
        const selected = libraryPeople.find(p => p.id === loanPersonSelect.value);
        if (selected) {
          if (loanNameInput) loanNameInput.value = selected.nombre;
          if (loanCourseInput) loanCourseInput.value = selected.curso;
        } else {
          if (loanNameInput) loanNameInput.value = '';
          if (loanCourseInput) loanCourseInput.value = '';
        }
      });
    } catch (err) {
      console.error('Error cargando library_people.json:', err);
    }
  }

  // ================== INICIALIZACIÓN ==================
  loadLibraryItems();
  loadLoans();
  checkOverdueLoans();
  attachLibraryFiltersListeners();
  attachLoansFiltersListeners();
  loadLibraryPeople(); // 🔹 nuevo: cargar listado de estudiantes/funcionarios
});
