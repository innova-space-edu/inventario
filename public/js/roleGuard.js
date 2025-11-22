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

  document.addEventListener('DOMContentLoaded', async () => {
    const session = await fetchSession();
    if (!session || !session.role) return;

    const role = session.role;
    // Admin puede todo
    if (role === 'admin') return;

    const page = document.body.dataset.page; // 'login', 'dashboard', 'science', 'computer', 'library', etc.

    // Login y dashboard siempre editables (form de login y navegación)
    if (page === 'login' || page === 'dashboard') return;

    // Lógica por página
    if (page === 'science') {
      if (role !== 'science') {
        // Usuarios que no son de ciencias → solo pueden VER
        lockPageEdition();
      }
    } else if (page === 'computer') {
      if (role !== 'computing') {
        // Usuarios que no son de computación → solo pueden VER
        lockPageEdition();
      }
    } else if (page === 'library') {
      if (role !== 'library') {
        // Usuarios que no son de biblioteca → solo pueden VER
        lockPageEdition();
      }
    }
  });
})();
