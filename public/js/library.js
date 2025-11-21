// public/js/library.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('libraryForm');
    const tableBody = document.querySelector('#libraryTableBody');
    const loanForm = document.getElementById('loanForm');
    const loanBody = document.getElementById('loanTableBody');

    // Obtener inventario desde API
    fetch('/api/library/items')
        .then(resp => resp.json())
        .then(items => items.forEach(addRow))
        .catch(err => console.error("Error cargando items:", err));

    // Agregar nuevo material
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);

        const response = await fetch('/api/library/items', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        addRow(result.item);
        form.reset();
    });

    // Mostrar items
    function addRow(item) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${item.codigo}</td>
            <td>${item.titulo}</td>
            <td>${item.autor}</td>
            <td>${item.anio}</td>
            <td>${item.serie}</td>
            <td>${item.categoria}</td>
            <td>${item.cantidad}</td>
            <td>${item.descripcion}</td>
            <td>${item.photo ? `<img src="${item.photo}" width="50">` : ''}</td>
            <td><button data-id="${item.id}" class="delete-button">Eliminar</button></td>
        `;

        tr.querySelector('.delete-button').addEventListener('click', async () => {
            await fetch(`/api/library/items/${item.id}`, { method: 'DELETE' });
            tr.remove();
        });

        tableBody.appendChild(tr);
    }

    // Obtener préstamos
    fetch('/api/library/loans')
        .then(resp => resp.json())
        .then(loans => loans.forEach(addLoan))
        .catch(err => console.error("Error cargando préstamos:", err));

    // Registrar préstamo
    loanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(loanForm));

        const response = await fetch('/api/library/loan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        addLoan(result.loan);
        loanForm.reset();
    });

    // Mostrar préstamo
    function addLoan(loan) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${loan.id}</td>
            <td>${loan.bookId || loan.bookCode || ''}</td>
            <td>${loan.user || ''}</td>
            <td>${loan.loanDate ? new Date(loan.loanDate).toLocaleString() : ''}</td>
            <td>${loan.returned ? '✔️' : '❌'}</td>
            <td>
                ${loan.returned ? '' : `<button class="return-button" data-id="${loan.id}">Devolver</button>`}
            </td>
        `;

        // Acción de devolver
        const btn = tr.querySelector('.return-button');
        if (btn) {
            btn.addEventListener('click', async () => {
                await fetch(`/api/library/return/${loan.id}`, { method: 'POST' });
                tr.remove();
            });
        }

        loanBody.appendChild(tr);
    }
});
