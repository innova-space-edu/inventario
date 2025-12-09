// /public/js/roleGuard.js
// Control de permisos de edición según el rol del usuario y helper global
// para manejar fetch autenticado (guardedFetch).

(() => {
  // -------------------------------------------
  // Helper global: guardedFetch
  // -------------------------------------------
  async function guardedFetch(url, options = {}) {
    const resp = await fetch(url, {
      credentials: 'include',
      ...options
    });

    if (resp.status === 401 || resp.status === 403) {
      // Sesión caducada, no autenticada o sin permisos suficientes
      alert('Tu sesión ha expirado o no estás autenticado. Vuelve a iniciar sesión.');
      window.location.href = '/login.html';
      throw new Error(`Acceso no autorizado (${resp.status})`);
    }

    return resp;
  }

  // Exponemos en window para que lo use computing.js, history.js, library.js, science.js, etc.
  window.guardedFetch = guardedFetch;

  // -------------------------------------------
  // Obtener sesión actual desde el backend
  // -------------------------------------------
  async function fetchSession() {
    try {
      // Usamos guardedFetch para que también capture 401/403
      const resp = await guardedFetch('/api/session', {
        method: 'GET'
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.error('Error al obtener sesión:', err);
      return null;
    }
  }

  // -------------------------------------------
  // Banner de advertencia solo-lectura
  // -------------------------------------------
  function showReadOnlyBanner(message) {
    // Si ya existe un banner, no lo duplicamos
    if (document.getElementById('readOnlyBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'readOnlyBanner';
    banner.textContent =
      message ||
      'No tienes permisos de edición en esta sección. Solo puedes visualizar los datos.';

    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.zIndex = '9999';
    banner.style.padding = '10px 16px';
    banner.style.textAlign = 'center';
    banner.style.fontSize = '14px';
    banner.style.fontWeight = '500';
    banner.style.background =
      'linear-gradient(90deg, #ffcc00, #ff9800, #ff5722)';
    banner.style.color = '#000';
    banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';

    document.body.appendChild(banner);
  }

  // -------------------------------------------
  // Bloquear edición de la página
  // -------------------------------------------
  function lockPageEdition() {
    // IDs que se deben mantener habilitados aun en modo solo lectura:
    // buscadores, filtros y botones de exportar / imprimir.
    const allowedIds = new Set([
      // Biblioteca
      'librarySearch',
      'loansSearch',
      'btnExportLibraryCSV',
      'btnExportLoansCSV',
      'btnPrintLibraryReport',
      'btnPrintLoansReport',
      // Ciencias
      'scienceSearch',
      'scienceLoansSearch',
      'btnExportScienceCSV',
      'btnExportScienceLoansCSV',
      'btnPrintScienceReport',
      'btnPrintScienceLoansReport',
      // Computación (por si los usas)
      'computingSearch',
      'computingLoansSearch',
      'btnExportComputingCSV',
      'btnExportComputingLoansCSV',
      'btnPrintComputingReport',
      'btnPrintComputingLoansReport'
    ]);

    // Deshabilita inputs, selects, textareas y botones que no sean de navegación
    const controls = document.querySelectorAll(
      'input, textarea, select, button'
    );

    controls.forEach(el => {
      // 1) Si explícitamente queremos mantenerlo activo: data-keep-enabled="true"
      if (el.dataset && el.dataset.keepEnabled === 'true') return;

      // 2) No bloqueamos enlaces que visualmente parecen botones (<button> dentro de <a>)
      if (el.closest('a')) return;

      // 3) Si su id está en la lista de permitidos (buscadores, export, etc.)
      if (el.id && allowedIds.has(el.id)) return;

      // 4) Permitir automáticamente inputs de búsqueda/filtro
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (
        el.tagName === 'INPUT' &&
        (type === 'search' ||
          // ids que contienen "search" o "filter"
          (el.id && /search|filter/i.test(el.id)))
      ) {
        return;
      }

      // 5) Permitir botones de exportar / imprimir por texto
      if (
        el.tagName === 'BUTTON' &&
        el.textContent &&
        /exportar|csv|imprimir|reporte/i.test(el.textContent)
      ) {
        return;
      }

      // Si llega hasta acá: se bloquea
      el.disabled = true;
      el.classList.add('readonly');
    });
  }

  // -------------------------------------------
  // Lógica principal por página / rol
  // -------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    const session = await fetchSession();
    if (!session || !session.role) return;

    const role = session.role;

    // Admin puede TODO, sin restricciones ni banner
    if (role === 'admin') return;

    const page = document.body.dataset.page; // 'login', 'dashboard', 'science', etc.

    // En login no bloqueamos nada
    if (page === 'login') return;

    // En el dashboard (todas las pestañas) mostramos aviso general de cuenta limitada
    if (page === 'dashboard') {
      showReadOnlyBanner(
        'Has iniciado sesión con una cuenta de área. Solo podrás editar tu sección asignada; el resto será solo lectura.'
      );
      // Aquí no bloqueamos nada porque cada módulo (biblioteca, ciencias, etc.)
      // se controla dentro de su propia pestaña/página.
      return;
    }

    // Si en el futuro vuelves a usar páginas separadas:
    if (page === 'science') {
      // Solo el rol "science" (o admin, que ya retornó arriba) puede editar
      if (role !== 'science') {
        showReadOnlyBanner(
          'Esta sección es exclusiva del laboratorio de Ciencias. Tu cuenta solo tiene permisos de lectura aquí.'
        );
        lockPageEdition();
      }
    } else if (page === 'computer') {
      if (role !== 'computing') {
        showReadOnlyBanner(
          'Esta sección es exclusiva de la Sala de Computación. Tu cuenta solo tiene permisos de lectura aquí.'
        );
        lockPageEdition();
      }
    } else if (page === 'library' || page === 'library-api') {
      // Consideramos tanto la biblioteca antigua como la nueva (library-api)
      if (role !== 'library') {
        showReadOnlyBanner(
          'Esta sección es exclusiva de la Biblioteca. Tu cuenta solo tiene permisos de lectura aquí.'
        );
        lockPageEdition();
      }
    }
  });
})();
