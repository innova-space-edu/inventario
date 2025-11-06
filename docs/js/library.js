document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('libraryForm');
    const tableBody = document.querySelector('#libraryTable tbody');
    const loanForm = document.getElementById('loanForm');
    const returnForm = document.getElementById('returnForm');

    // Cargar inventario existente
    fetch('/config/library_items.json')
        .then(resp => resp.json().catch(() => []))
        .then(items => {
            if (Array.isArray(items)) items.forEach(addRow);
        });

    // Envío de formulario
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

    // Agregar fila a la tabla
    function addRow(item) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${item.codigo}</td>
            <td>${item.titulo}</td>
            <td>${item.autor}</td>
            <td>${item.anio}</td>
            <td>${item.serie}</td>
            <td>${item.categoria || ''}</td>
            <td>${item.cantidad}</td>
            <td>${item.descripcion}</td>
            <td>${item.photo ? `<img src="/uploads/${item.photo}" width="50">` : ''}</td>
            <td><button data-id="${item.id}" class="delete-button">Eliminar</button></td>
        `;
        tr.querySelector('.delete-button').addEventListener('click', async () => {
            await fetch(`/api/library/items/${item.id}`, { method: 'DELETE' });
            tr.remove();
        });
        tableBody.appendChild(tr);
    }

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
        alert('Préstamo registrado');
        loanForm.reset();
    });

    // Registrar devolución
    returnForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loanId = new FormData(returnForm).get('loanId');
        const response = await fetch(`/api/library/return/${loanId}`, {
            method: 'POST'
        });
        const result = await response.json();
        alert('Devolución registrada');
        returnForm.reset();
    });
});
