// /public/js/library_people.js
// Gestión de estudiantes y funcionarios para Biblioteca
// - Carga lista de personas desde la API /api/library/people
//   (si falla, usa /config/library_people.json como respaldo).
// - Rellena el select de préstamos (#loanPersonSelect).
// - Auto-completa Nombre y Curso al seleccionar una persona.
// - Incluye lógica preparada para un futuro panel de administración
//   (#libraryPeopleTable, #peopleForm, etc.), pero funciona aunque
//   esos elementos no existan todavía.

document.addEventListener('DOMContentLoaded', () => {
  // ================== REFERENCIAS BÁSICAS ==================
  const loanPersonSelect = document.getElementById('loanPersonSelect');
  const loanNombreInput = document.getElementById('loanNombre');
  const loanCursoInput = document.getElementById('loanCurso');

  // (Opcionales para el panel de administración de personas)
  const peopleTableBody = document.querySelector('#libraryPeopleTable tbody');
  const peopleForm = document.getElementById('peopleForm');
  const peopleSearchInput = document.getElementById('peopleSearch');

  // Helper unificado para API (igual que en otros módulos)
  const apiFetch =
    window.guardedFetch ||
    ((url, options = {}) =>
      fetch(url, { credentials: 'include', ...options }));

  // Estado local de personas
  let libraryPeople = [];
  let peopleFilterText = '';

  // ================== CARGA DE PERSONAS ==================

  async function loadPeople() {
    try {
      // 1) Intentar API (base de datos + backup JSON)
      const resp = await apiFetch('/api/library/people');
      if (!resp.ok) throw new Error('API /api/library/people no disponible');
      const data = await resp.json();
      libraryPeople = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('No se pudo cargar desde /api/library/people, usando /config/library_people.json:', err);
      // 2) Respaldo estático desde JSON
      try {
        const resp2 = await fetch('/config/library_people.json');
        if (!resp2.ok) throw new Error('No se pudo cargar library_people.json');
        const data2 = await resp2.json();
        libraryPeople = Array.isArray(data2) ? data2 : [];
      } catch (err2) {
        console.error('Error cargando personas desde JSON de respaldo:', err2);
        libraryPeople = [];
      }
    }

    renderLoanSelect();
    renderPeopleTable(); // solo tendrá efecto si existen los elementos del panel
  }

  // ================== SELECT DE PRÉSTAMOS ==================

  function renderLoanSelect() {
    if (!loanPersonSelect) return;

    // Limpiamos opciones actuales
    loanPersonSelect.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Escribe o selecciona una persona';
    loanPersonSelect.appendChild(defaultOpt);

    // Separar por tipo para mostrar optgroups
    const estudiantes = libraryPeople.filter(p => (p.tipo || '').toLowerCase() === 'estudiante');
    const funcionarios = libraryPeople.filter(p => (p.tipo || '').toLowerCase() === 'funcionario');

    if (estudiantes.length > 0) {
      const ogEst = document.createElement('optgroup');
      ogEst.label = 'Estudiantes';
      estudiantes.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        // Ej: "Ana Pérez (7°A)"
        const cursoLabel = p.curso ? ` (${p.curso})` : '';
        opt.textContent = `${p.nombre || p.id}${cursoLabel}`;
        ogEst.appendChild(opt);
      });
      loanPersonSelect.appendChild(ogEst);
    }

    if (funcionarios.length > 0) {
      const ogFunc = document.createElement('optgroup');
      ogFunc.label = 'Funcionarios';
      funcionarios.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        // Ej: "María López (Bibliotecaria)"
        const cursoLabel = p.curso ? ` (${p.curso})` : '';
        opt.textContent = `${p.nombre || p.id}${cursoLabel}`;
        ogFunc.appendChild(opt);
      });
      loanPersonSelect.appendChild(ogFunc);
    }
  }

  function attachLoanSelectListener() {
    if (!loanPersonSelect) return;

    loanPersonSelect.addEventListener('change', () => {
      const personId = loanPersonSelect.value;
      const p = libraryPeople.find(x => x.id === personId);

      if (!p) {
        // Si no existe (o se limpia el select), no sobreescribimos
        // manualmente lo que haya escrito el usuario, solo salimos.
        return;
      }

      if (loanNombreInput) {
        loanNombreInput.value = p.nombre || '';
      }
      if (loanCursoInput) {
        loanCursoInput.value = p.curso || '';
      }
    });
  }

  // ================== PANEL DE ADMINISTRACIÓN (OPCIONAL) ==================
  // Estos métodos se usan solo si más adelante agregas en el HTML:
  //
  //  - Una tabla:
  //      <table id="libraryPeopleTable">
  //        <tbody> ... </tbody>
  //      </table>
  //
  //  - Un formulario:
  //      <form id="peopleForm">
  //        <input type="hidden" name="id" id="personId" />
  //        <input type="text"   name="nombre" id="personNombre" />
  //        <select name="tipo"  id="personTipo">...</select>
  //        <input type="text"   name="curso" id="personCurso" />
  //      </form>
  //
  // El script funcionará igual aunque todavía no existan estos elementos.

  function getFilteredPeople() {
    let items = [...libraryPeople];
    if (peopleFilterText.trim()) {
      const text = peopleFilterText.toLowerCase();
      items = items.filter(p => {
        const values = [
          p.id,
          p.nombre,
          p.tipo,
          p.curso
        ];
        return values.some(v => v && String(v).toLowerCase().includes(text));
      });
    }
    return items;
  }

  function renderPeopleTable() {
    if (!peopleTableBody) return; // Aún no existe el panel, salimos

    peopleTableBody.innerHTML = '';

    const people = getFilteredPeople();

    people.forEach(p => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${p.nombre || ''}</td>
        <td>${p.tipo || ''}</td>
        <td>${p.curso || ''}</td>
        <td>
          <button type="button" class="btn-ghost btn-small" data-action="edit" data-id="${p.id}">Editar</button>
          <button type="button" class="btn-danger btn-small" data-action="delete" data-id="${p.id}">Eliminar</button>
        </td>
      `;

      const editBtn = tr.querySelector('[data-action="edit"]');
      const delBtn = tr.querySelector('[data-action="delete"]');

      if (editBtn) {
        editBtn.addEventListener('click', () => fillPeopleForm(p.id));
      }
      if (delBtn) {
        delBtn.addEventListener('click', () => deletePerson(p.id));
      }

      peopleTableBody.appendChild(tr);
    });
  }

  function fillPeopleForm(personId) {
    if (!peopleForm) return;

    const formData = new FormData(peopleForm);
    const person = libraryPeople.find(p => p.id === personId);
    if (!person) return;

    // Si el form tiene estos campos, los llenamos
    const idField = peopleForm.querySelector('[name="id"]');
    const nombreField = peopleForm.querySelector('[name="nombre"]');
    const tipoField = peopleForm.querySelector('[name="tipo"]');
    const cursoField = peopleForm.querySelector('[name="curso"]');

    if (idField) idField.value = person.id || '';
    if (nombreField) nombreField.value = person.nombre || '';
    if (tipoField) tipoField.value = person.tipo || '';
    if (cursoField) cursoField.value = person.curso || '';
  }

  async function deletePerson(personId) {
    if (!personId) return;
    const ok = confirm('¿Seguro que deseas eliminar esta persona del registro?');
    if (!ok) return;

    try {
      const resp = await apiFetch(`/api/library/people/${encodeURIComponent(personId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        alert(d.message || 'No se pudo eliminar la persona.');
        return;
      }

      // Eliminamos localmente y volvemos a pintar
      libraryPeople = libraryPeople.filter(p => p.id !== personId);
      renderPeopleTable();
      renderLoanSelect(); // también actualizamos el select de préstamos
    } catch (err) {
      console.error('Error al eliminar persona:', err);
      alert('Ocurrió un error al eliminar la persona.');
    }
  }

  function attachPeopleSearchListener() {
    if (!peopleSearchInput) return;

    peopleSearchInput.addEventListener('input', () => {
      peopleFilterText = peopleSearchInput.value || '';
      renderPeopleTable();
    });
  }

  function attachPeopleFormListener() {
    if (!peopleForm) return;

    peopleForm.addEventListener('submit', async e => {
      e.preventDefault();

      const formData = new FormData(peopleForm);
      const data = Object.fromEntries(formData.entries());

      // Normalizamos campos
      const id = (data.id || '').trim();
      const nombre = (data.nombre || '').trim();
      const tipo = (data.tipo || '').trim().toLowerCase();
      const curso = (data.curso || '').trim();

      if (!nombre) {
        alert('El nombre es obligatorio.');
        return;
      }
      if (!tipo) {
        alert('Debes seleccionar el tipo (estudiante o funcionario).');
        return;
      }
      if (tipo === 'estudiante' && !curso) {
        alert('Para estudiantes, el curso es obligatorio.');
        return;
      }

      const payload = { nombre, tipo, curso };

      try {
        let resp;
        let message;

        if (id) {
          // Actualizar persona existente
          resp = await apiFetch(`/api/library/people/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          message = 'Persona actualizada';
        } else {
          // Crear persona nueva
          payload.id = undefined; // el servidor puede generar el id
          resp = await apiFetch('/api/library/people', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          message = 'Persona creada';
        }

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          alert(d.message || 'No se pudo guardar la persona.');
          return;
        }

        const result = await resp.json().catch(() => ({}));
        if (result && result.person) {
          // Actualizar array local:
          const idx = libraryPeople.findIndex(p => p.id === result.person.id);
          if (idx >= 0) {
            libraryPeople[idx] = result.person;
          } else {
            libraryPeople.push(result.person);
          }
        } else {
          // Si el backend no devuelve la persona, recargamos todo por seguridad
          await loadPeople();
        }

        // Refrescamos vistas
        renderPeopleTable();
        renderLoanSelect();

        // Limpiar formulario
        peopleForm.reset();
        const idField = peopleForm.querySelector('[name="id"]');
        if (idField) idField.value = '';

        if (message) {
          console.log(message);
        }
      } catch (err) {
        console.error('Error al guardar persona:', err);
        alert('Ocurrió un error al guardar la persona.');
      }
    });
  }

  // ================== INICIALIZACIÓN ==================
  loadPeople();
  attachLoanSelectListener();
  attachPeopleFormListener();
  attachPeopleSearchListener();
});
