/*
 * script.js
 * Este archivo contiene la lógica de animación de estrellas, síntesis de voz y
 * gestión de formularios para el sistema de inventario Innova Space Education - Track.
 */

(() => {
  /*****************************************************************
   * ANIMACIÓN DE ESTRELLAS
   *****************************************************************/

  /**
   * Inicializa el fondo con estrellas y estrellas fugaces.
   * Usa .background (login) o .space-bg (panel principal).
   */
  function initStars() {
    const bg =
      document.querySelector('.background') ||
      document.querySelector('.space-bg');
    if (!bg) return;

    // Limpia por si recargamos varias veces
    bg.querySelectorAll('.star, .shooting-star').forEach(el => el.remove());

    const starCount = 140;
    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('div');
      star.className = 'star';

      // Posición inicial
      star.style.top = Math.random() * 100 + '%';
      star.style.left = Math.random() * 100 + '%';

      // Tamaño aleatorio (algunas más grandes)
      const size = 1 + Math.random() * 2.5;
      star.style.width = size + 'px';
      star.style.height = size + 'px';

      // Variar la duración del parpadeo y del movimiento
      const twinkle = (2 + Math.random() * 4).toFixed(2) + 's';
      const drift = (30 + Math.random() * 40).toFixed(2) + 's';
      star.style.animationDuration = twinkle;
      star.style.setProperty('--drift-duration', drift);

      bg.appendChild(star);
    }

    // Genera algunas estrellas fugaces
    for (let i = 0; i < 5; i++) {
      createShootingStar();
    }
  }

  /**
   * Crea una estrella fugaz y la gestiona durante su vida.
   */
  function createShootingStar() {
    const bg =
      document.querySelector('.background') ||
      document.querySelector('.space-bg');
    if (!bg) return;

    const star = document.createElement('div');
    star.className = 'shooting-star';

    // La lanzamos desde fuera de la pantalla para que cruce en diagonal
    const startX = window.innerWidth + Math.random() * window.innerWidth;
    const startY = -Math.random() * window.innerHeight * 0.5;
    star.style.top = startY + 'px';
    star.style.left = startX + 'px';

    // Duración aleatoria para variar la velocidad
    star.style.animationDuration = (3 + Math.random() * 4).toFixed(2) + 's';

    bg.appendChild(star);

    // Cuando termine su animación, la quitamos y programamos otra
    star.addEventListener('animationend', () => {
      star.remove();
      setTimeout(createShootingStar, Math.random() * 5000 + 3000);
    });
  }

  /*****************************************************************
   * SÍNTESIS DE VOZ
   *****************************************************************/

  // Variables para voz
  let synth;
  let esVoice;

  /**
   * Inicializa la síntesis de voz seleccionando una voz en español,
   * priorizando mujer mexicana (es-MX) si está disponible.
   */
  function initVoice() {
    synth = window.speechSynthesis;
    if (!synth) return;

    function chooseSpanishFemaleVoice() {
      const voices = synth.getVoices();
      if (!voices || !voices.length) return;

      const lower = s => (s || '').toLowerCase();

      const femaleNameHints = [
        'female',
        'mujer',
        'woman',
        'sabina',
        'sofia',
        'sofía',
        'camila',
        'lucia',
        'lucía',
        'maría',
        'maria',
        'paola',
        'paula',
        'carla',
        'carmen',
        'helena',
        'juana',
        'luz'
      ];

      function isFemaleByName(v) {
        const name = lower(v.name);
        return femaleNameHints.some(hint => name.includes(hint));
      }

      // 1) es-MX + femenina
      let candidate = voices.find(
        v => lower(v.lang) === 'es-mx' && isFemaleByName(v)
      );

      // 2) es-MX cualquiera
      if (!candidate) {
        candidate = voices.find(v => lower(v.lang) === 'es-mx');
      }

      // 3) Cualquier español + femenina
      if (!candidate) {
        candidate = voices.find(
          v => lower(v.lang).startsWith('es') && isFemaleByName(v)
        );
      }

      // 4) Cualquier español
      if (!candidate) {
        candidate = voices.find(v => lower(v.lang).startsWith('es'));
      }

      // 5) Fallback
      if (!candidate) {
        candidate = voices[0];
      }

      esVoice = candidate;
    }

    chooseSpanishFemaleVoice();

    if (
      typeof speechSynthesis !== 'undefined' &&
      typeof speechSynthesis.onvoiceschanged !== 'undefined'
    ) {
      speechSynthesis.onvoiceschanged = chooseSpanishFemaleVoice;
    }
  }

  /**
   * Reproduce un texto a través de la voz seleccionada.
   * @param {string} text - El mensaje que se va a pronunciar.
   */
  function speak(text) {
    if (!synth || !esVoice || !text) return;
    if (synth.speaking) {
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = esVoice;
    utterance.lang = esVoice.lang;
    utterance.rate = 1;
    utterance.pitch = 1.05;
    synth.speak(utterance);
  }

  /*****************************************************************
   * PANEL DE SUGERENCIAS
   *****************************************************************/

  function createSuggestionPanel() {
    let panel = document.querySelector('#suggestionPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'suggestionPanel';
      panel.style.position = 'fixed';
      panel.style.bottom = '20px';
      panel.style.right = '20px';
      panel.style.width = '280px';
      panel.style.maxHeight = '200px';
      panel.style.overflowY = 'auto';
      panel.style.background = 'rgba(15, 15, 30, 0.9)';
      panel.style.color = '#fff';
      panel.style.padding = '12px';
      panel.style.borderRadius = '12px';
      panel.style.fontSize = '14px';
      panel.style.zIndex = '9999';
      panel.style.boxShadow = '0 0 12px rgba(0,0,0,0.6)';
      panel.innerHTML =
        '<strong>💡 Sugerencias:</strong><div id="suggestionContent" style="margin-top:5px;"></div>';
      document.body.appendChild(panel);
    }
  }

  /**
   * Actualiza el panel con sugerencias nuevas y las pronuncia.
   */
  function suggestAction(tipText) {
    createSuggestionPanel();
    const box = document.getElementById('suggestionContent');
    if (box) {
      box.textContent = tipText;
    }
    speak(tipText);
  }

  /*****************************************************************
   * UTILIDADES DE DATOS (localStorage)
   *****************************************************************/

  function getData(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }

  function setData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /*****************************************************************
   * SUGERENCIAS POR data-message
   *****************************************************************/

  function initFieldSuggestions() {
    document.querySelectorAll('input, textarea, select').forEach(el => {
      const msg = el.dataset.message;
      if (msg) {
        el.addEventListener('focus', () => {
          // Usamos el panel + voz con el texto específico de ese campo
          suggestAction(msg);
        });
      }
    });
  }

  /*****************************************************************
   * PÁGINA LOGIN
   *****************************************************************/

  function initLoginPage() {
    speak(
      'Bienvenido al sistema de inventario en línea del Colegio Providencia. ' +
        'Para ingresar, escribe tu correo institucional en el primer campo, ' +
        'luego tu contraseña en el segundo campo y presiona el botón Ingresar.'
    );

    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', e => {
      const emailInput = document.getElementById('email');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email) {
        e.preventDefault();
        speak('Por favor ingresa tu correo institucional antes de continuar.');
        return;
      }

      localStorage.setItem('innovaUser', email);
      speak('Datos enviados. Validando tu acceso al inventario.');
      // Dejamos que el servidor maneje el POST /login y la redirección.
    });
  }

  /*****************************************************************
   * PÁGINA DASHBOARD (index.html)
   *****************************************************************/

  function initDashboardPage() {
    const user = localStorage.getItem('innovaUser') || '';
    speak(
      'Bienvenido al panel de inventario y reservas' +
        (user ? ', ' + user : '') +
        '. Selecciona una sección para comenzar.'
    );

    const scienceLink = document.getElementById('scienceLink');
    const compLink = document.getElementById('computerLink');
    const libraryLink = document.getElementById('libraryLink');

    if (scienceLink) {
      scienceLink.addEventListener('click', () => {
        speak(
          'Abriendo laboratorio de ciencias. Aquí puedes agregar productos, ver inventario y gestionar reservas.'
        );
      });
    }
    if (compLink) {
      compLink.addEventListener('click', () => {
        speak(
          'Abriendo laboratorio de computación. Aquí puedes agregar equipos, gestionar inventario y reservar el laboratorio.'
        );
      });
    }
    if (libraryLink) {
      libraryLink.addEventListener('click', () => {
        speak(
          'Abriendo biblioteca. Aquí puedes agregar libros, registrar préstamos y devoluciones.'
        );
      });
    }
  }

  /*****************************************************************
   * PÁGINA BIBLIOTECA
   *****************************************************************/

  function initLibraryPage() {
    speak(
      'Estás en la biblioteca. Puedes agregar libros y materiales, registrar préstamos y devoluciones.'
    );

    let inventory = getData('libraryInventory');
    let loans = getData('libraryLoans');

    const tableBody =
      document.getElementById('libraryTableBody') ||
      document.querySelector('#libraryTable tbody');

    const loanBody =
      document.getElementById('libraryLoanBody') ||
      document.getElementById('loanTableBody') ||
      document.querySelector('#loanTable tbody');

    const addForm =
      document.getElementById('addLibraryForm') ||
      document.getElementById('libraryForm');

    const loanForm =
      document.getElementById('libraryLoanForm') ||
      document.getElementById('loanForm');

    const returnForm = document.getElementById('returnForm');

    if (!tableBody || !loanBody || !addForm || !loanForm) return;

    function updateInventoryTable() {
      tableBody.innerHTML = '';
      inventory.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.id}</td>
          <td>${item.code}</td>
          <td>${item.title}</td>
          <td>${item.author}</td>
          <td>${item.year}</td>
          <td>${item.series || ''}</td>
          <td>${item.category || ''}</td>
          <td>${item.quantity}</td>
          <td>${item.description || ''}</td>
          <td>${item.photo ? `<img src="${item.photo}" alt="foto">` : ''}</td>
          <td><button class="action-button" data-id="${item.id}">Eliminar</button></td>
        `;
        tableBody.appendChild(tr);
      });

      tableBody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          inventory = inventory.filter(it => it.id !== id);
          setData('libraryInventory', inventory);
          updateInventoryTable();
          speak('Libro o material eliminado del inventario.');
        });
      });
    }

    function updateLoanTable() {
      loanBody.innerHTML = '';
      loans.forEach(loan => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${loan.id}</td>
          <td>${loan.bookId}</td>
          <td>${loan.user}</td>
          <td>${new Date(loan.date).toLocaleString()}</td>
          <td>${loan.returned ? '✅' : '❌'}</td>
          <td>
            ${
              loan.returned
                ? ''
                : `<button class="action-button return-button" data-id="${loan.id}">Marcar devuelto</button>`
            }
          </td>
        `;
        loanBody.appendChild(tr);
      });

      loanBody.querySelectorAll('.return-button').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const loan = loans.find(l => l.id === id);
          if (!loan) return;
          if (!loan.returned) {
            loan.returned = true;
            loan.returnDate = new Date().toISOString();
            const item = inventory.find(it => it.id === loan.bookId);
            if (item) {
              item.quantity = (item.quantity || 0) + 1;
            }
            setData('libraryLoans', loans);
            setData('libraryInventory', inventory);
            updateInventoryTable();
            updateLoanTable();
            speak('El material ha sido marcado como devuelto.');
          }
        });
      });
    }

    updateInventoryTable();
    updateLoanTable();

    addForm.addEventListener('submit', e => {
      e.preventDefault();
      const id = 'LB' + Date.now();
      const code = addForm.querySelector('#libCode')
        ? addForm.querySelector('#libCode').value.trim()
        : addForm.codigo
        ? addForm.codigo.value.trim()
        : '';
      const title = addForm.querySelector('#libTitle')
        ? addForm.querySelector('#libTitle').value.trim()
        : addForm.titulo
        ? addForm.titulo.value.trim()
        : '';
      const author = addForm.querySelector('#libAuthor')
        ? addForm.querySelector('#libAuthor').value.trim()
        : addForm.autor
        ? addForm.autor.value.trim()
        : '';
      const year = addForm.querySelector('#libYear')
        ? addForm.querySelector('#libYear').value.trim()
        : addForm.anio
        ? addForm.anio.value.trim()
        : '';
      const series = addForm.querySelector('#libSeries')
        ? addForm.querySelector('#libSeries').value.trim()
        : addForm.serie
        ? addForm.serie.value.trim()
        : '';
      const quantity = parseInt(
        (
          addForm.querySelector('#libQuantity')
            ? addForm.querySelector('#libQuantity').value.trim()
            : addForm.cantidad
            ? addForm.cantidad.value.trim()
            : '0'
        ) || '0',
        10
      );
      const description = addForm.querySelector('#libDescription')
        ? addForm.querySelector('#libDescription').value.trim()
        : addForm.descripcion
        ? addForm.descripcion.value.trim()
        : '';
      const photoInput =
        addForm.querySelector('#libPhoto') ||
        addForm.querySelector('input[type="file"]');
      const categoryInput =
        addForm.querySelector('#libCategory') ||
        addForm.querySelector('[name="libCategory"]') ||
        addForm.querySelector('[name="categoria"]');
      const category = categoryInput ? categoryInput.value : 'general';

      if (!code || !title || !author || !year || quantity <= 0) {
        speak(
          'Por favor completa los campos obligatorios para agregar un libro o material.'
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const item = {
          id,
          code,
          title,
          author,
          year,
          series,
          category,
          quantity,
          description,
          photo: reader.result
        };
        inventory.push(item);
        setData('libraryInventory', inventory);
        updateInventoryTable();
        addForm.reset();
        speak('Libro o material agregado correctamente al inventario.');
      };
      if (photoInput && photoInput.files && photoInput.files[0]) {
        reader.readAsDataURL(photoInput.files[0]);
      } else {
        reader.onload();
      }
    });

    loanForm.addEventListener('submit', e => {
      e.preventDefault();
      const bookId = loanForm.querySelector('#loanBookId')
        ? loanForm.querySelector('#loanBookId').value.trim()
        : loanForm.bookId
        ? loanForm.bookId.value.trim()
        : '';
      const user = loanForm.querySelector('#loanUser')
        ? loanForm.querySelector('#loanUser').value.trim()
        : loanForm.userEmail
        ? loanForm.userEmail.value.trim()
        : '';
      if (!bookId || !user) {
        speak(
          'Ingresa el ID del material y el correo del usuario para registrar un préstamo.'
        );
        return;
      }
      const book = inventory.find(it => it.id === bookId);
      if (!book) {
        speak('El ID del material no existe en el inventario.');
        return;
      }
      if (book.quantity <= 0) {
        speak('No hay unidades disponibles para prestar.');
        return;
      }
      book.quantity -= 1;
      const loan = {
        id: 'PR' + Date.now(),
        bookId,
        user,
        date: new Date().toISOString(),
        returned: false
      };
      loans.push(loan);
      setData('libraryLoans', loans);
      setData('libraryInventory', inventory);
      updateInventoryTable();
      updateLoanTable();
      loanForm.reset();
      speak('Préstamo registrado con éxito.');
    });

    if (returnForm) {
      returnForm.addEventListener('submit', e => {
        e.preventDefault();
        const loanId = returnForm.loanId
          ? returnForm.loanId.value.trim()
          : '';
        if (!loanId) {
          speak(
            'Debes ingresar el ID del préstamo para registrar la devolución.'
          );
          return;
        }
        const loan = loans.find(l => l.id === loanId);
        if (!loan) {
          speak('No se encontró un préstamo con ese ID.');
          return;
        }
        if (loan.returned) {
          speak('Este préstamo ya estaba marcado como devuelto.');
          return;
        }
        loan.returned = true;
        loan.returnDate = new Date().toISOString();
        const item = inventory.find(i => i.id === loan.bookId);
        if (item) {
          item.quantity = (item.quantity || 0) + 1;
        }
        setData('libraryLoans', loans);
        setData('libraryInventory', inventory);
        updateInventoryTable();
        updateLoanTable();
        returnForm.reset();
        speak('Devolución registrada correctamente.');
      });
    }
  }

  /*****************************************************************
   * PÁGINA COMPUTACIÓN
   *****************************************************************/

  function initComputerPage() {
    speak(
      'Estás en el laboratorio de computación. Puedes agregar equipos y materiales, ver inventario y reservar el laboratorio.'
    );

    let inventory = getData('computerInventory');
    let reservations = getData('computerReservations');

    const tableBody = document.getElementById('compTableBody');
    const addForm = document.getElementById('addComputerForm');
    const resForm = document.getElementById('compReservationForm');
    const resBody = document.getElementById('compReservationBody');
    if (!tableBody || !addForm || !resForm || !resBody) return;

    function updateInventoryTable() {
      tableBody.innerHTML = '';
      inventory.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.id}</td>
          <td>${item.equipId}</td>
          <td>${item.code}</td>
          <td>${item.brand}</td>
          <td>${item.model}</td>
          <td>${item.year}</td>
          <td>${item.series || ''}</td>
          <td>${item.category || ''}</td>
          <td>${item.description || ''}</td>
          <td>${item.photo ? `<img src="${item.photo}" alt="foto">` : ''}</td>
          <td><button class="action-button" data-id="${item.id}">Eliminar</button></td>
        `;
        tableBody.appendChild(tr);
      });
      tableBody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          inventory = inventory.filter(it => it.id !== id);
          setData('computerInventory', inventory);
          updateInventoryTable();
          speak(
            'Equipo o material eliminado del inventario de computación.'
          );
        });
      });
    }

    function updateReservationTable() {
      resBody.innerHTML = '';
      reservations.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.id}</td>
          <td>${new Date(r.date).toLocaleString()}</td>
          <td>${r.description}</td>
        `;
        resBody.appendChild(tr);
      });
    }

    updateInventoryTable();
    updateReservationTable();

    addForm.addEventListener('submit', e => {
      e.preventDefault();
      const id = 'PC' + Date.now();
      const equipId = addForm.querySelector('#compEquipId').value.trim();
      const code = addForm.querySelector('#compCode').value.trim();
      const brand = addForm.querySelector('#compBrand').value.trim();
      const model = addForm.querySelector('#compModel').value.trim();
      const year = addForm.querySelector('#compYear').value.trim();
      const series = addForm.querySelector('#compSeries').value.trim();
      const description =
        addForm.querySelector('#compDescription').value.trim();
      const photoInput = addForm.querySelector('#compPhoto');
      const categoryInput =
        addForm.querySelector('#compCategory') ||
        addForm.querySelector('[name="compCategory"]') ||
        addForm.querySelector('[name="categoria"]');
      const category = categoryInput ? categoryInput.value : 'general';

      if (!equipId || !code || !brand || !model || !year) {
        speak(
          'Completa todos los campos obligatorios para agregar un equipo o material.'
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const item = {
          id,
          equipId,
          code,
          brand,
          model,
          year,
          series,
          category,
          description,
          photo: reader.result
        };
        inventory.push(item);
        setData('computerInventory', inventory);
        updateInventoryTable();
        addForm.reset();
        speak(
          'Equipo o material agregado correctamente al inventario de computación.'
        );
      };
      if (photoInput && photoInput.files && photoInput.files[0]) {
        reader.readAsDataURL(photoInput.files[0]);
      } else {
        reader.onload();
      }
    });

    resForm.addEventListener('submit', e => {
      e.preventDefault();
      const date = resForm.querySelector('#compReserveDate').value;
      const desc = resForm.querySelector('#compReserveDesc').value.trim();
      if (!date || !desc) {
        speak('Debes ingresar la fecha y la descripción de la reserva.');
        return;
      }
      const reservation = {
        id: 'RC' + Date.now(),
        date,
        description: desc
      };
      reservations.push(reservation);
      setData('computerReservations', reservations);
      updateReservationTable();
      resForm.reset();
      speak(
        'Reserva registrada correctamente para el laboratorio de computación.'
      );
    });
  }

  /*****************************************************************
   * PÁGINA CIENCIAS
   *****************************************************************/

  function initSciencePage() {
    speak(
      'Estás en el laboratorio de ciencias. Aquí puedes agregar productos y reservar el laboratorio.'
    );

    let inventory = getData('scienceInventory');
    let reservations = getData('scienceReservations');

    const tableBody = document.getElementById('scienceTableBody');
    const addForm = document.getElementById('addScienceForm');
    const resForm = document.getElementById('scienceReservationForm');
    const resBody = document.getElementById('scienceReservationBody');
    if (!tableBody || !addForm || !resForm || !resBody) return;

    function updateInventoryTable() {
      tableBody.innerHTML = '';
      inventory.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.id}</td>
          <td>${item.code}</td>
          <td>${item.name}</td>
          <td>${item.category || ''}</td>
          <td>${item.description || ''}</td>
          <td>${item.quantity}</td>
          <td>${new Date(item.date).toLocaleDateString()}</td>
          <td>${item.photo ? `<img src="${item.photo}" alt="foto">` : ''}</td>
          <td><button class="action-button" data-id="${item.id}">Eliminar</button></td>
        `;
        tableBody.appendChild(tr);
      });
      tableBody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          inventory = inventory.filter(it => it.id !== id);
          setData('scienceInventory', inventory);
          updateInventoryTable();
          speak('Producto eliminado del inventario de ciencias.');
        });
      });
    }

    function updateReservationTable() {
      resBody.innerHTML = '';
      reservations.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.id}</td>
          <td>${new Date(r.date).toLocaleString()}</td>
          <td>${r.description}</td>
        `;
        resBody.appendChild(tr);
      });
    }

    updateInventoryTable();
    updateReservationTable();

    addForm.addEventListener('submit', e => {
      e.preventDefault();
      const id = 'SC' + Date.now();
      const code = addForm.querySelector('#scienceCode').value.trim();
      const name = addForm.querySelector('#scienceName').value.trim();
      const quantity = parseInt(
        addForm.querySelector('#scienceQuantity').value.trim() || '0',
        10
      );
      const date = addForm.querySelector('#scienceDate').value;
      const description =
        addForm.querySelector('#scienceDescription').value.trim();
      const photoInput = addForm.querySelector('#sciencePhoto');
      const categoryInput =
        addForm.querySelector('#scienceCategory') ||
        addForm.querySelector('[name="scienceCategory"]') ||
        addForm.querySelector('[name="categoria"]');
      const category = categoryInput ? categoryInput.value : 'general';

      if (!code || !name || !date || quantity <= 0) {
        speak(
          'Por favor completa todos los campos obligatorios para agregar un producto de ciencias.'
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const item = {
          id,
          code,
          name,
          quantity,
          date,
          description,
          category,
          photo: reader.result
        };
        inventory.push(item);
        setData('scienceInventory', inventory);
        updateInventoryTable();
        addForm.reset();
        speak('Producto agregado correctamente al inventario de ciencias.');
      };
      if (photoInput && photoInput.files && photoInput.files[0]) {
        reader.readAsDataURL(photoInput.files[0]);
      } else {
        reader.onload();
      }
    });

    resForm.addEventListener('submit', e => {
      e.preventDefault();
      const date = resForm.querySelector('#scienceReserveDate').value;
      const desc = resForm.querySelector('#scienceReserveDesc').value.trim();
      if (!date || !desc) {
        speak(
          'Debes ingresar la fecha y la descripción de la reserva de laboratorio de ciencias.'
        );
        return;
      }
      const reservation = {
        id: 'RS' + Date.now(),
        date,
        description: desc
      };
      reservations.push(reservation);
      setData('scienceReservations', reservations);
      updateReservationTable();
      resForm.reset();
      speak(
        'Reserva registrada correctamente para el laboratorio de ciencias.'
      );
    });
  }

  /*****************************************************************
   * NAVBAR ACTIVA
   *****************************************************************/

  function highlightActiveLink() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    const path = window.location.pathname.split('/').pop();
    navbar.querySelectorAll('a').forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === path) {
        a.classList.add('active');
      }
    });
  }

  /*****************************************************************
   * SUGERENCIAS GENÉRICAS (solo cuando NO hay data-message)
   *****************************************************************/

  function initSmartSuggestions() {
    // Campos comunes
    document.querySelectorAll('input, textarea, select').forEach(field => {
      field.addEventListener('focus', () => {
        // Si el campo ya tiene data-message, usamos ese texto y NO repetimos
        if (field.dataset && field.dataset.message) return;

        const labelEl = field.previousElementSibling;
        const labelText = labelEl ? labelEl.textContent.trim() : '';
        const fallback = field.getAttribute('placeholder') || 'este campo';
        const name = labelText || fallback;

        suggestAction(
          `Estás en el campo ${name}. Puedes escribir o elegir una opción.`
        );
      });
    });

    // Botones de envío
    document
      .querySelectorAll('form button[type="submit"]')
      .forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          suggestAction(
            'Este botón enviará el formulario. Revisa los datos antes de continuar.'
          );
        });
      });

    // Enlaces
    document.querySelectorAll('a').forEach(link => {
      link.addEventListener('mouseenter', () => {
        const name = link.textContent.trim() || 'este enlace';
        suggestAction(
          `Puedes hacer clic en ${name} para explorar esa sección.`
        );
      });
    });
  }

  /*****************************************************************
   * INICIALIZACIÓN GENERAL
   *****************************************************************/

  function initPage() {
    initStars();
    initVoice();
    initFieldSuggestions();
    highlightActiveLink();

    const page = document.body.dataset.page;
    switch (page) {
      case 'login':
        initLoginPage();
        break;
      case 'dashboard':
        initDashboardPage();
        break;
      case 'library':
        initLibraryPage();
        break;
      case 'computer':
        initComputerPage();
        break;
      case 'science':
        initSciencePage();
        break;
      default:
        break;
    }

    initSmartSuggestions();
  }

  document.addEventListener('DOMContentLoaded', initPage);
})();
