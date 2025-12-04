// public/js/peopleUtils.js

// Función para cargar personas desde API y llenar un <select>
// Mejorada para:
// - Usar guardedFetch si existe (sesiones / roles)
// - Soportar campos "rol" o "tipo" (backend antiguo o nuevo)
// - Usar IDs como value del <option> y guardar datos extra en data-*
// - Agrupar en "Estudiantes" y "Funcionarios" por defecto
async function cargarPersonasEnSelect(
  selectElementId,
  includeRoles = ['estudiante', 'funcionario']
) {
  try {
    const apiFetch =
      window.guardedFetch ||
      ((url, options = {}) => fetch(url, { credentials: 'include', ...options }));

    const response = await apiFetch('/api/library/people');
    if (!response.ok) {
      console.error('Error HTTP al cargar personas:', response.status);
      return;
    }

    const personas = await response.json();
    const select = document.getElementById(selectElementId);
    if (!select) {
      console.warn('No se encontró el <select> con id:', selectElementId);
      return;
    }

    // limpiar, pero dejamos una opción vacía inicial
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Escribe o selecciona una persona';
    select.appendChild(placeholder);

    // Normalizamos roles a minúsculas y definimos etiquetas
    const roleLabels = {
      estudiante: 'Estudiantes',
      funcionario: 'Funcionarios'
    };

    includeRoles.forEach(rawRol => {
      const rolNorm = String(rawRol || '').toLowerCase();
      const grupo = document.createElement('optgroup');
      grupo.label = roleLabels[rolNorm] || rawRol || 'Otros';

      personas
        .filter(p => {
          const backendRole = String(p.tipo || p.rol || '').toLowerCase();
          return backendRole === rolNorm;
        })
        .forEach(p => {
          const option = document.createElement('option');

          // Usamos el ID como value si existe; si no, el nombre
          option.value = p.id || p.nombre || '';

          // Guardamos datos extra en data-* para que otros scripts los usen
          option.dataset.curso = p.curso || '';
          option.dataset.nombre = p.nombre || '';
          option.dataset.tipo = (p.tipo || p.rol || '').toLowerCase();

          // Texto visible: "Nombre (Curso)" si tiene curso
          option.textContent = p.curso
            ? `${p.nombre} (${p.curso})`
            : p.nombre || '(sin nombre)';

          grupo.appendChild(option);
        });

      select.appendChild(grupo);
    });
  } catch (error) {
    console.error('Error cargando personas:', error);
  }
}

// Función para llenar campo curso al seleccionar persona
// Mejorada para también poder llenar nombre y tipo (si se configuran data-*)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('select.persona-select').forEach(select => {
    select.addEventListener('change', e => {
      const selected =
        e.target.options[e.target.selectedIndex] || e.target.selectedOptions[0];
      if (!selected) return;

      const curso = selected.dataset.curso || '';
      const nombre = selected.dataset.nombre || selected.value || '';
      const tipo = selected.dataset.tipo || '';

      // Compatibilidad antigua: solo cursoTarget
      const cursoTargetId = e.target.dataset.cursoTarget;
      if (cursoTargetId) {
        const cursoInput = document.querySelector(`#${cursoTargetId}`);
        if (cursoInput) cursoInput.value = curso;
      } else {
        // Versión original (por compatibilidad): busca por atributo data-curso-target en el select
        const oldCursoInput = document.querySelector(
          `#${e.target.dataset.cursoTarget}`
        );
        if (oldCursoInput) oldCursoInput.value = curso;
      }

      // NUEVO: soporte para nombreTarget y tipoTarget (por ejemplo loanNombre, loanTipoPersona)
      const nombreTargetId = e.target.dataset.nombreTarget;
      if (nombreTargetId) {
        const nombreInput = document.querySelector(`#${nombreTargetId}`);
        if (nombreInput) nombreInput.value = nombre;
      }

      const tipoTargetId = e.target.dataset.tipoTarget;
      if (tipoTargetId) {
        const tipoInput = document.querySelector(`#${tipoTargetId}`);
        if (tipoInput) tipoInput.value = tipo;
      }
    });
  });
});
