// /public/js/science.js
// Laboratorio de Ciencias – Inventario + Préstamos + Personas (solo lectura) + Reservas (agenda)
//
// ✅ Mejoras incluidas:
// - Soporte completo para RESERVAS (scienceReservationForm + tabla de reservas si existe)
// - Registro en HISTORIAL para create/update/delete en items, loans, returns y reservations
// - Render robusto (no revienta si faltan nodos del DOM en páginas distintas)
// - Normalización de fechas para inputs type="date" y para display en tablas
// - Búsqueda debounced y filtros seguros
// - Botones/acciones tolerantes a backend variado (id/_id, loanDate/fecha, etc.)

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // Helpers base
  // =========================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const debounce = (fn, wait = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const safe = (v) => (v == null ? "" : String(v));

  const normalizeId = (obj) => obj?.id ?? obj?._id ?? obj?.loanId ?? obj?.reservationId ?? null;

  const toDateInputValue = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    // yyyy-mm-dd en zona local
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDateTimeCL = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleString("es-CL");
  };

  // =========================
  // API fetch (roleGuard)
  // =========================
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  // =========================
  // HISTORIAL helper
  // =========================
  async function logHistory(entry) {
    try {
      await apiFetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab: "science",
          action: entry.action, // create | update | delete
          entityType: entry.type, // item | loan | reservation
          entityId: entry.entityId ?? null,
          data: { detail: entry.detail ?? "" },
        }),
      });
    } catch (err) {
      console.warn("No se pudo registrar historial (science):", err);
    }
  }

  // =========================
  // Referencias DOM (todas opcionales)
  // =========================
  // INVENTARIO
  const scienceForm = $("#scienceForm");
  const scienceFormSubmit = $("#scienceFormSubmit");
  const scienceFormCancelEdit = $("#scienceFormCancelEdit");

  const sciIdInput = $("#sciId");
  const sciCodeInput = $("#sciCode");
  const sciNameInput = $("#sciName");
  const sciDescInput = $("#sciDescription");
  const sciCatSelect = $("#sciCategory");
  const sciQtyInput = $("#sciQuantity");
  const sciDateInput = $("#sciDate");

  const scienceSearchInput = $("#scienceSearch");
  const scienceTableBody = $("#scienceTableBody") || $("#scienceTable tbody");

  // PRÉSTAMOS
  const loanForm = $("#scienceLoanForm");
  const loansTableBody = $("#scienceLoansTableBody") || $("#scienceLoansTable tbody");
  const loansSearchInput = $("#scienceLoansSearch");

  const returnForm = $("#scienceReturnForm");
  const returnIdInput = $("#scienceReturnId");

  const loanPersonSelect = $("#sciLoanPersonSelect");
  const loanNombreInput = $("#sciLoanNombre");
  const loanCursoInput = $("#sciLoanCurso");
  const loanTipoPersonaInput = $("#sciLoanTipoPersona");

  // PERSONAS
  const peopleTableBody = $("#sciencePeopleTable tbody");

  // RESERVAS (AGENDA)
  const reservationForm = $("#scienceReservationForm");
  const reservationsTableBody =
    $("#scienceReservationsTableBody") || $("#scienceReservationsTable tbody");

  // Si NO estamos en una página que tenga el core de ciencias, no hacemos nada
  // (pero permitimos páginas que solo tengan reservas, etc.)
  const hasAnyScienceUI =
    !!scienceForm || !!scienceTableBody || !!loanForm || !!loansTableBody || !!reservationForm;

  if (!hasAnyScienceUI) return;

  // =========================
  // Estado
  // =========================
  let scienceItems = [];
  let scienceLoans = [];
  let sciencePeople = [];
  let scienceReservations = [];

  let editingItemId = null;

  // =========================
  // INVENTARIO
  // =========================
  async function loadScienceItems() {
    if (!scienceTableBody) return;
    try {
      const resp = await apiFetch("/api/science/items");
      if (!resp.ok) {
        console.error("Error al cargar inventario de ciencias:", resp.status);
        return;
      }
      const items = await resp.json();
      scienceItems = Array.isArray(items) ? items : [];
      renderScienceTable();
    } catch (err) {
      console.error("Error cargando materiales de ciencias:", err);
    }
  }

  function getFilteredItems() {
    const text = (scienceSearchInput?.value || "").trim().toLowerCase();
    if (!text) return [...scienceItems];

    return scienceItems.filter((item) => {
      const vals = [
        item.id,
        item._id,
        item.codigo,
        item.nombre,
        item.descripcion,
        item.categoria,
        item.fecha,
      ];
      return vals.some((v) => v && String(v).toLowerCase().includes(text));
    });
  }

  function renderScienceTable() {
    if (!scienceTableBody) return;
    scienceTableBody.innerHTML = "";

    const items = getFilteredItems();
    items.forEach((item) => {
      const id = normalizeId(item);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(id)}</td>
        <td>${safe(item.codigo)}</td>
        <td>${safe(item.nombre)}</td>
        <td>${safe(item.descripcion)}</td>
        <td>${safe(item.categoria)}</td>
        <td>${safe(item.cantidad)}</td>
        <td>${safe(item.fecha)}</td>
        <td>
          ${
            item.photo
              ? `<img src="${item.photo}" width="50" alt="Foto material" loading="lazy" decoding="async" />`
              : ""
          }
        </td>
        <td>
          <button type="button" class="btn-ghost sci-edit-item" data-id="${safe(id)}">Editar</button>
          <button type="button" class="btn-ghost sci-delete-item" data-id="${safe(id)}">Eliminar</button>
        </td>
      `;

      // Editar
      const editBtn = $(".sci-edit-item", tr);
      if (editBtn) {
        editBtn.addEventListener("click", () => enterEditMode(item));
      }

      // Eliminar
      const delBtn = $(".sci-delete-item", tr);
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!id) return;
          if (!confirm("¿Seguro que deseas eliminar este material de ciencias?")) return;

          try {
            const resp = await apiFetch(`/api/science/items/${encodeURIComponent(id)}`, {
              method: "DELETE",
            });
            if (!resp.ok) {
              const data = await resp.json().catch(() => ({}));
              alert(data.message || "No se pudo eliminar el material.");
              return;
            }

            scienceItems = scienceItems.filter((it) => normalizeId(it) !== id);
            renderScienceTable();

            await logHistory({
              action: "delete",
              type: "item",
              entityId: id,
              detail: `Eliminado material de ciencias "${item.nombre || ""}" (código ${item.codigo || ""})`,
            });
          } catch (err) {
            console.error("Error al eliminar material de ciencias:", err);
            alert("Ocurrió un error al eliminar el material.");
          }
        });
      }

      scienceTableBody.appendChild(tr);
    });
  }

  function enterEditMode(item) {
    const id = normalizeId(item);
    editingItemId = id || null;
    if (!editingItemId) return;

    if (sciIdInput) sciIdInput.value = safe(id);
    if (sciCodeInput) sciCodeInput.value = safe(item.codigo);
    if (sciNameInput) sciNameInput.value = safe(item.nombre);
    if (sciDescInput) sciDescInput.value = safe(item.descripcion);
    if (sciCatSelect) sciCatSelect.value = item.categoria || "instrumento";
    if (sciQtyInput) sciQtyInput.value = safe(item.cantidad);

    // IMPORTANTE: input date requiere yyyy-mm-dd
    if (sciDateInput) sciDateInput.value = toDateInputValue(item.fecha);

    if (scienceFormSubmit) scienceFormSubmit.textContent = "Actualizar material";
    if (scienceFormCancelEdit) scienceFormCancelEdit.style.display = "inline-block";
  }

  function resetEditMode() {
    editingItemId = null;
    if (scienceForm) scienceForm.reset();
    if (sciIdInput) sciIdInput.value = "";
    if (scienceFormSubmit) scienceFormSubmit.textContent = "Guardar";
    if (scienceFormCancelEdit) scienceFormCancelEdit.style.display = "none";
  }

  if (scienceFormCancelEdit) {
    scienceFormCancelEdit.addEventListener("click", () => resetEditMode());
  }

  if (scienceForm) {
    // Si existe sciDateInput y viene vacío, dejar por defecto hoy (opcional)
    if (sciDateInput && !sciDateInput.value) {
      sciDateInput.value = toDateInputValue(new Date());
    }

    scienceForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(scienceForm);

      // Normalizar fecha si el backend espera string yyyy-mm-dd (ya viene así del input)
      // formData.get("fecha")

      try {
        let resp;
        if (editingItemId) {
          resp = await apiFetch(`/api/science/items/${encodeURIComponent(editingItemId)}`, {
            method: "PUT",
            body: formData,
          });
        } else {
          resp = await apiFetch("/api/science/items", {
            method: "POST",
            body: formData,
          });
        }

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          alert(data.message || "No se pudo guardar el material.");
          return;
        }

        const result = await resp.json().catch(() => ({}));
        const item = result.item || result; // tolerante a backend

        if (item) {
          const id = normalizeId(item);

          if (editingItemId) {
            const idx = scienceItems.findIndex((i) => normalizeId(i) === editingItemId);
            if (idx >= 0) scienceItems[idx] = item;

            await logHistory({
              action: "update",
              type: "item",
              entityId: id,
              detail: `Actualizado material de ciencias "${item.nombre || ""}" (código ${item.codigo || ""})`,
            });
          } else {
            scienceItems.push(item);

            await logHistory({
              action: "create",
              type: "item",
              entityId: id,
              detail: `Ingresado material de ciencias "${item.nombre || ""}" (código ${item.codigo || ""})`,
            });
          }

          renderScienceTable();
        }

        resetEditMode();
      } catch (err) {
        console.error("Error al guardar material de ciencias:", err);
        alert("Ocurrió un error al guardar.");
      }
    });
  }

  if (scienceSearchInput) {
    scienceSearchInput.addEventListener("input", debounce(renderScienceTable, 200));
  }

  // =========================
  // PRÉSTAMOS
  // =========================
  async function loadScienceLoans() {
    if (!loansTableBody) return;
    try {
      const resp = await apiFetch("/api/science/loans");
      if (!resp.ok) {
        console.error("Error al cargar préstamos de ciencias:", resp.status);
        return;
      }
      const loans = await resp.json();
      scienceLoans = Array.isArray(loans) ? loans : [];
      renderLoansTable();
    } catch (err) {
      console.error("Error cargando préstamos de ciencias:", err);
    }
  }

  function getFilteredLoans() {
    const text = (loansSearchInput?.value || "").trim().toLowerCase();
    if (!text) return [...scienceLoans];

    return scienceLoans.filter((loan) => {
      const vals = [
        loan.id,
        loan._id,
        loan.codigo || loan.itemCode,
        loan.nombre || loan.borrowerName,
        loan.curso || loan.borrowerCourse,
        loan.observaciones || loan.notes,
      ];
      return vals.some((v) => v && String(v).toLowerCase().includes(text));
    });
  }

  function renderLoansTable() {
    if (!loansTableBody) return;
    loansTableBody.innerHTML = "";

    const loans = getFilteredLoans();
    loans.forEach((loan) => {
      const loanId = normalizeId(loan) || "";
      const codigo = loan.codigo || loan.itemCode || "";
      const nombre = loan.nombre || loan.borrowerName || "";
      const curso = loan.curso || loan.borrowerCourse || "";
      const observaciones = loan.observaciones || loan.notes || "";

      const loanDate = loan.loanDate || loan.fechaPrestamo || loan.fecha || loan.createdAt;
      const returnDate = loan.returnDate || loan.fechaDevolucion || loan.updatedAt;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(loanId)}</td>
        <td>${safe(codigo)}</td>
        <td>${safe(nombre)}</td>
        <td>${safe(curso)}</td>
        <td>${formatDateTimeCL(loanDate)}</td>
        <td>${loan.returned ? "Sí" : "No"}</td>
        <td>${formatDateTimeCL(returnDate)}</td>
        <td>${safe(observaciones)}</td>
        <td>
          ${
            loan.returned
              ? ""
              : `<button type="button" class="btn-ghost sci-return-btn" data-id="${safe(loanId)}">
                   Marcar devuelto
                 </button>`
          }
        </td>
      `;

      const retBtn = $(".sci-return-btn", tr);
      if (retBtn) {
        retBtn.addEventListener("click", async () => {
          if (!loanId) return;
          if (!confirm("¿Marcar este préstamo como devuelto?")) return;
          await doReturnLoan(loanId);
        });
      }

      loansTableBody.appendChild(tr);
    });
  }

  async function doReturnLoan(loanId) {
    try {
      const resp = await apiFetch(`/api/science/return/${encodeURIComponent(loanId)}`, {
        method: "POST",
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || "No se pudo registrar la devolución.");
        return;
      }

      await loadScienceLoans();
      await loadScienceItems();

      await logHistory({
        action: "update",
        type: "loan",
        entityId: loanId,
        detail: `Préstamo de ciencias ${loanId} marcado como devuelto`,
      });
    } catch (err) {
      console.error("Error al devolver préstamo de ciencias:", err);
      alert("Ocurrió un error al registrar la devolución.");
    }
  }

  if (loanForm) {
    loanForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(loanForm);
      const data = Object.fromEntries(formData.entries());

      // Si se seleccionó persona, pero no llenaron tipoPersona, intentamos inferir
      if (data.personaId && !data.tipoPersona) {
        const p = sciencePeople.find((x) => String(x.id) === String(data.personaId));
        if (p?.tipo) data.tipoPersona = p.tipo;
      }

      try {
        const resp = await apiFetch("/api/science/loan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || "No se pudo registrar el préstamo.");
          return;
        }

        const result = await resp.json().catch(() => ({}));
        const loan = result.loan || result;

        if (loan) {
          scienceLoans.unshift(loan);
          renderLoansTable();

          await logHistory({
            action: "create",
            type: "loan",
            entityId: normalizeId(loan),
            detail: `Préstamo de ciencias creado (ID ${normalizeId(loan)}) para ${loan.nombre || loan.borrowerName || ""}`,
          });
        }

        loanForm.reset();
        if (loanPersonSelect) loanPersonSelect.value = "";
        if (loanTipoPersonaInput) loanTipoPersonaInput.value = "";
      } catch (err) {
        console.error("Error al registrar préstamo de ciencias:", err);
        alert("Ocurrió un error al registrar el préstamo.");
      }
    });
  }

  if (returnForm && returnIdInput) {
    returnForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loanId = returnIdInput.value.trim();
      if (!loanId) {
        alert("Debes indicar el ID del préstamo.");
        return;
      }
      await doReturnLoan(loanId);
      returnForm.reset();
    });
  }

  if (loansSearchInput) {
    loansSearchInput.addEventListener("input", debounce(renderLoansTable, 200));
  }

  // =========================
  // PERSONAS (compartidas con Biblioteca)
  // =========================
  async function loadSciencePeople() {
    if (!peopleTableBody && !loanPersonSelect) return;

    try {
      const resp = await apiFetch("/api/library/people");
      if (!resp.ok) {
        console.error("Error al cargar personas para Ciencias:", resp.status);
        return;
      }
      const data = await resp.json();
      sciencePeople = Array.isArray(data) ? data : [];

      renderPeopleTable();
      fillLoanPersonSelect();
    } catch (err) {
      console.error("Error cargando personas para Ciencias:", err);
    }
  }

  function renderPeopleTable() {
    if (!peopleTableBody) return;
    peopleTableBody.innerHTML = "";

    sciencePeople.forEach((p) => {
      const tr = document.createElement("tr");
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

    loanPersonSelect.innerHTML = '<option value="">-- Seleccionar desde lista --</option>';

    const estudiantes = sciencePeople.filter(
      (p) => (p.tipo || "").toLowerCase() === "estudiante"
    );
    const funcionarios = sciencePeople.filter(
      (p) => (p.tipo || "").toLowerCase() === "funcionario"
    );

    if (estudiantes.length) {
      const og = document.createElement("optgroup");
      og.label = "Estudiantes";
      estudiantes.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        const extra = p.curso ? ` (${p.curso})` : "";
        opt.textContent = `${p.nombre}${extra}`;
        og.appendChild(opt);
      });
      loanPersonSelect.appendChild(og);
    }

    if (funcionarios.length) {
      const og = document.createElement("optgroup");
      og.label = "Funcionarios";
      funcionarios.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        const extra = p.curso ? ` (${p.curso})` : "";
        opt.textContent = `${p.nombre}${extra}`;
        og.appendChild(opt);
      });
      loanPersonSelect.appendChild(og);
    }
  }

  if (loanPersonSelect) {
    loanPersonSelect.addEventListener("change", () => {
      const id = loanPersonSelect.value;
      const p = sciencePeople.find((x) => String(x.id) === String(id));
      if (!p) return;

      if (loanNombreInput && !loanNombreInput.value) loanNombreInput.value = p.nombre || "";
      if (loanCursoInput && !loanCursoInput.value) loanCursoInput.value = p.curso || "";
      if (loanTipoPersonaInput) loanTipoPersonaInput.value = p.tipo || "";
    });
  }

  // =========================
  // RESERVAS (AGENDA)
  // =========================
  async function loadScienceReservations() {
    // Tabla opcional: si no existe, igual permitimos crear reservas
    if (!reservationsTableBody) return;

    // Si tu backend aún no tiene este endpoint, no romperá:
    // simplemente quedará vacío con un warning.
    try {
      const resp = await apiFetch("/api/science/reservations");
      if (!resp.ok) {
        console.warn("Reservas: endpoint /api/science/reservations no disponible:", resp.status);
        return;
      }
      const data = await resp.json();
      scienceReservations = Array.isArray(data) ? data : [];
      renderReservationsTable();
    } catch (err) {
      console.warn("No se pudieron cargar reservas de ciencias:", err);
    }
  }

  function renderReservationsTable() {
    if (!reservationsTableBody) return;
    reservationsTableBody.innerHTML = "";

    scienceReservations.forEach((r) => {
      const id = normalizeId(r);
      const solicitante = r.solicitante || r.requester || "";
      const curso = r.curso || r.room || r.grupo || "";
      const fechaUso = r.fechaUso || r.date || r.fecha || r.startDate;
      const horario = r.horario || r.time || r.bloque || "";
      const observaciones = r.observaciones || r.notes || "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(id)}</td>
        <td>${safe(solicitante)}</td>
        <td>${safe(curso)}</td>
        <td>${safe(toDateInputValue(fechaUso))}</td>
        <td>${safe(horario)}</td>
        <td>${safe(observaciones)}</td>
        <td>
          <button type="button" class="btn-ghost sci-delete-reservation" data-id="${safe(id)}">
            Eliminar
          </button>
        </td>
      `;

      const delBtn = $(".sci-delete-reservation", tr);
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!id) return;
          if (!confirm("¿Eliminar esta reserva?")) return;

          try {
            const resp = await apiFetch(`/api/science/reservations/${encodeURIComponent(id)}`, {
              method: "DELETE",
            });
            if (!resp.ok) {
              const d = await resp.json().catch(() => ({}));
              alert(d.message || "No se pudo eliminar la reserva.");
              return;
            }

            scienceReservations = scienceReservations.filter((x) => normalizeId(x) !== id);
            renderReservationsTable();

            await logHistory({
              action: "delete",
              type: "reservation",
              entityId: id,
              detail: `Eliminada reserva de laboratorio (solicitante: ${solicitante}, curso: ${curso}, fecha: ${toDateInputValue(fechaUso)}, horario: ${horario})`,
            });
          } catch (err) {
            console.error("Error eliminando reserva:", err);
            alert("Ocurrió un error al eliminar la reserva.");
          }
        });
      }

      reservationsTableBody.appendChild(tr);
    });
  }

  if (reservationForm) {
    // Set default date to today if empty (UX)
    const dateInput = $('input[name="fechaUso"]', reservationForm);
    if (dateInput && !dateInput.value) dateInput.value = toDateInputValue(new Date());

    reservationForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fd = new FormData(reservationForm);
      const payload = Object.fromEntries(fd.entries());

      // Normalizar campos (por si vienen vacíos)
      payload.solicitante = (payload.solicitante || "").trim();
      payload.curso = (payload.curso || "").trim();
      payload.fechaUso = payload.fechaUso || "";
      payload.horario = (payload.horario || "").trim();
      payload.observaciones = (payload.observaciones || "").trim();

      if (!payload.solicitante || !payload.curso || !payload.fechaUso) {
        alert("Completa solicitante, curso y fecha de uso.");
        return;
      }

      try {
        // ✅ IMPORTANTE:
        // - Si tu dashboard ya usa /api/science/reservation (singular), ajusta aquí
        // - Yo lo dejo en plural "reservations" por convención REST.
        // - Si tu backend ya tiene otro endpoint, cambia SOLO esta línea.
        let resp = await apiFetch("/api/science/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Fallback: muchos proyectos usan singular
        if (!resp.ok) {
          const try2 = await apiFetch("/api/science/reservation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          resp = try2;
        }

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || "No se pudo registrar la reserva.");
          return;
        }

        const result = await resp.json().catch(() => ({}));
        const reservation = result.reservation || result.item || result;

        // Log historial (esto es lo que te faltaba para que aparezca en Historial)
        await logHistory({
          action: "create",
          type: "reservation",
          entityId: normalizeId(reservation),
          detail: `Reserva laboratorio ciencias: ${payload.curso} – ${payload.horario || "sin horario"} – ${payload.fechaUso} – Solicitante: ${payload.solicitante}`,
        });

        // refrescar tabla de reservas si existe
        reservationForm.reset();
        if (dateInput) dateInput.value = toDateInputValue(new Date());

        await loadScienceReservations();
      } catch (err) {
        console.error("Error registrando reserva:", err);
        alert("Ocurrió un error al registrar la reserva.");
      }
    });
  }

  // =========================
  // Inicialización
  // =========================
  loadScienceItems();
  loadScienceLoans();
  loadSciencePeople();
  loadScienceReservations();
});
