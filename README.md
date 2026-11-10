# Comprobación fotográfica — Beeyond Media

App web interna para controlar la comprobación fotográfica de los soportes de cada campaña, por periodo (Previa, Durante o Única), con carga de campañas e inventario por Excel y aprobación.

- **Página:** GitHub Pages (gratis). Cada cambio que se sube a la rama `main` se publica solo.
- **Datos e inicio de sesión:** Firebase (plan gratuito Spark): Cloud Firestore + Authentication con correo y contraseña.
- **Sin servidor propio:** todo corre en el navegador y las **reglas de Firestore** (`firestore.rules`) deciden quién puede leer o escribir.
- **Modo demostración:** si `js/config.js` no tiene la configuración de Firebase, o si abres la app con `?demo` al final del link, funciona con datos de prueba guardados solo en tu navegador.

## Roles

| Rol | Puede |
|---|---|
| Consulta | Ver control, avance, campañas e inventario; exportar a Excel |
| Verificador | Lo anterior + marcar comprobaciones (fotos, Drive, PPT, estatus, ✔), agregar el arte de referencia de cada periodo (links de Drive), cargar la PPT de comprobación (incluido agregar soportes al periodo, darlos de alta o dar de baja del plan los que no salen) y subir Excels de campañas o inventario para aprobación |
| Aprobador | Lo anterior + aprobar o rechazar cargas **de otras personas**, editar, duplicar y archivar campañas |
| Administrador | Todo + dar de alta usuarios, cambiar roles y desactivar usuarios. Puede aprobar sus propias cargas |

## Instalación (una sola vez)

### 1. GitHub
1. Crea una cuenta u organización de GitHub para Beeyond (por ejemplo `beeyondmedia`).
2. Crea un repositorio **público** llamado `comprobacion` y sube todos los archivos de esta carpeta (o conecta el repositorio a Claude para que los suba).
3. En el repositorio: **Settings › Pages › Build and deployment › Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. En uno o dos minutos la app queda en `https://beeyondmedia.github.io/comprobacion/`.

### 2. Firebase
1. Entra a <https://console.firebase.google.com> con una cuenta de Google de la empresa y crea un proyecto (por ejemplo `beeyond-comprobacion`). Google Analytics no es necesario. Se queda en el plan gratuito **Spark**.
2. **Compilación › Authentication › Comenzar** y habilita **Correo electrónico/contraseña**.
3. **Authentication › Configuración › Dominios autorizados › Agregar dominio**: `beeyondmedia.github.io` (o el dominio donde quede la app).
4. **Authentication › Plantillas**: cambia el idioma a español (es el correo de "cambiar contraseña").
5. **Compilación › Firestore Database › Crear base de datos** en **modo de producción**. Elige una ubicación en Norteamérica (por ejemplo `nam5`).
6. **Firestore › Reglas**: borra lo que haya, pega el contenido de `firestore.rules` y presiona **Publicar**.
7. **Configuración del proyecto (engrane) › Tus apps › Web `</>`**: registra la app (sin Hosting) y copia los valores de `firebaseConfig` en `js/config.js`. Estos valores no son secretos.
8. Si el dominio de correo no es `beeyondmedia.com`, cámbialo en `js/config.js` (`DOMINIO`) y en `firestore.rules` (función `domainOk`).

### 3. Primer administrador
1. En Firebase: **Authentication › Usuarios › Agregar usuario** con tu correo @beeyondmedia.com y una contraseña.
2. Abre la app y entra. Verás **Configuración inicial**: escribe tu nombre y presiona **Ser administradora**. Esto solo funciona una vez; después, los usuarios se dan de alta desde la app.

### 4. Carga inicial de datos
Los archivos de la carga inicial **no van en el repositorio** (es público). Súbelos desde la app:
1. **Cargas › Carga de inventario** → `0_Inventario_Soportes_Beeyond.xlsx` → Enviar a aprobación → **Historial** → abrir la carga → **Aprobar y cargar**.
2. **Cargas › Nueva campaña** → sube cada archivo `1_…` a `4_…`, escribe el cliente, revisa y envía; luego apruébalos en **Historial**.

