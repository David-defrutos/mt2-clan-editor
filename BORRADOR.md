# Editor de clanes de Monster Train 2 — borrador histórico

> Sustituido por [PLAN.md](PLAN.md) y [DESARROLLO-AGIL.md](DESARROLLO-AGIL.md). Este borrador conserva decisiones anteriores; el alcance vigente excluye Deva, toma Yokai como referencia de desbloqueos y comienza con un catálogo guiado reducido.

Estado: borrador de alcance, sin implementación. Plataforma objetivo: Windows, macOS y Linux.

## Objetivo

Crear un editor visual para diseñar un clan y generar un proyecto de mod de Trainworks Reloaded. El proyecto resultante se guarda como ficheros de texto e imágenes y puede versionarse en Git. La interfaz y el motor local estarán escritos en TypeScript; la compilación de la DLL del plugin seguirá siendo .NET, normalmente mediante GitHub Actions.

**Principio central:** nombres, cantidades, campos, reglas, catálogos, tamaños de arte, plantillas de salida y parámetros de publicación se leen de ficheros de configuración. El código del editor interpreta esos ficheros y no contiene reglas de un clan concreto.

## Alcance funcional

1. **Abrir cualquier clan mod compatible.** Seleccionar una carpeta local que contenga un clan Trainworks existente, aunque nunca se haya creado con este editor. Detectar `manifest.json`, todos los JSON bajo `json/` sin presuponer nombres o subcarpetas, `textures/`, DLL, código fuente y configuración propia cuando existan. Admitir tanto proyectos con fuente como paquetes instalados que solo tengan DLL, JSON y texturas. Distinguir los JSON registrados por el plugin de archivos presentes pero no cargados por el juego; cuando no haya fuente, indicar que el registro de rutas no puede inspeccionarse con el método normal. Identificar clase, campeones, sendas, cartas, pools, efectos, triggers y arte. Mostrar un informe de carga con archivos ausentes, referencias rotas y elementos no reconocidos. También permitir crear un clan nuevo. Los nombres de clan no estarán codificados en el programa.
2. **Clan.** Crear y editar ID, nombre, textos, colores, iconos y metadatos del mod. Configurar estilo de carta y pantalla de selección, iconos y retratos de campeones, nodo de estandarte, recompensa y sus referencias. Generar los archivos de clase, manifiesto y proyecto necesarios.
3. **Campeones.** Exactamente 2 por clan. Cada uno tiene carta de campeón, personaje, carta inicial propia y 3 sendas. Cada senda contiene 3 niveles de mejora configurables: estadísticas, efectos, triggers y habilidades. El editor muestra las relaciones entre niveles y detecta referencias rotas.
4. **Cartas y contenido adicional.** Crear y duplicar cartas de unidad, hechizo, sala y equipo. Configurar nombre, descripción, ID, tipo, rareza, coste de ember, objetivos y pertenencia a pools. En unidades: ataque, salud y tamaño. Número variable de cartas comunes, infrecuentes y raras; una configuración puede ofrecer el reparto habitual como plantilla, sin imponerlo. Leer y conservar también cartas de habilidad, tokens, blights, reliquias, estados, esencias, mejoras, máscaras, valores rastreados, textos, nodos y demás secciones que aparezcan en los clanes de referencia. Cada sección tendrá formulario definido por esquema o, como mínimo, edición JSON con validación.
5. **Cartas iniciales y pools.** Asociar una carta inicial a cada campeón. Crear, cargar y editar un número variable de pools y sus referencias: los habituales `MegaPool`, `UnitsAllBanner` y `StarterCardsOnly`, además de pools propios o auxiliares para salas, equipos, kits y otras recompensas. La plantilla inicial puede ofrecer dos pools principales, pero no limitar a dos un clan importado. El editor debe mostrar dónde aparecerá cada carta, ya que rareza y pool cumplen funciones distintas.
6. **Efectos, triggers y habilidades.** Elegir entradas de un catálogo configurable de mecanismos ya existentes. Cada entrada declara sus parámetros, tipos, valores permitidos, requisitos y compatibilidad con cartas o personajes. Permitir varios efectos en orden. Las habilidades de unidad incluyen recarga y objetivo. Mostrar una vista de la estructura resultante antes de guardar.
7. **Recursos visuales.** Gestor de imágenes para todos los usos encontrados en un clan: arte de carta; `character_art` de unidades y campeones; iconos y retratos de selección de campeón; iconos, silueta y estandarte de clan; reliquias y sus iconos de HUD; equipos, salas, nodos de mapa, estados, triggers, habilidades, marcos/estilos de carta y otros sprites de interfaz. Importar y reemplazar cada recurso desde su uso concreto, mostrando qué objetos lo comparten. Descubrir su función a partir de las referencias `sprites`, `game_objects`, `atlas_icons` y de los campos que lo usan, no solo del nombre del PNG. Preparar una copia con las dimensiones, transparencia, encuadre y anclaje del perfil correspondiente; conservar siempre el original. No reescalar automáticamente iconos, marcos o elementos de interfaz con el perfil de arte de carta. Al cambiar el tamaño del arte de personaje, ajustar o advertir sobre `transform.scale` y `position` para que conserve su tamaño y altura en el juego. Mostrar vista previa, imágenes sin uso, referencias rotas y rutas cuyo uso de mayúsculas/minúsculas no coincide con el archivo.
8. **Salida y guardado.** Para un clan nuevo, generar JSON de Trainworks, texturas, `manifest.json`, código mínimo del plugin que registre todas las rutas JSON, proyecto .NET y workflow de GitHub Actions a partir de plantillas versionadas. Para una carpeta existente, editar los ficheros originales de forma localizada: conservar campos, secciones, orden, codificación, saltos de línea, DLL, archivos C# y archivos que el editor no comprende. Una carga seguida de guardado sin cambios no debe escribir ningún archivo. Mostrar diferencias antes de escribir; los tipos sin formulario visual tendrán edición JSON. En paquetes sin fuente, permitir cambios en JSON ya cargados y arte, y advertir antes de crear un JSON nuevo que la DLL existente quizá no registre su ruta. Hacer una copia de seguridad y permitir guardar en otra carpeta. Poder reabrir el resultado.
9. **Validación.** Comprobar esquema, IDs únicos, referencias `@`, presencia de imágenes, dos campeones y sus seis sendas, cartas iniciales, estilo y recursos del clan, nodo y recompensa de estandarte, composición de pools, parámetros obligatorios de efectos y rutas registradas por el plugin. Separar errores que impiden generar de advertencias de diseño. Mostrar archivo/campo y cómo corregirlo. Si falta fuente o la DLL no permite comprobar sus rutas, marcar esa comprobación como no verificable en vez de darla por correcta.
10. **GitHub y DLL.** Configurar repositorio, rama, workflow y nombre del artefacto. Antes del envío: vista de cambios y validación. Después: commit y push, localizar el run correspondiente al SHA enviado, disparar el workflow manualmente si el filtro de rutas no lo inicia, mostrar progreso y errores, y comprobar que el artefacto contiene una DLL del run correcto. Descargarla opcionalmente. Instalarla en el perfil local sería una acción separada y configurable.
11. **Persistencia.** Guardado automático o explícito del proyecto, copias de seguridad de cambios y capacidad de reabrirlo en los tres sistemas operativos. Las rutas se guardan relativas al proyecto cuando sea posible.
12. **Navegación y filtros.** Barra lateral fija con secciones de clan, campeones y sendas, cartas, pools, efectos y habilidades, arte, estadísticas, validación y publicación. Mostrar recuentos y avisos por sección; permitir expandir los campeones y sus sendas y volver al elemento anterior sin perder cambios. En los listados, búsqueda por texto e ID y filtros combinables por tipo de carta, rareza, pool, campeón/senda, coste, efecto, trigger, habilidad, arte asignado y estado de validación. Ofrecer limpiar filtros y mostrar cuántos elementos cumplen la selección.
13. **Estadísticas globales.** Pantalla accesible desde la barra lateral para seleccionar varias carpetas de clanes y compararlas, sin tener que abrirlas una a una como proyecto de edición. Mostrar campeones, sendas, cartas de draft por rareza y tipo, cartas iniciales, unidades de estandarte, costes de ember, ataque/salud de unidades, efectos, triggers, habilidades, pools, reliquias, estados y cobertura de recursos visuales por categoría (carta, personaje, selección, reliquia, interfaz, etc.). Incluir totales, distribuciones y avisos de datos incompletos. Cada cifra debe poder llevar a la lista filtrada que la compone. Los recuentos se actualizan al editar y pueden exportarse a CSV.

