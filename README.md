# AlmacénPro — Sistema de Administración y Gestión de Almacenes

Aplicación web responsiva (**PC, tablet y móvil**) para la administración integral de almacenes, control de inventario en tiempo real, análisis de costos promedio ponderado, gestión de pedidos con autorización, reportes en PDF/CSV y control de acceso por roles (**Administrador**, **Almacenista** y **Usuario Solicitante**).

## Características Principales

- **Dashboard en Tiempo Real**: KPIs de inventario valorizado en **Bolivianos (Bs.)**, alertas de stock mínimo/agotado, actividad del mes y gráfica de flujo.
- **Inventario y Escaneo de Códigos de Barras**: Búsqueda instantánea por nombre, SKU o código de barras (con escáner por cámara vía `@zxing/browser`) y gestión de **Categorías**.
- **Ingresos y Salidas con Análisis de Costo**: Cálculo automático de **costo promedio ponderado** comparando costo anterior vs. nuevo ingreso, actualización del margen y nuevo precio de venta.
- **Comprobantes de Salida en PDF**: Incluye detalle/motivo y responsable de retiro, con descarga directa en PDF, compartir en dispositivos móviles (Web Share API) y envío por correo electrónico.
- **Pedidos y Autorizaciones**: Flujo completo de solicitud, aprobación/rechazo por Administrador y despacho automático con descuento de stock.
- **Reportes Mensuales, Anuales, por Usuario y por Categoría**: Filtros combinables por período, usuario y categoría, exportación a **CSV** y **PDF**.
- **Roles Configurables y CRUD Total (Administrador)**: Matriz de permisos en tiempo real y consola CRUD para todas las tablas SQLite (`categories`, `products`, `users`, `roles`, `orders`, `movements`).
- **Interfaz Adaptable**: Menú lateral colapsable con tooltips, modo **Claro / Oscuro** y diseño táctil para móviles.

## Stack Tecnológico

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, jsPDF + jspdf-autotable, ZXing (`@zxing/browser`).
- **Backend**: Node.js (`>=22.0.0`), Express, SQLite nativo (`node:sqlite` `DatabaseSync`), Vite (middleware en desarrollo / archivos estáticos en producción).

## Requisitos Previos

- **Node.js 22.0.0 o superior** (requerido para el módulo integrado `node:sqlite`).
- **npm** (o **bun**).

## Instalación y Uso Local

1. Clona el repositorio e instala las dependencias:

```bash
npm install
```

2. Crea tu archivo de variables de entorno a partir de `.env.example`:

```bash
cp .env.example .env
```

3. Inicia el servidor de desarrollo (puerto `3000`):

```bash
npm run dev
```

4. Al abrir `http://localhost:3000` por primera vez, completa el asistente inicial para crear la cuenta de **Administrador** (y opcionalmente las cuentas de demostración del equipo).

### Compilación y Producción

```bash
npm run lint    # Verifica tipos TypeScript
npm run build   # Genera el bundle frontend en dist/
npm start       # Inicia el servidor en producción (node server.ts)
```

## Variables de Entorno

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP del servidor (por defecto `3000`). |
| `SESSION_SECRET` | Secreto para firmar los tokens HMAC de sesión (recomendado en producción). |
| `ADMIN_PASSCODE` | Código opcional para acceso/arranque directo como Administrador. |
| `APP_URL` | URL pública de la aplicación desplegada. |

## Seguridad

- Las contraseñas se almacenan con `crypto.scryptSync` y sal aleatoria por usuario; las sesiones usan tokens HMAC-SHA256 verificados en servidor.
- Todas las consultas SQLite usan sentencias preparadas con parámetros vinculados.
- Los archivos de base de datos locales (`data/*.db*`) y `.env` están excluidos en `.gitignore` para evitar publicar datos sensibles.

## Publicar en GitHub

```bash
git init -b main
git add .
git commit -m "feat: AlmacenPro sistema de gestion de almacenes"
git remote add origin https://github.com/TU_USUARIO/almacenpro.git
git push -u origin main
```
