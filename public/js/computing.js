// ======================================================================
//   Inventario – Sala de Computación (Versión limpia, moderna y final)
//   Totalmente compatible con index.html actualizado
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  // ====================================================================
  //  REFERENCIAS DEL DOM
  // ====================================================================
  const form = document.getElementById("computingForm");
  const tableBody = document.querySelector("#computingTable tbody");
  const searchInput = document.getElementById("computingSearch");

  const loanForm = document.getElementById("computingLoanForm");
  const loanTableBody = document.querySelector("#computingLoanTable tbody");
  const debtorsList = document.getElementById("computingLoanDebtorsList");

  // Campos principales del inventario
  const f_idEquip = document.getElementById("compIdEquip");
  const f_codigo = document.getElementById("compCodigo");
  const f_tipo = document.getElementById("compTipoActivo");
  const f_subtipo = document.getElementById("compSubtipo");
  const f_detalle = document.getElementById("compDetalleTipo");
  const f_marca = document.getElementById("compMarca");
  const f_modelo = document.getElementById("compModelo");
  const f_serie = document.getElementById("compSerie");
  const f_cantidad = document.getElementById("compCantidad");

  const f_cpu = document.getElementById("compCPU");
  const f_ram = document.getElementById("compRAM");
  const f_so = document.getElementById("compSO");
  const f_versionSO = document.getElementById("compVersionSO");

  const f_fechaCompra = document.getElementById("compFechaCompra");
  const f_ubicacion = document.getElementById("compUbicacion");
  const f_estado = document.getElementById("compEstado");
  const f_fechaActualizacion = document.getElementById("compFechaActualizacion");
  const f_descripcion = document.getElementById("compDescripcion");

  const f_foto = document.getElementById("compFoto");

  // Prestamos
  const p_id = document.getElementById("prestIdEquip");
  const p_codigo = document.getElementById("prestCodigo");
  const p_solicitante = document.getElementById("prestSolicitante");
  const p_curso = document.getElementById("prestCurso");
  const p_observaciones = document.getElementById("prestObservaciones");

  // Estado interno
  let items = [];
  let loans = [];

  let editingId = null;

  // Utilidades
  const safe = v => (v == null ? "" : String(v));
  const api = (u, o = {}) => fetch(u, { credentials: "include", ...o });

  const formatDate = d => {
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleDateString("es-CL");
  };
  const formatDateTime = d => {
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleString("es-CL");
  };

  // ====================================================================
  //  CARGA INVENTARIO
  // ====================================================================
  async function loadItems() {
    const r = await api("/api/computing/items");
    items = await r.json();
    renderItems();
  }

  function renderItems() {
    tableBody.innerHTML = "";

    const txt = searchInput.value.trim().toLowerCase();
    const filtered = !txt
      ? items
      : items.filter(it =>
          Object.values(it).some(v =>
            String(v).toLowerCase().includes(txt)
          )
        );

    filtered.forEach(it => {
      const tr = document.createElement("tr");

      const img = it.photo
        ? `<img src="${it.photo}" style="width:50px;height:50px;border-radius:6px;object-fit:cover;">`
        : "";

      tr.innerHTML = `
        <td>${it.id}</td>
        <td>${safe(it.idEquip)}</td>
        <td>${safe(it.codigo)}</td>
        <td>${safe(it.tipoActivo)}</td>
        <td>${safe(it.subtipo)}</td>
        <td>${safe(it.detalleTipo)}</td>
        <td>${safe(it.marca)}</td>
        <td>${safe(it.modelo)}</td>
        <td>${safe(it.cpu)}</td>
        <td>${safe(it.memoriaRam)}</td>
        <td>${safe(it.sistemaOperativo)}</td>
        <td>${safe(it.soVersion)}</td>
        <td>${safe(it.serie)}</td>
        <td>${safe(it.cantidad)}</td>
        <td>${safe(it.ubicacion)}</td>
        <td>${safe(it.estado)}</td>
        <td>${formatDate(it.fechaCompra)}</td>
        <td>${formatDate(it.fechaActualizacion)}</td>
        <td>${safe(it.descripcion)}</td>
        <td>${img}</td>
        <td>
          <button class="edit">Editar</button>
          <button class="del">Eliminar</button>
        </td>
      `;

      tr.querySelector(".edit").onclick = () => enterEdit(it);
      tr.querySelector(".del").onclick = () => deleteItem(it.id);

      tableBody.appendChild(tr);
    });
  }

  // ====================================================================
  //  MODO EDICIÓN
  // ====================================================================
  function enterEdit(it) {
    editingId = it.id;

    f_idEquip.value = it.idEquip;
    f_codigo.value = it.codigo;
    f_tipo.value = it.tipoActivo;
    f_subtipo.value = it.subtipo;
    f_detalle.value = it.detalleTipo;
    f_marca.value = it.marca;
    f_modelo.value = it.modelo;
    f_serie.value = it.serie;
    f_cantidad.value = it.cantidad;

    f_cpu.value = it.cpu;
    f_ram.value = it.memoriaRam;
    f_so.value = it.sistemaOperativo;
    f_versionSO.value = it.soVersion;

    f_fechaCompra.value = it.fechaCompra?.substring(0, 10) ?? "";
    f_ubicacion.value = it.ubicacion;
    f_estado.value = it.estado;

    f_fechaActualizacion.value = it.fechaActualizacion?.substring(0, 10) ?? "";
    f_descripcion.value = it.descripcion ?? "";
  }

  // ====================================================================
  //  GUARDAR ITEM
  // ====================================================================
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const fd = new FormData(form);

    let r;
    if (editingId) {
      r = await api(`/api/computing/items/${editingId}`, {
        method: "PUT",
        body: fd
      });
    } else {
      r = await api("/api/computing/items", {
        method: "POST",
        body: fd
      });
    }

    const res = await r.json();
    editingId = null;
    form.reset();

    await loadItems();
  });

  // ====================================================================
  //  ELIMINAR ITEM
  // ====================================================================
  async function deleteItem(id) {
    if (!confirm("¿Eliminar este equipo?")) return;
    await api(`/api/computing/items/${id}`, { method: "DELETE" });
    await loadItems();
  }

  // ====================================================================
  //  AUTO-COMPLETADO EN PRÉSTAMO
  // ====================================================================
  function autoFillLoan(by) {
    const value = by.value.trim().toLowerCase();
    if (!value) return;

    const found = items.find(
      it =>
        it.idEquip?.toLowerCase() === value ||
        it.codigo?.toLowerCase() === value
    );

    if (!found) return;

    p_id.value = found.idEquip;
    p_codigo.value = found.codigo;
  }

  p_id.addEventListener("input", () => autoFillLoan(p_id));
  p_codigo.addEventListener("input", () => autoFillLoan(p_codigo));

  // ====================================================================
  //  REGISTRAR PRÉSTAMO
  // ====================================================================
  loanForm.addEventListener("submit", async e => {
    e.preventDefault();

    const data = {
      idEquip: p_id.value,
      codigo: p_codigo.value,
      solicitante: p_solicitante.value,
      curso: p_curso.value,
      observaciones: p_observaciones.value
    };

    const r = await api("/api/computing/loan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    await loadLoans();
    loanForm.reset();
    loadItems(); // actualizar cantidades
  });

  // ====================================================================
  //  CARGAR PRÉSTAMOS
  // ====================================================================
  async function loadLoans() {
    const r = await api("/api/computing/loans");
    loans = await r.json();
    renderLoans();
    renderDebtors();
  }

  function renderLoans() {
    loanTableBody.innerHTML = "";

    loans.forEach(l => {
      const overdue = isOverdue(l);

      const tr = document.createElement("tr");
      tr.className = overdue ? "row-overdue" : "";

      tr.innerHTML = `
        <td>${safe(l.codigo)}</td>
        <td>${safe(l.detalle || l.itemDetail || "")}</td>
        <td>${safe(l.solicitante)}</td>
        <td>${safe(l.curso)}</td>
        <td>${safe(l.observaciones)}</td>
        <td>${formatDateTime(l.loanDate)}</td>
        <td>${l.returned ? "Sí" : "No"}</td>
        <td>${l.returnDate ? formatDateTime(l.returnDate) : ""}</td>
        <td>${!l.returned ? `<button class="r">Devolver</button>` : ""}</td>
      `;

      const btn = tr.querySelector(".r");
      if (btn) btn.onclick = () => returnLoan(l.id);

      loanTableBody.appendChild(tr);
    });
  }

  async function returnLoan(id) {
    await api(`/api/computing/return/${id}`, { method: "POST" });
    await loadLoans();
    await loadItems();
  }

  function isOverdue(l) {
    const dt = new Date(l.loanDate);
    const diff = (Date.now() - dt) / (1000 * 60 * 60 * 24);
    return !l.returned && diff > 7;
  }

  // ====================================================================
  //  DEUDORES
  // ====================================================================
  function renderDebtors() {
    debtorsList.innerHTML = "";

    const pending = loans.filter(l => !l.returned);

    if (!pending.length) {
      debtorsList.innerHTML = "<li>No hay deudores</li>";
      return;
    }

    const map = new Map();

    pending.forEach(l => {
      const key = `${l.solicitante}|${l.curso}`;
      if (!map.has(key)) map.set(key, { count: 0, overdue: 0 });

      const obj = map.get(key);
      obj.count++;
      if (isOverdue(l)) obj.overdue++;
      map.set(key, obj);
    });

    for (const [k, v] of map.entries()) {
      const [name, course] = k.split("|");
      const li = document.createElement("li");
      li.textContent = `${name} (${course}): ${v.count} equipos — ${v.overdue} vencidos`;
      debtorsList.appendChild(li);
    }
  }

  // ====================================================================
  // INICIO
  // ====================================================================
  loadItems();
  loadLoans();
});