### 5. Usuarios
**Catálogo › Usuarios**: nombre, correo @beeyondmedia.com, rol y contraseña temporal. La persona puede cambiarla con **Olvidé mi contraseña** en la pantalla de inicio.

## Cómo funciona cada carga

**Campaña** (un archivo = una campaña; un periodo por pestaña):
- Acepta el plan como lo arman (columnas UBICACIÓN, VENUE TYPE, MEDIA OWNER, LAT, LONG…) o la plantilla que se descarga en la app (columna ID SOPORTE).
- Cada fila se busca en el inventario por ID, por nombre (incluidos los nombres originales con los que ya apareció) y por cercanía de coordenadas. Resultado: **Encontrado**, **Dudoso** (eliges el correcto) o **No existe** (se propone darlo de alta con el siguiente ID de su ciudad).
- Pestaña de **sustituciones**: los sitios con motivo (No disponible, Fallas técnicas…) se proponen para quitar, y los que tienen estatus (Sustitución, Live, Bonificación) para agregar. Tú decides en cada uno.
- Si la campaña ya existe, los periodos nuevos se agregan; si un periodo ya existe, su lista de soportes se reemplaza y se conservan las comprobaciones de los soportes que siguen.

**Inventario** (agrega y actualiza; nunca borra):
- Usa como plantilla el inventario actual (botón "Descargar inventario actual").
- Celdas vacías = sin cambio. `ACTIVO = No` da de baja un soporte sin perder su historial.
- **Cambio de ID:** pon el ID actual en `ID ANTERIOR` y el nuevo en `ID`. Al aprobar, el soporte y todas sus comprobaciones pasan al ID nuevo; el anterior queda guardado como nombre original.
- Soporte nuevo sin ID: se le asigna el siguiente de su ciudad.

**PPT de comprobación** (Verificador, Aprobador y Administrador; no necesita aprobación):
- Eliges la campaña y el periodo y subes el `.pptx`. Una diapositiva = una ubicación: el nombre se toma del cuadro de texto de la izquierda y se cuentan las fotos de la campaña (imágenes grandes); fondos, logos, íconos y mapas no cuentan.
- Antes de guardar ves cada diapositiva con el soporte que encontró (Coincide / Revisa / Sin coincidencia) y puedes cambiarlo o ajustar el número de fotos.
- Si el soporte no aparece en la lista, **Buscar en todo el inventario** permite elegir cualquier soporte; al guardar se agrega al periodo. Si tampoco existe en el inventario, ahí mismo se da de alta (ubicación, venue type, owner, ciudad y tipo de espacio) con el siguiente ID de su ciudad.
- **Ubicaciones con dos caras** (por ejemplo MASARYK I / MASARYK II o MUNDO E NORTE-SUR / SUR-NORTE, que en el inventario son soportes separados): si el texto de la diapositiva describe las dos caras, la app propone la otra cara en una fila debajo ("Otra cara (propuesta)"). En cualquier diapositiva puedes usar **+ Tiene otra cara** y elegirla de la lista, buscarla en todo el inventario o darla de alta. Las fotos se reparten a la mitad y puedes cambiar cuántas lleva cada cara.
- **Ubicaciones de la PPT que no están en el plan:** si una diapositiva no coincide con el periodo pero sí, sin dudas, con un soporte del inventario, se propone "Fuera del plan: se agregará"; al guardar se agrega al periodo y cuenta en Avance. Puedes cambiarlo a "No aplicar".
- **Ubicaciones del plan que no salen en la PPT:** aparecen en una lista para decidir cada una: **Dejar pendiente** (por defecto) o **Dar de baja del plan** con motivo (se pide confirmar al guardar). Las bajas salen de Control y Avance y quedan registradas en Campañas › Editar soportes, donde se pueden reactivar.
- Si una diapositiva trae más de 5 fotos, se marcan 5 y te avisa. Si el soporte ya tenía fotos marcadas distintas, eliges entre usar la PPT o conservar lo marcado.
- Al guardar se marcan Foto 1…N, "En PPT: Sí" y "En Drive: Sí" (si está en la PPT también está en Drive), y el soporte queda **Comprobado ✔**. Los que están "Con observaciones" conservan ese estatus. Lo mismo pasa en Control al marcar "Cargadas en PPT".

