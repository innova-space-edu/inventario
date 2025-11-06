# Sistema de Inventario y Reservas para Laboratorios y Biblioteca

Este proyecto es una aplicación web diseñada para gestionar el inventario y las reservas de tres áreas principales de una institución educativa: **Laboratorio de Ciencias**, **Laboratorio de Computación** y **Biblioteca**. Los usuarios acceden mediante correo electrónico y contraseña, con privilegios administrados por un administrador.

## Características principales

- **Autenticación de Usuarios:** Inicio de sesión con correo y contraseña. Solo usuarios autorizados pueden acceder a los módulos.
- **Inventario del Laboratorio de Ciencias:** Registro de productos, equipos, experimentos y químicos con código, fecha, cantidad, descripción y fotografía. Permite agregar y eliminar entradas.
- **Inventario del Laboratorio de Computación:** Registro de computadores y otros equipos con campos de identificación (ID, código, marca, modelo, serie, año, descripción y foto). Permite modificar el stock.
- **Biblioteca:** Registro de libros y productos con título, autores, año, serie/ISBN, cantidad y foto. Incluye sistema de préstamos y devoluciones con alertas para usuarios según los lineamientos de sistemas modernos【228849602532203†L248-L316】.
- **Reservas de Laboratorio:** Cada módulo de laboratorio incluye un formulario para agendar horas de uso del laboratorio o sala correspondiente.
- **Diseño Moderno:** Se aplica un estilo minimalista con **bordes redondeados** y paletas de colores claros, siguiendo las tendencias de diseño de 2025 que recomiendan formas curvas y botones de estilo píldora【983437070571960†L362-L369】. Las páginas son responsivas y adaptadas a dispositivos móviles.
- **Carga de Imágenes:** Permite subir fotografías de cada artículo para una mejor identificación.

## Estructura de Carpetas

```
inventory-web/
├── controllers/            # Controladores para manejar la lógica de negocio
├── models/                 # Modelos de datos (usuarios, ítems, reservas)
├── routes/                 # Rutas de la API (por implementar)
├── middleware/             # Middleware (autenticación, etc.)
├── config/                 # Archivos JSON de configuración y datos
│   ├── users.json          # Usuarios predefinidos
│   ├── science_items.json  # Datos del laboratorio de ciencias
│   ├── computing_items.json
│   ├── library_items.json
│   ├── science_reservations.json
│   ├── computing_reservations.json
│   ├── library_reservations.json
│   └── library_loans.json  # Préstamos registrados
├── public/                 # Archivos estáticos
│   ├── index.html          # Panel principal de navegación
│   ├── login.html          # Página de ingreso
│   ├── labs/               # Páginas de cada módulo
│   │   ├── science.html
│   │   ├── computing.html
│   │   └── library.html
│   ├── css/                # Hojas de estilo
│   │   └── styles.css
│   └── js/                 # Lógica de cliente
│       ├── science.js
│       ├── computing.js
│       └── library.js
├── uploads/                # Almacén de imágenes cargadas
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── server.js               # Servidor Express principal
```

## Instalación y ejecución

1. **Requisitos previos:** Asegúrate de tener [Node.js](https://nodejs.org/) instalado.
2. Clona el repositorio y accede al directorio:

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd inventory-web
   ```

3. Instala las dependencias:

   ```bash
   npm install
   ```

4. Inicia la aplicación:

   ```bash
   node server.js
   ```

5. Accede a `http://localhost:3000` en tu navegador para usar la aplicación.

## Notas

- Este proyecto es un prototipo básico que utiliza archivos JSON como almacenamiento. Se puede integrar fácilmente con bases de datos como MongoDB o MySQL en el futuro.
- La autenticación es simple y no incluye cifrado de contraseñas; para un entorno de producción se recomienda usar técnicas de hash y HTTPS.
- El diseño minimalista se inspira en artículos que indican que en 2025 los sitios web están adoptando **formas redondeadas y colores suaves** para mejorar la experiencia del usuario【983437070571960†L362-L369】. Además, la función de notificaciones de préstamos en la biblioteca se basa en las mejores prácticas de los sistemas modernos de gestión de bibliotecas【228849602532203†L248-L316】.