## Ficheros de configuración propuestos

| Fichero | Contenido |
|---|---|
| `editor.json` | Idioma, directorios, herramientas externas y preferencias locales. |
| `ui/navigation.json` y `ui/filters.json` | Secciones, orden, etiquetas, campos de búsqueda y filtros visibles en cada listado. |
| `stats/metrics.json` | Definición de métricas, filtros de inclusión, agrupaciones y columnas de comparación. |
| `rules/mt2-trainworks.json` | Tipos de objeto, campos, reglas de validación, cardinalidades y nombres de pools técnicos. Versionado por versión compatible de Trainworks. |
| `import-profiles/*.json` | Cómo reconocer una carpeta de clan, localizar sus archivos y mapear variantes conocidas al modelo del editor, sin depender del nombre de la carpeta. |
| `config.schema.json` y `migrations/*.json` | Validación y versionado de la propia configuración; migración de proyectos guardados al cambiar el formato del editor. |
| `catalogs/effects.json` | Efectos disponibles y formulario declarativo de parámetros de cada uno. |
| `catalogs/triggers.json` | Triggers de carta y personaje, condiciones y compatibilidades. |
| `catalogs/abilities.json` | Habilidades existentes, recargas, objetivos y enlaces que necesitan. |
| `presets/clan-standard.json` | Plantilla inicial: 2 campeones, 3 sendas × 3 niveles, 2 cartas iniciales y sugerencia de reparto de cartas. |
| `art-profiles/*.json` | Tamaños, recorte, transparencia, anclaje, compensación de escala y reglas de validación por función del recurso: carta, personaje, selección, reliquia, HUD, equipo, sala, estado, mapa e interfaz. |
| `templates/**` | Plantillas de JSON, manifiesto, plugin C#, proyecto .NET y workflow. |
| `clan/project.json` y `clan/content/*.json` | Datos editables de un clan concreto, independientes de los JSON generados. |
| `clan/publish.json` | Repositorio, rama, workflow, artefacto y destino de descarga o instalación. |

