// /public/js/roleGuard.js
// Control de permisos de edición según el rol del usuario y la página actual.
//
// Roles esperados desde el backend (/api/session):
//  - admin        → puede editar TODO
//  - science      → solo edita página de ciencias
//  - computing    → solo edita página de computación
//  - library      → solo edita página de biblioteca
//
// En las demás páginas, los formularios quedan SOLO LECTURA.

(async () => {
  // -------------------------------------------
  // Obtener sesión actual desde el backend
  // -------------------------------------------
  async function fetchSession() {
    try {
      const resp = await fetch('/api/session', {
        credentials: 'include'
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
    // Deshabilita inputs, selects, textareas y botones que no sean de navegación
    const controls = document.querySelectorAll(
      'input, textarea, select, button'
    );

    controls.forEach(el => {
      // Si explícitamente queremos mantenerlo activo: data-keep-enabled="true"
      if (el.dataset && el.dataset.keepEnabled === 'true') return;

      // No bloqueamos enlaces que visualmente parecen botones (<button> dentro de <a>)
      if (el.closest('a')) return;

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

    // Admin (Emorales) puede TODO, sin restricciones ni banner
    if (role === 'admin') return;

    const page = document.body.dataset.page; // 'login', 'dashboard', 'science', 'computer', 'library', etc.

    // En login y dashboard no bloqueamos nada, pero podemos mostrar aviso ligero
    if (page === 'login' || page === 'dashboard') {
      // Aquí solo avisamos que se trata de una cuenta con permisos limitados
      showReadOnlyBanner(
        'Has iniciado sesión con una cuenta de área. Solo podrás editar tu sección asignada; el resto será solo lectura.'
      );
      return;
    }

    // Lógica por página
    if (page === 'science') {
      if (role !== 'science') {
        // Usuarios que no son de ciencias → solo pueden VER
        showReadOnlyBanner(
          'Esta sección es exclusiva del laboratorio de Ciencias. Tu cuenta solo tiene permisos de lectura aquí.'
        );
        lockPageEdition();
      }
    } else if (page === 'computer') {
      if (role !== 'computing') {
        // Usuarios que no son de computación → solo pueden VER
        showReadOnlyBanner(
          'Esta sección es exclusiva de la Sala de Computación. Tu cuenta solo tiene permisos de lectura aquí.'
        );
        lockPageEdition();
      }
    } else if (page === 'library') {
      if (role !== 'library') {
        // Usuarios que no son de biblioteca → solo pueden VER
        showReadOnlyBanner(
          'Esta sección es exclusiva de la Biblioteca. Tu cuenta solo tiene permisos de lectura aquí.'
        );
        lockPageEdition();
      }
    }
  });
})();
