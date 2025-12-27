// /public/js/science.js
// Laboratorio de Ciencias – Inventario + Préstamos + Reservas + Personas (solo lectura)

document.addEventListener("DOMContentLoaded", () => {
  // ---------- Referencias base ----------
  const scienceForm = document.getElementById("scienceForm");
  const scienceFormSubmit = document.getElementById("scienceFormSubmit");
  const scienceFormCancelEdit = document.getElementById("scienceFormCancelEdit");

  const sciIdInput = document.getElementById("sciId");
  const sciCodeInput = document.getElementById("sciCode");
  const sciNameInput = document.getElementById("sciName");
  const sciDescInput = document.getElementById("sciDescription");
  const sciCatSelect = document.getElementById("sciCategory");
  const sciQtyInput = document.getElementById("sciQuantity");
  const sciDateInput = document.getElementById("sciDate");

  const scienceTableBody = document.querySelector("#scienceTable tbody");
  const scienceSearchInput = document.getElementById("scienceSearch");

  // Préstamos (en dashboard, si existe tu sección; si no, no rompe)
  const loanForm = document.getElementById("scienceLoanForm");
  const loansTableBody = document.querySelector("#scienceLoansTable tbody");
  const loansSearchInput = document.getElementById("scienceLoansSearch");
  const returnForm = document.getElementById("scienceReturnForm");
  const returnIdInput = document.getElementById("scienceReturnId");

  const loanPersonSelect = document.getElementById("sciLoanPersonSelect");
  const loanNombreInput = document.getElementById("sciLoanNombre");
  const loanCursoInput = document.getElementById("sciLoanCurso");
  const loanTipoPersonaInput = document.getElementById("sciLoanTipoPersona");
  const peopleTableBody = document.querySelector("#sciencePeopleTable tbody");

  // Reservas (dashboard)
  const resForm = document.getElementById("scienceReservationForm");
  const resId = document.getElementById("scienceReservationId");
  const resSolicitante = document.getElementById("scienceResSolicitante");
  const resCurso = document.getElementById("scienceResCurso");
  const resFechaUso = document.getElementById("scienceResFechaUso");
  const resHoraInicio = document.getElementById("scienceResHoraInicio");
  const resHoraFin = document.getElementById("scienceResHoraFin");
  const resObs = document.getElementById("scienceResObs");
  const resStatus = document.getElementById("scienceResStatus");
  const resSubmit = document.getElementById("scienceResSubmit");
  const resCancelEdit = document.getElementById("scienceResCancelEdit");

  const resDateFrom = document.getElementById("scienceResDateFrom");
  const resDateTo = document.getElementById("scienceResDateTo");
  const resTableBody = document.querySelector("#scienceReservationsTable tbody");

  const btnResPDF = document.getElementById("btnExportScienceResPDF");
  const btnResXLSX = document.getElementById("btnExportScienceResXLSX");

  // Fetch con credenciales
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: "include", ...options }));

  // Si no existe lo mínimo, salir
  if (!scienceForm || !scienceTableBody) return;

  // ---------- Estado ----------
  let scienceItems = [];
  let scienceLoans = [];
  let sciencePeople = [];
  let scienceReservations = [];

  let editingItemId = null;
  let editingReservationId = null;

  // ---------- Utils ----------
  const debounce = (fn, wait = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const safe = (v) => (v == null ? "" : String(v));

  const formatDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("es-CL");
  };

  // ===== Historial (backup frontend) =====
  async function logHistory(entry) {
    // entry: { action, type, entityId, detail, payload? }
    try {
      await apiFetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab: "science",
          action: entry.action,
          entityType: entry.type,
          entityId: entry.entityId,
          data: entry.payload || { detail: entry.detail },
        }),
      });
    } catch (err) {
      console.warn("No se pudo registrar historial (science):", err);
    }
  }

  // ================== INVENTARIO ==================
  async function loadScienceItems() {
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
        item.codigo,
        item.nombre,
        item.descripcion,
        item.categoria,
        item.fecha,
        item.ubicacion,
      ];
      return vals.some((v) => v && String(v).toLowerCase().includes(text));
    });
  }

  function renderScienceTable() {
    scienceTableBody.innerHTML = "";

    const items = getFilteredItems();
    items.forEach((item) => {
      const qty = Number(item.cantidad ?? item.qty ?? 0);
      const lowStock = Number.isFinite(qty) && qty <= 2;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(item.id)}</td>
        <td>${safe(item.codigo)}</td>
        <td>${safe(item.nombre)}</td>
        <td>${safe(item.descripcion)}</td>
        <td>${safe(item.categoria)}</td>
        <td>
          <span style="${lowStock ? "color:#ffb4b4; font-weight:700;" : ""}">
            ${safe(item.cantidad)}
          </span>
        </td>
        <td>${safe(item.fecha)}</td>
        <td>${item.photo ? `<img src="${item.photo}" width="50" alt="Foto material" />` : ""}</td>
        <td style="display:flex; gap:.35rem; flex-wrap:wrap;">
          <button type="button" class="btn-ghost sci-edit-item" data-id="${item.id}">Editar</button>
          <button type="button" class="btn-ghost sci-delete-item" data-id="${item.id}">Eliminar</button>
        </td>
      `;

      tr.querySelector(".sci-edit-item")?.addEventListener("click", () => enterEditMode(item));

      tr.querySelector(".sci-delete-item")?.addEventListener("click", async () => {
        if (!confirm("¿Seguro que deseas eliminar este material de ciencias?")) return;

        try {
          const resp = await apiFetch(`/api/science/items/${item.id}`, { method: "DELETE" });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || "No se pudo eliminar el material.");
            return;
          }

          scienceItems = scienceItems.filter((it) => it.id !== item.id);
          renderScienceTable();

          await logHistory({
            action: "delete",
            type: "item",
            entityId: item.id,
            detail: `Eliminado material "${item.nombre || ""}" (código ${item.codigo || ""})`,
            payload: { item },
          });
        } catch (err) {
          console.error("Error al eliminar material:", err);
          alert("Ocurrió un error al eliminar el material.");
        }
      });

      scienceTableBody.appendChild(tr);
    });
  }

  function enterEditMode(item) {
    editingItemId = item.id || null;
    if (!editingItemId) return;

    sciIdInput && (sciIdInput.value = item.id || "");
    sciCodeInput && (sciCodeInput.value = item.codigo || "");
    sciNameInput && (sciNameInput.value = item.nombre || "");
    sciDescInput && (sciDescInput.value = item.descripcion || "");
    sciCatSelect && (sciCatSelect.value = item.categoria || "instrumento");
    sciQtyInput && (sciQtyInput.value = item.cantidad || "");
    sciDateInput && (sciDateInput.value = item.fecha || "");

    if (scienceFormSubmit) scienceFormSubmit.textContent = "Actualizar material";
    if (scienceFormCancelEdit) scienceFormCancelEdit.style.display = "inline-block";
  }

  function resetEditMode() {
    editingItemId = null;
    scienceForm.reset();
    sciIdInput && (sciIdInput.value = "");
    if (scienceFormSubmit) scienceFormSubmit.textContent = "Guardar material";
    if (scienceFormCancelEdit) scienceFormCancelEdit.style.display = "none";
  }

  scienceFormCancelEdit?.addEventListener("click", resetEditMode);

  scienceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(scienceForm);

    try {
      let resp;
      if (editingItemId) {
        resp = await apiFetch(`/api/science/items/${encodeURIComponent(editingItemId)}`, {
          method: "PUT",
          body: formData,
        });
      } else {
        resp = await apiFetch("/api/science/items", { method: "POST", body: formData });
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || "No se pudo guardar el material.");
        return;
      }

      const result = await resp.json();
      const item = result?.item;

      if (item) {
        if (editingItemId) {
          const idx = scienceItems.findIndex((i) => i.id === editingItemId);
          if (idx >= 0) scienceItems[idx] = item;

          await logHistory({
            action: "update",
            type: "item",
            entityId: item.id,
            detail: `Actualizado material "${item.nombre || ""}" (código ${item.codigo || ""})`,
            payload: { item },
          });
        } else {
          scienceItems.push(item);

          await logHistory({
            action: "create",
            type: "item",
            entityId: item.id,
            detail: `Ingresado material "${item.nombre || ""}" (código ${item.codigo || ""})`,
            payload: { item },
          });
        }

        renderScienceTable();
      }

      resetEditMode();
    } catch (err) {
      console.error("Error al guardar material:", err);
      alert("Ocurrió un error al guardar.");
    }
  });

  scienceSearchInput?.addEventListener("input", debounce(renderScienceTable, 200));

  // ================== PRÉSTAMOS (STOCK AUTOMÁTICO) ==================
  async function loadScienceLoans() {
    if (!loansTableBody) return;
    try {
      const resp = await apiFetch("/api/science/loans");
      if (!resp.ok) {
        console.error("Error al cargar préstamos:", resp.status);
        return;
      }
      const loans = await resp.json();
      scienceLoans = Array.isArray(loans) ? loans : [];
      renderLoansTable();
    } catch (err) {
      console.error("Error cargando préstamos:", err);
    }
  }

  function getFilteredLoans() {
    const text = (loansSearchInput?.value || "").trim().toLowerCase();
    if (!text) return [...scienceLoans];

    return scienceLoans.filter((loan) => {
      const vals = [
        loan.id,
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

    getFilteredLoans().forEach((loan) => {
      const loanId = loan.id || "";
      const codigo = loan.codigo || loan.itemCode || "";
      const nombre = loan.nombre || loan.borrowerName || "";
      const curso = loan.curso || loan.borrowerCourse || "";
      const observaciones = loan.observaciones || loan.notes || "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(loanId)}</td>
        <td>${safe(codigo)}</td>
        <td>${safe(nombre)}</td>
        <td>${safe(curso)}</td>
        <td>${formatDate(loan.loanDate)}</td>
        <td>${loan.returned ? "Sí" : "No"}</td>
        <td>${formatDate(loan.returnDate)}</td>
        <td>${safe(observaciones)}</td>
        <td>
          ${
            loan.returned
              ? ""
              : `<button type="button" class="btn-ghost sci-return-btn" data-id="${loanId}">
                   Marcar devuelto
                 </button>`
          }
        </td>
      `;

      tr.querySelector(".sci-return-btn")?.addEventListener("click", async () => {
        if (!confirm("¿Marcar este préstamo como devuelto?")) return;
        await doReturnLoan(loanId);
      });

      loansTableBody.appendChild(tr);
    });
  }

  async function doReturnLoan(loanId) {
    try {
      const resp = await apiFetch(`/api/science/return/${loanId}`, { method: "POST" });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || "No se pudo registrar la devolución.");
        return;
      }

      // Backend debe incrementar stock automáticamente
      await loadScienceLoans();
      await loadScienceItems();

      await logHistory({
        action: "return",
        type: "loan",
        entityId: loanId,
        detail: `Devolución registrada (préstamo ${loanId})`,
        payload: { loanId },
      });
    } catch (err) {
      console.error("Error devolución:", err);
      alert("Ocurrió un error al registrar la devolución.");
    }
  }

  loanForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loanForm);
    const data = Object.fromEntries(formData.entries());

    try {
      const resp = await apiFetch("/api/science/loan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        // Mensaje típico stock: "Stock insuficiente"
        alert(d.message || "No se pudo registrar el préstamo.");
        return;
      }

      const result = await resp.json();
      if (result?.loan) {
        scienceLoans.unshift(result.loan);
        renderLoansTable();

        // recargar items para ver stock ya decrementado
        await loadScienceItems();

        await logHistory({
          action: "create",
          type: "loan",
          entityId: result.loan.id,
          detail: `Préstamo creado (ID ${result.loan.id}) para ${result.loan.nombre || ""}`,
          payload: { loan: result.loan },
        });
      }

      loanForm.reset();
      loanPersonSelect && (loanPersonSelect.value = "");
      loanTipoPersonaInput && (loanTipoPersonaInput.value = "");
    } catch (err) {
      console.error("Error préstamo:", err);
      alert("Ocurrió un error al registrar el préstamo.");
    }
  });

  returnForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const loanId = returnIdInput?.value?.trim();
    if (!loanId) return alert("Debes indicar el ID del préstamo.");
    await doReturnLoan(loanId);
    returnForm.reset();
  });

  loansSearchInput?.addEventListener("input", debounce(renderLoansTable, 200));

  // ================== RESERVAS (CHOQUES + HISTORIAL) ==================
  function normalizeTime(t) {
    // "08:00" ok
    return (t || "").toString().trim();
  }

  function isOverlap(aStart, aEnd, bStart, bEnd) {
    // intervalos [start,end)
    return aStart < bEnd && bStart < aEnd;
  }

  // Validación rápida en frontend (backup), el backend igual manda 409 si choca
  function hasConflictLocal(payload) {
    const date = payload.fechaUso;
    const start = normalizeTime(payload.horaInicio);
    const end = normalizeTime(payload.horaFin);
    if (!date || !start || !end) return false;

    return scienceReservations.some((r) => {
      if (editingReservationId && String(r.id) === String(editingReservationId)) return false;
      if (String(r.fechaUso || r.date) !== String(date)) return false;

      const rs = normalizeTime(r.horaInicio);
      const re = normalizeTime(r.horaFin);
      return isOverlap(start, end, rs, re);
    });
  }

  async function loadScienceReservations() {
    if (!resTableBody) return;

    const params = [];
    if (resDateFrom?.value) params.push(`dateFrom=${encodeURIComponent(resDateFrom.value)}`);
    if (resDateTo?.value) params.push(`dateTo=${encodeURIComponent(resDateTo.value)}`);
    const qs = params.length ? `?${params.join("&")}` : "";

    try {
      const resp = await apiFetch(`/api/science/reservations${qs}`);
      if (!resp.ok) {
        console.error("Error al cargar reservas:", resp.status);
        return;
      }
      const data = await resp.json();
      scienceReservations = Array.isArray(data) ? data : [];
      renderReservationsTable();
    } catch (err) {
      console.error("Error cargando reservas:", err);
    }
  }

  function renderReservationsTable() {
    if (!resTableBody) return;
    resTableBody.innerHTML = "";

    scienceReservations
      .slice()
      .sort((a, b) => {
        const da = new Date((a.fechaUso || a.date || "") + "T" + (a.horaInicio || "00:00")).getTime();
        const db = new Date((b.fechaUso || b.date || "") + "T" + (b.horaInicio || "00:00")).getTime();
        return db - da;
      })
      .forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${safe(r.id)}</td>
          <td>${safe(r.fechaUso || r.date)}</td>
          <td>${safe(r.horaInicio)}</td>
          <td>${safe(r.horaFin)}</td>
          <td>${safe(r.solicitante)}</td>
          <td>${safe(r.curso)}</td>
          <td>${safe(r.status)}</td>
          <td>${safe(r.observaciones)}</td>
          <td style="display:flex; gap:.35rem; flex-wrap:wrap;">
            <button type="button" class="btn-ghost sci-res-edit" data-id="${r.id}">Editar</button>
            <button type="button" class="btn-ghost sci-res-del" data-id="${r.id}">Eliminar</button>
          </td>
        `;

        tr.querySelector(".sci-res-edit")?.addEventListener("click", () => enterReservationEdit(r));
        tr.querySelector(".sci-res-del")?.addEventListener("click", async () => {
          if (!confirm("¿Eliminar esta reserva?")) return;
          await deleteReservation(r.id);
        });

        resTableBody.appendChild(tr);
      });
  }

  function enterReservationEdit(r) {
    editingReservationId = r.id;
    if (resId) resId.value = r.id;

    resSolicitante && (resSolicitante.value = r.solicitante || "");
    resCurso && (resCurso.value = r.curso || "");
    resFechaUso && (resFechaUso.value = r.fechaUso || r.date || "");
    resHoraInicio && (resHoraInicio.value = r.horaInicio || "");
    resHoraFin && (resHoraFin.value = r.horaFin || "");
    resObs && (resObs.value = r.observaciones || "");
    resStatus && (resStatus.value = r.status || "pendiente");

    if (resSubmit) resSubmit.textContent = "Actualizar reserva";
    if (resCancelEdit) resCancelEdit.style.display = "inline-block";
  }

  function resetReservationEdit() {
    editingReservationId = null;
    if (resId) resId.value = "";
    resForm?.reset();
    if (resSubmit) resSubmit.textContent = "Registrar reserva";
    if (resCancelEdit) resCancelEdit.style.display = "none";
  }

  resCancelEdit?.addEventListener("click", resetReservationEdit);

  async function deleteReservation(id) {
    try {
      const resp = await apiFetch(`/api/science/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || "No se pudo eliminar la reserva.");
        return;
      }
      scienceReservations = scienceReservations.filter((x) => String(x.id) !== String(id));
      renderReservationsTable();

      await logHistory({
        action: "delete",
        type: "reservation",
        entityId: id,
        detail: `Reserva eliminada (ID ${id})`,
        payload: { reservationId: id },
      });

      resetReservationEdit();
    } catch (err) {
      console.error("Error eliminando reserva:", err);
      alert("Ocurrió un error al eliminar la reserva.");
    }
  }

  resForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      solicitante: resSolicitante?.value?.trim() || "",
      curso: resCurso?.value?.trim() || "",
      fechaUso: resFechaUso?.value || "",
      horaInicio: resHoraInicio?.value || "",
      horaFin: resHoraFin?.value || "",
      observaciones: resObs?.value?.trim() || "",
      status: resStatus?.value || "pendiente",
    };

    // Validación básica
    if (!payload.fechaUso || !payload.horaInicio || !payload.horaFin) {
      return alert("Debes indicar fecha, hora inicio y hora fin.");
    }
    if (payload.horaFin <= payload.horaInicio) {
      return alert("La hora fin debe ser mayor que la hora inicio.");
    }

    // Validación rápida local (backup)
    if (hasConflictLocal(payload)) {
      return alert("⚠️ Choque detectado: ya existe una reserva en ese rango horario.");
    }

    try {
      let resp;

      if (editingReservationId) {
        resp = await apiFetch(`/api/science/reservations/${encodeURIComponent(editingReservationId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        resp = await apiFetch(`/api/science/reservations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      // choque en backend
      if (resp.status === 409) {
        const d = await resp.json().catch(() => ({}));
        return alert(d.message || "⚠️ Choque de horario: ya existe una reserva en ese rango.");
      }

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        return alert(d.message || "No se pudo guardar la reserva.");
      }

      const result = await resp.json();
      const reservation = result?.reservation || result;

      // actualizar tabla
      await loadScienceReservations();

      await logHistory({
        action: editingReservationId ? "update" : "create",
        type: "reservation",
        entityId: reservation?.id || editingReservationId || "sin-id",
        detail: editingReservationId
          ? `Reserva actualizada (${payload.fechaUso} ${payload.horaInicio}-${payload.horaFin})`
          : `Reserva creada (${payload.fechaUso} ${payload.horaInicio}-${payload.horaFin})`,
        payload: { reservation },
      });

      resetReservationEdit();
    } catch (err) {
      console.error("Error guardando reserva:", err);
      alert("Ocurrió un error al guardar la reserva.");
    }
  });

  resDateFrom?.addEventListener("change", loadScienceReservations);
  resDateTo?.addEventListener("change", loadScienceReservations);

  btnResPDF?.addEventListener("click", () => {
    const table = document.getElementById("scienceReservationsTable");
    window.ExportUtils?.exportTableToPDF(table, "Reservas - Laboratorio de Ciencias");
  });

  btnResXLSX?.addEventListener("click", () => {
    const table = document.getElementById("scienceReservationsTable");
    window.ExportUtils?.exportTableToXLSX(table, "reservas_ciencias.xlsx", "Reservas");
  });

  // ================== PERSONAS (compartidas con Biblioteca) ==================
  async function loadSciencePeople() {
    try {
      const resp = await apiFetch("/api/library/people");
      if (!resp.ok) {
        console.error("Error al cargar personas:", resp.status);
        return;
      }
      const data = await resp.json();
      sciencePeople = Array.isArray(data) ? data : [];

      renderPeopleTable();
      fillLoanPersonSelect();
    } catch (err) {
      console.error("Error cargando personas:", err);
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

    const estudiantes = sciencePeople.filter((p) => (p.tipo || "").toLowerCase() === "estudiante");
    const funcionarios = sciencePeople.filter((p) => (p.tipo || "").toLowerCase() === "funcionario");

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

  loanPersonSelect?.addEventListener("change", () => {
    const id = loanPersonSelect.value;
    const p = sciencePeople.find((x) => x.id === id);
    if (!p) return;

    if (loanNombreInput && !loanNombreInput.value) loanNombreInput.value = p.nombre || "";
    if (loanCursoInput && !loanCursoInput.value) loanCursoInput.value = p.curso || "";
    if (loanTipoPersonaInput) loanTipoPersonaInput.value = p.tipo || "";
  });

  // ================== INICIALIZACIÓN ==================
  loadScienceItems();
  loadScienceLoans();
  loadSciencePeople();
  loadScienceReservations();
});