Las credenciales de GitHub se obtendrán del gestor de credenciales del sistema o de una herramienta de autenticación instalada; los tokens **no** se escribirán en los ficheros del proyecto. Los catálogos deberán indicar procedencia y versión. Al abrir un proyecto se fija la versión de reglas y catálogos usada, para que una actualización del editor no cambie silenciosamente su salida. Una entrada no catalogada podrá conservarse mediante edición avanzada del JSON, con una advertencia de que el editor no puede validar sus parámetros.

## Arquitectura propuesta

- **Interfaz TypeScript** servida localmente y abierta en el navegador. Funciona sin servidor externo y evita depender de un contenedor de escritorio específico.
- **Servicio local TypeScript/Node.js** para mostrar un selector de carpetas del sistema y acceder a archivos, procesar imágenes, validar, generar el mod y ejecutar operaciones Git/GitHub. La interfaz no accede directamente al sistema de archivos; el servicio escucha solo en la máquina local.
- **Dos modos de guardado:** un clan nuevo se genera desde configuración + proyecto; un clan importado se modifica en sus propios archivos, sin convertirlo obligatoriamente al formato del editor. El motor comparte el análisis y la validación, y evita reescribir el contenido que no se ha editado.
- **Adaptadores de sistema:** rutas, Git, credenciales y herramientas externas con comportamiento comprobado en Windows, macOS y Linux. Los scripts PowerShell actuales sirven de referencia funcional; sus funciones necesarias se trasladan a TypeScript o a comandos multiplataforma.
- **Build .NET en GitHub Actions:** TypeScript genera el proyecto y observa la compilación; el DLL sigue siendo C# porque es un plugin del juego.

## Fases y entregables

