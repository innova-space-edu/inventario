// inventario/public/js/tabs.js

document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');

  // === Función para activar pestaña y hablar ===
  function activateTab(btn, speakOnLoad = false) {
    const target = btn.getAttribute('data-target');

    // Desactivar todo
    buttons.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    // Activar actual
    btn.classList.add('active');
    const panel = document.querySelector(target);
    if (panel) panel.classList.add('active');

    // Scroll al inicio para evitar confusiones
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Que MIRA hable al cargar pestaña
    if (window.innovaSpeak) {
      if (target === '#tab-science')
        window.innovaSpeak('Has abierto el módulo de Ciencias.');
      else if (target === '#tab-computing')
        window.innovaSpeak('Has abierto la sala de Computación.');
      else if (target === '#tab-library')
        window.innovaSpeak('Has abierto la Biblioteca.');
      else if (target === '#tab-history')
        window.innovaSpeak('Has abierto el Historial de movimientos.');
    }
  }

  // === Evento normal de click ===
  buttons.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn));
  });

  // === Activar pestaña por defecto y hablar SI corresponde ===
  const defaultBtn = document.querySelector('.tab-button.active');
  if (defaultBtn) {
    activateTab(defaultBtn, true);
  }
});
