// inventario/public/js/tabs.js
// Tabs del dashboard + voz (opcional) + persistencia de pestaña

document.addEventListener("DOMContentLoaded", () => {
  const buttons = Array.from(document.querySelectorAll(".tab-button"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  if (!buttons.length || !panels.length) return;

  const STORAGE_KEY = "inventario_active_tab";

  function speakForTarget(target) {
    if (!window.innovaSpeak) return;

    if (target === "#tab-science")
      window.innovaSpeak("Has abierto el módulo de Ciencias.");
    else if (target === "#tab-computing")
      window.innovaSpeak("Has abierto la sala de Computación.");
    else if (target === "#tab-library")
      window.innovaSpeak("Has abierto la Biblioteca.");
    else if (target === "#tab-history")
      window.innovaSpeak("Has abierto el Historial de movimientos.");
  }

  function activateTabByTarget(target, { speak = false, save = true } = {}) {
    if (!target) return;

    // Botón correspondiente
    const btn = buttons.find(b => b.getAttribute("data-target") === target);
    const panel = document.querySelector(target);

    if (!btn || !panel) return;

    // Desactivar todo
    buttons.forEach(b => b.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));

    // Activar actual
    btn.classList.add("active");
    panel.classList.add("active");

    // Guardar selección
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, target);
      } catch {}
    }

    // Scroll arriba para evitar confusión de tablas
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Hablar (opcional)
    if (speak) speakForTarget(target);
  }

  // Click normal
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");
      activateTabByTarget(target, { speak: true, save: true });
    });
  });

  // Activación inicial:
  // 1) intenta restaurar del storage
  // 2) si no, usa el .active del HTML
  // 3) si no, usa el primero
  let initialTarget = null;

  try {
    initialTarget = localStorage.getItem(STORAGE_KEY);
  } catch {}

  if (!initialTarget) {
    const defaultBtn = document.querySelector(".tab-button.active");
    initialTarget = defaultBtn?.getAttribute("data-target") || null;
  }

  if (!initialTarget) {
    initialTarget = buttons[0]?.getAttribute("data-target") || null;
  }

  activateTabByTarget(initialTarget, { speak: false, save: false });
});
