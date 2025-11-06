document.addEventListener('DOMContentLoaded', () => {
    const scienceForm = document.getElementById('scienceForm');
    const scienceTableBody = document.querySelector('#scienceTable tbody');
    const scienceReservationForm = document.getElementById('scienceReservationForm');

    // Load existing items
    fetch('/config/science_items.json')
        .then(resp => resp.json().catch(() => []))
        .then(items => {
            if (Array.isArray(items)) {
                items.forEach(addRow);
            }
        });

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

    function addRow(item) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${item.codigo}</td>
            <td>${item.nombre}</td>
            <td>${item.descripcion}</td>
            <td>${item.cantidad}</td>
            <td>${item.fecha}</td>
            <td>${item.photo ? `<img src="/uploads/${item.photo}" width="50">` : ''}</td>
            <td><button data-id="${item.id}" class="delete-button">Eliminar</button></td>
        `;
        tr.querySelector('.delete-button').addEventListener('click', async () => {
            await fetch(`/api/science/items/${item.id}`, { method: 'DELETE' });
            tr.remove();
        });
        scienceTableBody.appendChild(tr);
    }

    // Reservation form
    scienceReservationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(scienceReservationForm));
        const response = await fetch('/api/science/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        alert('Reserva creada con éxito');
        scienceReservationForm.reset();
    });
});