**Duplicar campaña** (Aprobador y Administrador, en Campañas): crea una campaña nueva con los mismos periodos y soportes activos (sin los dados de baja). Eliges nombre, cliente, versión, qué periodos copiar y sus fechas. Fotos, checks y arte empiezan en cero; después se ajusta cada periodo con "Editar soportes".

**Filtro de fechas** (Avance y Control, también aplica al Excel exportado): eliges *desde* y *hasta* en el calendario y salen los periodos vigentes en algún día de ese rango. Las fechas se leen del texto de cada periodo ("2 al 12 nov 2026", "17 de septiembre al 31 de octubre"…); si el texto no tiene año se toma el del alta del periodo. Los periodos cuyo texto no se entiende aparecen aparte en "Sin fechas reconocibles"; en Campañas › Editar se les pone inicio y fin con calendario.

**Versión:** campo libre de cada campaña (por ejemplo "V2 · 10 nov"), se escribe en Editar o al duplicar. Se ve junto al nombre y sale en el Excel exportado.

Nada de las cargas de Excel se aplica hasta que un aprobador (distinto de quien subió el archivo) o un administrador lo aprueba. Todas las cargas quedan en **Historial**.

## Costos
- GitHub Pages con repositorio público: $0.
- Firebase Spark: $0. Incluye 50,000 lecturas y 20,000 escrituras de Firestore al día. La app guarda el inventario en un documento por ciudad y cada periodo de campaña en un documento, así que abrir la app lee solo unas decenas de documentos. Si algún día se rebasara el límite, Firebase pausa el servicio hasta el día siguiente; no cobra.
- Las fotos siguen en Google Drive; la app solo guarda el link de la carpeta.

## Estructura
```
index.html            página
css/app.css           estilos
js/config.js          configuración de Firebase y dominio  ← editar al instalar
js/main.js            inicio de sesión, menú y rutas
js/views.js           Control, Avance, Campañas, Inventario, Usuarios
js/cargas.js          cargas de campaña e inventario, revisión, aprobación, historial
js/carga-ppt.js       carga de la PPT de comprobación (cuenta fotos por ubicación; lee el recuadro de estatus de Testigos)
js/ppt.js             lectura del .pptx y búsqueda de cada diapositiva en el periodo
js/excel.js           lectura de Excel, normalización y búsqueda de coincidencias
js/backend-firebase.js / js/backend-demo.js   acceso a datos
firestore.rules       reglas de seguridad (pegar en la consola de Firebase)
```

## Modelo de datos (Firestore)
- `users/{uid}`: nombre, email, rol, activo.
- `catalogo/{CIUDAD}`: `sitios.{ID}` → tipo de espacio, venue type, ubicación, detalle, ciudad, network, owner, ID proveedor, medidas, lat, long, nombres originales, activo.
- `campanas/{C01…}`: nombre, cliente, versión, activo, duplicadaDe.
- `periodos/{C01-P|D|U}`: campaña, periodo, fechas (texto), inicio y fin (solo si se pusieron a mano con calendario), `sitios[]`, `refs[]` (hasta 2 links de Drive con el arte de referencia), `bajas.{ID}` (motivo, fecha, sustituido por), `estado.{ID}` → estatus, fotos, drive, ppt, link, comentarios, verificó, fecha.
- `cargas/{id}`: archivo subido, decisiones de revisión, estatus (pendiente, aprobada, rechazada, cancelada), quién subió y quién revisó.
- `config/setup`: marca que ya existe el primer administrador.

## Recuadro de estatus de la app de Testigos

Las PPT que genera la app de Testigos (beeyondmedia/BEEYOND-TESTIGOS) pueden traer, en el lugar de una foto, un recuadro llamado `BT-ESTATUS` con el estatus del reporte de monitoreo (1er renglón: CON OBSERVACIONES, EN REVISIÓN o PENDIENTE) y el comentario (2º renglón). Al cargar la PPT:

- **Con observaciones / En revisión:** se marcan las fotos como siempre, pero el soporte toma ese estatus (no Comprobado) y el comentario se agrega a *Comentarios* sin repetir lo que ya había.
- **Pendiente:** diapositiva sin fotos; el soporte sigue pendiente y no se toca.
- Sin recuadro: igual que antes.
