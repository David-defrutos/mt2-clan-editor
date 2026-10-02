# Plan de desarrollo ágil — Editor de clanes MT2

Estado: roadmap vigente; el primer incremento ya está implementado y sus límites figuran en [README.md](README.md). La especificación funcional está en [PLAN.md](PLAN.md); [BORRADOR.md](BORRADOR.md) es histórico.

## 1. Forma de trabajo

Se propone una adaptación ligera de Scrum para un equipo pequeño: **iteraciones de dos semanas**, con una primera semana de exploración técnica. Cada iteración termina con una versión ejecutable, una demostración sobre clanes reales y una revisión del backlog. El plan fija el **orden de riesgos y objetivos**, no fechas inamovibles. Una historia que no cumpla su criterio de aceptación vuelve al backlog; no se declara terminada por estar parcialmente programada.

Cadencia:

- **Inicio de iteración (30–60 min):** elegir un objetivo único, descomponer historias y comprobar dependencias.
- **Durante la iteración:** tablero `Pendiente → En curso → Revisión → Terminado`, máximo dos historias en curso por desarrollador. Registrar bloqueos y decisiones en el propio repositorio.
- **Revisión (60 min):** demostrar las funciones con copias de los siete clanes de referencia y recoger cambios de prioridad. El usuario comprueba los flujos que importan, no solo capturas.
- **Retrospectiva (20–30 min):** identificar un ajuste concreto para la siguiente iteración.
- **Refinamiento semanal (30 min):** aclarar las próximas historias y dividir las que no caben en una iteración.

