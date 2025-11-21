// public/js/computing.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('computingForm');
    const tableBody = document.querySelector('#computingTable tbody');
    const reservationForm = document.getElementById('computingReservationForm');

    // Obtener inventario desde API (ya no desde JSON)
    fetch('/api/computing/items')
        .then(resp => resp.json())
        .then(items => {
            items.forEach(addRow);
        })
        .catch(err => console.error("Error cargando items:", err));

    // Envío de formulario (formData con foto)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);

        const response = await fetch('/api/computing/items', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        addRow(result.item);
        form.reset();
    });

    // Renderizar fila en tabla
    function addRow(item) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${item.idEquip || ''}</td>
            <td>${item.codigo || ''}</td>
            <td>${item.marca || ''}</td>
            <td>${item.modelo || ''}</td>
            <td>${item.anio || ''}</td>
            <td>${item.serie || ''}</td>
            <td>${item.categoria || ''}</td>
            <td>${item.descripcion || ''}</td>
            <td>${item.photo ? `<img src="${item.photo}" width="50">` : ''}</td>
            <td><button class="delete-button" data-id="${item.id}">Eliminar</button></td>
        `;

        tr.querySelector('.delete-button').addEventListener('click', async () => {
            await fetch(`/api/computing/items/${item.id}`, { method: 'DELETE' });
            tr.remove();
        });

        tableBody.appendChild(tr);
    }

    // Reservas de laboratorio
    reservationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(reservationForm));

        await fetch('/api/computing/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        alert('Reserva registrada correctamente.');
        reservationForm.reset();
    });
});
