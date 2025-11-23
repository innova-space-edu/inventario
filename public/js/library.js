// /public/js/library.js
document.addEventListener('DOMContentLoaded', () => {
  const libraryForm = document.getElementById('libraryForm');
  const libraryTableBody = document.querySelector('#libraryTable tbody');

  const loanForm = document.getElementById('loanForm');
  const returnForm = document.getElementById('returnForm');
  const loansTableBody = document.querySelector('#loansTable tbody');

  const overdueBanner = document.getElementById('libraryOverdueBanner');

  if (!libraryForm || !libraryTableBody) {
    // No estamos en la pestaña de biblioteca
    return;
  }

  // ================== HELPER HISTORIAL ==================
  async function logHistory(entry) {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          module: 'library',
          ...entry
        })
      });
    } catch (err) {
      console.error('Error registrando historial (library):', err);
    }
  }

  // ================== INVENTARIO DE BIBLIOTECA ==================

  async function loadLibraryItems() {
    try {
      const resp = await fetch('/api/library/items', {
        credentials: 'include'
      });
      if (!resp.ok) {
        console.error('Error al cargar libros:', resp.status);
        return;
      }
      const items = await resp.json();
      libraryTableBody.innerHTML = '';
      items.forEach(addItemRow);
    } catch (err) {
      console.error('Error cargando libros:', err);
    }
  }

  function addItemRow(item) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.codigo || ''}</td>
      <td>${item.titulo || ''}</td>
      <td>${item.autor || ''}</td>
      <td>${item.anio || ''}</td>
      <td>${item.serie || ''}</td>
      <td>${item.categoria || ''}</td>
      <td>${item.cantidad || ''}</td>
      <td>${item.descripcion || ''}</td>
      <td>${item.photo ? `<img src="${item.photo}" width="50" alt="Foto libro">` : ''}</td>
      <td>
        <button type="button" class="delete-button" data-id="${item.id}">Eliminar</button>
      </td>
    `;

    const deleteBtn = tr.querySelector('.delete-button');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('¿Seguro que deseas eliminar este libro del inventario?')) return;

      try {
        const resp = await fetch(`/api/library/items/${item.id}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          alert(data.message || 'No se pudo eliminar el libro.');
          return;
        }

        tr.remove();

        // Historial: eliminación de libro
        await logHistory({
          action: 'delete',
          type: 'item',
          entityId: item.id,
          detail: `Eliminado libro/material: ${item.titulo || item.codigo || '(sin título)'}`
        });
      } catch (err) {
        console.error('Error al eliminar libro:', err);
        alert('Ocurrió un error al eliminar el libro.');
      }
    });

    libraryTableBody.appendChild(tr);
  }

  libraryForm.addEventListener('submit', async e => {
    e.preventDefault();

    const formData = new FormData(libraryForm);

    try {
      const resp = await fetch('/api/library/items', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || 'No se pudo guardar el libro.');
        return;
      }

      const result = await resp.json();
      if (result && result.item) {
        addItemRow(result.item);

        // Historial: creación de libro
        await logHistory({
          action: 'create',
          type: 'item',
          entityId: result.item.id,
          detail: `Ingresado libro/material: ${result.item.titulo || result.item.codigo || '(sin título)'}`
        });
      }

      libraryForm.reset();
    } catch (err) {
      console.error('Error al guardar libro:', err);
      alert('Ocurrió un error al guardar el libro.');
    }
  });

  // ================== PRÉSTAMOS DE BIBLIOTECA ==================

  async function loadLoans() {
    if (!loansTableBody) return;
    try {
      const resp = await fetch('/api/library/loans', {
        credentials: 'include'
      });
      if (!resp.ok) {
        console.error('Error al cargar préstamos:', resp.status);
        return;
      }
      const loans = await resp.json();
      loansTableBody.innerHTML = '';
      loans.forEach(addLoanRow);

      // Actualizar banner de vencidos cada vez que recargamos préstamos
      await checkOverdueLoans();
    } catch (err) {
      console.error('Error cargando préstamos:', err);
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CL');
  }

  function addLoanRow(loan) {
    const tr = document.createElement('tr');

    const loanId = loan.id || '';
    const codigo = loan.codigo || loan.bookCode || '';
    const nombre = loan.nombre || loan.borrowerName || '';
    const curso = loan.curso || loan.borrowerCourse || '';
    const observaciones = loan.observaciones || loan.notes || '';

    tr.innerHTML = `
      <td>${loanId}</td>
      <td>${codigo}</td>
      <td>${nombre}</td>
      <td>${curso}</td>
      <td>${formatDate(loan.loanDate)}</td>
      <td>${loan.returned ? 'Sí' : 'No'}</td>
      <td>${formatDate(loan.returnDate)}</td>
      <td>${observaciones}</td>
      <td>
        ${loan.returned
          ? ''
          : `<button type="button" class="return-button" data-id="${loanId}">Marcar devuelto</button>`}
        <button type="button" class="delete-loan-button" data-id="${loanId}">Eliminar</button>
      </td>
    `;

    const returnBtn = tr.querySelector('.return-button');
    if (returnBtn) {
      returnBtn.addEventListener('click', async () => {
        if (!confirm('¿Marcar este préstamo como devuelto?')) return;

        try {
          const resp = await fetch(`/api/library/return/${loanId}`, {
            method: 'POST',
            credentials: 'include'
          });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.message || 'No se pudo registrar la devolución.');
            return;
          }

          // Historial: devolución por botón
          await logHistory({
            action: 'return',
            type: 'loan',
            entityId: loanId,
            detail: `Devolución registrada — Código: ${codigo}, Usuario: ${nombre}`
          });

          await loadLoans();
        } catch (err) {
          console.error('Error al registrar devolución:', err);
          alert('Ocurrió un error al registrar la devolución.');
        }
      });
    }

    const deleteBtn = tr.querySelector('.delete-loan-button');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('¿Seguro que deseas eliminar este préstamo del registro?')) return;

      try {
        const resp = await fetch(`/api/library/loan/${loanId}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          alert(data.message || 'No se pudo eliminar el préstamo.');
          return;
        }

        tr.remove();

        // Historial: eliminar préstamo
        await logHistory({
          action: 'delete',
          type: 'loan',
          entityId: loanId,
          detail: `Préstamo eliminado — Código: ${codigo}, Usuario: ${nombre}`
        });
      } catch (err) {
        console.error('Error al eliminar préstamo:', err);
        alert('Ocurrió un error al eliminar el préstamo.');
      }
    });

    loansTableBody.appendChild(tr);
  }

  if (loanForm) {
    loanForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(loanForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const resp = await fetch('/api/library/loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data)
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar el préstamo.');
          return;
        }

        const result = await resp.json();
        if (result && result.loan) {
          addLoanRow(result.loan);

          // Historial: crear préstamo
          await logHistory({
            action: 'create',
            type: 'loan',
            entityId: result.loan.id,
            detail: `Préstamo creado — Código: ${result.loan.codigo}, Usuario: ${result.loan.nombre}`
          });
        }

        loanForm.reset();
      } catch (err) {
        console.error('Error al registrar préstamo:', err);
        alert('Ocurrió un error al registrar el préstamo.');
      }
    });
  }

  if (returnForm) {
    returnForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(returnForm);
      const loanId = formData.get('loanId');

      if (!loanId) {
        alert('Debes indicar el ID del préstamo.');
        return;
      }

      try {
        const resp = await fetch(`/api/library/return/${loanId}`, {
          method: 'POST',
          credentials: 'include'
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo registrar la devolución.');
          return;
        }

        // Historial: devolución por formulario
        await logHistory({
          action: 'return',
          type: 'loan',
          entityId: loanId,
          detail: `Devolución registrada manualmente — ID préstamo: ${loanId}`
        });

        await loadLoans();
        returnForm.reset();
      } catch (err) {
        console.error('Error al registrar devolución:', err);
        alert('Ocurrió un error al registrar la devolución.');
      }
    });
  }

  // ================== ALERTA DE PRÉSTAMOS VENCIDOS (> 7 DÍAS) ==================

  async function checkOverdueLoans() {
    if (!overdueBanner) return;

    try {
      const resp = await fetch('/api/library/overdue', {
        credentials: 'include'
      });
      if (!resp.ok) return;

      const overdue = await resp.json();
      if (Array.isArray(overdue) && overdue.length > 0) {
        overdueBanner.textContent =
          `⚠️ Hay ${overdue.length} préstamo(s) con más de 7 días sin devolución. Revisa el listado.`;
        overdueBanner.style.display = 'block';

        // Si tienes función de voz global, la usamos
        if (typeof window.speak === 'function') {
          window.speak(
            `Atención. Hay ${overdue.length} préstamos con más de siete días sin devolución en la biblioteca.`
          );
        }
      } else {
        overdueBanner.style.display = 'none';
        overdueBanner.textContent = '';
      }
    } catch (err) {
      console.error('Error al comprobar préstamos vencidos:', err);
    }
  }

  // ================== INICIALIZACIÓN ==================
  loadLibraryItems();
  loadLoans();
  checkOverdueLoans();
});
