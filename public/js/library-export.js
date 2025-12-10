// /public/js/library-export.js
// Exportar a CSV el inventario y los préstamos de Biblioteca

document.addEventListener('DOMContentLoaded', () => {
  const btnExportInventory = document.getElementById('btnExportLibraryCSV');
  const btnExportLoans = document.getElementById('btnExportLoansCSV');

  // Utilidad general para exportar una tabla a CSV
  function exportTableToCSV(tableElement, filename) {
    if (!tableElement) return;

    const rows = Array.from(tableElement.querySelectorAll('tr'));
    if (!rows.length) return;

    const csv = rows
      .map((row) =>
        Array.from(row.children)
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
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Exportar INVENTARIO de biblioteca
  if (btnExportInventory) {
    btnExportInventory.addEventListener('click', () => {
      const table = document.getElementById('libraryTable');
      if (!table) {
        alert('No se encontró la tabla de inventario de biblioteca.');
        return;
      }
      exportTableToCSV(table, 'inventario_biblioteca.csv');
    });
  }

  // Exportar PRÉSTAMOS de biblioteca
  if (btnExportLoans) {
    btnExportLoans.addEventListener('click', () => {
      const table = document.getElementById('loansTable');
      if (!table) {
        alert('No se encontró la tabla de préstamos de biblioteca.');
        return;
      }
      exportTableToCSV(table, 'prestamos_biblioteca.csv');
    });
  }
});
