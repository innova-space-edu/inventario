// /public/js/exportUtils.js
// Exportación simple a PDF y XLSX desde tablas HTML

(function () {
  function tableToMatrix(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    return rows.map((r) =>
      Array.from(r.children).map((c) => (c.innerText || "").trim())
    );
  }

  function exportTableToPDF(tableEl, title = "Reporte") {
    if (!tableEl) return;

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      alert("jsPDF no está cargado.");
      return;
    }

    const doc = new jsPDF("p", "pt");
    doc.setFontSize(14);
    doc.text(title, 40, 40);

    const head = [];
    const body = [];

    const matrix = tableToMatrix(tableEl);
    if (!matrix.length) return;

    head.push(matrix[0]);
    matrix.slice(1).forEach((r) => body.push(r));

    doc.autoTable({
      head,
      body,
      startY: 60,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
      margin: { left: 40, right: 40 },
    });

    doc.save(`${title}.pdf`);
  }

  function exportTableToXLSX(tableEl, filename = "reporte.xlsx", sheetName = "Datos") {
    if (!tableEl) return;
    if (!window.XLSX) {
      alert("SheetJS (XLSX) no está cargado.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(tableToMatrix(tableEl));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }

  window.ExportUtils = {
    exportTableToPDF,
    exportTableToXLSX,
  };
})();
