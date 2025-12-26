/**
 * collapsibles.js
 * Control universal para paneles desplegables futuristas.
 *
 * Reglas (tu solicitud):
 *  ✅ Todos los paneles parten CERRADOS por defecto
 *  ✅ Solo 1 panel abierto a la vez (modo accordion)
 *
 * Mejoras incluidas en esta versión:
 *  ✅ No rompe si faltan partes del DOM (toggle/body)
 *  ✅ Animación robusta usando transitionend (sin depender de setTimeout)
 *  ✅ Evita “saltos” cuando el contenido cambia de alto después de abrir
 *  ✅ Respeta prefers-reduced-motion (accesibilidad)
 *  ✅ Click en el header (opcional) también puede alternar (si quieres)
 *
 * Estructura esperada:
 * <div class="collapsible-card" data-collapsed="false|true">
 *   <div class="collapsible-header">
 *     <button class="collapse-toggle" aria-expanded="true|false">
 *       <span class="collapse-icon">⌄</span> Mostrar/Ocultar
 *     </button>
 *   </div>
 *   <div class="collapsible-body">...</div>
 * </div>
 */

document.addEventListener("DOMContentLoaded", () => {
  const collapsibleCards = Array.from(document.querySelectorAll(".collapsible-card"));
  if (!collapsibleCards.length) return;

  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ==============================
  // 1) FONDO CIRCUITO: halo mouse
  // ==============================
  // (Esto activa el efecto del CSS usando variables --mx/--my si existen)
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
    if (!btn) return;
    btn.innerHTML = isCollapsed
      ? `<span class="collapse-icon">⌄</span> Mostrar`
      : `<span class="collapse-icon">⌄</span> Ocultar`;
    btn.setAttribute("aria-expanded", String(!isCollapsed));
  }

  function getParts(card) {
    const btn = card.querySelector(".collapse-toggle");
    const body = card.querySelector(".collapsible-body");
    return { btn, body };
  }

  function isCollapsed(card) {
    return card.dataset.collapsed === "true";
  }

  function stopCurrentTransition(body) {
    if (!body) return;
    body.style.transition = "none";
    // Forzar reflow para “cortar” transición en curso
    body.getBoundingClientRect();
    body.style.transition = "";
  }

  function openCard(card, { animate = true } = {}) {
    const { btn, body } = getParts(card);
    if (!body) return;

    card.dataset.collapsed = "false";
    setToggleLabel(btn, false);

    // Preparar estado visible
    body.style.display = "block";
    body.style.overflow = "hidden";
    body.style.opacity = "1";
    body.style.transform = "translateY(0)";

    const doAnimate = animate && !reduceMotion;

    // Si no animamos, dejamos abierto libre
    if (!doAnimate) {
      body.style.maxHeight = "none";
      body.style.overflow = "visible";
      return;
    }

    // Cortar transición previa si existía
    stopCurrentTransition(body);

    // Empezar desde 0
    body.style.maxHeight = "0px";
    body.getBoundingClientRect();

    // Expandir a altura real
    const target = body.scrollHeight;
    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    body.style.maxHeight = `${target}px`;

    const onEnd = (ev) => {
      if (ev.propertyName !== "max-height") return;
      body.removeEventListener("transitionend", onEnd);

      // Abierto: liberar altura para que el contenido pueda crecer sin cortar
      body.style.maxHeight = "none";
      body.style.overflow = "visible";
    };

    body.addEventListener("transitionend", onEnd);
  }

  function closeCard(card, { animate = true } = {}) {
    const { btn, body } = getParts(card);
    if (!body) return;

    card.dataset.collapsed = "true";
    setToggleLabel(btn, true);

    const doAnimate = animate && !reduceMotion;

    body.style.overflow = "hidden";

    if (!doAnimate) {
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
      body.style.transform = "translateY(-4px)";
      return;
    }

    // Si está en "none", fijar altura actual antes de cerrar
    stopCurrentTransition(body);
    const currentHeight = body.scrollHeight;
    body.style.maxHeight = `${currentHeight}px`;
    body.getBoundingClientRect();

    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    body.style.transform = "translateY(-4px)";

    // No ocultamos display none porque tu CSS usa max-height/opacity y así medimos rápido después
  }

  function closeAllExcept(exceptCard) {
    collapsibleCards.forEach((c) => {
      if (c === exceptCard) return;
      // Solo cerrar si estaba abierto para evitar “re-animar” cerrados
      if (!isCollapsed(c)) closeCard(c, { animate: true });
    });
  }

  // ==========================================
  // 3) ESTADO INICIAL: TODO CERRADO POR DEFECTO
  // ==========================================
  collapsibleCards.forEach((card) => {
    const { btn, body } = getParts(card);
    if (!body) return;

    // Forzar cerrado
    card.dataset.collapsed = "true";
    setToggleLabel(btn, true);

    // Preparar estilos iniciales
    body.style.display = "block"; // mantenemos para medir scrollHeight al abrir
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    body.style.transform = "translateY(-4px)";
    body.style.overflow = "hidden";

    if (!reduceMotion) {
      body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    } else {
      body.style.transition = "none";
    }
  });

  // ==========================================
  // 4) EVENTOS: ABRIR/CERRAR + SOLO 1 ABIERTO
  // ==========================================
  collapsibleCards.forEach((card) => {
    const { btn, body } = getParts(card);
    if (!btn || !body) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const collapsedNow = isCollapsed(card);

      if (collapsedNow) {
        closeAllExcept(card);
        openCard(card, { animate: true });

        // Llevar a vista (premium)
        window.setTimeout(() => {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      } else {
        closeCard(card, { animate: true });
      }
    });

    // (Opcional) click en header completo para alternar, EXCEPTO si clickeas un input/botón/link dentro
    const header = card.querySelector(".collapsible-header");
    if (header) {
      header.addEventListener("click", (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        const isInteractive =
          tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea" || tag === "label";
        if (isInteractive) return;

        // Simula click del botón
        btn.click();
      });
    }
  });

  // ==========================================
  // 5) RE-CALC SI EL CONTENIDO CAMBIA (ej: tablas cargan)
  // ==========================================
  // Si un panel está abierto y su contenido crece mientras está animando, esto ayuda.
  // (Solo útil si usas max-height fijo durante la animación)
  if (!reduceMotion && "ResizeObserver" in window) {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const body = entry.target;
        const card = body.closest(".collapsible-card");
        if (!card) return;

        // Si está abierto y en transición con maxHeight en px, ajustamos
        if (card.dataset.collapsed === "false" && body.style.maxHeight && body.style.maxHeight !== "none") {
          body.style.maxHeight = `${body.scrollHeight}px`;
        }
      });
    });

    collapsibleCards.forEach((card) => {
      const { body } = getParts(card);
      if (body) ro.observe(body);
    });
  }
});
