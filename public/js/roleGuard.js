// public/js/roleGuard.js
// Control de permisos por rol + fetch seguro con express-session
// Compatible al 100% con tu server.js actual (sessions, no JWT)

(() => {
  // ==============================================
  // Helper global: fetch que envía la cookie de sesión
  // ==============================================
  async function guardedFetch(url, options = {}) {
    const resp = await fetch(url, {
      credentials: 'include', // Esto envía la cookie de sesión
      ...options
    });

    if (resp.status === 401 || resp.status === 403) {
      alert('Tu sesión ha expirado o no tienes permisos. Serás redirigido al login.');
      window.location.href = '/login.html';
      return null;
    }
    return resp;
  }

  // Exponer para que lo usen todos los módulos (computing.js, library.js, etc.)
  window.guardedFetch = guardedFetch;

  // ==============================================
  // Obtener sesión desde /api/session
  // ==============================================
  async function getCurrentSession() {
    try {
      const resp = await guardedFetch('/api/session');
      if (!resp) return null;
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.warn('Error obteniendo sesión:', err);
      return null;
    }
  }

  // ==============================================
  // Banner de solo lectura (amarillo bonito)
  // ==============================================
  function showReadOnlyBanner(message) {
    if (document.getElementById('readOnlyBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'readOnlyBanner';
    banner.textContent = message;
    banner.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 9999;
      padding: 12px 20px;
      background: linear-gradient(90deg, #ffcc00, #ff9800, #ff5722);
      color: #000;
      font-weight: 600;
      font-size: 15px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      border-bottom: 3px solid #d32f2f;
    `;
    document.body.prepend(banner);
  }

  // ==============================================
  // Bloquear edición (pero deja buscadores, filtros y exportar)
  // ==============================================
  function lockPageEdition() {
    const allowedIds = new Set([
      // Biblioteca
      'librarySearch', 'loansSearch',
      'btnExportLibraryCSV', 'btnExportLoansCSV',
      'btnPrintLibraryReport', 'btnPrintLoansReport',
      // Ciencias
      'scienceSearch', 'scienceLoansSearch',
      'btnExportScienceCSV', 'btnExportScienceLoansCSV',
      'btnPrintScienceReport', 'btnPrintScienceLoansReport',
      // Computación
      'computingSearch', 'computingLoansSearch',
      'btnExportComputingCSV', 'btnExportComputingLoansCSV',
      'btnPrintComputingReport', 'btnPrintComputingLoansReport',
      // Filtros generales
      'historyLabFilter', 'historyLimit'
    ]);

    document.querySelectorAll('input, textarea, select, button').forEach(el => {
      // Mantener habilitados los elementos explícitamente permitidos
      if (el.dataset.keepEnabled === 'true') return;
      if (el.id && allowedIds.has(el.id)) return;
      if (el.closest('a')) return; // botones que son links

      // Permitir inputs de búsqueda y filtros
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'INPUT' && (type === 'search' || /search|filter/i.test(el.id || ''))) {
        return;
      }

      // Permitir botones de exportar/imprimir por texto
      if (el.tagName === 'BUTTON' && /exportar|csv|imprimir|reporte/i.test(el.textContent || '')) {
        return;
      }

      el.disabled = true;
      el.classList.add('readonly');
    });
  }

  // ==============================================
  // Lógica principal al cargar la página
  // ==============================================
  document.addEventListener('DOMContentLoaded', async () => {
    // No hacer nada en la página de login
    if (window.location.pathname.includes('login.html')) return;

    const session = await getCurrentSession();

    // Si no hay sesión → login
    if (!session || !session.email) {
      window.location.href = '/login.html';
      return;
    }

    const role = session.role;
    const page = document.body.dataset.page || '';

    // Admin puede todo
    if (role === 'admin') return;

    // Mensaje general en el dashboard
    if (page === 'dashboard' || page === 'index') {
      showReadOnlyBanner(
        'Cuenta de área: solo puedes editar tu sección asignada. El resto es solo lectura.'
      );
      return;
    }

    // Control por página
    if (page.includes('science') && role !== 'science') {
      showReadOnlyBanner('Sección exclusiva del Laboratorio de Ciencias.');
      lockPageEdition();
    } else if (page.includes('computing') || page === 'computer') {
      if (role !== 'computing') {
        showReadOnlyBanner('Sección exclusiva de la Sala de Computación.');
        lockPageEdition();
      }
    } else if (page.includes('library') && role !== 'library') {
      showReadOnlyBanner('Sección exclusiva de la Biblioteca.');
      lockPageEdition();
    }
  });

})();
