// /public/js/science.js
// =====================================================
// Laboratorio de Ciencias – Inventario + Préstamos + Reservas + Personas (solo lectura)
// ✅ Actualizado (FULL):
// - Fallback de endpoints (por si tu backend tiene variaciones)
// - Inventario: crear / editar / eliminar (con motivo opcional)
// - Préstamos: crear / devolver (con recarga de stock) + (opcional) eliminar
// - Reservas: crear / editar / eliminar, detección de choques (local + 409 backend)
// - Personas: lectura desde /api/library/people, select con optgroup
// - UX: debounce, safe helpers, formato de fecha es-CL, stock bajo resaltado,
//       fallback de imágenes, manejo robusto de errores, logging historial
// - Export reservas: PDF/XLSX usando window.ExportUtils (si existe)
// =====================================================

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

  const scienceTableBody =
    document.querySelector("#scienceTable tbody") ||
    document.querySelector("#scienceItemsTable tbody") ||
    document.querySelector("#itemsTable tbody");
  const scienceSearchInput = document.getElementById("scienceSearch");

  // Préstamos
  const loanForm = document.getElementById("scienceLoanForm");
  const loansTableBody =
    document.querySelector("#scienceLoansTable tbody") ||
    document.querySelector("#scienceLoanTable tbody");
  const loansSearchInput = document.getElementById("scienceLoansSearch");
  const returnForm = document.getElementById("scienceReturnForm");
  const returnIdInput = document.getElementById("scienceReturnId");

  const loanPersonSelect = document.getElementById("sciLoanPersonSelect");
  const loanNombreInput = document.getElementById("sciLoanNombre");
  const loanCursoInput = document.getElementById("sciLoanCurso");
  const loanTipoPersonaInput = document.getElementById("sciLoanTipoPersona");
  const peopleTableBody = document.querySelector("#sciencePeopleTable tbody");

  // Reservas
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
  const resTableBody =
    document.querySelector("#scienceReservationsTable tbody") ||
    document.querySelector("#reservationsTable tbody");

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

  const formatDateOnly = (d) => {
    if (!d) return "";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("es-CL");
  };

  function imageFallback(imgEl) {
    imgEl.onerror = null;
    imgEl.src = "/img/placeholder.png";
    imgEl.alt = "Sin imagen";
  }
  window.innovaImageFallback = window.innovaImageFallback || imageFallback;

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
    const res = await tryFetchJSON(
      [
        "/api/science/items",          // principal
        "/api/science/item",           // fallback
        "/api/labs/science/items",     // fallback
      ],
      { method: "GET" }
    );

    if (!res.ok) {
      console.error("Error al cargar inventario de ciencias:", res.errors);
      return;
    }

    const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
    scienceItems = Array.isArray(items) ? items : [];
    renderScienceTable();
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
      const qty = Number(item.cantidad ?? item.qty ?? item.quantity ?? 0);
      const lowStock = Number.isFinite(qty) && qty <= 2;

      const photoHtml = item.photo
        ? `<a href="${safe(item.photo)}" target="_blank" rel="noopener noreferrer">
             <img src="${safe(item.photo)}" width="50" alt="Foto material"
                  style="border-radius:8px;object-fit:cover;"
                  onerror="window.innovaImageFallback && window.innovaImageFallback(this)" />
           </a>`
        : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(item.id)}</td>
        <td>${safe(item.codigo)}</td>
        <td>${safe(item.nombre)}</td>
        <td>${safe(item.descripcion)}</td>
        <td>${safe(item.categoria)}</td>
        <td>
          <span style="${lowStock ? "color:#ffb4b4; font-weight:700;" : ""}">
            ${safe(item.cantidad ?? item.qty ?? item.quantity ?? "")}
          </span>
        </td>
        <td>${safe(item.fecha)}</td>
        <td>${photoHtml}</td>
        <td style="display:flex; gap:.35rem; flex-wrap:wrap;">
          <button type="button" class="btn-ghost sci-edit-item" data-id="${safe(item.id)}">Editar</button>
          <button type="button" class="btn-ghost sci-delete-item" data-id="${safe(item.id)}">Eliminar</button>
        </td>
      `;

      tr.querySelector(".sci-edit-item")?.addEventListener("click", () => enterEditMode(item));

      tr.querySelector(".sci-delete-item")?.addEventListener("click", async () => {
        if (!confirm("¿Seguro que deseas eliminar este material de ciencias?")) return;

        // motivo opcional (si tu backend lo ignora, no afecta)
        const motivo =
          prompt('Motivo (opcional): "daño", "pérdida", "baja", etc.')?.trim() || "";

        const res = await tryFetchJSON(
          [
            `/api/science/items/${encodeURIComponent(item.id)}`,
            `/api/science/item/${encodeURIComponent(item.id)}`,
            `/api/labs/science/items/${encodeURIComponent(item.id)}`,
          ],
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ motivo }),
          }
        );

        if (!res.ok) {
          const msg =
            res.errors?.[0]?.data?.message ||
            res.errors?.[0]?.data?.error ||
            "No se pudo eliminar el material.";
          alert(msg);
          return;
        }

        scienceItems = scienceItems.filter((it) => String(it.id) !== String(item.id));
        renderScienceTable();

        await logHistory({
          action: "delete",
          type: "item",
          entityId: item.id,
          detail: `Eliminado material "${item.nombre || ""}" (código ${item.codigo || ""})${motivo ? ` – Motivo: ${motivo}` : ""}`,
          payload: { item, motivo },
        });

        if (editingItemId && String(editingItemId) === String(item.id)) resetEditMode();
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
    sciQtyInput && (sciQtyInput.value = item.cantidad ?? item.qty ?? "");
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

  scienceFormCancelEdit?.addEventListener("click", (e) => {
    e.preventDefault();
    resetEditMode();
  });

  scienceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(scienceForm);

    try {
      let res;

      if (editingItemId) {
        res = await tryFetchJSON(
          [
            `/api/science/items/${encodeURIComponent(editingItemId)}`,
            `/api/science/item/${encodeURIComponent(editingItemId)}`,
            `/api/labs/science/items/${encodeURIComponent(editingItemId)}`,
          ],
          {
            method: "PUT",
            body: formData,
          }
        );
      } else {
        res = await tryFetchJSON(
          ["/api/science/items", "/api/science/item", "/api/labs/science/items"],
          { method: "POST", body: formData }
        );
      }

      if (!res.ok) {
        const msg =
          res.errors?.[0]?.data?.message ||
          res.errors?.[0]?.data?.error ||
          "No se pudo guardar el material.";
        alert(msg);
        return;
      }

      const result = res.data;
      const item = result?.item || result;

      if (item) {
        if (editingItemId) {
          const idx = scienceItems.findIndex((i) => String(i.id) === String(editingItemId));
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

    const res = await tryFetchJSON(
      [
        "/api/science/loans",
        "/api/science/loan",
        "/api/labs/science/loans",
      ],
      { method: "GET" }
    );

    if (!res.ok) {
      console.error("Error al cargar préstamos:", res.errors);
      return;
    }

    const loans = Array.isArray(res.data) ? res.data : res.data?.loans || [];
    scienceLoans = Array.isArray(loans) ? loans : [];
    renderLoansTable();
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

      const returnedFlag = !!(loan.returned || loan.devuelto);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(loanId)}</td>
        <td>${safe(codigo)}</td>
        <td>${safe(nombre)}</td>
        <td>${safe(curso)}</td>
        <td>${formatDate(loan.loanDate || loan.fechaPrestamo || loan.fecha_prestamo)}</td>
        <td>${returnedFlag ? "Sí" : "No"}</td>
        <td>${formatDate(loan.returnDate || loan.fechaDevolucion || loan.fecha_devolucion)}</td>
        <td>${safe(observaciones)}</td>
        <td>
          ${
            returnedFlag
              ? ""
              : `<button type="button" class="btn-ghost sci-return-btn" data-id="${safe(loanId)}">
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
    if (!loanId) return;

    const res = await tryFetchJSON(
      [
        `/api/science/return/${encodeURIComponent(loanId)}`,
        `/api/science/loans/${encodeURIComponent(loanId)}/return`,
        `/api/science/loan/${encodeURIComponent(loanId)}/return`,
        `/api/labs/science/return/${encodeURIComponent(loanId)}`,
      ],
      { method: "POST" }
    );

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        "No se pudo registrar la devolución.";
      alert(msg);
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
  }

  loanForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loanForm);
    const data = Object.fromEntries(formData.entries());

    // Si usamos personas, podemos forzar consistencia
    if (loanPersonSelect?.value) data.personaId = loanPersonSelect.value;

    const res = await tryFetchJSON(
      ["/api/science/loan", "/api/science/loans", "/api/labs/science/loan"],
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        "No se pudo registrar el préstamo.";
      alert(msg);
      return;
    }

    const result = res.data;
    const loan = result?.loan || result;

    if (loan) {
      scienceLoans.unshift(loan);
      renderLoansTable();

      // recargar items para ver stock ya decrementado
      await loadScienceItems();

      await logHistory({
        action: "create",
        type: "loan",
        entityId: loan.id,
        detail: `Préstamo creado (ID ${loan.id}) para ${loan.nombre || loan.borrowerName || ""}`,
        payload: { loan },
      });
    }

    loanForm.reset();
    if (loanPersonSelect) loanPersonSelect.value = "";
    if (loanTipoPersonaInput) loanTipoPersonaInput.value = "";
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
    return (t || "").toString().trim();
  }

  function isOverlap(aStart, aEnd, bStart, bEnd) {
    // intervalos [start,end)
    return aStart < bEnd && bStart < aEnd;
  }

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

    const res = await tryFetchJSON(
      [
        `/api/science/reservations${qs}`,
        `/api/labs/science/reservations${qs}`,
      ],
      { method: "GET" }
    );

    if (!res.ok) {
      console.error("Error al cargar reservas:", res.errors);
      return;
    }

    const data = Array.isArray(res.data) ? res.data : res.data?.reservations || [];
    scienceReservations = Array.isArray(data) ? data : [];
    renderReservationsTable();
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
            <button type="button" class="btn-ghost sci-res-edit" data-id="${safe(r.id)}">Editar</button>
            <button type="button" class="btn-ghost sci-res-del" data-id="${safe(r.id)}">Eliminar</button>
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

  resCancelEdit?.addEventListener("click", (e) => {
    e.preventDefault();
    resetReservationEdit();
  });

  async function deleteReservation(id) {
    if (!id) return;

    const motivo = prompt('Motivo (opcional): "anulada", "error", etc.')?.trim() || "";

    const res = await tryFetchJSON(
      [
        `/api/science/reservations/${encodeURIComponent(id)}`,
        `/api/labs/science/reservations/${encodeURIComponent(id)}`,
      ],
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      }
    );

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        "No se pudo eliminar la reserva.";
      alert(msg);
      return;
    }

    scienceReservations = scienceReservations.filter((x) => String(x.id) !== String(id));
    renderReservationsTable();

    await logHistory({
      action: "delete",
      type: "reservation",
      entityId: id,
      detail: `Reserva eliminada (ID ${id})${motivo ? ` – Motivo: ${motivo}` : ""}`,
      payload: { reservationId: id, motivo },
    });

    resetReservationEdit();
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

    if (!payload.fechaUso || !payload.horaInicio || !payload.horaFin) {
      return alert("Debes indicar fecha, hora inicio y hora fin.");
    }
    if (payload.horaFin <= payload.horaInicio) {
      return alert("La hora fin debe ser mayor que la hora inicio.");
    }

    if (hasConflictLocal(payload)) {
      return alert("⚠️ Choque detectado: ya existe una reserva en ese rango horario.");
    }

    let res;
    if (editingReservationId) {
      res = await tryFetchJSON(
        [
          `/api/science/reservations/${encodeURIComponent(editingReservationId)}`,
          `/api/labs/science/reservations/${encodeURIComponent(editingReservationId)}`,
        ],
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
    } else {
      res = await tryFetchJSON(
        ["/api/science/reservations", "/api/labs/science/reservations"],
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
    }

    // choque en backend (si alguno devolvió 409)
    const err409 = res.ok ? null : res.errors?.find((e) => e.status === 409);
    if (err409) {
      return alert(err409.data?.message || "⚠️ Choque de horario: ya existe una reserva en ese rango.");
    }

    if (!res.ok) {
      const msg =
        res.errors?.[0]?.data?.message ||
        res.errors?.[0]?.data?.error ||
        "No se pudo guardar la reserva.";
      alert(msg);
      return;
    }

    const result = res.data;
    const reservation = result?.reservation || result;

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
  });

  resDateFrom?.addEventListener("change", loadScienceReservations);
  resDateTo?.addEventListener("change", loadScienceReservations);

  btnResPDF?.addEventListener("click", () => {
    const table = document.getElementById("scienceReservationsTable");
    if (!window.ExportUtils?.exportTableToPDF) {
      return alert("No está disponible ExportUtils.exportTableToPDF en esta página.");
    }
    window.ExportUtils.exportTableToPDF(table, "Reservas - Laboratorio de Ciencias");
  });

  btnResXLSX?.addEventListener("click", () => {
    const table = document.getElementById("scienceReservationsTable");
    if (!window.ExportUtils?.exportTableToXLSX) {
      return alert("No está disponible ExportUtils.exportTableToXLSX en esta página.");
    }
    window.ExportUtils.exportTableToXLSX(table, "reservas_ciencias.xlsx", "Reservas");
  });

  // ================== PERSONAS (compartidas con Biblioteca) ==================
  async function loadSciencePeople() {
    const res = await tryFetchJSON(
      ["/api/library/people", "/api/people", "/api/school/people"],
      { method: "GET" }
    );

    if (!res.ok) {
      console.error("Error al cargar personas:", res.errors);
      return;
    }

    const data = Array.isArray(res.data) ? res.data : res.data?.people || [];
    sciencePeople = Array.isArray(data) ? data : [];

    renderPeopleTable();
    fillLoanPersonSelect();
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

  loanPersonSelect?.addEventListener("change", () => {
    const id = loanPersonSelect.value;
    const p = sciencePeople.find((x) => String(x.id) === String(id));
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
