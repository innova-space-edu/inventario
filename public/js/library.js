// public/js/science.js
document.addEventListener('DOMContentLoaded', () => {
    const scienceForm = document.getElementById('scienceForm');
    const scienceTableBody = document.querySelector('#scienceTable tbody');
    const scienceReservationForm = document.getElementById('scienceReservationForm');

    // Cargar items desde API
    fetch('/api/science/items')
        .then(resp => resp.json())
        .then(items => items.forEach(addRow))
        .catch(err => console.error("Error cargando items:", err));

    // Agregar producto
    scienceForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(scienceForm);
        const response = await fetch('/api/science/items', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        addRow(result.item);
        scienceForm.reset();
    });

    // Insertar fila
    function addRow(item) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${item.codigo}</td>
            <td>${item.nombre}</td>
            <td>${item.descripcion}</td>
            <td>${item.categoria}</td>
            <td>${item.cantidad}</td>
            <td>${item.fecha}</td>
            <td>${item.photo ? `<img src="${item.photo}" width="50">` : ''}</td>
            <td><button data-id="${item.id}" class="delete-button">Eliminar</button></td>
        `;

        tr.querySelector('.delete-button').addEventListener('click', async () => {
            await fetch(`/api/science/items/${item.id}`, { method: 'DELETE' });
            tr.remove();
        });

        scienceTableBody.appendChild(tr);
    }

    // Reservas
    scienceReservationForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = Object.fromEntries(new FormData(scienceReservationForm));
        await fetch('/api/science/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        alert('Reserva registrada');
        scienceReservationForm.reset();
    });
});
