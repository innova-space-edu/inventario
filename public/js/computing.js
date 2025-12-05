// /public/js/computing.js
// =============================================================
// Sala de Computación - Inventario + Préstamos
// - Inventario detallado (hardware, software, otros activos)
// - Control de stock en préstamos / devoluciones
// - Listado de préstamos activos e históricos
// - Listado de préstamos vencidos (> 7 días)
// - Listado de quienes aún deben material (returned = false)
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================
  // REFERENCIAS BÁSICAS
  // =========================================================

  // Inventario
  const itemForm = document.getElementById('computingItemForm');
  const itemsTableBody = document.querySelector('#computingItemsTable tbody');
  const itemCategoriaSelect = document.getElementById('compCategory');
  const itemSubcategoriaSelect = document.getElementById('compSubcategory');
  const itemCodigoInput = document.getElementById('compCodigo');
  const itemDescripcionInput = document.getElementById('compDescripcion');
  const itemCantidadInput = document.getElementById('compCantidad');
  const itemUbicacionInput = document.getElementById('compUbicacion');
  const itemEstadoInput = document.getElementById('compEstado');
  const itemMantenimientoInput = document.getElementById('compMantenimiento');
  const itemActualizacionInput = document.getElementById('compActualizacion');

  // Grupos de campos específicos por subcategoría
  const boxComputadoras = document.getElementById('compComputadorasBox');
  const boxPerifericos = document.getElementById('compPerifericosBox');
  const boxRed = document.getElementById('compRedBox');
  const boxSO = document.getElementById('compSOBox');
  const boxApps = document.getElementById('compAppsBox');
  const boxLicencias = document.getElementById('compLicenciasBox');
  const boxMobiliario = document.getElementById('compMobiliarioBox');
  const boxHerramientas = document.getElementById('compHerramientasBox');

  // Préstamos
  const loanForm = document.getElementById('computingLoanForm');
  const loansTableBody = document.querySelector('#computingLoansTable tbody');

  // Préstamos vencidos y deudores
  const overdueListContainer = document.getElementById('computingOverdueList');
  const pendingListContainer = document.getElementById('computingPendingList');

  // Helper API (como en otros módulos)
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, { credentials: 'include', ...options }));

  // Estado local
  let computingItems = [];
  let computingLoans = [];
  let computingOverdue = [];

  // =========================================================
  // UTILIDADES
  // =========================================================

  function showOnlyBoxForSubcategory() {
    if (!itemSubcategoriaSelect) return;

    const sub = (itemSubcategoriaSelect.value || '').toLowerCase();

    // Ocultar todos
    const allBoxes = [
      boxComputadoras,
      boxPerifericos,
      boxRed,
      boxSO,
      boxApps,
      boxLicencias,
      boxMobiliario,
      boxHerramientas
    ];
    allBoxes.forEach(b => {
      if (b) b.style.display = 'none';
    });

    // Mostrar solo el que corresponde
    if (sub === 'computadoras' && boxComputadoras) boxComputadoras.style.display = 'block';
    if (sub === 'perifericos' && boxPerifericos) boxPerifericos.style.display = 'block';
    if (sub === 'dispositivos-red' && boxRed) boxRed.style.display = 'block';
    if (sub === 'sistemas-operativos' && boxSO) boxSO.style.display = 'block';
    if (sub === 'aplicaciones' && boxApps) boxApps.style.display = 'block';
    if (sub === 'licencias' && boxLicencias) boxLicencias.style.display = 'block';
    if (sub === 'mobiliario' && boxMobiliario) boxMobiliario.style.display = 'block';
    if (sub === 'herramientas' && boxHerramientas) boxHerramientas.style.display = 'block';
  }

  function formatDate(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function safeText(v) {
    return v == null ? '' : String(v);
  }

  // =========================================================
  // CARGA DE DATOS INICIALES
  // =========================================================

  async function loadComputingItems() {
    try {
      const resp = await apiFetch('/api/computing/items');
      if (!resp.ok) throw new Error('No se pudieron obtener items de computación');
      const data = await resp.json();
      computingItems = Array.isArray(data) ? data : [];
      renderItemsTable();
    } catch (err) {
      console.error('Error cargando items de computación:', err);
      computingItems = [];
      renderItemsTable();
    }
  }

  async function loadComputingLoans() {
    try {
      const resp = await apiFetch('/api/computing/loans');
      if (!resp.ok) throw new Error('No se pudieron obtener préstamos de computación');
      const data = await resp.json();
      computingLoans = Array.isArray(data) ? data : [];
      renderLoansTable();
      renderPendingList();
    } catch (err) {
      console.error('Error cargando préstamos de computación:', err);
      computingLoans = [];
      renderLoansTable();
      renderPendingList();
    }
  }

  async function loadComputingOverdue() {
    try {
      const resp = await apiFetch('/api/computing/overdue');
      if (!resp.ok) throw new Error('No se pudieron obtener préstamos vencidos de computación');
      const data = await resp.json();
      computingOverdue = Array.isArray(data) ? data : [];
      renderOverdueList();
    } catch (err) {
      console.error('Error cargando préstamos vencidos de computación:', err);
      computingOverdue = [];
      renderOverdueList();
    }
  }

  // =========================================================
  // RENDER: INVENTARIO
  // =========================================================

  function renderItemsTable() {
    if (!itemsTableBody) return;

    itemsTableBody.innerHTML = '';

    computingItems.forEach(item => {
      const tr = document.createElement('tr');

      const {
        id,
        codigo,
        categoria,
        subcategoria,
        descripcion,
        estado,
        ubicacion,
        cantidad,
        mantenimiento,
        actualizacion,
        ...rest
      } = item;

      // Construir texto de detalles con todas las propiedades restantes
      const detallesArr = [];
      Object.entries(rest).forEach(([k, v]) => {
        if (k === 'photo') return;
        if (v === undefined || v === null || v === '') return;
        detallesArr.push(`${k}: ${v}`);
      });
      const detallesStr = detallesArr.join(' | ');

      tr.innerHTML = `
        <td>${safeText(codigo)}</td>
        <td>${safeText(categoria)}</td>
        <td>${safeText(subcategoria)}</td>
        <td>${safeText(descripcion)}</td>
        <td>${safeText(estado)}</td>
        <td>${safeText(ubicacion)}</td>
        <td>${safeText(cantidad)}</td>
        <td>${safeText(mantenimiento)}</td>
        <td>${safeText(actualizacion)}</td>
        <td class="comp-detalles">${safeText(detallesStr)}</td>
        <td>
          <button type="button" class="btn-danger btn-small" data-action="delete" data-id="${id}">
            Eliminar
          </button>
        </td>
      `;

      const delBtn = tr.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => deleteItem(id));
      }

      itemsTableBody.appendChild(tr);
    });
  }

  async function deleteItem(id) {
    if (!id) return;
    const ok = confirm('¿Seguro que deseas eliminar este equipo de computación?');
    if (!ok) return;

    try {
      const resp = await apiFetch(`/api/computing/items/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo eliminar el equipo.');
        return;
      }

      computingItems = computingItems.filter(it => it.id !== id);
      renderItemsTable();
    } catch (err) {
      console.error('Error al eliminar equipo de computación:', err);
      alert('Ocurrió un error al eliminar el equipo.');
    }
  }

  // =========================================================
  // SUBMIT: INVENTARIO
  // =========================================================

  function attachItemFormListener() {
    if (!itemForm) return;

    itemForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const formData = new FormData(itemForm);

        const codigo = (formData.get('codigo') || '').toString().trim();
        const categoria = (formData.get('categoria') || '').toString().trim();
        const subcategoria = (formData.get('subcategoria') || '').toString().trim();
        const descripcion = (formData.get('descripcion') || '').toString().trim();
        const cantidad = (formData.get('cantidad') || '').toString().trim();
        const ubicacion = (formData.get('ubicacion') || '').toString().trim();
        const estado = (formData.get('estado') || '').toString().trim();
        const mantenimiento = (formData.get('mantenimiento') || '').toString().trim();
        const actualizacion = (formData.get('actualizacion') || '').toString().trim();

        if (!codigo) {
          alert('El código es obligatorio.');
          return;
        }
        if (!categoria) {
          alert('Debes seleccionar una categoría.');
          return;
        }
        if (!subcategoria) {
          alert('Debes seleccionar una subcategoría.');
          return;
        }
        if (!cantidad) {
          alert('La cantidad es obligatoria.');
          return;
        }

        // Construimos el objeto de datos base
        const data = {
          codigo,
          categoria,
          subcategoria,
          descripcion,
          cantidad,
          ubicacion,
          estado,
          mantenimiento,
          actualizacion
        };

        // Campos específicos según subcategoría
        const sub = subcategoria.toLowerCase();

        if (sub === 'computadoras') {
          data.cpu = (formData.get('cpu') || '').toString().trim();
          data.ram = (formData.get('ram') || '').toString().trim();
          data.so = (formData.get('so') || '').toString().trim();
          data.marca = (formData.get('marca') || '').toString().trim();
          data.modelo = (formData.get('modelo') || '').toString().trim();
          data.numeroSerie = (formData.get('numeroSerie') || '').toString().trim();
          data.fechaCompra = (formData.get('fechaCompra') || '').toString().trim();
        }

        if (sub === 'perifericos') {
          data.tipoPeriferico = (formData.get('tipoPeriferico') || '').toString().trim();
          data.marca = (formData.get('marcaPerif') || '').toString().trim();
          data.modelo = (formData.get('modeloPerif') || '').toString().trim();
          data.numeroSerie = (formData.get('numeroSeriePerif') || '').toString().trim();
        }

        if (sub === 'dispositivos-red') {
          data.tipoRed = (formData.get('tipoRed') || '').toString().trim();
          data.marca = (formData.get('marcaRed') || '').toString().trim();
          data.modelo = (formData.get('modeloRed') || '').toString().trim();
          data.numeroSerie = (formData.get('numeroSerieRed') || '').toString().trim();
        }

        if (sub === 'sistemas-operativos') {
          data.soNombre = (formData.get('soNombre') || '').toString().trim();
          data.soVersion = (formData.get('soVersion') || '').toString().trim();
          data.soTipoLicencia = (formData.get('soTipoLicencia') || '').toString().trim();
        }

        if (sub === 'aplicaciones') {
          data.appNombre = (formData.get('appNombre') || '').toString().trim();
          data.appVersion = (formData.get('appVersion') || '').toString().trim();
          data.appFechaInstalacion = (formData.get('appFechaInstalacion') || '').toString().trim();
          data.appLicencia = (formData.get('appLicencia') || '').toString().trim();
        }

        if (sub === 'licencias') {
          data.licTipo = (formData.get('licTipo') || '').toString().trim();
          data.licNumero = (formData.get('licNumero') || '').toString().trim();
          data.licVencimiento = (formData.get('licVencimiento') || '').toString().trim();
        }

        if (sub === 'mobiliario') {
          data.tipoMueble = (formData.get('tipoMueble') || '').toString().trim();
          data.detalleMueble = (formData.get('detalleMueble') || '').toString().trim();
        }

        if (sub === 'herramientas') {
          data.herramientaNombre = (formData.get('herramientaNombre') || '').toString().trim();
          data.herramientaUso = (formData.get('herramientaUso') || '').toString().trim();
        }

        // Enviamos como JSON (no manejamos foto aquí para simplificar;
        // si quieres foto, se puede cambiar a multipart/form-data con multer)
        const resp = await apiFetch('/api/computing/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo guardar el equipo de computación.');
          return;
        }

        const result = await resp.json().catch(() => ({}));
        if (result && result.item) {
          computingItems.push(result.item);
        } else {
          // Por si acaso, recargamos toda la lista
          await loadComputingItems();
        }

        renderItemsTable();
        itemForm.reset();
        // Ajustamos subcategoría visible
        showOnlyBoxForSubcategory();
      } catch (err) {
        console.error('Error al guardar equipo de computación:', err);
        alert('Ocurrió un error al guardar el equipo.');
      }
    });
  }

  // =========================================================
  // RENDER: PRÉSTAMOS
  // =========================================================

  function renderLoansTable() {
    if (!loansTableBody) return;

    loansTableBody.innerHTML = '';

    computingLoans.forEach(loan => {
      const tr = document.createElement('tr');

      const {
        id,
        codigo,
        itemCode,
        detalle,
        itemName,
        solicitante,
        borrowerName,
        curso,
        borrowerGroup,
        observaciones,
        notes,
        loanDate,
        returnDate,
        returned
      } = loan;

      const code = codigo || itemCode;
      const nombreItem = detalle || itemName;
      const solicit = solicitante || borrowerName;
      const grupo = curso || borrowerGroup;
      const obs = observaciones || notes;

      tr.innerHTML = `
        <td>${safeText(code)}</td>
        <td>${safeText(nombreItem)}</td>
        <td>${safeText(solicit)}</td>
        <td>${safeText(grupo)}</td>
        <td>${safeText(obs)}</td>
        <td>${formatDate(loanDate)}</td>
        <td>${returned ? 'Sí' : 'No'}</td>
        <td>${returned ? formatDate(returnDate) : ''}</td>
        <td>
          ${
            returned
              ? ''
              : `<button type="button" class="btn-primary btn-small" data-action="return" data-id="${id}">
                   Devolver
                 </button>`
          }
          <button type="button" class="btn-danger btn-small" data-action="delete" data-id="${id}">
            Eliminar
          </button>
        </td>
      `;

      const returnBtn = tr.querySelector('[data-action="return"]');
      const delBtn = tr.querySelector('[data-action="delete"]');

      if (returnBtn) {
        returnBtn.addEventListener('click', () => returnLoan(id));
      }
      if (delBtn) {
        delBtn.addEventListener('click', () => deleteLoan(id));
      }

      loansTableBody.appendChild(tr);
    });
  }

  async function returnLoan(loanId) {
    if (!loanId) return;
    const ok = confirm('¿Registrar devolución de este equipo?');
    if (!ok) return;

    try {
      const resp = await apiFetch(`/api/computing/return/${encodeURIComponent(loanId)}`, {
        method: 'POST'
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo registrar la devolución.');
        return;
      }

      const result = await resp.json().catch(() => ({}));
      // Recargamos lista para actualizar stock y estados
      await loadComputingLoans();
      await loadComputingItems();
      await loadComputingOverdue();
    } catch (err) {
      console.error('Error al devolver préstamo de computación:', err);
      alert('Ocurrió un error al registrar la devolución.');
    }
  }

  async function deleteLoan(loanId) {
    if (!loanId) return;
    const ok = confirm('¿Seguro que deseas eliminar este registro de préstamo?');
    if (!ok) return;

    try {
      const resp = await apiFetch(`/api/computing/loan/${encodeURIComponent(loanId)}`, {
        method: 'DELETE'
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo eliminar el préstamo.');
        return;
      }

      computingLoans = computingLoans.filter(l => l.id !== loanId);
      renderLoansTable();
      renderPendingList();
      await loadComputingOverdue();
    } catch (err) {
      console.error('Error al eliminar préstamo de computación:', err);
      alert('Ocurrió un error al eliminar el préstamo.');
    }
  }

  // =========================================================
  // SUBMIT: PRÉSTAMOS
  // =========================================================

  function attachLoanFormListener() {
    if (!loanForm) return;

    loanForm.addEventListener('submit', async e => {
      e.preventDefault();

      try {
        const formData = new FormData(loanForm);

        const codigo = (formData.get('loanCodigo') || '').toString().trim();
        const solicitante = (formData.get('loanSolicitante') || '').toString().trim();
        const curso = (formData.get('loanCurso') || '').toString().trim();
        const observaciones = (formData.get('loanObservaciones') || '').toString().trim();

        if (!codigo) {
          alert('Debes indicar el código del equipo.');
          return;
        }
        if (!solicitante) {
          alert('Debes indicar quién se lleva el equipo.');
          return;
        }

        const data = {
          codigo,
          solicitante,
          curso,
          observaciones
        };

        const resp = await apiFetch('/api/computing/loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar el préstamo.');
          return;
        }

        // Actualizamos listas
        await loadComputingLoans();
        await loadComputingItems();
        await loadComputingOverdue();

        loanForm.reset();
      } catch (err) {
        console.error('Error al registrar préstamo de computación:', err);
        alert('Ocurrió un error al registrar el préstamo.');
      }
    });
  }

  // =========================================================
  // LISTADOS: VENCIDOS Y PENDIENTES
  // =========================================================

  function renderOverdueList() {
    if (!overdueListContainer) return;

    overdueListContainer.innerHTML = '';

    if (computingOverdue.length === 0) {
      overdueListContainer.textContent = 'No hay préstamos vencidos de computación.';
      return;
    }

    const ul = document.createElement('ul');
    ul.classList.add('overdue-list');

    computingOverdue.forEach(loan => {
      const {
        codigo,
        itemCode,
        detalle,
        itemName,
        solicitante,
        borrowerName,
        curso,
        borrowerGroup,
        loanDate
      } = loan;

      const code = codigo || itemCode;
      const nombreItem = detalle || itemName;
      const solicit = solicitante || borrowerName;
      const grupo = curso || borrowerGroup;

      const li = document.createElement('li');
      li.textContent = `Código: ${safeText(code)} | Equipo: ${safeText(
        nombreItem
      )} | Solicitante: ${safeText(solicit)} (${safeText(
        grupo
      )}) | Fecha préstamo: ${formatDate(loanDate)}`;
      ul.appendChild(li);
    });

    overdueListContainer.appendChild(ul);
  }

  function renderPendingList() {
    if (!pendingListContainer) return;

    pendingListContainer.innerHTML = '';

    const pendientes = computingLoans.filter(l => !l.returned);

    if (pendientes.length === 0) {
      pendingListContainer.textContent = 'No hay equipos pendientes por devolver.';
      return;
    }

    const ul = document.createElement('ul');
    ul.classList.add('pending-list');

    pendientes.forEach(loan => {
      const {
        codigo,
        itemCode,
        detalle,
        itemName,
        solicitante,
        borrowerName,
        curso,
        borrowerGroup,
        loanDate
      } = loan;

      const code = codigo || itemCode;
      const nombreItem = detalle || itemName;
      const solicit = solicitante || borrowerName;
      const grupo = curso || borrowerGroup;

      const li = document.createElement('li');
      li.textContent = `Código: ${safeText(code)} | Equipo: ${safeText(
        nombreItem
      )} | Solicitante: ${safeText(solicit)} (${safeText(
        grupo
      )}) | Fecha préstamo: ${formatDate(loanDate)}`;
      ul.appendChild(li);
    });

    pendingListContainer.appendChild(ul);
  }

  // =========================================================
  // EVENTOS DE CATEGORÍA / SUBCATEGORÍA
  // =========================================================

  function attachCategoryListeners() {
    if (itemCategoriaSelect) {
      itemCategoriaSelect.addEventListener('change', () => {
        // Por ahora, las subcategorías se manejan directamente en el select
        // (Hardware → Computadoras, Periféricos, Dispositivos de red, etc.)
        // Aquí podríamos cambiar dinámicamente las opciones si lo deseas.
      });
    }

    if (itemSubcategoriaSelect) {
      itemSubcategoriaSelect.addEventListener('change', () => {
        showOnlyBoxForSubcategory();
      });
      // Inicial
      showOnlyBoxForSubcategory();
    }
  }

  // =========================================================
  // INICIALIZACIÓN
  // =========================================================

  async function init() {
    attachCategoryListeners();
    attachItemFormListener();
    attachLoanFormListener();

    await loadComputingItems();
    await loadComputingLoans();
    await loadComputingOverdue();
  }

  init();
});
