# JGGOLDNICSA – versión web con GitHub Pages + Supabase

Esta versión sustituye PHP + MySQL/MariaDB por **HTML, CSS y JavaScript + Supabase (PostgreSQL, Auth y Storage)**. Está preparada como sitio estático para GitHub Pages. No necesita servidor PHP.

## Funciones trasladadas
- Inicio de sesión con Supabase Auth.
- Listado de facturas con proveedor, fecha y cliente; filtro rápido.
- Crear factura con datos del cliente, foto de cédula, proveedor, RUC/UAF y filas de detalle.
- Cálculo automático de subtotal (gramos × precio por gramo) y total.
- Numeración por proveedor con incremento atómico en PostgreSQL.
- Búsqueda de clientes existentes por cédula y reutilización de sus datos.
- Impresión del comprobante, incluyendo datos y foto de cédula.
- Eliminación de factura (sus detalles se eliminan por cascada).

## 1. Preparar Supabase
1. Crea un proyecto en https://supabase.com (plan gratuito puede servir para pruebas; revisa límites y políticas vigentes).
2. Abre **SQL Editor** y ejecuta todo `supabase/schema.sql`.
3. En **Authentication → Users**, crea los usuarios autorizados. Desactiva el registro público si no quieres que cualquiera pueda crear una cuenta.
4. En **Project Settings → API**, copia Project URL y la clave `anon`/`publishable` pública.
5. Copia `config.example.js` como `config.js` y sustituye los dos valores. La clave pública puede estar en el frontend; la seguridad depende de RLS. **Nunca publiques la clave `service_role`.**

## 2. Publicar en GitHub Pages
1. Crea un repositorio GitHub y sube el contenido de esta carpeta (incluyendo `config.js`).
2. En **Settings → Pages**, selecciona desplegar desde la rama principal y carpeta raíz.
3. Espera a que GitHub publique el sitio. Abre el enlace y prueba el inicio de sesión.

## 3. Datos y archivos anteriores
El ZIP entregado contiene el código PHP y el esquema SQL, pero no contiene un volcado de datos de clientes/facturas. Por eso esta versión crea la estructura y los tres proveedores iniciales, pero no inventa registros históricos. Si tienes una exportación CSV/SQL de las tablas, se puede preparar la importación conservando IDs y relaciones.

Las imágenes que estaban dentro de `uploads/` no se copian automáticamente: podrían ser documentos personales. Deben importarse de forma autorizada al bucket privado `documentos-clientes`, y actualizarse las rutas `foto_cedula` correspondientes.

## 4. Prueba funcional recomendada
- Inicia sesión con un usuario creado en Supabase.
- Crea una factura de prueba con una imagen de prueba (no uses una cédula real en pruebas).
- Verifica que se reserve el número correcto para cada proveedor.
- Comprueba el total, listado, impresión y eliminación.
- Confirma que las fotos no se pueden abrir sin iniciar sesión.

## Consideraciones importantes
- El sistema almacena números de cédula y fotografías de identificación. Mantén el bucket privado, limita las cuentas de acceso y no compartas credenciales.
- La numeración se incrementa en una función transaccional para evitar duplicados por dos usuarios guardando al mismo tiempo.
- La versión conserva los campos y el formato funcional observados en el proyecto recibido. No se incluyen módulos de inventario, reportes ni facturación fiscal.
- **Aún requiere configuración del proyecto Supabase y publicación en GitHub Pages.** No puedo crear esas cuentas ni publicar en tus servicios sin acceso/autorización; el paquete sí queda listo para esa configuración.
