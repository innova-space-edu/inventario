// /public/js/history.js
// Historial mejorado con resumen legible, modal de detalles, fechas limpias, y soporte multi-módulo.

document.addEventListener('DOMContentLoaded', () => {
  const historyTableBody = document.querySelector('#historyTable tbody');
  const labFilter = document.getElementById('historyLabFilter');
  const limitFilter = document.getElementById('historyLimit');

  if (!historyTableBody) return;

  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) => fetch(url, { credentials: 'include', ...options }));

  // Fecha formateada
  function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(d);
  }

  // --------- FORMATEO INTELIGENTE DE DETALLES ----------
  function buildDetailSummary(log) {
    const data = log.data || log.details || log.payload || log.meta;

    if (!data) return '';

    // Si ya viene una frase humana
    if (typeof data === 'object' && data.detail) {
      return data.detail;
    }

    // Si viene JSON crudo con estructura de item
    try {
      const obj = typeof data === "string" ? JSON.parse(data) : data;

      // COMPUTACIÓN
      if (log.lab === "computing" && log.entityType === "item") {
        const p = [];
        if (obj.codigo) p.push(`Código ${obj.codigo}`);
        if (obj.marca) p.push(`Marca ${obj.marca}`);
        if (obj.modelo) p.push(`Modelo ${obj.modelo}`);
        if (obj.ubicacion) p.push(`Ubicación ${obj.ubicacion}`);
        if (obj.estado) p.push(`Estado ${obj.estado}`);
        return p.join(" · ") || "Actualización de equipo";
      }

      // BIBLIOTECA
      if (log.lab === "library" && log.entityType === "item") {
        const p = [];
        if (obj.codigo) p.push(`Código ${obj.codigo}`);
        if (obj.titulo) p.push(`“${obj.titulo}”`);
        if (obj.autor) p.push(`Autor ${obj.autor}`);
        if (obj.categoria) p.push(`Categoría ${obj.categoria}`);
        return p.join(" · ") || "Actualización de libro";
      }

      // LABORATORIO DE CIENCIAS
      if (log.lab === "science" && log.entityType === "item") {
        const p = [];
        if (obj.codigo) p.push(`Código ${obj.codigo}`);
        if (obj.nombre) p.push(obj.nombre);
        if (obj.categoria) p.push(`Categoría ${obj.categoria}`);
        return p.join(" · ") || "Actualización de material científico";
      }

      return JSON.stringify(obj);
    } catch {
      return String(data);
    }
  }

  // --------- MODAL PARA DETALLES COMPLETOS ----------
  function showDetailModal(obj) {
    let modal = document.getElementById("historyDetailModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "historyDetailModal";
      modal.style.position = "fixed";
      modal.style.top = 0;
      modal.style.left = 0;
      modal.style.width = "100%";
      modal.style.height = "100%";
      modal.style.background = "rgba(0,0,0,0.7)";
      modal.style.display = "flex";
      modal.style.alignItems = "center";
      modal.style.justifyContent = "center";
      modal.style.zIndex = "9999";
      modal.innerHTML = `
        <div style="
          background:#111;
          padding:20px;
          border-radius:12px;
          width:60%;
          max-height:80%;
          overflow:auto;
          color:white;
          font-family:monospace;
        ">
          <h2>Detalle del Registro</h2>
          <pre id="historyDetailContent"></pre>
          <button id="closeHistoryModal" style="
            margin-top:15px;
            padding:10px 20px;
            background:#4facfe;
            border:none;
            border-radius:8px;
            cursor:pointer;
            color:black;
            font-weight:bold;
          ">Cerrar</button>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener("click", (e) => {
        if (e.target.id === "historyDetailModal" || e.target.id === "closeHistoryModal") {
          modal.style.display = "none";
        }
      });
    }

    const pre = document.getElementById("historyDetailContent");
    pre.textContent = JSON.stringify(obj, null, 2);
    modal.style.display = "flex";
  }

  // --------- CARGA DEL HISTORIAL ----------
  async function loadHistory() {
    const lab = labFilter ? labFilter.value : "all";
    const limit = limitFilter ? limitFilter.value : "100";

    const qs = [];
    if (lab !== "all") qs.push(`lab=${lab}`);
    if (limit) qs.push(`limit=${limit}`);

    const url = "/api/history" + (qs.length ? `?${qs.join("&")}` : "");

    try {
      const resp = await apiFetch(url);
      if (!resp.ok) {
        console.error("Error al cargar historial:", resp.status);
        return;
      }

      const logs = await resp.json();
      historyTableBody.innerHTML = "";

      logs
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(log => {
          const tr = document.createElement("tr");

          const summary = buildDetailSummary(log);

          tr.innerHTML = `
            <td>${formatDate(log.createdAt)}</td>
            <td>${log.lab}</td>
            <td>${log.action}</td>
            <td>${log.entityType}</td>
            <td>${log.entityId}</td>
            <td>${log.user || ""}</td>
            <td>${summary}</td>
          `;

          tr.style.cursor = "pointer";
          tr.addEventListener("click", () => showDetailModal(log));

          historyTableBody.appendChild(tr);
        });

      if (!historyTableBody.children.length) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="7" style="text-align:center;opacity:.7;">No hay historial disponible.</td>`;
        historyTableBody.appendChild(row);
      }
    } catch (err) {
      console.error("Error cargando historial:", err);
    }
  }

  if (labFilter) labFilter.addEventListener("change", loadHistory);
  if (limitFilter) limitFilter.addEventListener("change", loadHistory);

  loadHistory();
});
