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

**Objetivo:** poder crear un clan nuevo jugable y abrir, modificar y guardar los siete clanes de referencia sin pérdida de datos, con navegación, filtros, estadísticas, arte, progresión como Yokai y seguimiento de la DLL en GitHub. Deva queda fuera de la primera versión.

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

Estimación **preliminar**, para una persona con experiencia en TypeScript y conocimiento del modding de MT2: **360–580 horas**, aproximadamente **9–15 semanas a jornada completa**. Incluye la compatibilidad obligatoria con siete clanes, edición conservadora, creación jugable, recursos visuales, estadísticas, progresión y GitHub. El catálogo guiado inicial será pequeño; se amplía mediante ficheros de configuración. No incluye Deva, producir ilustraciones ni programar mecánicas C# nuevas para cada clan. La incertidumbre mayor está en importar y guardar sin pérdida los formatos existentes y en la prueba de carga real del juego.

La primera reestimación se hace al terminar la iteración 0, con el prototipo de parser y los siete fixtures; la segunda al terminar la iteración 2, cuando ya se conoce el coste real de edición conservadora. Cada revisión informa **objetivo conseguido, evidencia, horas consumidas, riesgos y siguiente prioridad**. El avance se mide por historias aceptadas y pruebas superadas, no por porcentaje de pantallas dibujadas.
