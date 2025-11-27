// public/js/peopleUtils.js

// Función para cargar personas desde API y llenar un <select>
async function cargarPersonasEnSelect(selectElementId, includeRoles = ["Estudiante", "Funcionario"]) {
  try {
    const response = await fetch("/api/library/people");
    const personas = await response.json();

    const select = document.getElementById(selectElementId);
    select.innerHTML = ""; // limpiar

    includeRoles.forEach(rol => {
      const grupo = document.createElement("optgroup");
      grupo.label = rol + "s";

      personas
        .filter(p => p.rol === rol)
        .forEach(p => {
          const option = document.createElement("option");
          option.value = p.nombre;
          option.dataset.curso = p.curso;
          option.textContent = p.nombre;
          grupo.appendChild(option);
        });

      select.appendChild(grupo);
    });
  } catch (error) {
    console.error("Error cargando personas:", error);
  }
}

// Función para llenar campo curso al seleccionar persona
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("select.persona-select").forEach(select => {
    select.addEventListener("change", e => {
      const selected = e.target.options[e.target.selectedIndex];
      const curso = selected.dataset.curso || "";

      const cursoInput = document.querySelector(`#${e.target.dataset.cursoTarget}`);
      if (cursoInput) cursoInput.value = curso;
    });
  });
});
