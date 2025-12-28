// /public/js/library.js
// ===============================
// Biblioteca – Inventario + Préstamos + Personas
// ✅ Actualizado (full):
// - Compatible con tu backend actual (con fallback de endpoints)
// - Inventario: crear / editar / eliminar + motivo (si backend lo soporta)
// - Préstamos: crear / marcar devuelto / eliminar + motivo
// - Personas: crear / editar / eliminar
// - Filtros avanzados + persistencia en localStorage
// - Exportación CSV (separador ; para Excel Chile + BOM UTF-8)
// - Reporte imprimible (print -> PDF)
// - Alertas vencidos (API /overdue o cálculo local > 7 días)
// - UX: debounce, safe helpers, fallback de imágenes, banner + speak opcional
// ===============================

document.addEventListener('DOMContentLoaded', () => {
  // ------------------ Referencias base ------------------
  const libraryForm = document.getElementById('libraryForm');
  const libraryTableBody =
    document.querySelector('#libraryTable tbody') ||
    document.querySelector('#libraryItemsTable tbody') ||
    document.querySelector('#itemsTable tbody');

  const loanForm = document.getElementById('loanForm');
  const returnForm = document.getElementById('returnForm');

  // Nota: en tu HTML la tabla se llama "loansTable", pero aquí soportamos varios ids
  const loansTableBody =
    document.querySelector('#loansTable tbody') ||
    document.querySelector('#loanTable tbody') ||
    document.querySelector('#libraryLoansTable tbody');

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

  // ------------------ Personas ------------------
  const loanPersonSelect = document.getElementById('loanPersonaSelect');
  const loanTipoPersonaInput = document.getElementById('loanTipoPersona');

  const peopleForm = document.getElementById('peopleForm');
  const peopleFormSubmit = document.getElementById('peopleFormSubmit');
  const peopleFormCancel = document.getElementById('peopleFormCancel');
  const peopleTableBody = document.querySelector('#peopleTable tbody');

  // ------------------ Botones reporte ------------------
  const btnExportLibraryCSV = document.getElementById('btnExportLibraryCSV');
  const btnExportLoansCSV = document.getElementById('btnExportLoansCSV');
  const btnPrintLibraryReport = document.getElementById('btnPrintLibraryReport');
  const btnPrintLoansReport = document.getElementById('btnPrintLoansReport');

  // Botón extra (opcional) para exportar personas
  const btnExportPeopleCSV = document.getElementById('btnExportPeopleCSV');
  const btnPrintPeopleReport = document.getElementById('btnPrintPeopleReport');

  // ------------------ Helper de API (con credenciales) ------------------
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: 'include', ...options }));

  // Si no hay nada de biblioteca en la página, salir silenciosamente
  if (!libraryForm && !libraryTableBody && !loanForm && !loansTableBody && !peopleForm && !peopleTableBody) {
    return;
  }

  // ================== Estado local ==================
  let libraryItems = [];
  let libraryLoans = [];
  let libraryPeople = [];

  let editingPersonId = null;
  let editingItemId = null;

  // ================== Utils ==================
  const safeText = (v) => (v == null ? '' : String(v));

  function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CL');
  }

  function formatDateOnly(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CL');
  }

  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function imageFallback(imgEl) {
    imgEl.onerror = null;
    imgEl.src = '/img/placeholder.png'; // asegúrate de tener esta imagen en /public/img
    imgEl.alt = 'Sin imagen';
  }
  window.innovaImageFallback = imageFallback;

  // ✅ Auto-fecha en préstamo (si existe un input típico)
  (function autoSetLoanDate() {
    if (!loanForm) return;
    const dateInput =
      loanForm.querySelector('input[type="date"][name="loanDate"]') ||
      loanForm.querySelector('#loanDate') ||
      loanForm.querySelector('#fechaPrestamo') ||
      loanForm.querySelector('input[type="date"][name="fechaPrestamo"]');
    if (!dateInput || dateInput.value) return;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  })();

  // ================== API Helpers (fallback endpoints) ==================
  async function readJSON(resp) {
    return await resp.json().catch(() => ({}));
  }

  async function tryFetchJSON(urls, options = {}) {
    const errors = [];
    for (const url of urls) {
      try {
        const resp = await apiFetch(url, options);
        if (resp.ok) {
          const data = await readJSON(resp);
          return { ok: true, url, data, resp };
        }
        const data = await readJSON(resp);
        errors.push({ url, status: resp.status, data });
      } catch (e) {
        errors.push({ url, error: String(e) });
      }
    }
    return { ok: false, errors };
  }

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
          data: { detail: entry.detail },
        }),
      });
    } catch (err) {
      console.warn('No se pudo registrar historial (library):', err);
    }
  }

  // ================== INVENTARIO ==================
  async function loadLibraryItems() {
    if (!libraryTableBody) return;
    const res = await tryFetchJSON(['/api/library/items'], { method: 'GET' });
    if (!res.ok) {
      console.error('Error al cargar inventario de biblioteca:', res.errors);
      return;
    }
    libraryItems = Array.isArray(res.data) ? res.data : [];
    restoreInventoryFiltersFromStorage();
    renderLibraryTable();
  }

  function getFilteredLibraryItems() {
    let items = [...libraryItems];

    const mode = libraryFilterMode ? libraryFilterMode.value : 'both';
    const text = librarySearchInput ? librarySearchInput.value.trim().toLowerCase() : '';

    if (text && (mode === 'simple' || mode === 'both' || !libraryFilterMode)) {
      items = items.filter((item) => {
        const values = [
          item.id,
          item.codigo,
          item.titulo,
          item.autor,
          item.serie,
          item.categoria,
          item.descripcion,
        ];
        return values.some((v) => v && String(v).toLowerCase().includes(text));
      });
    }

    if (mode === 'advanced' || mode === 'both' || !libraryFilterMode) {
      const cat = libraryFilterCategoria ? libraryFilterCategoria.value : 'all';
      const yearFrom = libraryFilterYearFrom ? parseInt(libraryFilterYearFrom.value, 10) : NaN;
      const yearTo = libraryFilterYearTo ? parseInt(libraryFilterYearTo.value, 10) : NaN;
      const mustHavePhoto = libraryFilterHasPhoto ? libraryFilterHasPhoto.checked : false;

      if (cat && cat !== 'all') {
        items = items.filter(
          (it) => (it.categoria || '').toLowerCase() === String(cat).toLowerCase()
        );
      }

      if (!Number.isNaN(yearFrom)) {
        items = items.filter((it) => {
          const y = parseInt(it.anio, 10);
          if (Number.isNaN(y)) return false;
          return y >= yearFrom;
        });
      }

      if (!Number.isNaN(yearTo)) {
        items = items.filter((it) => {
          const y = parseInt(it.anio, 10);
          if (Number.isNaN(y)) return false;
          return y <= yearTo;
        });
      }

      if (mustHavePhoto) {
        items = items.filter((it) => !!it.photo);
      }
    }

    return items;
  }

  function renderLibraryTable() {
    if (!libraryTableBody) return;
    libraryTableBody.innerHTML = '';

    const filtered = getFilteredLibraryItems();

    filtered.forEach((item) => {
      const tr = document.createElement('tr');

      const fotoCell = item.photo
        ? `
          <a href="${safeText(item.photo)}" target="_blank" rel="noopener noreferrer">
            <img src="${safeText(item.photo)}"
                 class="inventory-thumb"
                 style="max-width:60px;max-height:60px;border-radius:8px;object-fit:cover;"
                 alt="Foto"
                 onerror="window.innovaImageFallback && window.innovaImageFallback(this)">
          </a>
        `
        : '';

      tr.innerHTML = `
        <td>${safeText(item.id)}</td>
        <td>${safeText(item.codigo)}</td>
        <td>${safeText(item.titulo)}</td>
        <td>${safeText(item.autor)}</td>
        <td>${safeText(item.anio)}</td>
        <td>${safeText(item.serie)}</td>
        <td>${safeText(item.categoria)}</td>
        <td>${safeText(item.cantidad)}</td>
        <td>${safeText(item.descripcion)}</td>
        <td>${fotoCell}</td>
        <td>
          <button type="button" class="btn-ghost lib-edit-item" data-id="${safeText(item.id)}">Editar</button>
          <button type="button" class="btn-ghost lib-delete-item" data-id="${safeText(item.id)}">Eliminar</button>
        </td>
      `;

      const editBtn = tr.querySelector('.lib-edit-item');
      const deleteBtn = tr.querySelector('.lib-delete-item');

      if (editBtn) {
        editBtn.addEventListener('click', () => enterItemEditMode(item));
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm('¿Seguro que deseas eliminar este libro/material del inventario?')) return;

          const motivo = prompt(
            'Indica el motivo de eliminación (por ejemplo: "daño", "pérdida", "traslado", etc.):'
          );
          if (!motivo || !motivo.trim()) {
            alert('Debes indicar un motivo para poder eliminar el libro/material.');
            return;
          }

          await deleteLibraryItem(item, motivo.trim());
        });
      }

      libraryTableBody.appendChild(tr);
    });
  }

  function getItemFormField(nameOrIdList) {
    if (!libraryForm) return null;
    for (const key of nameOrIdList) {
      // por id
      const byId = document.getElementById(key);
      if (byId && libraryForm.contains(byId)) return byId;
      // por name
      const byName = libraryForm.elements[key];
      if (byName) return byName;
    }
    return null;
  }

  function enterItemEditMode(item) {
    if (!libraryForm) return;
    editingItemId = item.id || null;

    // Intentamos llenar campos típicos por id o name (sin romper si no existen)
    const fCodigo = getItemFormField(['codigo', 'libraryCodigo', 'bookCodigo']);
    const fTitulo = getItemFormField(['titulo', 'libraryTitulo', 'bookTitulo']);
    const fAutor = getItemFormField(['autor', 'libraryAutor', 'bookAutor']);
    const fAnio = getItemFormField(['anio', 'libraryAnio', 'bookAnio']);
    const fSerie = getItemFormField(['serie', 'librarySerie', 'bookSerie']);
    const fCategoria = getItemFormField(['categoria', 'libraryCategoria', 'bookCategoria']);
    const fCantidad = getItemFormField(['cantidad', 'libraryCantidad', 'bookCantidad']);
    const fDescripcion = getItemFormField(['descripcion', 'libraryDescripcion', 'bookDescripcion']);

    if (fCodigo) fCodigo.value = item.codigo || '';
    if (fTitulo) fTitulo.value = item.titulo || '';
    if (fAutor) fAutor.value = item.autor || '';
    if (fAnio) fAnio.value = item.anio || '';
    if (fSerie) fSerie.value = item.serie || '';
    if (fCategoria) fCategoria.value = item.categoria || '';
    if (fCantidad) fCantidad.value = item.cantidad || '';
    if (fDescripcion) fDescripcion.value = item.descripcion || '';

    // Si tienes un botón submit con id, cambiamos texto (opcional)
    const submitBtn =
      document.getElementById('libraryFormSubmit') ||
      libraryForm.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Actualizar';

    // Si tienes un botón cancelar para ítems (opcional)
    const cancelBtn = document.getElementById('libraryFormCancel');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
  }

  function resetItemEditMode() {
    editingItemId = null;
    if (libraryForm) libraryForm.reset();

    const submitBtn =
      document.getElementById('libraryFormSubmit') ||
      (libraryForm ? libraryForm.querySelector('button[type="submit"], input[type="submit"]') : null);
    if (submitBtn) submitBtn.textContent = 'Guardar';

    const cancelBtn = document.getElementById('libraryFormCancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  async function deleteLibraryItem(item, motivo) {
    const id = item?.id;
    if (!id) return;

    const res = await tryFetchJSON(
      [
        `/api/library/items/${encodeURIComponent(id)}`, // tu ruta actual
        `/api/library/item/${encodeURIComponent(id)}`,  // fallback
      ],
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      }
    );

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        'No se pudo eliminar el libro/material.';
      alert(msg);
      return;
    }

    libraryItems = libraryItems.filter((it) => it.id !== id);
    renderLibraryTable();

    await logHistory({
      action: 'delete',
      type: 'item',
      entityId: id,
      detail: `Eliminado libro/material "${item.titulo || ''}" (código ${item.codigo || ''}) – Motivo: ${motivo}`,
    });

    // Si estabas editando ese mismo ítem
    if (editingItemId === id) resetItemEditMode();
  }

  // Persistencia de filtros inventario
  function persistInventoryFiltersToStorage() {
    try {
      const state = {
        text: librarySearchInput ? librarySearchInput.value : '',
        mode: libraryFilterMode ? libraryFilterMode.value : 'both',
        categoria: libraryFilterCategoria ? libraryFilterCategoria.value : 'all',
        from: libraryFilterYearFrom ? libraryFilterYearFrom.value : '',
        to: libraryFilterYearTo ? libraryFilterYearTo.value : '',
        hasPhoto: libraryFilterHasPhoto ? !!libraryFilterHasPhoto.checked : false,
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

  // Envío del formulario de inventario (crear / actualizar)
  if (libraryForm) {
    libraryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(libraryForm);

      try {
        let res;

        if (editingItemId) {
          // ✅ Update (si backend lo soporta)
          res = await tryFetchJSON(
            [
              `/api/library/items/${encodeURIComponent(editingItemId)}`,
              `/api/library/item/${encodeURIComponent(editingItemId)}`,
            ],
            {
              method: 'PUT',
              body: formData,
            }
          );
        } else {
          // ✅ Create
          res = await tryFetchJSON(['/api/library/items', '/api/library/item'], {
            method: 'POST',
            body: formData,
          });
        }

        if (!res.ok) {
          const msg =
            res.errors?.[0]?.data?.message ||
            res.errors?.[0]?.data?.error ||
            'No se pudo guardar el libro/material.';
          alert(msg);
          return;
        }

        // Tu backend suele devolver { item }, pero soportamos lista directa
        const item = res.data?.item || res.data;

        if (item && item.id != null) {
          if (editingItemId) {
            const idx = libraryItems.findIndex((x) => String(x.id) === String(editingItemId));
            if (idx >= 0) libraryItems[idx] = item;

            await logHistory({
              action: 'update',
              type: 'item',
              entityId: item.id,
              detail: `Actualizado libro/material "${item.titulo || ''}" (código ${item.codigo || ''})`,
            });
          } else {
            libraryItems.push(item);

            await logHistory({
              action: 'create',
              type: 'item',
              entityId: item.id,
              detail: `Ingresado libro/material "${item.titulo || ''}" (código ${item.codigo || ''})`,
            });
          }

          renderLibraryTable();
        }

        resetItemEditMode();
      } catch (err) {
        console.error('Error al guardar libro/material:', err);
        alert('Ocurrió un error al guardar.');
      }
    });

    // Cancel opcional para ítems
    const cancelBtn = document.getElementById('libraryFormCancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetItemEditMode();
      });
    }
  }

  // ================== PRÉSTAMOS ==================
  async function loadLoans() {
    if (!loansTableBody) return;

    const res = await tryFetchJSON(['/api/library/loans', '/api/library/loan'], { method: 'GET' });
    if (!res.ok) {
      console.error('Error al cargar préstamos:', res.errors);
      return;
    }

    const loans = Array.isArray(res.data) ? res.data : [];
    libraryLoans = loans;

    restoreLoanFiltersFromStorage();
    renderLoansTable();
  }

  function getFilteredLoans() {
    let loans = [...libraryLoans];

    const mode = loansFilterMode ? loansFilterMode.value : 'both';
    const text = loansSearchInput ? loansSearchInput.value.trim().toLowerCase() : '';

    if (text && (mode === 'simple' || mode === 'both' || !loansFilterMode)) {
      loans = loans.filter((loan) => {
        const codigo = loan.codigo || loan.bookCode || loan.itemCode || '';
        const nombre = loan.nombre || loan.borrowerName || loan.persona || '';
        const curso = loan.curso || loan.borrowerCourse || '';
        const obs = loan.observaciones || loan.notes || '';
        const id = loan.id || '';
        const personaId = loan.personaId || loan.personId || '';

        return [id, codigo, nombre, curso, obs, personaId].some(
          (v) => v && String(v).toLowerCase().includes(text)
        );
      });
    }

    if (mode === 'advanced' || mode === 'both' || !loansFilterMode) {
      if (loansFilterReturned && loansFilterReturned.value !== 'all') {
        const val = loansFilterReturned.value;
        loans = loans.filter((loan) => {
          const returned = !!(loan.returned || loan.devuelto);
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
        loans = loans.filter((loan) => {
          const when = loan.loanDate || loan.fechaPrestamo || loan.fecha_prestamo;
          if (!when) return false;
          const d = new Date(when);
          if (Number.isNaN(d.getTime())) return false;
          if (fromDate && d < fromDate) return false;
          if (toDate && d > toDate) return false;
          return true;
        });
      }
    }

    return loans;
  }

  function isLoanOverdue(loan) {
    const returned = !!(loan.returned || loan.devuelto);
    if (returned) return false;

    const base = loan.loanDate || loan.fechaPrestamo || loan.fecha_prestamo;
    if (!base) return false;

    const d = new Date(base);
    if (Number.isNaN(d.getTime())) return false;

    const now = new Date();
    const diffDays = (now - d) / (1000 * 60 * 60 * 24);
    return diffDays > 7;
  }

  function renderLoansTable() {
    if (!loansTableBody) return;
    loansTableBody.innerHTML = '';

    const loans = getFilteredLoans();

    loans.forEach((loan) => {
      const tr = document.createElement('tr');

      const loanId = loan.id || '';
      const codigo = loan.codigo || loan.bookCode || loan.itemCode || '';
      const nombre = loan.nombre || loan.borrowerName || loan.persona || '';
      const curso = loan.curso || loan.borrowerCourse || '';
      const observaciones = loan.observaciones || loan.notes || '';

      const returnedFlag = !!(loan.returned || loan.devuelto);
      const overdue = isLoanOverdue(loan);
      if (overdue) tr.classList.add('row-overdue');

      tr.innerHTML = `
        <td>${safeText(loanId)}</td>
        <td>${safeText(codigo)}</td>
        <td>${safeText(nombre)}</td>
        <td>${safeText(curso)}</td>
        <td>${formatDate(loan.loanDate || loan.fechaPrestamo || loan.fecha_prestamo)}</td>
        <td>${returnedFlag ? 'Sí' : overdue ? 'No (vencido)' : 'No'}</td>
        <td>${formatDate(loan.returnDate || loan.fechaDevolucion || loan.fecha_devolucion)}</td>
        <td>${safeText(observaciones)}</td>
        <td>
          ${
            returnedFlag
              ? ''
              : `<button type="button" class="return-button btn-ghost" data-id="${safeText(loanId)}">Marcar devuelto</button>`
          }
          <button type="button" class="delete-loan-button btn-ghost" data-id="${safeText(loanId)}">Eliminar</button>
        </td>
      `;

      const returnBtn = tr.querySelector('.return-button');
      if (returnBtn) {
        returnBtn.addEventListener('click', async () => {
          if (!confirm('¿Marcar este préstamo como devuelto?')) return;
          await markLoanReturned(loanId);
        });
      }

      const deleteBtn = tr.querySelector('.delete-loan-button');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm('¿Seguro que deseas eliminar este préstamo del registro?')) return;

          const motivo = prompt(
            'Indica el motivo de eliminación del préstamo (por ejemplo, "error de registro", "anulado", etc.):'
          );
          if (!motivo || !motivo.trim()) {
            alert('Debes indicar un motivo para poder eliminar el préstamo.');
            return;
          }

          await deleteLoan(loanId, motivo.trim());
        });
      }

      loansTableBody.appendChild(tr);
    });
  }

  async function markLoanReturned(loanId) {
    if (!loanId) return;

    const res = await tryFetchJSON(
      [
        `/api/library/return/${encodeURIComponent(loanId)}`,               // tu ruta actual
        `/api/library/loans/${encodeURIComponent(loanId)}/return`,        // fallback similar a computing
        `/api/library/loan/${encodeURIComponent(loanId)}/return`,         // fallback
      ],
      { method: 'POST' }
    );

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        'No se pudo registrar la devolución.';
      alert(msg);
      return;
    }

    await loadLoans();

    await logHistory({
      action: 'update',
      type: 'loan',
      entityId: loanId,
      detail: `Préstamo ${loanId} marcado como devuelto`,
    });
  }

  async function deleteLoan(loanId, motivo) {
    if (!loanId) return;

    const res = await tryFetchJSON(
      [
        `/api/library/loan/${encodeURIComponent(loanId)}`,   // tu ruta actual
        `/api/library/loans/${encodeURIComponent(loanId)}`,  // fallback
      ],
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      }
    );

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        'No se pudo eliminar el préstamo.';
      alert(msg);
      return;
    }

    libraryLoans = libraryLoans.filter((l) => String(l.id) !== String(loanId));
    renderLoansTable();

    await logHistory({
      action: 'delete',
      type: 'loan',
      entityId: loanId,
      detail: `Préstamo ${loanId} eliminado – Motivo: ${motivo}`,
    });
  }

  // Persistencia de filtros préstamos
  function persistLoanFiltersToStorage() {
    try {
      const state = {
        text: loansSearchInput ? loansSearchInput.value : '',
        mode: loansFilterMode ? loansFilterMode.value : 'both',
        returned: loansFilterReturned ? loansFilterReturned.value : 'all',
        from: loansFilterDateFrom ? loansFilterDateFrom.value : '',
        to: loansFilterDateTo ? loansFilterDateTo.value : '',
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

  // Formularios préstamos
  if (loanForm) {
    loanForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(loanForm);
      const data = Object.fromEntries(formData.entries());

      // Si el select de personas está presente, mantenemos consistencia
      if (loanPersonSelect && loanPersonSelect.value) {
        data.personaId = loanPersonSelect.value;
      }

      const res = await tryFetchJSON(
        ['/api/library/loan', '/api/library/loans'],
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const msg =
          res.errors?.[0]?.data?.message ||
          res.errors?.[0]?.data?.error ||
          'No se pudo registrar el préstamo.';
        alert(msg);
        return;
      }

      const loan = res.data?.loan || res.data;
      if (loan && loan.id != null) {
        libraryLoans.unshift(loan);
        renderLoansTable();

        await logHistory({
          action: 'create',
          type: 'loan',
          entityId: loan.id,
          detail: `Préstamo creado (ID ${loan.id}) para ${loan.nombre || loan.borrowerName || loan.persona || ''}`,
        });

        // refrescar vencidos
        checkOverdueLoans();
      }

      loanForm.reset();
      if (loanPersonSelect) loanPersonSelect.value = '';
      if (loanTipoPersonaInput) loanTipoPersonaInput.value = '';
    });
  }

  if (returnForm) {
    returnForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(returnForm);
      const loanId = formData.get('loanId');

      if (!loanId) {
        alert('Debes indicar el ID del préstamo.');
        return;
      }

      await markLoanReturned(String(loanId));
      returnForm.reset();
    });
  }

  // ================== PERSONAS ==================
  async function loadLibraryPeople() {
    if (!peopleTableBody && !loanPersonSelect) return;

    const res = await tryFetchJSON(['/api/library/people'], { method: 'GET' });
    if (!res.ok) {
      console.error('Error al cargar personas de biblioteca:', res.errors);
      return;
    }

    libraryPeople = Array.isArray(res.data) ? res.data : [];
    renderPeopleTable();
    fillLoanPersonaSelect();
  }

  function fillLoanPersonaSelect() {
    if (!loanPersonSelect) return;

    loanPersonSelect.innerHTML = '<option value="">-- Seleccionar desde lista --</option>';
    libraryPeople.forEach((p) => {
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

    libraryPeople.forEach((person) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safeText(person.id)}</td>
        <td>${safeText(person.nombre)}</td>
        <td>${safeText(person.tipo)}</td>
        <td>${safeText(person.curso)}</td>
        <td>
          <button type="button" class="edit-person-button btn-ghost" data-id="${safeText(person.id)}">Editar</button>
          <button type="button" class="delete-person-button btn-ghost" data-id="${safeText(person.id)}">Eliminar</button>
        </td>
      `;

      const editBtn = tr.querySelector('.edit-person-button');
      const deleteBtn = tr.querySelector('.delete-person-button');

      if (editBtn && peopleForm) {
        editBtn.addEventListener('click', () => {
          const p = libraryPeople.find((x) => String(x.id) === String(person.id));
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
            prompt('Opcional: indica el motivo de eliminación (por ejemplo, "egresado", "baja", etc.):') ||
            '';

          const res = await tryFetchJSON(
            [`/api/library/people/${encodeURIComponent(person.id)}`],
            {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ motivo }),
            }
          );

          if (!res.ok) {
            const msg =
              res.errors?.[0]?.data?.message ||
              res.errors?.[0]?.data?.error ||
              'No se pudo eliminar la persona.';
            alert(msg);
            return;
          }

          await loadLibraryPeople();

          await logHistory({
            action: 'delete',
            type: 'person',
            entityId: person.id,
            detail: `Persona "${person.nombre || ''}" eliminada del listado – Motivo: ${motivo || '—'}`,
          });
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
    peopleForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(peopleForm);
      const data = Object.fromEntries(formData.entries());

      const payload = {
        id: (data.id || '').trim(),
        nombre: (data.nombre || '').trim(),
        tipo: (data.tipo || '').trim(),
        curso: (data.curso || '').trim(),
      };

      if (!payload.nombre || !payload.tipo) {
        alert('Nombre y tipo son obligatorios (estudiante/funcionario).');
        return;
      }

      let res;
      if (editingPersonId) {
        res = await tryFetchJSON(
          [`/api/library/people/${encodeURIComponent(editingPersonId)}`],
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: payload.nombre,
              tipo: payload.tipo,
              curso: payload.curso,
            }),
          }
        );
      } else {
        res = await tryFetchJSON(['/api/library/people'], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const msg =
          res.errors?.[0]?.data?.message ||
          res.errors?.[0]?.data?.error ||
          'No se pudo guardar la persona.';
        alert(msg);
        return;
      }

      await loadLibraryPeople();
      resetPeopleForm();

      await logHistory({
        action: editingPersonId ? 'update' : 'create',
        type: 'person',
        entityId: payload.id || '(auto)',
        detail: `${editingPersonId ? 'Actualizada' : 'Creada'} persona "${payload.nombre}"`,
      });
    });
  }

  if (peopleFormCancel) {
    peopleFormCancel.addEventListener('click', (e) => {
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

      const person = libraryPeople.find((p) => String(p.id) === String(personId));
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

    // 1) Intentar endpoint del backend
    const res = await tryFetchJSON(['/api/library/overdue'], { method: 'GET' });

    let overdueCount = 0;

    if (res.ok && Array.isArray(res.data)) {
      overdueCount = res.data.length;
    } else {
      // 2) Fallback: calcular localmente con loans cargados (si existen)
      const base = libraryLoans && libraryLoans.length ? libraryLoans : [];
      overdueCount = base.filter((l) => isLoanOverdue(l)).length;
    }

    if (overdueCount > 0) {
      overdueBanner.textContent = `⚠️ Hay ${overdueCount} préstamo(s) con más de 7 días sin devolución. Revisa el listado.`;
      overdueBanner.style.display = 'block';

      const speakFn = window.innovaSpeak || window.speak;
      if (typeof speakFn === 'function') {
        speakFn(`Atención. Hay ${overdueCount} préstamos con más de siete días sin devolución en la biblioteca.`);
      }
    } else {
      overdueBanner.style.display = 'none';
      overdueBanner.textContent = '';
    }
  }

  // ================== Exportaciones CSV (Excel Chile) ==================
  function csvEscape(value) {
    const s = value == null ? '' : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadCSV(filename, headers, rows) {
    // ✅ BOM UTF-8 para Excel
    const BOM = '\uFEFF';
    const lines = [];
    lines.push(headers.map(csvEscape).join(';')); // ✅ separador ;
    rows.forEach((r) => lines.push(r.map(csvEscape).join(';')));

    const csv = BOM + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
      'Foto',
    ];
    const rows = data.map((it) => [
      it.id,
      it.codigo || '',
      it.titulo || '',
      it.autor || '',
      it.anio || '',
      it.serie || '',
      it.categoria || '',
      it.cantidad || '',
      (it.descripcion || '').replace(/\s+/g, ' ').trim(),
      it.photo || '',
    ]);
    downloadCSV(
      `biblioteca_inventario_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
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
      'Observaciones',
    ];
    const rows = data.map((l) => [
      l.id || '',
      l.codigo || l.bookCode || l.itemCode || '',
      l.nombre || l.borrowerName || l.persona || '',
      l.curso || l.borrowerCourse || '',
      formatDate(l.loanDate || l.fechaPrestamo || l.fecha_prestamo),
      (l.returned || l.devuelto) ? 'Sí' : 'No',
      formatDate(l.returnDate || l.fechaDevolucion || l.fecha_devolucion),
      (l.observaciones || l.notes || '').replace(/\s+/g, ' ').trim(),
    ]);
    downloadCSV(
      `biblioteca_prestamos_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  }

  function exportPeopleCSV() {
    const data = [...libraryPeople];
    const headers = ['ID', 'Nombre', 'Tipo', 'Curso'];
    const rows = data.map((p) => [p.id || '', p.nombre || '', p.tipo || '', p.curso || '']);
    downloadCSV(
      `biblioteca_personas_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  }

  // ================== Reporte imprimible (Print -> PDF) ==================
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
        .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; background:#111a38; color:#fff; }
        .overdue { color:#b00020; font-weight:700; }
      </style>
    `;
    const tableHead = `<tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>`;
    const tableRows = rows
      .map((r) => `<tr>${r.map((c) => `<td>${safeText(c)}</td>`).join('')}</tr>`)
      .join('');

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
    const columns = ['ID', 'Código', 'Título/Material', 'Autor/Fabricante', 'Año', 'Serie', 'Categoría', 'Cantidad', 'Descripción'];
    const rows = data.map((it) => [
      it.id,
      it.codigo || '',
      it.titulo || '',
      it.autor || '',
      it.anio || '',
      it.serie || '',
      it.categoria || '',
      it.cantidad || '',
      (it.descripcion || '').replace(/\s+/g, ' ').trim(),
    ]);
    printHTMLReport({
      title: 'Informe de Inventario – Biblioteca',
      subtitle: 'Listado filtrado',
      columns,
      rows,
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
      'Estado',
      'Fecha Devolución',
      'Observaciones',
    ];
    const rows = data.map((l) => {
      const returned = !!(l.returned || l.devuelto);
      const overdue = isLoanOverdue(l);
      const estado = returned ? 'Devuelto' : overdue ? 'No (vencido)' : 'No';
      return [
        l.id || '',
        l.codigo || l.bookCode || l.itemCode || '',
        l.nombre || l.borrowerName || l.persona || '',
        l.curso || l.borrowerCourse || '',
        formatDate(l.loanDate || l.fechaPrestamo || l.fecha_prestamo),
        estado,
        formatDate(l.returnDate || l.fechaDevolucion || l.fecha_devolucion),
        (l.observaciones || l.notes || '').replace(/\s+/g, ' ').trim(),
      ];
    });
    printHTMLReport({
      title: 'Informe de Préstamos – Biblioteca',
      subtitle: 'Listado filtrado',
      columns,
      rows,
    });
  }

  function printPeopleReport() {
    const data = [...libraryPeople];
    const columns = ['ID', 'Nombre', 'Tipo', 'Curso'];
    const rows = data.map((p) => [p.id || '', p.nombre || '', p.tipo || '', p.curso || '']);
    printHTMLReport({
      title: 'Informe de Personas – Biblioteca',
      subtitle: 'Listado',
      columns,
      rows,
    });
  }

  // Enganchar botones reporte
  if (btnExportLibraryCSV) btnExportLibraryCSV.addEventListener('click', exportInventoryCSV);
  if (btnExportLoansCSV) btnExportLoansCSV.addEventListener('click', exportLoansCSV);
  if (btnPrintLibraryReport) btnPrintLibraryReport.addEventListener('click', printInventoryReport);
  if (btnPrintLoansReport) btnPrintLoansReport.addEventListener('click', printLoansReport);

  if (btnExportPeopleCSV) btnExportPeopleCSV.addEventListener('click', exportPeopleCSV);
  if (btnPrintPeopleReport) btnPrintPeopleReport.addEventListener('click', printPeopleReport);

  // ================== Listeners filtros ==================
  function attachLibraryFiltersListeners() {
    if (librarySearchInput) {
      librarySearchInput.addEventListener(
        'input',
        debounce(() => {
          persistInventoryFiltersToStorage();
          renderLibraryTable();
        }, 200)
      );
    }
    if (libraryFilterMode) {
      libraryFilterMode.addEventListener('change', () => {
        const simpleGroup = document.querySelector('[data-library-filters="simple"]');
        const advancedGroup = document.querySelector('[data-library-filters="advanced"]');
        const mode = libraryFilterMode.value;

        if (simpleGroup) simpleGroup.style.display = mode === 'simple' || mode === 'both' ? 'flex' : 'none';
        if (advancedGroup) advancedGroup.style.display = mode === 'advanced' || mode === 'both' ? 'flex' : 'none';

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
      loansSearchInput.addEventListener(
        'input',
        debounce(() => {
          persistLoanFiltersToStorage();
          renderLoansTable();
        }, 200)
      );
    }
    if (loansFilterMode) {
      loansFilterMode.addEventListener('change', () => {
        const simpleGroup = document.querySelector('[data-loans-filters="simple"]');
        const advancedGroup = document.querySelector('[data-loans-filters="advanced"]');
        const mode = loansFilterMode.value;

        if (simpleGroup) simpleGroup.style.display = mode === 'simple' || mode === 'both' ? 'flex' : 'none';
        if (advancedGroup) advancedGroup.style.display = mode === 'advanced' || mode === 'both' ? 'flex' : 'none';

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
  loadLoans().then(() => checkOverdueLoans());
  attachLibraryFiltersListeners();
  attachLoansFiltersListeners();
  loadLibraryPeople();
});
