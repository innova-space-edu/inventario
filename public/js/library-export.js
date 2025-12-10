// /public/js/library-export.js
// Exporta el inventario de biblioteca a CSV usando ; como separador
// para que Excel en Chile lo abra en columnas correctas.

document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = document.getElementById('btnExportLibraryCSV');

  // Buscamos el tbody de la tabla de biblioteca en varios posibles IDs
  const libraryTableBody =
    document.getElementById('libraryTableBody') ||
    (document.querySelector('#libraryTable tbody')) ||
    (document.querySelector('#libraryItemsTable tbody'));

  if (!exportBtn || !libraryTableBody) {
    // Si no existen, no hacemos nada (evita errores)
    return;
  }

  const safe = (v) => (v == null ? '' : String(v));

  exportBtn.addEventListener('click', () => {
    // Tomamos todas las filas de la tabla (thead + tbody)
    const table = libraryTableBody.parentElement; // <table> o <tbody>.parentElement => <table>
    const rows = Array.from(table.querySelectorAll('tr'));

    if (!rows.length) {
      alert('No hay registros de biblioteca para exportar.');
      return;
    }

    const lines = rows.map((row) => {
      const cells = Array.from(row.children);
      const line = cells
        .map((cell) => {
          const text = safe(cell.innerText).replace(/\s+/g, ' ').trim();
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(';'); // IMPORTANTE: separador en ; para que Excel lo vea por columnas
      return line;
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventario_biblioteca.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
