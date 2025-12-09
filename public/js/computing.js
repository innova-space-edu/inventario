// /public/js/computing.js
// Inventario – Sala de Computación: equipos, reservas y préstamos

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Referencias base ----------
  const computingForm =
    document.getElementById('computingForm') ||
    document.getElementById('computingItemForm');

  const computingTableBody =
    document.getElementById('computingTableBody') ||
    document.querySelector('#computingTable tbody') ||
    document.querySelector('#computingItemsTable tbody');

  const computingSearchInput = document.getElementById('computingSearch');
  const exportBtn = document.getElementById('btnExportComputingCSV');

  const reservationForm = document.getElementById('computingReservationForm');
  const reservationsTableBody =
    document.querySelector('#computingReservationsTable tbody') || null;

  const loanForm = document.getElementById('computingLoanForm');
  const loansTableBody =
    document.getElementById('computingLoanTableBody') ||
    document.querySelector('#computingLoanTable tbody') ||
    document.querySelector('#computingLoansTable tbody');

  const debtorsList =
    document.getElementById('computingLoanDebtorsList') ||
    document.getElementById('computingPendingList');
  const overdueList = document.getElementById('computingOverdueList');

  // ---------- Campos del formulario de inventario ----------
  const compIdEquip = document.getElementById('compIdEquip');
  const compCodigo = document.getElementById('compCodigo');
  const compTipoActivo = document.getElementById('compTipoActivo');
  const compSubtipo = document.getElementById('compSubtipo');
  const compDetalleTipo = document.getElementById('compDetalleTipo');

  const compMarca = document.getElementById('compMarca') || document.getElementById('marca');
  const compModelo = document.getElementById('compModelo') || document.getElementById('modelo');
  const compSerie = document.getElementById('compSerie') || document.getElementById('numeroSerie');
  const compCantidad = document.getElementById('compCantidad');

  const compCPU = document.getElementById('compCPU') || document.getElementById('cpu');
  const compRAM =
    document.getElementById('compRAM') ||
    document.getElementById('memoriaRam') ||
    document.getElementById('ram');
  const compSO =
    document.getElementById('compSO') ||
    document.getElementById('sistemaOperativo') ||
    document.getElementById('so');
  const compFechaCompra =
    document.getElementById('compFechaCompra') || document.getElementById('fechaCompra');
  const compEstado = document.getElementById('compEstado');

  const compTipoSO =
    document.getElementById('compTipoSO') || document.getElementById('soTipo');
  const compVersionSO =
    document.getElementById('compVersionSO') || document.getElementById('soVersion');
  const compAppNombre =
    document.getElementById('compAppNombre') || document.getElementById('appNombre');
  const compAppVersion =
    document.getElementById('compAppVersion') || document.getElementById('appVersion');
  const compAppFechaInstalacion =
    document.getElementById('compAppFechaInstalacion') ||
    document.getElementById('appFechaInstalacion');
  const compLicenciaTipo =
    document.getElementById('compLicenciaTipo') || document.getElementById('licenciaTipo');
  const compLicenciaNumero =
    document.getElementById('compLicenciaNumero') || document.getElementById('licenciaNumero');
  const compLicenciaVencimiento =
    document.getElementById('compLicenciaVencimiento') ||
    document.getElementById('licenciaVencimiento');

  const compDescripcionOtros = document.getElementById('compDescripcionOtros');

  const compUbicacion = document.getElementById('compUbicacion');
  const compFechaActualizacion =
    document.getElementById('compFechaActualizacion') ||
    document.getElementById('compActualizacion');
  const compMantenimientoNotas =
    document.getElementById('compMantenimientoNotas') ||
    document.getElementById('compMantenimiento');
  const compDescripcion = document.getElementById('compDescripcion');

  // Versión antigua (wizard) – si existiera
  const compCategory = document.getElementById('compCategory');
  const compSubcategory = document.getElementById('compSubcategory');

  // Campos de formulario de préstamo para autocompletar desde inventario
  const loanCodigoInput =
    document.getElementById('loanCodigo') ||
    document.getElementById('computingLoanCodigo');
  const loanItemIdInput =
    document.getElementById('loanItemId') ||
    document.getElementById('computingLoanItemId');
  const loanItemInfo = document.getElementById('computingLoanItemInfo');

  // ---------- API helper ----------
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, {
        credentials: 'include',
        ...options
      }));

  // Si no hay nada de computación en la página, salimos
  if (!computingForm && !computingTableBody && !reservationForm && !loanForm) {
    return;
  }

  // Inicializar automáticamente la fecha de préstamo al día actual
  const loanDateAuto = document.getElementById('computingLoanFecha');
  if (loanDateAuto) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    loanDateAuto.value = `${yyyy}-${mm}-${dd}`;
  }

  // ---------- Estado ----------
  let computingItems = [];
  let computingReservations = [];
  let computingLoans = [];
  let editingItemId = null;

  // ---------- Utils ----------
  const debounce = (fn, wait = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const safe = (v) => (v == null ? '' : String(v));

  const formatDateTime = (d) => {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-CL');
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-CL');
  };

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
      console.warn('No se pudo registrar historial (computing):', err);
    }
  }

  // ========================================================
  //                    INTERACCIÓN CON SELECTORES
  // ========================================================
  (function setupWizardSync() {
    const wTipo = document.getElementById('wizardTipoActivo');
    const wSubtipo = document.getElementById('wizardSubtipo');
    const wDetalle = document.getElementById('wizardDetalle');
    const tipoInput = compTipoActivo;
    const subtipoInput = compSubtipo;
    const detalleInput = compDetalleTipo;

    const groupHardware = document.querySelector('.group-hardware');
    const groupSoftware = document.querySelector('.group-software');
    const groupOtros = document.querySelector('.group-otros');

    const subBoxMap = {
      computadora: 'compComputadorasBox',
      periferico: 'compPerifericosBox',
      red: 'compRedBox',
      so: 'compSOBox',
      aplicacion: 'compAppsBox',
      licencia: 'compLicenciasBox',
      mobiliario: 'compMobiliarioBox',
      herramienta: 'compHerramientasBox'
    };

    function updateFieldGroups() {
      if (!wTipo) return;
      const type = wTipo.value;
      if (groupHardware) groupHardware.style.display = type === 'hardware' ? '' : 'none';
      if (groupSoftware) groupSoftware.style.display = type === 'software' ? '' : 'none';
      if (groupOtros) groupOtros.style.display = type === 'otros' ? '' : 'none';
    }

    function updateSubtipoOptions() {
      if (!wTipo || !wSubtipo) return;
      const selectedType = wTipo.value;
      const allowed = {
        hardware: ['computadora', 'periferico', 'red'],
        software: ['so', 'aplicacion', 'licencia'],
        otros: ['mobiliario', 'herramienta']
      };
      Array.from(wSubtipo.options).forEach((opt) => {
        if (!opt.value) return;
        const isAllowed = allowed[selectedType] && allowed[selectedType].includes(opt.value);
        opt.disabled = !isAllowed;
        opt.style.display = isAllowed ? '' : 'none';
      });
      if (wSubtipo.value && wSubtipo.options[wSubtipo.selectedIndex].disabled) {
        wSubtipo.value = '';
        if (subtipoInput) subtipoInput.value = '';
      }
    }

    function updateSubBoxes() {
      if (!wSubtipo) return;
      const val = wSubtipo.value;
      Object.keys(subBoxMap).forEach((key) => {
        const box = document.getElementById(subBoxMap[key]);
        if (box) {
          box.style.display = val === key ? '' : 'none';
        }
      });
    }

    if (wTipo) {
      wTipo.addEventListener('change', () => {
        if (tipoInput) tipoInput.value = wTipo.value || '';
        updateFieldGroups();
        updateSubtipoOptions();
        if (wSubtipo) wSubtipo.value = '';
        if (subtipoInput) subtipoInput.value = '';
        updateSubBoxes();
      });
      updateFieldGroups();
      updateSubtipoOptions();
    }

    if (wSubtipo) {
      wSubtipo.addEventListener('change', () => {
        const selected = wSubtipo.options[wSubtipo.selectedIndex];
        if (subtipoInput) subtipoInput.value = selected ? selected.textContent.trim() : '';
        updateSubBoxes();
      });
    }

    if (wDetalle) {
      wDetalle.addEventListener('change', () => {
        const selected = wDetalle.options[wDetalle.selectedIndex];
        if (detalleInput) detalleInput.value = selected ? selected.textContent.trim() : '';
      });
    }
  })();

  // Configuración de la versión simplificada en index.html (si existiera)
  (function setupSimpleSelectors() {
    if (!compCategory || !compSubcategory) return;
    const originalOptions = Array.from(compSubcategory.options);

    const subcategoryBoxesMap = {
      computadoras: 'compComputadorasBox',
      perifericos: 'compPerifericosBox',
      'dispositivos-red': 'compRedBox',
      'sistemas-operativos': 'compSOBox',
      aplicaciones: 'compAppsBox',
      licencias: 'compLicenciasBox',
      mobiliario: 'compMobiliarioBox',
      herramientas: 'compHerramientasBox'
    };

    compCategory.addEventListener('change', () => {
      const catVal = compCategory.value;
      compSubcategory.value = '';
      originalOptions.forEach((opt) => {
        if (!opt.value) {
          opt.style.display = '';
          return;
        }
        const optionCat = opt.getAttribute('data-cat');
        if (optionCat === catVal) {
          opt.style.display = '';
          opt.disabled = false;
        } else {
          opt.style.display = 'none';
          opt.disabled = true;
        }
      });
      Object.keys(subcategoryBoxesMap).forEach((key) => {
        const box = document.getElementById(subcategoryBoxesMap[key]);
        if (box) box.style.display = 'none';
      });
    });

    compSubcategory.addEventListener('change', () => {
      const subVal = compSubcategory.value;
      Object.keys(subcategoryBoxesMap).forEach((key) => {
        const box = document.getElementById(subcategoryBoxesMap[key]);
        if (!box) return;
        box.style.display = key === subVal ? '' : 'none';
      });
    });
  })();

  // ========================================================
  //                    INVENTARIO
  // ========================================================
  async function loadComputingItems() {
    if (!computingTableBody) return;
    try {
      const resp = await apiFetch('/api/computing/items');
      if (!resp.ok) {
        console.error('Error al cargar inventario de computación:', resp.status);
        return;
      }
      const items = await resp.json();
      computingItems = Array.isArray(items) ? items : [];
      renderComputingTable();
    } catch (err) {
      console.error('Error cargando inventario de computación:', err);
    }
  }

  function getFilteredComputingItems() {
    const text = (computingSearchInput?.value || '').trim().toLowerCase();
    if (!text) return [...computingItems];
    return computingItems.filter((item) => {
      const vals = [
        item.id,
        item.idEquip,
        item.codigo,
        item.tipoActivo,
        item.subtipo,
        item.detalleTipo,
        item.marca,
        item.modelo,
        item.cpu,
        item.memoriaRam,
        item.sistemaOperativo,
        item.soVersion,
        item.appVersion,
        item.serie,
        item.ubicacion,
        item.estado,
        item.descripcion
      ];
      return vals.some((v) => v && String(v).toLowerCase().includes(text));
    });
  }

  function renderComputingTable() {
    if (!computingTableBody) return;
    computingTableBody.innerHTML = '';
    const items = getFilteredComputingItems();
    items.forEach((item) => {
      const tr = document.createElement('tr');

      const fotoCell = item.photo
        ? `
          <a href="${safe(item.photo)}" target="_blank" rel="noopener noreferrer">
            <img src="${safe(item.photo)}" alt="Foto" class="inventory-thumb" style="max-width:60px;max-height:60px;border-radius:6px;object-fit:cover;">
          </a>
        `
        : '';

      tr.innerHTML = `
        <td>${safe(item.id)}</td>
        <td>${safe(item.idEquip)}</td>
        <td>${safe(item.codigo)}</td>
        <td>${safe(item.tipoActivo)}</td>
        <td>${safe(item.subtipo)}</td>
        <td>${safe(item.detalleTipo)}</td>
        <td>${safe(item.marca)}</td>
        <td>${safe(item.modelo)}</td>
        <td>${safe(item.cpu)}</td>
        <td>${safe(item.memoriaRam)}</td>
        <td>${safe(item.sistemaOperativo)}</td>
        <td>${safe(item.soVersion || item.appVersion || '')}</td>
        <td>${safe(item.serie)}</td>
        <td>${safe(item.cantidad)}</td>
        <td>${safe(item.ubicacion)}</td>
        <td>${safe(item.estado)}</td>
        <td>${safe(item.fechaCompra || '')}</td>
        <td>${safe(item.fechaActualizacion || '')}</td>
        <td>${safe(item.descripcion)}</td>
        <td>${fotoCell}</td>
        <td>
          <button type="button" class="comp-edit-item">Editar</button>
          <button type="button" class="comp-delete-item">Eliminar</button>
        </td>
      `;
      const editBtn = tr.querySelector('.comp-edit-item');
      const delBtn = tr.querySelector('.comp-delete-item');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          enterEditMode(item);
        });
      }
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm('¿Seguro que deseas eliminar este equipo/activo?')) return;
          await deleteComputingItem(item.id);
        });
      }
      computingTableBody.appendChild(tr);
    });
  }

  function enterEditMode(item) {
    editingItemId = item.id || null;
    if (!editingItemId || !computingForm) return;
    if (compIdEquip) compIdEquip.value = item.idEquip || '';
    if (compCodigo) compCodigo.value = item.codigo || '';
    if (compTipoActivo) compTipoActivo.value = item.tipoActivo || '';
    if (compSubtipo) compSubtipo.value = item.subtipo || '';
    if (compDetalleTipo) compDetalleTipo.value = item.detalleTipo || '';
    if (compMarca) compMarca.value = item.marca || '';
    if (compModelo) compModelo.value = item.modelo || '';
    if (compSerie) compSerie.value = item.serie || '';
    if (compCantidad) compCantidad.value = item.cantidad || 1;
    if (compCPU) compCPU.value = item.cpu || '';
    if (compRAM) compRAM.value = item.memoriaRam || '';
    if (compSO) compSO.value = item.sistemaOperativo || '';
    if (compFechaCompra) compFechaCompra.value = (item.fechaCompra || '').substring(0, 10);
    if (compEstado) compEstado.value = item.estado || '';
    if (compTipoSO) compTipoSO.value = item.soTipo || '';
    if (compVersionSO) compVersionSO.value = item.soVersion || '';
    if (compAppNombre) compAppNombre.value = item.appNombre || '';
    if (compAppVersion) compAppVersion.value = item.appVersion || '';
    if (compAppFechaInstalacion)
      compAppFechaInstalacion.value = (item.appFechaInstalacion || '').substring(0, 10);
    if (compLicenciaTipo) compLicenciaTipo.value = item.licenciaTipo || '';
    if (compLicenciaNumero) compLicenciaNumero.value = item.licenciaNumero || '';
    if (compLicenciaVencimiento)
      compLicenciaVencimiento.value = (item.licenciaVencimiento || '').substring(0, 10);
    if (compDescripcionOtros) compDescripcionOtros.value = item.descripcionOtros || '';
    if (compUbicacion) compUbicacion.value = item.ubicacion || '';
    if (compFechaActualizacion)
      compFechaActualizacion.value = (item.fechaActualizacion || '').substring(0, 10);
    if (compMantenimientoNotas) compMantenimientoNotas.value = item.mantenimientoNotas || '';
    if (compDescripcion) compDescripcion.value = item.descripcion || '';

    const boxesMap = {
      computadoras: 'compComputadorasBox',
      perifericos: 'compPerifericosBox',
      'dispositivos-red': 'compRedBox',
      'sistemas-operativos': 'compSOBox',
      aplicaciones: 'compAppsBox',
      licencias: 'compLicenciasBox',
      mobiliario: 'compMobiliarioBox',
      herramientas: 'compHerramientasBox'
    };
    Object.values(boxesMap).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const boxId = boxesMap[item.subtipo];
    if (boxId) {
      const el = document.getElementById(boxId);
      if (el) el.style.display = '';
    }
  }

  function resetEditMode() {
    editingItemId = null;
    if (computingForm) computingForm.reset();
    const subBoxes = document.querySelectorAll('.subbox');
    subBoxes.forEach((box) => {
      box.style.display = 'none';
    });
  }

  async function deleteComputingItem(id) {
    try {
      const resp = await apiFetch(`/api/computing/items/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || 'No se pudo eliminar el equipo/activo.');
        return;
      }
      computingItems = computingItems.filter((it) => it.id !== id);
      renderComputingTable();
      await logHistory({
        action: 'delete',
        type: 'item',
        entityId: id,
        detail: `Equipo/activo de computación eliminado (ID ${id})`
      });
    } catch (err) {
      console.error('Error al eliminar equipo/activo de computación:', err);
      alert('Ocurrió un error al eliminar el equipo.');
    }
  }

  if (computingForm) {
    computingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(computingForm);
      try {
        let resp;
        if (editingItemId) {
          resp = await apiFetch(
            `/api/computing/items/${encodeURIComponent(editingItemId)}`,
            {
              method: 'PUT',
              body: formData
            }
          );
        } else {
          resp = await apiFetch('/api/computing/items', {
            method: 'POST',
            body: formData
          });
        }
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          alert(data.message || 'No se pudo guardar el equipo/activo.');
          return;
        }
        const result = await resp.json();
        if (result && result.item) {
          const item = result.item;
          if (editingItemId) {
            const idx = computingItems.findIndex((i) => i.id === editingItemId);
            if (idx >= 0) computingItems[idx] = item;
            await logHistory({
              action: 'update',
              type: 'item',
              entityId: item.id,
              detail: `Equipo/activo de computación actualizado (ID ${item.id})`
            });
          } else {
            computingItems.push(item);
            await logHistory({
              action: 'create',
              type: 'item',
              entityId: item.id,
              detail: `Equipo/activo de computación creado (ID ${item.id})`
            });
          }
          renderComputingTable();
        }
        resetEditMode();
      } catch (err) {
        console.error('Error al guardar equipo/activo de computación:', err);
        alert('Ocurrió un error al guardar el equipo.');
      }
    });
  }

  if (computingSearchInput) {
    computingSearchInput.addEventListener(
      'input',
      debounce(() => renderComputingTable(), 200)
    );
  }

  if (exportBtn && computingTableBody) {
    exportBtn.addEventListener('click', () => {
      const rows = Array.from(
        computingTableBody.parentElement.querySelectorAll('tr')
      );
      if (!rows.length) return;
      const csv = rows
        .map((row) =>
          Array.from(row.children)
            .slice(0, 20) // hasta Descripción; Foto y Acciones no son tan necesarias
            .map((cell) => {
              const text = cell.innerText.replace(/\s+/g, ' ').trim();
              return `"${text.replace(/"/g, '""')}"`;
            })
            .join(',')
        )
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventario_computacion.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ========================================================
  //                    RESERVAS DE SALA
  // ========================================================
  async function loadComputingReservations() {
    if (!reservationsTableBody) return;
    try {
      const resp = await apiFetch('/api/computing/reservations');
      if (!resp.ok) {
        console.error('Error al cargar reservas de sala de computación:', resp.status);
        return;
      }
      const data = await resp.json();
      computingReservations = Array.isArray(data) ? data : [];
      renderReservationsTable();
    } catch (err) {
      console.error('Error cargando reservas de computación:', err);
    }
  }

  function renderReservationsTable() {
    if (!reservationsTableBody) return;
    reservationsTableBody.innerHTML = '';
    computingReservations.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${safe(r.id)}</td>
        <td>${safe(r.solicitante || r.nombre)}</td>
        <td>${safe(r.curso)}</td>
        <td>${formatDate(r.fechaUso || r.fecha)}</td>
        <td>${safe(r.horario)}</td>
        <td>${safe(r.observaciones || '')}</td>
        <td>${safe(r.usuario || r.user || '')}</td>
      `;
      reservationsTableBody.appendChild(tr);
    });
  }

  if (reservationForm) {
    reservationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(reservationForm);
      const data = Object.fromEntries(formData.entries());
      try {
        const resp = await apiFetch('/api/computing/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar la reserva.');
          return;
        }
        const result = await resp.json();
        if (result && result.reservation) {
          computingReservations.unshift(result.reservation);
          renderReservationsTable();
          await logHistory({
            action: 'create',
            type: 'reservation',
            entityId: result.reservation.id,
            detail: `Reserva de sala de computación creada para ${
              result.reservation.solicitante || ''
            }`
          });
        }
        reservationForm.reset();
      } catch (err) {
        console.error('Error al registrar reserva de computación:', err);
        alert('Ocurrió un error al registrar la reserva.');
      }
    });
  }

  // ========================================================
  //     PRÉSTAMOS – BÚSQUEDA EN INVENTARIO (ID / CÓDIGO)
  // ========================================================
  function findComputingItemByIdOrCode(idVal, codeVal) {
    const id = (idVal || '').toString().trim();
    const codigo = (codeVal || '').toString().trim();
    if (!id && !codigo) return null;

    let item = null;

    if (id) {
      item = computingItems.find((it) => it.id && String(it.id) === id);
      if (item) return item;
      item = computingItems.find((it) => it.idEquip && String(it.idEquip) === id);
      if (item) return item;
    }

    if (codigo) {
      item = computingItems.find(
        (it) => it.codigo && String(it.codigo).toLowerCase() === codigo.toLowerCase()
      );
    }

    return item || null;
  }

  function handleLoanInventoryLookup() {
    if (!loanCodigoInput && !loanItemIdInput) return;

    const idVal = loanItemIdInput ? loanItemIdInput.value : '';
    const codeVal = loanCodigoInput ? loanCodigoInput.value : '';

    const item = findComputingItemByIdOrCode(idVal, codeVal);

    if (!item) {
      if (loanItemInfo) {
        loanItemInfo.textContent = 'Equipo no encontrado en inventario.';
      }
      return;
    }

    if (loanItemIdInput) loanItemIdInput.value = item.id || item.idEquip || '';
    if (loanCodigoInput) loanCodigoInput.value = item.codigo || '';

    if (loanItemInfo) {
      const texto = [
        item.descripcion || item.detalleTipo || '',
        item.marca || '',
        item.modelo || '',
        item.ubicacion || ''
      ]
        .filter(Boolean)
        .join(' – ');
      loanItemInfo.textContent = texto || 'Equipo encontrado.';
    }
  }

  if (loanCodigoInput) {
    ['change', 'blur'].forEach((ev) => {
      loanCodigoInput.addEventListener(ev, handleLoanInventoryLookup);
    });
  }
  if (loanItemIdInput) {
    ['change', 'blur'].forEach((ev) => {
      loanItemIdInput.addEventListener(ev, handleLoanInventoryLookup);
    });
  }

  // ========================================================
  //                    PRÉSTAMOS DE EQUIPOS
  // ========================================================
  async function loadComputingLoans() {
    if (!loansTableBody) return;
    try {
      const resp = await apiFetch('/api/computing/loans');
      if (!resp.ok) {
        console.error('Error al cargar préstamos de computación:', resp.status);
        return;
      }
      const data = await resp.json();
      computingLoans = Array.isArray(data) ? data : [];
      renderLoansTable();
      renderDebtorsList();
    } catch (err) {
      console.error('Error cargando préstamos de computación:', err);
    }
  }

  function isLoanOverdue(loan) {
    const baseDate =
      loan.dueDate || loan.loanDate || loan.fechaPrestamo || loan.fecha_prestamo;
    if (!baseDate) return false;
    const d = new Date(baseDate);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    const diffDays = (now - d) / (1000 * 60 * 60 * 24);
    return !loan.returned && !loan.devuelto && diffDays > 7;
  }

  function renderLoansTable() {
    if (!loansTableBody) return;
    loansTableBody.innerHTML = '';
    const activeLoans = computingLoans;
    activeLoans.forEach((loan) => {
      const tr = document.createElement('tr');
      const overdue = isLoanOverdue(loan);
      if (overdue) tr.classList.add('row-overdue');
      const returnedFlag = loan.returned || loan.devuelto;

      tr.innerHTML = `
        <td>${safe(loan.id)}</td>
        <td>${safe(loan.itemId || loan.idEquip || '')}</td>
        <td>${safe(loan.codigo || loan.itemCode || '')}</td>
        <td>${safe(loan.tipoPersona || '')}</td>
        <td>${safe(loan.persona || loan.nombre || '')}</td>
        <td>${safe(loan.curso || '')}</td>
        <td>${formatDateTime(loan.loanDate || loan.fechaPrestamo || loan.fecha_prestamo)}</td>
        <td>${
          loan.returnDate || loan.fechaDevolucion || loan.fecha_devolucion
            ? formatDateTime(
                loan.returnDate ||
                  loan.fechaDevolucion ||
                  loan.fecha_devolucion
              )
            : ''
        }</td>
        <td>${returnedFlag ? 'Sí' : overdue ? 'No (vencido)' : 'No'}</td>
        <td>
          ${
            returnedFlag
              ? ''
              : '<button type="button" class="comp-return-loan">Marcar devuelto</button>'
          }
        </td>
      `;
      const btn = tr.querySelector('.comp-return-loan');
      if (btn) {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Marcar este préstamo como devuelto?')) return;
          await doReturnLoan(loan.id);
        });
      }
      loansTableBody.appendChild(tr);
    });
  }

  function renderDebtorsList() {
    const pendingLoans = computingLoans.filter((l) => !(l.returned || l.devuelto));
    if (debtorsList) {
      debtorsList.innerHTML = '';
      const map = new Map();
      pendingLoans.forEach((l) => {
        const key = `${l.persona || l.nombre || 'Desconocido'}|${l.curso || ''}`;
        const current = map.get(key) || { count: 0, overdueCount: 0 };
        current.count += 1;
        if (isLoanOverdue(l)) current.overdueCount += 1;
        map.set(key, current);
      });
      map.forEach((info, key) => {
        const [nombre, curso] = key.split('|');
        const li = document.createElement('li');
        const extraCurso = curso ? ` (${curso})` : '';
        const extraOver = info.overdueCount > 0 ? ` – ${info.overdueCount} vencido(s)` : '';
        li.textContent = `${nombre}${extraCurso}: ${info.count} equipo(s) pendiente(s)${extraOver}`;
        debtorsList.appendChild(li);
      });
      if (!map.size) {
        const li = document.createElement('li');
        li.textContent = 'No hay equipos pendientes por devolver.';
        debtorsList.appendChild(li);
      }
    }
    if (overdueList) {
      overdueList.innerHTML = '';
      const overdueItems = pendingLoans.filter((l) => isLoanOverdue(l));
      if (overdueItems.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No hay préstamos vencidos.';
        overdueList.appendChild(li);
      } else {
        overdueItems.forEach((loan) => {
          const li = document.createElement('li');
          const nombre = loan.persona || loan.nombre || 'Desconocido';
          const curso = loan.curso || '';
          const extraCurso = curso ? ` (${curso})` : '';
          li.textContent = `${nombre}${extraCurso}: ${loan.id || loan.itemId} – préstamo vencido`;
          overdueList.appendChild(li);
        });
      }
    }
  }

  async function doReturnLoan(loanId) {
    try {
      const resp = await apiFetch(
        `/api/computing/loans/${encodeURIComponent(loanId)}/return`,
        {
          method: 'POST'
        }
      );
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo registrar la devolución.');
        return;
      }
      await loadComputingLoans();
      await loadComputingItems();
      await logHistory({
        action: 'update',
        type: 'loan',
        entityId: loanId,
        detail: `Préstamo de computación ${loanId} marcado como devuelto`
      });
    } catch (err) {
      console.error('Error al marcar devolución de préstamo de computación:', err);
      alert('Ocurrió un error al registrar la devolución.');
    }
  }

  if (loanForm) {
    loanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(loanForm);
      const data = Object.fromEntries(formData.entries());
      try {
        const resp = await apiFetch('/api/computing/loans', {
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
          computingLoans.unshift(result.loan);
          renderLoansTable();
          renderDebtorsList();
          await loadComputingItems();
          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo de computación creado para ${
              result.loan.persona || result.loan.nombre || ''
            }`
          });
        }
        loanForm.reset();
      } catch (err) {
        console.error('Error al registrar préstamo de computación:', err);
        alert('Ocurrió un error al registrar el préstamo.');
      }
    });
  }

  // ========================================================
  //                    INICIALIZACIÓN
  // ========================================================
  loadComputingItems();
  loadComputingReservations();
  loadComputingLoans();
});
