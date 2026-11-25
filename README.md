# AlmacénPro — Centro de salud Pumas Andinos

Aplicación web responsiva (**PC, tablet y móvil**) para la administración integral de almacenes e inventarios del **Centro de salud Pumas Andinos**, con control de existencias en tiempo real, análisis de costos promedio ponderado, gestión de pedidos autorizados, reportes en PDF/CSV y control de acceso por roles.

## Características Principales

- **Panel en Tiempo Real**: KPIs de inventario valorizado en **Bolivianos (Bs.)**, alertas de stock mínimo/agotado, actividad mensual y gráfica comparativa de ingresos vs. egresos.
- **Búsqueda en Tiempo Real con Existencias (`Ctrl + K`)**: Buscador global e instantáneo por nombre, SKU, categoría o ubicación que muestra de inmediato la **cantidad en existencia**, estado del stock y accesos rápidos a Ingreso, Salida o Pedido.
- **Ingresos y Salidas Multi-Producto con Análisis de Costo**: Cálculo automático de **costo promedio ponderado** comparando costo anterior vs. nuevo ingreso, actualización del margen y nuevo precio de venta.
- **Reportes Principales para Centro de salud Pumas Andinos**:
  - **Resumen General** (mensual y anual) con filtros por usuario y categoría.
  - **Reporte de Ingresos** dedicado, con métricas y exportación en **PDF** y **CSV**.
  - **Reporte de Egresos (Salidas)** dedicado, con responsables, sectores, motivos y exportación en **PDF** y **CSV**.
  - **Comprobantes Oficiales de Salida en PDF** con descarga directa, compartir en dispositivos móviles (Web Share API) y envío por correo.
- **Pedidos y Autorizaciones**: Flujo completo de solicitud, aprobación/rechazo por Administrador y despacho automático con descuento de stock.
- **Roles Configurables, Consola CRUD y Respaldo SQL/JSON (Administrador)**: Matriz de permisos en tiempo real, gestión completa de todas las tablas (`sectors`, `personnel`, `categories`, `products`, `users`, `roles`, `orders`, `movements`) y exportación de respaldo completo en `.sql` o `.json`.
- **Interfaz Adaptable**: Menú lateral colapsable, modo **Claro / Oscuro** y diseño táctil para móviles.

## Stack Tecnológico

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, jsPDF + jspdf-autotable.
- **Backend**: Node.js (`>=22.0.0`), Express, PostgreSQL (`pg`) + Drizzle ORM, Vite (middleware en desarrollo / archivos estáticos en producción).
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) ejecutando verificación de tipos (`npm run lint`) y compilación (`npm run build`) en cada `push` y `pull_request` hacia `main`.

## Requisitos Previos

- **Node.js 22.0.0 o superior** y **npm**.
- **PostgreSQL 15+** (local o en la nube / Cloud SQL).

## Instalación y Uso Local

1. Clona el repositorio e instala las dependencias:

```bash
npm install
```

2. Crea tu archivo `.env` a partir de `.env.example` y configura tus credenciales de PostgreSQL:

```bash
cp .env.example .env
```

3. Aplica el esquema en tu base de datos PostgreSQL (si es una base nueva):

```bash
npx drizzle-kit push
```

4. Inicia el servidor de desarrollo (puerto `3000`):

```bash
npm run dev
```

5. Al abrir `http://localhost:3000` por primera vez, inicia sesión o registra tu cuenta de **Administrador**.

## Scripts Disponibles

```bash
npm run dev     # Inicia Express + Vite en desarrollo (puerto 3000)
npm run lint    # Verifica tipos TypeScript (tsc --noEmit)
npm run build   # Compila el frontend en dist/
npm start       # Inicia el servidor en producción (node server.ts)
```

## Publicar en GitHub

El repositorio ya incluye `.gitignore` (protegiendo `.env`, `node_modules/`, `dist/` y respaldos `.sql`) y el flujo de integración continua en `.github/workflows/ci.yml`:

```bash
git init -b main
git add .
git commit -m "feat: AlmacenPro Centro de salud Pumas Andinos"
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```
