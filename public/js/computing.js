// /public/js/computing.js
// Inventario – Sala de Computación: equipos, reservas y préstamos

/*
  Esta versión del script de computación contiene varias mejoras para
  compatibilizar los distintos diseños de la interfaz y corregir
  errores reportados por el usuario:

  1. Soporta tanto el formulario antiguo (id="computingForm")
     usado en la página labs/computing.html como el formulario
     simplificado (id="computingItemForm") incluido en index.html.
  2. Los selectores de categoría y subcategoría filtran sus
     opciones según la categoría elegida y muestran u ocultan
     los grupos de campos correspondientes (hardware, software u
     otros) y los subcampos específicos de cada subcategoría.
  3. Se sincronizan los valores del asistente (wizard) con los
     campos de texto de identificación del activo.
  4. Se añaden fallbacks para algunos nombres de campo que se
     modificaron en el HTML (p.ej. compMantenimiento →
     compMantenimientoNotas).
  5. Se corrige la lógica de referencia de la tabla de inventario
     para que funcione con los identificadores existentes en ambos
     diseños.

  Todas las llamadas al backend permanecen sin cambios. Si el
  servidor responde correctamente, los datos se persistirán en
  Supabase y se actualizará la tabla en pantalla.
*/

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Referencias base ----------
  // Permitir compatibilidad con el formulario nuevo y antiguo
  const computingForm =
    document.getElementById('computingForm') ||
    document.getElementById('computingItemForm');

  // La tabla puede tener distintos ids según el HTML. Buscamos el tbody en orden de preferencia.
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
  // Para la tabla de préstamos soportamos distintos nombres según el HTML:
  // labs/computing.html usa "computingLoanTableBody" o un tbody dentro de #computingLoanTable.
  // index.html usa #computingLoansTable sin id específico de tbody.
  const loansTableBody =
    document.getElementById('computingLoanTableBody') ||
    document.querySelector('#computingLoanTable tbody') ||
    document.querySelector('#computingLoansTable tbody');

  // Listas de deudores y vencidos. labs/computing.html usa computingLoanDebtorsList;
  // index.html usa computingPendingList y computingOverdueList para pendientes y vencidos.
  const debtorsList =
    document.getElementById('computingLoanDebtorsList') ||
    document.getElementById('computingPendingList');
  const overdueList = document.getElementById('computingOverdueList');

  // Campos del formulario de inventario (muchos son opcionales según el HTML)
  // Elige el primero que exista para cada campo, permitiendo retrocompatibilidad.
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
  const compRAM = document.getElementById('compRAM') || document.getElementById('ram');
  const compSO = document.getElementById('compSO') || document.getElementById('so');
  const compFechaCompra = document.getElementById('compFechaCompra') || document.getElementById('fechaCompra');
  const compEstado = document.getElementById('compEstado');

  const compTipoSO = document.getElementById('compTipoSO') || document.getElementById('soTipoLicencia');
  const compVersionSO = document.getElementById('compVersionSO') || document.getElementById('soVersion');
  const compAppNombre = document.getElementById('compAppNombre') || document.getElementById('appNombre');
  const compAppVersion = document.getElementById('compAppVersion') || document.getElementById('appVersion');
  const compAppFechaInstalacion =
    document.getElementById('compAppFechaInstalacion') || document.getElementById('appFechaInstalacion');
  const compLicenciaTipo = document.getElementById('compLicenciaTipo') || document.getElementById('licTipo');
  const compLicenciaNumero = document.getElementById('compLicenciaNumero') || document.getElementById('licNumero');
  const compLicenciaVencimiento =
    document.getElementById('compLicenciaVencimiento') || document.getElementById('licVencimiento');

  const compDescripcionOtros = document.getElementById('compDescripcionOtros');

  const compUbicacion = document.getElementById('compUbicacion');
  const compFechaActualizacion =
    document.getElementById('compFechaActualizacion') || document.getElementById('compActualizacion');
  const compMantenimientoNotas =
    document.getElementById('compMantenimientoNotas') || document.getElementById('compMantenimiento');
  const compDescripcion = document.getElementById('compDescripcion');

  // Selects de categoría/subcategoría para la versión simplificada
  const compCategory = document.getElementById('compCategory');
  const compSubcategory = document.getElementById('compSubcategory');

  // ---------- API helper ----------
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, {
        credentials: 'include',
        ...options,
      }));

  // Si no hay nada de computación en la página, salimos
  if (!computingForm && !computingTableBody && !reservationForm && !loanForm) {
    return;
  }

  // Inicializar automáticamente la fecha de préstamo al día actual si existe el campo
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
          data: { detail: entry.detail },
        }),
      });
    } catch (err) {
      console.warn('No se pudo registrar historial (computing):', err);
    }
  }

  // ========================================================
  //                    INTERACCIÓN CON SELECTORES
  // ========================================================
  // En el diseño basado en wizard (labs/computing.html), sincroniza la selección
  // de tipo, subtipo y detalle con los campos de texto ocultos y muestra solo
  // los grupos de campos relevantes.
  (function setupWizardSync() {
    const wTipo = document.getElementById('wizardTipoActivo');
    const wSubtipo = document.getElementById('wizardSubtipo');
    const wDetalle = document.getElementById('wizardDetalle');
    const tipoInput = compTipoActivo;
    const subtipoInput = compSubtipo;
    const detalleInput = compDetalleTipo;

    // Grupos de campos que se mostrarán/ocultarán según el tipo
    const groupHardware = document.querySelector('.group-hardware');
    const groupSoftware = document.querySelector('.group-software');
    const groupOtros = document.querySelector('.group-otros');

    // Mapa de subtipos a los IDs de los contenedores de campos específicos
    const subBoxMap = {
      computadora: 'compComputadorasBox',
      periferico: 'compPerifericosBox',
      red: 'compRedBox',
      so: 'compSOBox',
      aplicacion: 'compAppsBox',
      licencia: 'compLicenciasBox',
      mobiliario: 'compMobiliarioBox',
      herramienta: 'compHerramientasBox',
    };

    // Mostrar/ocultar grupos de campo según el tipo seleccionado
    function updateFieldGroups() {
      if (!wTipo) return;
      const type = wTipo.value;
      if (groupHardware) groupHardware.style.display = type === 'hardware' ? '' : 'none';
      if (groupSoftware) groupSoftware.style.display = type === 'software' ? '' : 'none';
      if (groupOtros) groupOtros.style.display = type === 'otros' ? '' : 'none';
    }

    // Filtra opciones de subtipo para que solo sean seleccionables las del tipo elegido
    function updateSubtipoOptions() {
      if (!wTipo || !wSubtipo) return;
      const selectedType = wTipo.value;
      const allowed = {
        hardware: ['computadora', 'periferico', 'red'],
        software: ['so', 'aplicacion', 'licencia'],
        otros: ['mobiliario', 'herramienta'],
      };
      Array.from(wSubtipo.options).forEach((opt) => {
        if (!opt.value) return; // Placeholder
        const isAllowed = allowed[selectedType] && allowed[selectedType].includes(opt.value);
        opt.disabled = !isAllowed;
        // Ocultamos opciones no permitidas pero dejamos visibles los grupos
        opt.style.display = isAllowed ? '' : 'none';
      });
      // Si el valor seleccionado no es válido, reseteamos
      if (wSubtipo.value && wSubtipo.options[wSubtipo.selectedIndex].disabled) {
        wSubtipo.value = '';
        if (subtipoInput) subtipoInput.value = '';
      }
    }

    // Muestra el bloque de campos específico para el subtipo seleccionado
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
        // Reiniciar subtipo y detalle cuando cambia tipo
        if (wSubtipo) wSubtipo.value = '';
        if (subtipoInput) subtipoInput.value = '';
        updateSubBoxes();
      });
      // Ejecutar al inicio para aplicar estado inicial
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

  // Configuración de la versión simplificada en index.html
  (function setupSimpleSelectors() {
    if (!compCategory || !compSubcategory) return;
    // Guardar la lista original de opciones para poder restaurarlas
    const originalOptions = Array.from(compSubcategory.options);

    // Asociar cada subcategoría con su grupo para mostrar/ocultar campos
    const subcategoryBoxesMap = {
      computadoras: 'compComputadorasBox',
      perifericos: 'compPerifericosBox',
      'dispositivos-red': 'compRedBox',
      'sistemas-operativos': 'compSOBox',
      aplicaciones: 'compAppsBox',
      licencias: 'compLicenciasBox',
      mobiliario: 'compMobiliarioBox',
      herramientas: 'compHerramientasBox',
    };

    compCategory.addEventListener('change', () => {
      const catVal = compCategory.value;
      // Resetear subcategoría
      compSubcategory.value = '';
      // Filtrar opciones según el atributo data-cat
      // Restauramos todas las opciones a visibles primero
      originalOptions.forEach((opt) => {
        // Mantener el placeholder siempre visible
        if (!opt.value) {
          opt.style.display = '';
          return;
        }
        const optionCat = opt.getAttribute('data-cat');
        // Mostrar solo las opciones cuyo data-cat coincide con la categoría seleccionada
        if (optionCat === catVal) {
          opt.style.display = '';
          opt.disabled = false;
        } else {
          // Ocultar opciones que no pertenecen a la categoría
          opt.style.display = 'none';
          opt.disabled = true;
        }
      });
      // Ocultar todas las cajas de subcategorías
      Object.keys(subcategoryBoxesMap).forEach((key) => {
        const box = document.getElementById(subcategoryBoxesMap[key]);
        if (box) box.style.display = 'none';
      });
    });
    compSubcategory.addEventListener('change', () => {
      const subVal = compSubcategory.value;
      // Mostrar la caja asociada a la subcategoría y ocultar las demás
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
        item.ubicacion,
        item.estado,
        item.descripcion,
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
        ? `<a href="${safe(item.photo)}" target="_blank" rel="noopener noreferrer">Ver foto</a>`
        : '';
      // Construimos la fila con la mayoría de los campos. Si la tabla
      // en la interfaz actual tiene menos columnas, las celdas extra
      // simplemente no se mostrarán.
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
    // No tocamos el input de foto: si quiere cambiar la foto, el usuario la vuelve a cargar.
  }

  function resetEditMode() {
    editingItemId = null;
    if (computingForm) computingForm.reset();
    // Ocultar todas las cajas de subcategorías al salir del modo edición
    const subBoxes = document.querySelectorAll('.subbox');
    subBoxes.forEach((box) => {
      box.style.display = 'none';
    });
  }

  async function deleteComputingItem(id) {
    try {
      const resp = await apiFetch(`/api/computing/items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
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
        detail: `Equipo/activo de computación eliminado (ID ${id})`,
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
          // Actualizar
          resp = await apiFetch(
            `/api/computing/items/${encodeURIComponent(editingItemId)}`,
            {
              method: 'PUT',
              body: formData,
            }
          );
        } else {
          // Crear nuevo
          resp = await apiFetch('/api/computing/items', {
            method: 'POST',
            body: formData,
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
              detail: `Equipo/activo de computación actualizado (ID ${item.id})`,
            });
          } else {
            computingItems.push(item);
            await logHistory({
              action: 'create',
              type: 'item',
              entityId: item.id,
              detail: `Equipo/activo de computación creado (ID ${item.id})`,
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
            // Se recortan las columnas hasta "Acciones". Si la tabla tiene menos,
            // slice devolverá todas las existentes.
            .slice(0, 19)
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
          body: JSON.stringify(data),
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
            }`,
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
    // Si el backend entrega dueDate lo usamos, si no, consideramos vencido a los 7 días.
    const baseDate = loan.dueDate || loan.loanDate || loan.fechaPrestamo;
    if (!baseDate) return false;
    const d = new Date(baseDate);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    const diffDays = (now - d) / (1000 * 60 * 60 * 24);
    return !loan.returned && diffDays > 7;
  }

  function renderLoansTable() {
    if (!loansTableBody) return;
    loansTableBody.innerHTML = '';
    const activeLoans = computingLoans;
    activeLoans.forEach((loan) => {
      const tr = document.createElement('tr');
      const overdue = isLoanOverdue(loan);
      if (overdue) tr.classList.add('row-overdue');
      tr.innerHTML = `
        <td>${safe(loan.id)}</td>
        <td>${safe(loan.itemId || loan.idEquip || '')}</td>
        <td>${safe(loan.codigo || loan.itemCode || '')}</td>
        <td>${safe(loan.tipoPersona || '')}</td>
        <td>${safe(loan.persona || loan.nombre || '')}</td>
        <td>${safe(loan.curso || '')}</td>
        <td>${formatDateTime(loan.loanDate || loan.fechaPrestamo)}</td>
        <td>${loan.returnDate || loan.fechaDevolucion ? formatDateTime(loan.returnDate || loan.fechaDevolucion) : ''}</td>
        <td>${loan.returned ? 'Sí' : overdue ? 'No (vencido)' : 'No'}</td>
        <td>
          ${
            loan.returned
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
    // Construir listas de pendientes y vencidos.
    const pendingLoans = computingLoans.filter((l) => !l.returned);
    // Renderizar lista de deudores (pendientes) si existe.
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
    // Renderizar lista de vencidos si existe
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
      const resp = await apiFetch(`/api/computing/return/${encodeURIComponent(loanId)}`, {
        method: 'POST',
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo registrar la devolución.');
        return;
      }
      await loadComputingLoans();
      await loadComputingItems(); // para actualizar stock
      await logHistory({
        action: 'update',
        type: 'loan',
        entityId: loanId,
        detail: `Préstamo de computación ${loanId} marcado como devuelto`,
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
        const resp = await apiFetch('/api/computing/loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
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
          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo de computación creado para ${
              result.loan.persona || result.loan.nombre || ''
            }`,
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
