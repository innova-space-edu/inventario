document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('libraryForm');
  const tableBody = document.querySelector('#libraryTable tbody');
  const loanForm = document.getElementById('loanForm');
  const loanTableBody = document.getElementById('loanTableBody');
  const returnForm = document.getElementById('returnForm'); // si algún día lo agregas en HTML

  const ITEMS_API = '/api/library/items';
  const LOANS_API = '/api/library/loans';
  const CREATE_LOAN_API = '/api/library/loan';

  // ---------- CARGAR INVENTARIO DESDE BD ----------
  function loadItems() {
    fetch(ITEMS_API)
      .then(resp => resp.json())
      .then(items => {
        tableBody.innerHTML = '';
        if (Array.isArray(items)) items.forEach(addRow);
      })
      .catch(err => {
        console.error('Error cargando items de biblioteca:', err);
      });
  }

  // ---------- CARGAR PRÉSTAMOS DESDE BD ----------
  function loadLoans() {
    if (!loanTableBody) return;
    fetch(LOANS_API)
      .then(resp => resp.json())
      .then(loans => {
        loanTableBody.innerHTML = '';
        if (!Array.isArray(loans)) return;

        loans.forEach(loan => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${loan.id}</td>
            <td>${loan.bookId || loan.bookCode || ''}</td>
            <td>${loan.user || loan.userEmail || ''}</td>
            <td>${loan.loanDate ? new Date(loan.loanDate).toLocaleString() : ''}</td>
            <td>${loan.returned ? '✅' : '❌'}</td>
            <td>
              ${loan.returned ? '' : `<button class="delete-button" data-id="${loan.id}">Devolver</button>`}
            </td>
          `;

          const btn = tr.querySelector('.delete-button');
          if (btn) {
            btn.addEventListener('click', async () => {
              try {
                const resp = await fetch(`/api/library/return/${loan.id}`, {
                  method: 'POST'
                });
                if (!resp.ok) {
                  alert('No se pudo registrar la devolución.');
                  return;
                }
                loadLoans();
              } catch (err) {
                console.error('Error al registrar devolución:', err);
                alert('Error al registrar la devolución.');
              }
            });
          }

          loanTableBody.appendChild(tr);
        });
      })
      .catch(err => {
        console.error('Error cargando préstamos de biblioteca:', err);
      });
  }

  // ---------- INICIO ----------
  loadItems();
  loadLoans();

  // ---------- AL GUARDAR MATERIAL ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    try {
      const response = await fetch(ITEMS_API, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        alert('Error al guardar el material.');
        return;
      }

      const result = await response.json();
      if (result && result.item) {
        addRow(result.item);
      }
      form.reset();
    } catch (err) {
      console.error('Error al guardar material de biblioteca:', err);
      alert('Error al guardar el material.');
    }
  });

  // ---------- Agregar fila a la tabla de inventario ----------
  function addRow(item) {
    const tr = document.createElement('tr');

    const photoSrc = item.photo
      ? (item.photo.startsWith('http') ? item.photo : `/uploads/${item.photo}`)
      : '';

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
      <td>${photoSrc ? `<img src="${photoSrc}" width="50">` : ''}</td>
      <td><button data-id="${item.id}" class="delete-button">Eliminar</button></td>
    `;

    tr.querySelector('.delete-button').addEventListener('click', async () => {
      try {
        const resp = await fetch(`/api/library/items/${item.id}`, { method: 'DELETE' });
        if (!resp.ok) {
          alert('No se pudo eliminar el material.');
          return;
        }
        tr.remove();
      } catch (err) {
        console.error('Error al eliminar material de biblioteca:', err);
        alert('Error al eliminar el material.');
      }
    });

    tableBody.appendChild(tr);
  }

  // ---------- Registrar préstamo ----------
  loanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loanForm));

    try {
      const response = await fetch(CREATE_LOAN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        alert('Error al registrar el préstamo.');
        return;
      }

      await response.json();
      alert('Préstamo registrado');
      loanForm.reset();
      loadLoans();
    } catch (err) {
      console.error('Error al registrar préstamo:', err);
      alert('Error al registrar el préstamo.');
    }
  });

  // ---------- Registrar devolución por formulario opcional ----------
  if (returnForm) {
    returnForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loanId = new FormData(returnForm).get('loanId');

      try {
        const response = await fetch(`/api/library/return/${loanId}`, {
          method: 'POST'
        });

        if (!response.ok) {
          alert('Error al registrar la devolución.');
          return;
        }

        await response.json();
        alert('Devolución registrada');
        returnForm.reset();
        loadLoans();
      } catch (err) {
        console.error('Error al registrar devolución:', err);
        alert('Error al registrar la devolución.');
      }
    });
  }
});