| Fase | Entregable verificable |
|---|---|
| 1. Especificación | Esquema del proyecto, reglas, catálogos iniciales e inventario de las variantes de los ocho clanes instalados. |
| 2. Editor básico | Selector de carpeta, lectura y guardado conservador de los ocho clanes de referencia, incluido el caso sin fuente de Deva; navegación lateral, búsqueda, filtros y estadísticas comparativas; creación de clan, campeones, sendas, cartas y pools. Generación de JSON y plugin mínimo para clanes nuevos. |
| 3. Mecánicas | Selector de efectos/triggers/habilidades con parámetros y validación de referencias. |
| 4. Recursos visuales | Inventario por uso, importación, vista previa, preparación, referencias compartidas y asignación a todos los tipos de imagen observados. |
| 5. Publicación | GitHub Actions, estado del run, descarga y verificación de DLL. |
| 6. Cierre | Prueba completa creando un clan nuevo y abriéndolo en el juego; apertura, cambio localizado y guardado de los ocho clanes; documentación de uso en los tres sistemas. |

## Criterios de aceptación

- Se pueden seleccionar por separado las carpetas de **The Free Company, SuccClan, Sandscourged, The Silk Song, Pathogens, Equestrian, Yokai y Deva**. En cada una se ven campeones, sendas, cartas, pools y arte; cambiar un dato y guardar no altera el resto de su contenido. Reabrir la carpeta reproduce ese cambio. Una carga y guardado sin cambios deja intactos los archivos.
- Para cada clan de referencia, una prueba compara todos los ficheros antes y después de guardar sin cambios y otra verifica que editar un campo solo altera los archivos esperados. Se prueba también crear desde cero un proyecto con las secciones que ese clan utiliza; las mecánicas C# propias se suministran como código o plantilla, no se inventan a partir de JSON.
- Una carpeta adicional que siga el formato Trainworks se descubre por su contenido y se puede abrir sin añadir su nombre al código. Las secciones nuevas se conservan y pueden editarse como JSON hasta que exista un formulario visual.
- En un clan cargado, la barra lateral permite acceder a cualquier campeón, senda y sección principal. La búsqueda y los filtros combinados reducen los listados sin modificar datos; los recuentos, avisos y la opción de limpiar filtros se actualizan al cambiar la selección.
- La pantalla de estadísticas compara los ocho clanes con las mismas definiciones de métricas. Distingue cartas de draft de habilidades, tokens y cartas sin rareza; al seleccionar una cifra se ven los elementos que la forman. Los valores cambian tras editar y se pueden exportar.
- Se puede crear un clan con 2 campeones, sus 6 sendas completas, 2 cartas iniciales y N cartas por rareza sin editar a mano el JSON generado.
- Las cartas de unidad permiten configurar coste, ataque, salud, arte de carta y arte de personaje. Los efectos y triggers del catálogo se parametrizan desde la interfaz.
- Para cada uno de los ocho clanes se reconocen y pueden reemplazarse, sin perder referencias, las imágenes de carta, personaje, selección, reliquia y demás categorías presentes. Un recurso compartido muestra todos sus usos; el perfil de tamaño aplicado depende de su función, y el arte de personaje conserva su escala aparente al redimensionarlo.
- La validación detecta IDs duplicados, referencias inexistentes, pools incorrectos, imágenes ausentes y archivos JSON no registrados en el plugin.
- Los clanes creados desde cero se regeneran de forma determinista desde configuración y proyecto. Los clanes importados conservan sus archivos originales y solo escriben los cambios solicitados.
- Un clan nuevo incluye estilo visual, recursos de selección, nodo y recompensa de estandarte, y puede seleccionarse y jugarse tras generar y compilar el plugin.
- Tras un push, la interfaz identifica el run asociado al commit y confirma si produjo una DLL descargable. Un run anterior no puede presentarse como resultado del commit actual.
- El mismo proyecto de clan puede abrirse y generar la misma estructura en Windows, macOS y Linux, salvo diferencias propias de rutas y herramientas instaladas.

## Límites y decisiones pendientes

