/**
 * collapsibles.js
 * Control universal para paneles desplegables futuristas.
 * Funciona con cualquier elemento:
 *
 * <div class="collapsible-card" data-collapsed="false">
 *      <div class="collapsible-header">
 *          <button class="collapse-toggle" aria-expanded="true">
 *              <span class="collapse-icon">⌄</span> Ocultar
 *          </button>
 *      </div>
 *      <div class="collapsible-body">...</div>
 * </div>
 */

document.addEventListener("DOMContentLoaded", () => {
    const collapsibleCards = document.querySelectorAll(".collapsible-card");

    collapsibleCards.forEach(card => {
        const toggleBtn = card.querySelector(".collapse-toggle");
        const body = card.querySelector(".collapsible-body");

        if (!toggleBtn || !body) return;

        const icon = toggleBtn.querySelector(".collapse-icon");

        // Estado inicial
        let collapsed = card.dataset.collapsed === "true";

        applyState();

        // Evento clic para abrir/cerrar
        toggleBtn.addEventListener("click", () => {
            collapsed = !collapsed;
            card.dataset.collapsed = collapsed ? "true" : "false";
            applyState(true);
        });

        /** Actualiza el estado visual */
        function applyState(withAnimation = false) {
            toggleBtn.setAttribute("aria-expanded", !collapsed);

            // Texto del botón
            toggleBtn.innerHTML = collapsed
                ? `<span class="collapse-icon">⌄</span> Mostrar`
                : `<span class="collapse-icon">⌄</span> Ocultar`;

            if (collapsed) {
                body.style.maxHeight = withAnimation ? body.scrollHeight + "px" : "0px";

                // disparar cierre con retraso para animación
                requestAnimationFrame(() => {
                    body.style.maxHeight = "0px";
                    body.style.opacity = "0";
                    body.style.transform = "translateY(-4px)";
                });
            } else {
                body.style.display = "block";
                body.style.maxHeight = body.scrollHeight + "px";
                body.style.opacity = "1";
                body.style.transform = "translateY(0)";

                // resetear maxHeight luego de animar
                setTimeout(() => {
                    body.style.maxHeight = "none";
                }, 250);
            }
        }
    });
});
