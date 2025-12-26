/**
 * collapsibles.js
 * Control universal para paneles desplegables futuristas.
 * Reglas nuevas (tu solicitud):
 *  ✅ Todos los paneles parten CERRADOS por defecto
 *  ✅ Solo 1 panel abierto a la vez (modo accordion)
 *
 * Estructura esperada:
 * <div class="collapsible-card" data-collapsed="false|true">
 *   <div class="collapsible-header">
 *     <button class="collapse-toggle" aria-expanded="true|false">
 *       <span class="collapse-icon">⌄</span> Ocultar
 *     </button>
 *   </div>
 *   <div class="collapsible-body">...</div>
 * </div>
 */

document.addEventListener("DOMContentLoaded", () => {
  const collapsibleCards = Array.from(document.querySelectorAll(".collapsible-card"));
  if (!collapsibleCards.length) return;

  // ==============================
  // 1) FONDO CIRCUITO: halo mouse
  // ==============================
  // (Esto activa el efecto del CSS body::after siguiendo el mouse)
  // Si no tienes el CSS del circuito, no pasa nada.
  document.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    document.documentElement.style.setProperty("--mx", `${x}%`);
    document.documentElement.style.setProperty("--my", `${y}%`);
  });

  // ==============================
  // 2) HELPERS
  // ==============================
  function setToggleLabel(btn, isCollapsed) {
    btn.innerHTML = isCollapsed
      ? `<span class="collapse-icon">⌄</span> Mostrar`
      : `<span class="collapse-icon">⌄</span> Ocultar`;
    btn.setAttribute("aria-expanded", String(!isCollapsed));
  }

  function openCard(card, { animate = true } = {}) {
    const btn = card.querySelector(".collapse-toggle");
    const body = card.querySelector(".collapsible-body");
    if (!btn || !body) return;

    card.dataset.collapsed = "false";
    setToggleLabel(btn, false);

    // Preparar para animación
    body.style.display = "block";
    body.style.overflow = "hidden";
    body.style.opacity = "1";
    body.style.transform = "translateY(0)";

    if (!animate) {
      body.style.maxHeight = "none";
      body.style.overflow = "visible";
      return;
    }

    // Animación de altura: 0 -> scrollHeight
    body.style.maxHeight = "0px";
    // Forzar reflow para que tome el 0px antes de expandir
    body.getBoundingClientRect();

    const target = body.scrollHeight;
    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    body.style.maxHeight = `${target}px`;

    // Al terminar, dejar libre el contenido
    window.setTimeout(() => {
      body.style.maxHeight = "none";
      body.style.overflow = "visible";
    }, 270);
  }

  function closeCard(card, { animate = true } = {}) {
    const btn = card.querySelector(".collapse-toggle");
    const body = card.querySelector(".collapsible-body");
    if (!btn || !body) return;

    card.dataset.collapsed = "true";
    setToggleLabel(btn, true);

    body.style.overflow = "hidden";

    if (!animate) {
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
      body.style.transform = "translateY(-4px)";
      return;
    }

    // Si estaba en "none", debemos fijar altura actual antes de cerrar
    const currentHeight = body.scrollHeight;
    body.style.transition = "none";
    body.style.maxHeight = `${currentHeight}px`;
    body.getBoundingClientRect(); // reflow

    // Ahora sí, animar hacia 0
    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    body.style.transform = "translateY(-4px)";
  }

  function closeAllExcept(exceptCard) {
    collapsibleCards.forEach((c) => {
      if (c === exceptCard) return;
      closeCard(c, { animate: true });
    });
  }

  // ==========================================
  // 3) ESTADO INICIAL: TODO CERRADO POR DEFECTO
  // ==========================================
  // Ignoramos lo que venga en data-collapsed y partimos cerrado siempre,
  // como pediste. Luego, cuando hagas clic, se abre uno.
  collapsibleCards.forEach((card) => {
    const btn = card.querySelector(".collapse-toggle");
    const body = card.querySelector(".collapsible-body");
    if (!btn || !body) return;

    // Forzar cerrado al cargar
    card.dataset.collapsed = "true";
    setToggleLabel(btn, true);

    body.style.display = "block"; // se mantiene para medir altura cuando se necesite
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    body.style.transform = "translateY(-4px)";
    body.style.overflow = "hidden";
    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
  });

  // ==========================================
  // 4) EVENTOS: ABRIR/CERRAR + SOLO 1 ABIERTO
  // ==========================================
  collapsibleCards.forEach((card) => {
    const toggleBtn = card.querySelector(".collapse-toggle");
    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const collapsed = card.dataset.collapsed === "true";

      if (collapsed) {
        // Abrir este y cerrar todos los demás
        closeAllExcept(card);
        openCard(card, { animate: true });

        // Opcional: llevar el panel a vista (se siente premium)
        // (Si no lo quieres, lo quito después)
        window.setTimeout(() => {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      } else {
        // Cerrar este
        closeCard(card, { animate: true });
      }
    });
  });
});