Esta cadencia toma las ideas de incremento, revisión y definición de terminado de la [Scrum Guide](https://scrumguides.org/scrum-guide.html), con flexibilidad para responder a los hallazgos sobre los clanes y sus reglas, de acuerdo con los [principios del Manifiesto Ágil](https://agilemanifesto.org/principles). No presupone un equipo Scrum completo.

## 2. Objetivo de producto y estrategia

**Objetivo:** poder crear un clan nuevo jugable y abrir, modificar y guardar los siete clanes de referencia sin pérdida de datos, con navegación, filtros, estadísticas, arte, progresión como Yokai y seguimiento de la DLL en GitHub. Deva se incorpora a la primera versión por la ampliación solicitada el 30-09-2026.

Orden de entrega según riesgo:

1. Demostrar lectura y escritura conservadora de los siete formatos de referencia.
2. Hacer útil el editor con navegación, cartas, campeones y pools.
3. Crear un clan completo y probarlo en el juego temprano.
4. Añadir catálogos de mecánicas, progresión y recursos visuales.
5. Cerrar comparación global, validación, GitHub y pruebas multiplataforma.

Los clanes instalados son **fixtures de aceptación**. Las pruebas automáticas trabajan con copias controladas dentro del repositorio de desarrollo; nunca modifican el perfil activo del juego. Cada error encontrado en un clan real se convierte en fixture y prueba de regresión antes de corregir el lector o generador.

## 3. Backlog priorizado

| Épica | Prioridad | Resultado comprobable |
|---|---|
| E1. Contratos y configuración | P0 | Esquemas versionados para datos, pantallas, importación, reglas, métricas, arte y plantillas; errores claros ante configuración inválida. |
| E2. Importación conservadora | P0 | Los siete clanes abren; guardado sin cambios produce cero diferencias. |
| E3. Navegación y edición | P0 | Biblioteca, barra lateral, búsqueda, filtros, ficha de clan, campeones, sendas, cartas y pools. |
| E4. Creación de clan | P0 | Asistente y plantillas generan un clan que carga en el juego con dos campeones, sendas, iniciales, estandarte y arte básico. |
| E5. Progresión y mecánicas | P0 | `unlock_level` siguiendo Yokai, simulación por nivel y un catálogo guiado reducido de efectos/triggers/habilidades, ampliable mediante configuración. |
| E6. Recursos visuales | P0 | Inventario y sustitución por uso real de cartas, personajes, selección, reliquias, HUD y demás categorías presentes. |
| E7. Estadísticas globales | P0 | Comparación simultánea de siete clanes, desglose por objeto y exportación. |
| E8. Compilación y publicación de DLL | P0 | Compilación local con `dotnet`, DLL localizada y verificada; como alternativa, push revisado, run de Actions identificado por SHA y artefacto descargado. |
| E9. Calidad multiplataforma | P0 | Misma salida funcional en Windows, macOS y Linux; rutas y mayúsculas verificadas. |

`P0` significa necesario para la primera versión que cumple [PLAN.md](PLAN.md). Dentro de cada épica, se prioriza primero el camino completo más pequeño. Formularios específicos para **toda** la API de Trainworks no bloquean la primera versión: las secciones sin formulario guiado conservan edición JSON con validación y guardado sin pérdida.

### Historias de alto riesgo que se hacen pronto

| ID | Historia | Aceptación principal |
|---|---|---|
| H01 | Como autor, selecciono una carpeta y veo qué clan contiene. | Reconoce clase por contenido en `plugin.json`, `class.json`, `json/class/*.json` o `content.json`. |
| H02 | Como autor, abro y guardo un clan existente sin editarlo. | Hashes de todos los archivos idénticos antes y después en los siete fixtures. |
| H03 | Como autor, cambio un campo en una carta existente. | Solo cambia el archivo esperado; se conservan campos desconocidos, formato y referencias. |
| H04 | Como autor, veo qué puede hacer mi carpeta. | Muestra fuente, Git, rutas JSON y capacidad de compilación sin prometer funciones que falten. |
| H05 | Como autor, creo un clan básico. | Lo compilo y aparece en selección con ambos campeones, iniciales y estandarte. |
| H06 | Como autor, asigno niveles de desbloqueo como en Yokai. | Cartas sin campo disponibles al inicio; nueve ejemplos de Yokai en niveles 2–10; cartas auxiliares con nivel 99 no se mezclan con recompensas normales. |
| H07 | Como autor, sustituyo un recurso visual. | Muestra todos sus usos, aplica el perfil correcto y conserva el original. |
| H08 | Como autor, comparo clanes. | Cada métrica abre exactamente los objetos que cuenta; habilidades/tokens no inflan el draft. |
| H09 | Como autor, envío el clan a GitHub. | La DLL mostrada procede del run del SHA enviado, nunca de un run anterior. |
| H10 | Como autor, compilo la DLL en mi equipo sin subir el clan. | Si hay proyecto C# y SDK compatible, el editor ejecuta `dotnet build` en Release, muestra el log y la ruta de la DLL; informa con precisión si faltan SDK, fuentes o acceso a paquetes. |
| H11 | Como autor, genero un clan que Trainworks carga realmente. | El JSON generado respeta el esquema y el Mod Template; incluye selección de campeones y el circuito completo de estandarte. Se compila y se prueba en un perfil aislado con el log de BepInEx. Véase [revisión de la wiki](REVISION-WIKI-TRAINWORKS.md). |

## 4. Plan de iteraciones

Las duraciones son orientativas y se ajustan tras la revisión de cada iteración. Un trabajo que no quepa se divide en una entrega observable; no se traslada una pantalla a medias como «terminada».

| Iteración | Duración | Objetivo de la iteración | Demostración final |
|---|---|---|---|
| 0. Base técnica | 1 semana | Inventario de siete clanes, configuración versionada, fixtures, prototipo de parser y escritura sin cambios; elegir el pequeño catálogo guiado inicial. | Informe de diferencias por clan y decisión documentada sobre lectura/escritura de JSON y catálogos. |
| 1. Biblioteca y lectura | 2 semanas | Aplicación local TypeScript, selector de carpeta, biblioteca, informe de importación, barra lateral y lectura de los siete. | Abrir los siete clanes y navegar por objetos sin modificar archivos. |
| 2. Edición segura | 2 semanas | Formularios genéricos, ficha de carta/unidad, búsqueda, filtros, referencias, diferencias, copias y guardado. | Editar una carta en cada clan, guardar y reabrir; hash idéntico de todo lo no tocado. |
| 3. Creación y estructura | 2 semanas | Asistente, identidad, dos campeones, seis sendas, cartas iniciales, pools variables, estilo y circuito completo de estandarte; conformidad con esquema/Mod Template y primera compilación local. | Generar un clan nuevo, validarlo, compilarlo localmente y verlo en selección y en el mapa dentro del juego. |
| 4. Mecánicas y progresión | 2 semanas | Catálogo guiado reducido y ampliable por configuración, `unlock_level`, simulación de nivel y avisos de draft. | Añadir mecánicas del catálogo y comprobar el comportamiento con Yokai; preservar valores 99 importados. |
| 5. Recursos visuales | 2 semanas | Inventario por referencias, perfiles de tamaño, vistas previas, reemplazo y compensación de `character_art`. | Cambiar en copias arte de carta, personaje, selección y reliquia sin afectar otros recursos. |
| 6. Estadísticas y validación | 2 semanas | Comparación de siete clanes, métricas configuradas, desglose, exportación y validación completa. | Comparar los siete, abrir una cifra hasta sus cartas y detectar referencias/pools/arte incorrectos. |
| 7. GitHub y cierre | 2 semanas | Integrar la compilación local en la pantalla de Publicación, conservar Actions como vía remota, comprobar DLL, documentación, regresión y funcionamiento multiplataforma. | Generar una DLL local sin GitHub y otra mediante Actions en un repositorio de prueba; versión candidata que supera la matriz de aceptación. |

**Primer incremento útil:** al terminar la iteración 2, abrir y editar de forma segura los siete clanes. **Primer clan nuevo jugable:** al terminar la iteración 3. **Versión que cumple todo el plan:** tras la iteración 7 y sus pruebas. Las revisiones pueden reordenar historias dentro de las iteraciones sin omitir los criterios P0.

## 5. Definición de preparado y de terminado

Una historia está **preparada** cuando tiene ejemplo real o fixture, pantalla o API afectada, entradas/salidas, criterio observable, dependencias conocidas y tamaño que cabe en una iteración. Si falta una respuesta de diseño, la historia puede empezar con una investigación limitada que produzca una decisión verificable.

Una historia está **terminada** cuando:

1. Funciona en la interfaz o CLI local y demuestra el flujo completo descrito.
2. Los datos y reglas se expresan en la configuración prevista; no introduce un nombre de clan codificado en el programa.
3. La validación muestra fallos comprensibles y no pierde datos ante errores.
4. Las pruebas relevantes pasan, incluidos fixtures de clanes afectados y guardado sin cambios cuando hay escritura.
5. La revisión visual o en juego se ha hecho cuando la función afecta arte o comportamiento del juego.
6. La documentación de uso y las decisiones técnicas afectadas están actualizadas.
7. La demostración puede repetirse desde una copia limpia; los cambios están integrados y revisados.

Para la **versión completa**, además se exige abrir y modificar los siete clanes, crear un clan jugable, comparar estadísticas, gestionar todas las categorías visuales observadas, validar progresión como Yokai y verificar la DLL del commit correcto.

## 6. Pruebas y calidad continuas

- **En cada cambio de importador/guardado:** siete pruebas de lectura y guardado sin cambios, comparación de hashes y prueba de modificación localizada por formato de archivo.
- **En cada cambio de generador:** JSON válido, IDs/referencias, rutas de sprites, rutas registradas por el plugin y comparación de salida reproducible.
- **En cada cambio de UI:** recorrido por teclado de la pantalla afectada, estado vacío, error y datos reales de un clan grande como Free Company o Silk Song.
- **En progresión:** comparar con Yokai niveles iniciales, nueve cartas en 2–10, reliquias con nivel, pools de estandarte y exclusión de cartas auxiliares; comprobar en juego la apariencia en el libro de registro.
- **En arte:** comprobar dimensiones/transparencia por categoría y transform de personaje; no aplicar el perfil de carta a iconos/HUD.
- **Antes de publicar:** probar compilación local desde un clan generado y uno importado con fuentes, comprobar la DLL de salida y mostrar errores de restauración de paquetes. Para Actions, probar run por SHA y rechazo de DLL vieja. No usar el perfil de juego activo como destino automático.
- **Por plataforma:** al menos una pasada de instalación/arranque, selector de carpeta, lectura, guardado y generación en Windows, macOS y Linux; si el juego no está disponible en una plataforma, la prueba en juego se realiza donde sí pueda ejecutarse y se documenta esa diferencia.

## 7. Gestión del alcance y decisiones

Los cambios nuevos entran al backlog como historia con beneficio, ejemplo y criterio de aceptación. En cada revisión se decide si desplazan trabajo menos prioritario, si amplían el calendario o si pertenecen a una versión posterior. La especificación [PLAN.md](PLAN.md) se actualiza en la misma iteración en la que se acepta un cambio de alcance. El historial de decisiones se conserva en Git.

Decisiones que conviene cerrar en las primeras revisiones:

1. Lista concreta del pequeño catálogo guiado inicial de efectos, triggers y habilidades, fijada tras inventariar los siete clanes en la iteración 0. El resto permanece editable como JSON.
2. Detalles visuales del libro de registro, tomando Yokai como referencia y comprobándolos en el juego.
3. Idiomas que admiten los formularios y las plantillas iniciales.
4. Si la instalación local de DLL entra en la primera versión o se entrega tras la verificación de GitHub.

## 8. Estimación y seguimiento

### Asignación de unidades a invocaciones · 01-10-2026

- Inspector de carta y efecto: selector de invocación estándar, unidad principal/adicional, búsqueda de personajes y resumen de estadísticas; quitar unidad secundaria.
- Lista de usos directos compartidos, vista previa y guardado localizado con respaldo. Referencias estructuradas idénticas se conservan sin escritura.
- Configuración de efectos y campos en `config/spawn-assignment.json`. Rechaza referencias inexistentes/ambiguas, cambios en disco desde la revisión, eliminación de la unidad principal y pools/lógica personalizada sin adaptador.
- Las referencias y parches C# no se simulan; la edición de pools de personajes continúa pendiente.

### Arte independiente · 30-09-2026

- Formulario de copia dentro del selector de arte, con ID, previsualización de archivos/definiciones y guardado con respaldo.
- Duplica game_object, sprites y PNG, conservando transformaciones, pivotes, PPU, campos desconocidos y frames de animación local. Asigna solo al objeto seleccionado.
- Configuración en `config/visual-copy.json`; bloquea Spine/referencias externas hasta disponer de adaptadores. Control de hashes de JSON e imágenes, IDs/rutas ocupados y guardados simultáneos de copias.
- Verificación de independencia, conservación de originales y retirada de archivos nuevos ante fallo de la asignación final. Los cambios de este incremento permanecen locales.

### Asignación visual desde catálogo · 30-09-2026

- Inspector de cartas/unidades: búsqueda y selección de arte por tipo, imagen, dimensiones y lista de usuarios; vista previa y guardado con respaldo.
- Configuración en `config/visual-assignments.json`; IDs de recursos locales únicos y tipo correcto. Seleccionar el recurso ya asignado no reescribe una referencia estructurada.
- Pruebas verifican conservación byte a byte del JSON salvo la referencia, PNG, comentarios, campos desconocidos, respaldo y bloqueo de hashes antiguos, IDs duplicados y tipos incorrectos.
- La copia independiente de arte se completa en el incremento siguiente; asignar recursos de otros contextos mediante formularios específicos sigue pendiente.

### Biblioteca ampliada y transformaciones · 30-09-2026

- Deva vuelve a entrar en alcance. Se incorporan Steward, Disciple y versiones originales de FreeCompany, Sandscourged, Silk Song y Yokai; Sweetkin se detecta adicionalmente.
- Búsqueda por definiciones `classes`, importación de archivos `.old` en copias de trabajo y listado separado de complementos sin clase. Configuración en `config/library-discovery.json`.
- Avisos de estructura incorrecta de `transform`; escritura de `offset` y lectura histórica de `offset_position`, migración explícita al editar desplazamientos conservando X/Y/Z. La versión local antigua de Trainworks y la corrección anunciada requieren verificar el runtime instalado.
- Silk Song conserva sus duplicados con diagnóstico. Se bloquea edición cuando el ID no es único en un archivo.
- Compilación correcta y 43 pruebas superadas. Detalles y límites en `REVISION-CLANES-INSTALADOS.md`.

### Creación y duplicación de contenido · 30-09-2026

- Botones Crear carta, Crear unidad y Duplicar selección; formulario con ID, nombre, tipo, vista previa y guardado explícito.
- Plantilla configurable para cartas de unidad, hechizos y personajes independientes. Archivo JSON nuevo y PNG marcadores propios; guardado exclusivo, comprobación de cambios en disco y retirada de archivos nuevos si falla la operación.
- Copia de invocaciones estándar y sus personajes, incluida segunda unidad y referencias estructuradas; conservación de campos desconocidos y traducciones existentes. Arte y mecánicas adicionales compartidos con aviso. Pools de personajes e invocaciones personalizadas requieren adaptadores.
- Pruebas en carpetas temporales: conservación exacta de originales, independencia de estadísticas, PNG válidos, colisiones, rutas, referencias externas y vistas previas obsoletas.
- Los cambios de desarrollo permanecen locales. No subir a GitHub sin autorización explícita; tampoco en horario de Madrid de lunes a jueves 08:00–19:00 ni viernes 08:00–15:00.


### Ayudas de los controles y requisito de traducción · 30-09-2026

- Vista de personaje: grupos de tamaño, movimiento vertical y movimiento horizontal, explicaciones y tooltips. El bloque horizontal queda plegado inicialmente. Grupos y textos proceden de configuración.
- Se incorpora como requisito obligatorio de cierre la traducción completa y un selector de idiomas. La fase final cubrirá catálogos, textos configurados, ayudas, mensajes de error, persistencia de preferencia y regresión visual. Las traducciones completas se realizarán cuando se estabilice el alcance funcional.
- Los IDs actuales de controles y grupos se mantienen estables para su futura vinculación con claves de traducción. La interfaz todavía está en español; el selector se entrega en la fase final.

### Corrección de tamaño en fondo del juego · 30-09-2026

- Recalibración con tres capturas: Virodemonologist, Carrier e Incubus Butcher. Comparación de contornos coloreados, excluyendo iconos de estado, y normalización por la altura del Shield Steward en cada captura.
- Corrección general: proyección vertical de 62 a 72 px/unidad y origen Y de 270 a 300; se mantiene la posición horizontal. Viro y Butcher concuerdan en la proyección común.
- Carrier presenta proporción vertical distinta: ajuste empírico de vista configurable por clase/arte, con aviso visible. No se alteran las transformaciones del clan; pendiente de confirmar la excepción con otra captura y la versión cargada por el juego.
- Pruebas de referencia verifican ancho y alturas de los tres ejemplos, además de las regresiones de guardado.

### Incremento de fondo del juego · 30-09-2026

- Entregado: captura local como fondo predeterminado, sprite situado en el hueco izquierdo del Shield Steward, cambio a cuadrícula y zoom conjunto. Encadre/proyección configurados y separados de las transformaciones del clan.
- Calibración aproximada: comparación de Carrier con la captura aportada; se consideran márgenes transparentes, pivote y escalas diferentes en X/Y para la proyección de referencia. El perfil no reproduce shaders ni cámara 3D y requiere validación visual en el juego.
- Verificación: pruebas del encuadre (cuernos, capa y hueco respecto al Steward) y movimiento por eje. La captura se conserva como dato local; la revisión interactiva del navegador sigue pendiente por el error de ACL.

### Incremento de vista de personaje · 30-09-2026

- Entregado: lienzo con sprite y guía de suelo, filtros por uso/nombre/sprite, arrastre de posición, tirador de escala, proporciones vinculadas, controles numéricos, zoom y cuadrícula. Vista previa y guardado de transformaciones con respaldo y control de hash.
- Evidencia: 31 pruebas superadas; lectura de 166 character art con imagen válida en los siete clanes y la demo. Pruebas de guardado en carpetas temporales conservan PNG, Z, animaciones, otro objeto de selección, comentarios y formato.
- Fuente de geometría: código local de `SpritePipeline.cs` y `GameObjectCharacterArtFinalizer.cs`; PPU 100, pivote 0.5/0.5 y factor de altura automática 0.647 configurables. El lienzo es una referencia 2D y no valida la cámara ni los shaders del juego.
- Pendiente de aceptación: interacción visual/teclado y contraste con capturas del juego; el navegador automatizado falla por `apply deny-read ACLs`. Animaciones, Spine y calibración de cámara permanecen en el backlog.

### Incremento de edición del árbol · 30-09-2026

- Entregado: asignación de mejoras existentes a los niveles de cada senda, filtro por nombre/ID/archivo, vista previa, cancelar/restablecer y guardado con respaldo.
- Verificado: cambio de una referencia conserva el resto del archivo byte por byte, incluyendo BOM, CRLF, comentarios, campos desconocidos, otro campeón y referencias externas. Seleccionar la misma mejora conserva su referencia estructurada sin escribir. Se rechazan hashes antiguos, posiciones inválidas y IDs duplicados.
- Evidencia: 28 pruebas superadas y compilación correcta. Las escrituras de prueba se realizan en carpetas temporales.
- Pendiente: aceptación visual y por teclado; prueba en el juego de un árbol modificado. Los árboles incompletos se siguen reparando en el editor avanzado; crear y clonar mejoras queda en el backlog.

### Incremento de campeones y sendas · 30-09-2026

- Objetivo entregado: comparar valores base y bonificaciones de cada nivel; explorar combinaciones y abrir las mejoras para editar campos guiados.
- Criterios verificados: II sustituye a I; II + I suma una mejora de cada senda; los límites de combinación vienen de configuración; referencias externas, duplicadas o desconocidas no producen valores inventados; habilidades personalizadas generan avisos.
- Evidencia: compilación del editor correcta, 25 pruebas superadas y resolución en lectura de 16 campeones y 144 mejoras entre los siete clanes y la demo.
- Pendiente de aceptación: recorrido visual y por teclado de la pantalla en el navegador del usuario; no se ha verificado este cálculo mediante una partida. La herramienta de revisión del navegador está bloqueada por el error de ACL del entorno.
- Próximo alcance de esta pantalla: previsualización de arte y creación/clonado de mejoras; la edición guiada del árbol se ha entregado en el incremento posterior.

Estimación **preliminar**, para una persona con experiencia en TypeScript y conocimiento del modding de MT2: **360–580 horas**, aproximadamente **9–15 semanas a jornada completa**. Incluye la compatibilidad obligatoria con siete clanes, edición conservadora, creación jugable, recursos visuales, estadísticas, progresión y GitHub. El catálogo guiado inicial será pequeño; se amplía mediante ficheros de configuración. La estimación original no incluía Deva; su incorporación amplía los fixtures de compatibilidad. No incluye producir ilustraciones ni programar mecánicas C# nuevas para cada clan. La incertidumbre mayor está en importar y guardar sin pérdida los formatos existentes y en la prueba de carga real del juego.

La primera reestimación se hace al terminar la iteración 0, con el prototipo de parser y los siete fixtures; la segunda al terminar la iteración 2, cuando ya se conoce el coste real de edición conservadora. Cada revisión informa **objetivo conseguido, evidencia, horas consumidas, riesgos y siguiente prioridad**. El avance se mide por historias aceptadas y pruebas superadas, no por porcentaje de pantallas dibujadas.

### Incremento de pertenencia a pools · 01-10-2026

- Entregado: altas y bajas de cartas en pools, filtros, revisión y descarte, guardado de varios archivos con respaldo y recuperación.
- Criterios verificados: conserva referencias externas/estructuradas y otros pools, campos desconocidos, BOM, CRLF y comentarios; rechaza IDs duplicados, pools desconocidos y vistas previas caducadas; restaura el primer archivo ante fallo del segundo.
- Evidencia: 55 pruebas superadas y compilación correcta. Lectura del catálogo de las 16 carpetas de la biblioteca sin escribir en clanes. Pools del juego de salas/equipo contrastados con el esquema y la wiki locales de Trainworks.
- Pendiente de aceptación: recorrido visual/teclado y partida con un lote modificado. La membresía construida desde C# requiere adaptadores. Crear definiciones de pools y clonar mejoras siguen en backlog.
- Cambios locales pendientes de autorización para publicar en GitHub.

### Incremento de creación y copia de mejoras · 01-10-2026

- Entregado: catálogo de mejoras en Campeones y sendas, filtros, selección de origen, creación desde plantilla y copia independiente del objeto. Los originales y árboles no se modifican automáticamente.
- Criterios verificados: conservación de idiomas, bonificaciones, referencias externas y datos desconocidos; ninguna textura generada; creación y asignación posterior a una senda; rechazo de solicitudes distintas de las revisadas. Se amplía la comprobación de revisión a toda creación de contenido.
- Evidencia: compilación correcta y 58 pruebas superadas. Escrituras de prueba únicamente en carpetas temporales. El siguiente paso de aceptación es recorrer el catálogo visualmente y probar una mejora asignada dentro del juego.
- Pendiente: crear definiciones de pools, adaptadores de mecánicas y cierre de internacionalización/multiplataforma. La implementación de creación/clonado de mejoras del backlog anterior está cubierta por este incremento.
- Cambios locales, sin publicación en GitHub.

### Incremento de creación de pools · 02-10-2026

- Entregado: crear definición vacía desde plantilla, previsualizar, guardar archivo independiente, seleccionar el nuevo pool y añadir cartas con el flujo anterior. Abrir definición permite revisar su JSON en Todos los objetos.
- Evidencia: compilación correcta y 61 pruebas superadas. Prueba del recorrido crear → guardar → añadir carta con respaldo; rechazo de copia no soportada, colisiones y vista previa caducada; lectura de unión de miembros directos/indirectos sin duplicar ni confundir referencias externas.
- Fuentes: esquema local Trainworks-Reloaded/schemas/schemas/card_pools.json. Plantilla y avisos versionados en configuración.
- Pendiente de aceptación: recorrido visual/teclado y prueba en juego. Pendiente de implementación: adaptadores para edición/copia de miembros directos, conexión guiada a recompensas, internacionalización y verificación multiplataforma. Crear definiciones de pools ya está cubierto.
- Cambios locales, sin publicación en GitHub.

### Incremento de edición de miembros directos · 02-10-2026

- Entregado: altas en la lista directa del pool cuando la declara, bajas en ambas fuentes, origen de pertenencia visible y archivos/listas afectados en la revisión. Regla de altas configurable y misma transacción de respaldo/recuperación.
- Evidencia: compilación correcta y 65 pruebas superadas. Altas directas conservan el archivo de cartas; bajas múltiples eliminan referencias locales duplicadas conservando externas; revisión caducada bloqueada; fallo del segundo archivo restaura el primero; listas vacías, miembro único, comentarios y comas finales verificados.
- Corrección incluida: eliminación localizada por árbol JSONC ante el defecto observado en la librería al borrar el último elemento de un array compacto.
- Pendiente de aceptación: recorrido visual/teclado y carga en el juego. Pendiente de implementación: copia de pools, conexión guiada a recompensas, adaptadores de C#/referencias externas e internacionalización/multiplataforma.
- Cambios locales, sin publicación en GitHub.

### Incremento de copia de pools · 02-10-2026

- Entregado: copia de pool local desde Pools, revisión de miembros/usos, materialización de pertenencias en la definición nueva y selección posterior. El origen y los archivos de cartas no cambian.
- Evidencia: 68 pruebas superadas; copia de unión directa/indirecta con referencias externas y campos desconocidos, ausencia de duplicado local añadido, edición posterior de la copia sin cambiar origen, pools vacíos, rechazo de listas malformadas/límite de 500 referencias y revisión obsoleta. Compilación correcta.
- Pendiente de aceptación: recorrido visual/teclado y carga en el juego. Pendiente de implementación: conexión guiada a recompensas, adaptadores C#/referencias externas e internacionalización/multiplataforma.
- Cambios locales, sin publicación en GitHub.

### Incremento de asignación de pools a efectos · 02-10-2026

- Entregado: selector de pool desde cartas/reliquias y sus efectos configurados, miembros locales y usos compartidos, revisión y guardado con respaldo. Reglas y catálogo en configuración, basados en la wiki local.
- Evidencia: 71 pruebas superadas y compilación correcta. Cambio localizado con conservación del origen, parámetros y pools; selección idéntica sin escritura; pools del juego en efectos de reliquias; rechazo de tipos no configurados, alternativas individuales, IDs duplicados y revisión obsoleta. Ante fallo del reemplazo se conserva el original y se retira el temporal.
- Pendiente de aceptación: recorrido visual/teclado y partida. El selector no simula efectos ni verifica automáticamente que todos los miembros correspondan al tipo esperado.
- Pendiente de implementación: recompensas/mapa, pools de personajes, adaptadores personalizados e internacionalización/multiplataforma.
- Cambios locales, sin publicación en GitHub.

### Incremento de pools de personajes · 02-10-2026

- Entregado: selección de miembros inline de invocaciones, búsqueda/estadísticas, recuentos, referencias protegidas, parámetros individuales conservados, usos compartidos, descarte, revisión y guardado con respaldo. Reglas/límites en configuración.
- Evidencia: compilación correcta y 75 pruebas superadas. Altas y bajas con referencias repetidas/estructuradas/externas, conservación del respaldo y archivos de unidades, selección idéntica sin escritura, creación de lista ausente, rechazo de pool vacío/IDs ambiguos/formato no soportado/revisión caducada y fallo de reemplazo sin pérdida ni temporales residuales.
- Fuentes: esquema local Trainworks-Reloaded/schemas/schemas/effects.json, referencia de efectos de la wiki y listas reales de Sweetkin. Los pools de personajes son listas del efecto; no se generan definiciones con ID.
- Pendiente de aceptación: recorrido visual/teclado y prueba en el juego. No se simulan probabilidades ni C#. Pendientes de implementación: recompensas/mapa, adaptadores personalizados/externos e internacionalización/multiplataforma.
- Cambios locales, sin publicación en GitHub.

### Incremento de pools de recompensas · 02-10-2026

- Entregado: asignación de pools a recompensas draft/card_pool desde el inspector y desde estandartes que las referencien. Selector, filtros, miembros locales, usos compartidos, revisión y respaldo; adaptadores configurables.
- Evidencia: compilación correcta y 78 pruebas superadas. Pruebas nuevas de rutas anidadas, conservación de costes/rarezas/nodos/extensiones/BOM/CRLF/comentarios, respaldo, referencias estructuradas idénticas, pools del juego, usos externos excluidos y rechazo de extensiones inválidas/ambiguas, IDs duplicados y revisión obsoleta.
- Pendiente de aceptación: recorrido visual/teclado y partida. No se simulan sorteos ni se modifican pools de aparición del mapa. Próximas mejoras: creación y parámetros de recompensas, adaptadores externos, internacionalización y verificación multiplataforma.
- Cambios locales, sin publicación en GitHub.

### Incremento de ajustes de recompensas · 02-10-2026

- Entregado: controles configurables para costes y parámetros draft, con explicación, revisión individual y respaldo desde recompensa o nodo del mapa.
- Evidencia: compilación correcta y 81 pruebas superadas. Conservación del formato y datos ajenos, costes por rareza intactos, alta de campo antes ausente, selección idéntica sin escritura, rechazo de tipos/valores fuera de límites/campos no aplicables, IDs/extensiones ambiguos y revisión caducada; fallo de reemplazo conserva origen y elimina temporal.
- Pendiente de aceptación: recorrido visual/teclado y partida. No se simulan probabilidades ni reglas de reliquias; campos avanzados mantienen edición JSON. Creación de recompensas/nodos e internacionalización/multiplataforma pendientes.
- Cambios locales, sin publicación en GitHub.

### Incremento de creación de recompensas · 02-10-2026

- Entregado: creación desde plantillas configuradas draft/card_pool y copia de recompensas desde Todos los objetos; selección automática del resultado y continuidad hacia ajustes/pools.
- Evidencia: compilación correcta y 84 pruebas superadas. Creación sin imágenes, integración con editores de ajustes/pools, conservación de origen/nodos/extensiones/referencias/idiomas, rechazo de pool desconocido/inválido/ambiguo, tipo no configurado, colisiones y revisión alterada/caducada.
- Pendiente de aceptación: recorrido visual/teclado y partida. Conexión a nodos/eventos y creación de nodos siguen pendientes, además de internacionalización/multiplataforma.
- Cambios locales, sin publicación en GitHub.

### Corrección de escala animada · 02-10-2026

- Corregido el cálculo de tamaño para character_art con animaciones por fotogramas, detectado en Roderic y Vesper. El renderizador local CharacterUIMeshAnimatedSprite conserva un quad fijo y aplica transform.scale; multiplicar también por tamaño PNG/PPU sobredimensionaba la vista.
- Primer fotograma idle local válido, quad configurable de 1 × 1 unidades, pivote centrado, alineación por diferencia de altura respecto al sprite base. La altura automática mantiene el cálculo a partir del sprite base. Si idle no se resuelve, imagen base con aviso; referencias externas no se resuelven como locales. Arte estático mantiene su cálculo anterior.
- Evidencia: compilación correcta y 85 pruebas superadas, incluyendo regresión de tamaño animado, pivote, fotograma, altura automática, fallback y conservación de archivos del clan. Verificación visual en el juego pendiente; animación completa y Spine siguen fuera de esta vista.
- Cambios locales, sin publicación en GitHub.

### Extracción de recursos oficiales · 02-10-2026

- Completada extracción de los 25 bundles de personajes de la instalación local, sin modificar archivos del juego. 1.916 PNG (527 sprites/1.389 texturas), 1.683 archivos auxiliares de animación, cero errores y aproximadamente 281 MB de salida.
- Evidencia: índice con hashes/procedencia/dimensiones/PPU/pivote, lectura correcta del sprite Shield Steward y revisión visual de su PNG. Script y reglas de extracción guardados; dependencias aisladas y salida en data ignorada por Git.
- Pendiente: asociación a catálogo oficial, escala/posición de prefabs e integración en el visor. Los atlas Spine no son poses completas. Sin publicación en GitHub.

### Revisión de requisitos de arte · 02-10-2026

- Incorporada al plan la referencia aportada docs/referencia/arte-escalas.md: identidad, marcos, estados del mapa, presentación de campeones, sprites/atlas de mecánicas y recursos según contenido.
- Carencias confirmadas: inventario actual solo sprites y asignaciones guiadas solo carta/personaje. Pendientes catálogo de roles en configuración, inventario atlas_icons/bundles, formularios de asignación y checklist con revisión de alpha/área visible.
- Criterios: medidas orientativas sin rechazar variantes funcionales; medium/large se conserva según rol existente; compartir imágenes entre roles permitido. Compensación de escala estática no extrapolada automáticamente a quads animados/Spine; suelo calibrado localmente.
- Revisión documental, sin cambios en clanes ni publicación en GitHub.

### Inventario atlas y prioridad final · 02-10-2026

- Entregado: atlas_icons en Recursos visuales y Validación, diferenciación de secciones/IDs compartidos y conservación de resolución exclusiva de sprites en los editores existentes.
- Evidencia: compilación correcta y 86 pruebas superadas. Regresión de ID compartido con imágenes distintas, catálogo de carta sin confusión, atlas ausente detectado y JSON original conservado.
- Pendiente: sustitución guiada de atlas, usos en texto, bundles y checklist/roles de arte.
- Decisión del usuario: comparación con imágenes oficiales al final, prioridad baja, sin bloquear el cierre principal. Extracción ya disponible; integración del visor pospuesta.
- Cambios locales, sin publicación en GitHub.