- **Catálogo:** decidir qué efectos, triggers y habilidades entran en la primera versión. Cubrir toda la API de Trainworks elevaría mucho el coste de formularios y pruebas.
- **Compatibilidad de importación:** los ocho clanes instalados son pruebas obligatorias de la primera versión, no ejemplos opcionales. La estructura varía: Free Company declara la clase en `json/plugin.json`, The Silk Song en `json/class/silksong.json`, varios en `json/class.json` y Deva concentra el contenido en `json/content.json`. El importador debe recorrer todos los JSON y reconocer sus secciones por contenido. Un mod que no use Trainworks requerirá un perfil de importación propio.
- **Mecánicas nuevas:** los siete clanes `David-*` incluyen código C# propio; Deva solo aporta la DLL instalada. El editor debe conservar fuentes y binarios al cargar, editar y guardar, y permitir gestionar las referencias conocidas desde la configuración. Crear desde cero una mecánica C# arbitraria requiere programar esa mecánica; la configuración puede declarar su formulario y su plantilla, pero no sustituye su lógica.
- **Publicación de paquetes sin fuente:** Deva no trae `src/`, workflow ni metadatos Git en la carpeta instalada. Se puede editar su contenido existente, pero compilar una DLL nueva o publicarla en GitHub requiere obtener la fuente o crear un proyecto nuevo; el editor debe mostrar esa condición de forma explícita.
- **Publicar:** aquí significa subir a GitHub y comprobar la DLL. Publicar en Thunderstore y generar ilustraciones no están incluidos.
- **Pools:** para un clan nuevo se ofrece una plantilla con los dos pools principales de draft y estandarte; los clanes observados necesitan además `StarterCardsOnly` y varios pools auxiliares. El editor no impondrá un máximo de dos.

## Repaso breve de los ocho clanes instalados (28-09-2026)

Se revisaron los JSON y texturas de las carpetas `David-*` y `DevaClan` del perfil instalado, y las fuentes C# cuando existen. Los ocho tienen 2 campeones con 3 sendas de 3 niveles. Los números de cartas siguientes son **todas** las entradas `cards`, incluidas habilidades y auxiliares; no son directamente el tamaño del draft.

El perfil también contiene carpetas de versiones originales y otros mods. Las copias originales de Silk Song, FreeCompany, Sandscourged, Disciple, Steward y Yokai tienen sus DLL/manifiestos renombrados con `.old`; se tratan como referencias o importaciones manuales, no como clanes activos de esta matriz. `Conductor-FullClan` es una dependencia sin datos de clan en JSON.

| Clan | JSON | Cartas | Rasgos que debe cubrir el editor |
|---|---:|---:|---|
| The Free Company | 78 | 103 | Clase en `plugin.json`, kits, salas, equipos, estados, efectos propios y pools adicionales. |
| SuccClan | 58 | 43 | Esencias, blight, reliquias, estados y efectos propios. |
| Sandscourged | 71 | 62 | Blights, scourges, equipos, valores rastreados, textos y muchos pools auxiliares. |
| The Silk Song | 94 | 61 | Clase en `json/class/silksong.json`, carpetas muy divididas, HUD, textos de reemplazo y estados. |
| Pathogens | 66 | 51 | Esencias, tipos de trigger, estados y efectos propios. |
| Equestrian | 63 | 47 | Triggers de carta, modificadores de sala, máscaras y reliquias. |
| Yokai | 58 | 62 | Clase en `class.json`, cartas auxiliares sin rareza, salas, equipos y estados. |
| Deva | 1 | 66 | Todo en `json/content.json` (5.629 líneas), 137 archivos de arte, HUD, estados y pools auxiliares; solo DLL instalada, sin fuente ni Git en la carpeta. |

**Conclusión de diseño:** no bastan formularios de “carta común/infrecuente/rara” ni dos pools fijos. La carga debe descubrir secciones en cualquier JSON, ofrecer edición guiada por esquemas y conservar el resto sin pérdida. Las estadísticas deben contar por función real de la carta, no sumar indiscriminadamente el campo `rarity` ni todas las entradas `cards`.

## Base observada en este workspace

- `repos/david/mt2-freecompany/json/plugin.json`: clase, campeones, sendas y pools.
- `repos/david/mt2-freecompany/json/units/unit_berserker.json`: carta, unidad, efectos, triggers y sprites.
- `repos/david/mt2-freecompany/src/Plugin.cs`: registro explícito de rutas JSON.
- `scripts/preparar-arte-mt2.ps1`: reglas actuales de preparación de imágenes.
- `scripts/publicar-y-instalar-dll.ps1`: validación, envío, seguimiento y comprobación de artefacto.
- `docs/referencia/efectos-carta.md`, `triggers-carta.md`, `triggers-personaje.md` y `habilidades-de-unidad.md`: punto de partida para catálogos, sujetos a revisión contra la versión instalada.
