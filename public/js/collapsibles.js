/**
 * collapsibles.js
 * Control universal para paneles desplegables futuristas.
 *
 * Reglas (tu solicitud):
 *  ✅ Todos los paneles parten CERRADOS por defecto
 *  ✅ Solo 1 panel abierto a la vez (modo accordion)
 *
 * Mejoras incluidas en esta versión (actualizada):
 *  ✅ No rompe si faltan partes del DOM (toggle/body)
 *  ✅ Animación robusta con transitionend (sin setTimeout para liberar altura)
 *  ✅ Evita “saltos” si el contenido cambia de alto (ResizeObserver)
 *  ✅ Respeta prefers-reduced-motion (accesibilidad)
 *  ✅ Click en header alterna (opcional, con protección de elementos interactivos)
 *  ✅ Dispara eventos personalizados:
 *      - "collapsible:open"  (cuando un panel termina de abrir)
 *      - "collapsible:close" (cuando se cierra)
 *    -> Esto ayuda a tu history.js a renderizar gráficos SOLO cuando se abre el panel.
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

  function emit(card, name) {
    try {
      document.dispatchEvent(
        new CustomEvent(name, {
          detail: { card, id: card.id || null },
        })
      );
    } catch {}
  }

  function stopCurrentTransition(body) {
    if (!body) return;
    body.style.transition = "none";
    body.getBoundingClientRect(); // reflow
    body.style.transition = "";
  }

  function openCard(card, { animate = true } = {}) {
    const { btn, body } = getParts(card);
    if (!body) return;

    card.dataset.collapsed = "false";
    setToggleLabel(btn, false);

    // Estado visible base
    body.style.display = "block";
    body.style.overflow = "hidden";
    body.style.opacity = "1";
    body.style.transform = "translateY(0)";

    const doAnimate = animate && !reduceMotion;

    if (!doAnimate) {
      body.style.maxHeight = "none";
      body.style.overflow = "visible";
      emit(card, "collapsible:open");
      return;
    }

    stopCurrentTransition(body);

    // Animación 0 -> scrollHeight
    body.style.maxHeight = "0px";
    body.getBoundingClientRect();

    const target = body.scrollHeight;
    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    body.style.maxHeight = `${target}px`;

    const onEnd = (ev) => {
      if (ev.propertyName !== "max-height") return;
      body.removeEventListener("transitionend", onEnd);

      // Liberar para que el contenido pueda crecer sin cortar
      body.style.maxHeight = "none";
      body.style.overflow = "visible";

      emit(card, "collapsible:open");
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
      emit(card, "collapsible:close");
      return;
    }

    stopCurrentTransition(body);

    // Si estaba en none, fijar altura actual antes de cerrar
    const currentHeight = body.scrollHeight;
    body.style.maxHeight = `${currentHeight}px`;
    body.getBoundingClientRect();

    body.style.transition = "max-height 260ms ease, opacity 220ms ease, transform 220ms ease";
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    body.style.transform = "translateY(-4px)";

    // Emitimos close inmediatamente (estado lógico cerrado ya está)
    emit(card, "collapsible:close");
  }

  function closeAllExcept(exceptCard) {
    collapsibleCards.forEach((c) => {
      if (c === exceptCard) return;
      if (!isCollapsed(c)) closeCard(c, { animate: true });
    });
  }

  function isInteractiveElement(target) {
    if (!target) return false;
    const el = target.closest
      ? target.closest("button,a,input,select,textarea,label,summary,[role='button'],[data-no-collapse]")
      : null;
    return !!el;
  }

  // ==========================================
  // 3) ESTADO INICIAL: TODO CERRADO POR DEFECTO
  // ==========================================
  collapsibleCards.forEach((card) => {
    const { btn, body } = getParts(card);
    if (!body) return;

    card.dataset.collapsed = "true";
    setToggleLabel(btn, true);

    body.style.display = "block"; // para medir scrollHeight al abrir
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

        // Llevar a vista (premium). Si prefieres sin scroll, lo quitas.
        window.setTimeout(() => {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      } else {
        closeCard(card, { animate: true });
      }
    });

    // Click en header alterna (opcional) — no dispara si clickeas elementos interactivos
    const header = card.querySelector(".collapsible-header");
    if (header) {
      header.addEventListener("click", (e) => {
        if (isInteractiveElement(e.target)) return;
        btn.click();
      });
    }
  });

  // ==========================================
  // 5) RE-CALC SI EL CONTENIDO CAMBIA (ej: charts/tablas)
  // ==========================================
  // Si un panel está abierto y en transición (maxHeight en px), ajusta maxHeight.
  if (!reduceMotion && "ResizeObserver" in window) {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const body = entry.target;
        const card = body.closest(".collapsible-card");
        if (!card) return;

        const isOpen = card.dataset.collapsed === "false";
        const mh = body.style.maxHeight;

        if (isOpen && mh && mh !== "none") {
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
