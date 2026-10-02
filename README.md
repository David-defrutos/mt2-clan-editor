# Editor de clanes de Monster Train 2

Aplicación local en TypeScript para crear, abrir y editar proyectos de clanes basados en Trainworks Reloaded. El plan funcional está en [PLAN.md](PLAN.md), el plan ágil en [DESARROLLO-AGIL.md](DESARROLLO-AGIL.md) y los hallazgos de la wiki en [REVISION-WIKI-TRAINWORKS.md](REVISION-WIKI-TRAINWORKS.md).

## Iniciar

Requiere Node.js 22 o superior. En esta carpeta:

```powershell
npm install
npm run build
npm start
```

Abre `http://127.0.0.1:4318`. `npm run check` comprueba los tipos y `npm test` ejecuta las pruebas. La aplicación está diseñada para Windows, macOS y Linux; en este incremento solo se ha probado en Windows; el selector nativo de carpetas utiliza PowerShell, AppleScript o Zenity, respectivamente. También se puede pegar una ruta absoluta.

## Lo que ya hace

- Abre y recorre los siete clanes de referencia (The Free Company, SuccClan, Sandscourged, The Silk Song, Pathogens, Equestrian y Yokai). Deva y los clanes originales instalados se incorporan mediante búsqueda e importación, incluidas copias de archivos `.old` desactivados. Véase REVISION-CLANES-INSTALADOS.md.
- Genera un proyecto nuevo con dos campeones, tres sendas de tres niveles para cada uno, dos cartas iniciales, N unidades de draft (mínimo dos de estandarte), dos pools propios, circuito de estandarte, recursos visuales de clan y campeón, manifiesto, fuente C# y workflow de compilación. Las cantidades y los perfiles del proyecto nuevo salen de `config/templates/new-clan.json`.
- Busca y filtra cartas, unidades, todos los objetos JSON, pools, mecánicas e imágenes; muestra progresión inspirada en Yokai y compara estadísticas globales.
- En **Estadísticas**, cada cifra abre su desglose con búsqueda por nombre, ID o archivo. Los resultados con objeto definido se abren en **Todos los objetos** con su inspector. Las medianas muestran la muestra de unidades y promedian los dos valores centrales cuando hay un número par de valores. Las métricas y niveles técnicos excluidos del draft están en `config/stats.json`; las habilidades y cartas de nivel 99 no inflan las cifras de draft. El recuento de errores usa la misma validación que la ficha del clan.
- En **Progresión → Editar desbloqueos**, selecciona cartas de draft, filtra por nombre, archivo o nivel actual y asigna un nivel normal a varias cartas. **Previsualizar desbloqueos** muestra los cambios por carta y archivo antes de guardar. **Desde el inicio** elimina `unlock_level`. Iniciales, campeones, habilidades y niveles técnicos quedan fuera de esta edición. Los límites y el campo editable están en `config/progression.json` y `config/stats.json`.

- Edita campos guiados, asigna definiciones ya existentes de efectos, triggers y habilidades, y permite editar el JSON completo de un objeto. Antes de guardar se muestra una vista previa. Cada cambio crea una copia de seguridad en `data/backups/` y rechaza archivos modificados fuera del editor.
- Clasifica sprites por uso, informa dimensiones y referencias, y permite sustituir un PNG con vista previa y ajuste de tamaño. La imagen anterior queda respaldada.
- Comprueba sintaxis, IDs duplicados, estructura de campeones, cartas iniciales, algunos rangos, referencias locales entre objetos y recursos visuales. Las excepciones de referencias a clases y triggers externos están en `config/validation.json`, según los siete clanes de referencia. Los siete clanes se leen correctamente. La comprobación de mayúsculas detecta tres rutas de imagen que conviene corregir para Linux/Proton: `icon_Vizier` (Sandscourged), `LaceChampionIcon` (The Silk Song) y `FearstoneIcon` (Yokai).
- En **Publicación → Compilación local**, detecta proyectos C# del clan, ejecuta `dotnet build` en Release sin GitHub y muestra el registro. Si genera una DLL nueva, indica su ruta y SHA-256, incluso cuando el proyecto define un `AssemblyName` distinto a su nombre de archivo. El comando, los límites y la búsqueda de proyectos están en `config/build.json`.
- **Compilar con DLL instaladas** compila las fuentes C# en un proyecto aislado bajo `data/offline-builds/`, usando las referencias de `data/build-local.json`. Esta opción se ha probado con un clan recién generado y Trainworks 0.7.27, comprobando que todos los archivos del clan conservan su hash.
- **Preparar carpeta del mod** reúne la última DLL compilada desde el editor, `json/`, `textures/` y los archivos opcionales definidos en `config/artifacts.json`. Guarda la salida en una carpeta nueva de `data/packages/` con un registro de hashes. Detecta cambios en fuentes, DLL y contenido; cambiar JSON o texturas permite preparar de nuevo sin recompilar. Para DLL locales también comprueba las referencias y su configuración. Los pasos de compilación externos al árbol del clan todavía requieren revisión manual.

## Probar un clan nuevo

En **Campeones**, busca por nombre, ID o mejora. Cada senda muestra sus bonificaciones de ataque, salud y tamaño por nivel; pulsa una mejora para editar su nombre, descripción y bonificaciones en **Objetos**. Los botones de carta, unidad, inicial y clase abren sus respectivos inspectores. Guarda el cambio y vuelve a **Campeones** para recalcular.

Los selectores permiten comparar hasta tres niveles entre dos sendas. El nivel II sustituye al I: se suma solo la mejora seleccionada de cada senda a los valores base. **Restablecer** vuelve a los valores sin mejoras. La configuración está en `config/champions.json` y los campos editables en `config/fields.json`.

**Editar árbol de sendas** permite asignar mejoras locales existentes a los niveles del árbol. Filtra el catálogo por nombre, ID o archivo, cambia los selectores y pulsa **Previsualizar cambios** antes de **Guardar árbol de sendas**. La vista muestra las referencias anterior y nueva y avisa de mejoras compartidas o repetidas. El guardado crea una copia de seguridad, comprueba el hash actual del archivo y conserva comentarios, formato, otros campeones y referencias sin modificar. Las referencias externas se conservan mientras no se sustituyan explícitamente. El selector excluye IDs duplicados; añadir sendas o niveles ausentes sigue disponible mediante el editor avanzado de la clase.

La vista calcula bonificaciones numéricas explícitas; no simula combate, habilidades, triggers, modificaciones iniciales ni C# personalizado. Los avisos identifican esos campos y las referencias externas o no resueltas. Los valores desconocidos aparecen como `—`. Se ha verificado la resolución de las 126 mejoras de los siete clanes de referencia y las 18 de la demo, sin modificar sus archivos. La revisión visual automatizada de esta pantalla está pendiente.

1. Inicia el editor y pulsa **Crear clan** en la biblioteca.
2. Elige una carpeta de destino nueva dentro de una carpeta que ya exista y completa identidad, campeones y cartas iniciales.
3. Revisa **Cartas**, **Campeones**, **Recursos visuales** y **Validación**.
4. En **Publicación**, selecciona `src/ID.Plugin.csproj` y pulsa **Compilar con DLL instaladas**. El resultado muestra la ruta de la DLL, SHA-256 y registro.
5. Pulsa **Preparar carpeta del mod**. Copia la carpeta indicada a un perfil de pruebas de BepInEx que tenga las dependencias del clan. Comprueba la selección de campeones, iniciales y estandarte dentro del juego y revisa `LogOutput.log` si falla.

La pantalla conserva la última compilación correcta aunque vuelvas a abrirla. **Actualizar comprobación** contrasta fuentes y contenido con la salida preparada. Cambios en C# o en el proyecto requieren recompilar; cambios solo en JSON o texturas requieren preparar de nuevo. La salida incluye los directorios configurados; añade a `config/artifacts.json` cualquier otro directorio de recursos que necesite un proyecto importado. El editor no instala la carpeta automáticamente.

Para configurar esta opción en otro equipo, copia `config/build-local.example.json` a `data/build-local.json`, sustituye los valores por rutas absolutas a las DLL y escribe la versión instalada de Trainworks. Los nombres de referencias y el framework están en `config/offline-build.json`. Las rutas locales permanecen fuera de Git. Reinicia el editor o vuelve a entrar en Publicación después de cambiar la configuración.

La opción con DLL instaladas está pensada para las fuentes de la plantilla generada: usa el framework configurado y no reproduce propiedades, generadores, recursos incrustados ni pasos personalizados del proyecto original. Para proyectos importados que necesiten esos pasos, usa **Compilar DLL local**, que ejecuta su `.csproj` completo. Una DLL compilada aún necesita los JSON y texturas del clan y la comprobación de carga en el juego.

## Estado y límites de esta versión

### Vista de personaje

Los controles se organizan en **Tamaño**, **Movimiento vertical · Y** y **Movimiento horizontal · X**. Cada bloque explica su función y los botones `?` ofrecen ayuda al pasar el ratón, enfocar con el teclado o pulsarlos. `Escape` cierra la ayuda. El bloque horizontal está plegado inicialmente: normalmente basta con ajustar tamaño y altura. La ayuda de altura distingue la posición base de la corrección adicional y explica cómo conservar el cálculo automático. Los grupos y sus textos están en `config/character-preview.json`.

El selector **Fondo** permite alternar la cuadrícula con una captura del juego. En este equipo está configurada la sala aportada, con el personaje a la izquierda del Shield Steward. La captura original está en `data/preview/train-floor.png` (archivo local); copia un PNG de 1632 × 413 allí para utilizar el mismo encuadre en otro equipo. Sus dimensiones, origen, suelo y proyección X/Y están en `config/character-preview.json`. El zoom mueve conjuntamente fondo y personaje. Cambiar de fondo no modifica ningún ajuste del clan.

Este encuadre se ha recalibrado con las capturas de Virodemonologist, Carrier e Incubus Butcher, normalizando sus dimensiones por el Shield Steward. La proyección común usa 72 px/unidad en ambos ejes y origen Y 300; el hueco izquierdo se conserva. Carrier tiene una corrección visual explícita en `background.projectionOverrides` (factor vertical 0.855 y desplazamiento −10 px), porque su proporción en la captura difiere de la de los otros dos. Esta excepción es empírica y requiere contraste con una nueva captura del juego; se indica en pantalla. Ninguna de estas correcciones modifica el JSON del clan. La captura no reproduce shaders, animaciones, oclusiones ni perspectiva 3D. El perfil de combate no calibra la selección de campeones.

Abre **Vista de personaje** en la barra lateral. Elige un `character_art`, filtrando por nombre, sprite o uso (combate/selección). Arrastra la imagen para moverla y el tirador de su esquina para redimensionarla; también puedes usar deslizadores y valores numéricos de escala, altura y desplazamiento. **Mantener proporciones** conserva la relación de escalas. El zoom y la cuadrícula solo afectan a la vista.

Pulsa **Previsualizar guardado** para comprobar los campos y objetos afectados; **Guardar ajustes con respaldo** modifica únicamente las transformaciones elegidas. Conserva el PNG, animaciones, profundidad Z, otros objetos y campos desconocidos. Si varios personajes usan el mismo objeto, todos recibirán el ajuste. **Restablecer cambios** recupera los valores cargados. Las reglas, límites, pivote y tamaño de la guía están en `config/character-preview.json`.

Para arte estático, la vista dibuja el sprite base usando sus dimensiones, píxeles por unidad, pivote, escala, posición y desplazamiento. Para animaciones por fotogramas, muestra el primer fotograma idle sobre el quad fijo de Trainworks, con pivote centrado; no multiplica el tamaño del quad por las dimensiones del PNG. Conserva el sprite base para calcular la altura automática y aplica la diferencia de altura del fotograma en su alineación. Las medidas del quad y el nombre de la animación de reposo están en frameAnimation de config/character-preview.json. La altura automática usa el factor 0.647 del código local de Trainworks; las diferencias entre versiones, meshes tight, Spine, cámara, iluminación y animaciones requieren verificación dentro del juego. No es una captura de MT2. Los mods históricos con otro PPU pueden necesitar cambiar el valor predeterminado de configuración. Se han resuelto las 166 imágenes de personaje entre siete clanes y la demo. La revisión visual automatizada está bloqueada por el error de ACL del navegador de este entorno.

El guardado de desbloqueos conserva comentarios, formato y campos ajenos. Comprueba todos los hashes antes de escribir y respalda los originales bajo `data/backups/`; si falla un reemplazo, intenta revertir los archivos ya escritos sin sobrescribir cambios externos. `transaction.json` registra el resultado. Una interrupción del proceso entre archivos puede requerir recuperar las copias originales: el guardado completo de varios archivos no es una operación atómica del sistema de archivos.

La creación produce una **base editable**. Los gráficos de color son marcadores y las cartas de draft son unidades simples. La estructura generada ya incluye el estandarte y pasa pruebas de referencias internas, pero aún no está confirmada por una carga en el juego. El proyecto requiere revisión de equilibrio, iconos, recompensas y mecánicas antes de distribuirse. La compilación local se ha probado con una biblioteca .NET sin dependencias. Además, el C# generado compiló sin errores contra las DLL de Trainworks Reloaded 0.7.27 instaladas en este equipo; esa prueba no equivale a compilar el proyecto generado con su dependencia declarada 0.7.1 ni a cargarlo en el juego. Ese build normal sigue bloqueado porque GitHub Packages responde `401` al restaurar `TrainworksReloaded.Base`. La [guía de Trainworks](https://github.com/Monster-Train-2-Modding-Group/Trainworks-Reloaded/wiki/Getting-Setup-for-Modding) indica usar una credencial con `read:packages` para ese feed. Las credenciales se configuran en NuGet fuera del proyecto; no deben añadirse al repositorio.

La pantalla de publicación muestra Git, crea un commit limitado a la carpeta del clan, envía la rama a `origin` y consulta los runs de GitHub Actions asociados al SHA actual. Puede descargar el artefacto de un run exitoso del SHA actual y comprobar que incluye una DLL; no instala el archivo en el juego. La validación todavía no comprueba todas las referencias de Trainworks ni confirma el resultado dentro del juego. Los perfiles de dimensiones de arte y las reglas de edición están en `config/`; el editor conserva campos desconocidos de los clanes importados.

El workflow de los clanes nuevos comprueba que el repositorio tenga los secretos `GH_AUTH_USER` y `GH_AUTH_TOKEN` (token con `read:packages`) antes de restaurar paquetes. El token se usa solo en el runner de Actions y no se incluye en los archivos generados.

Nunca se editan los siete mods por ejecutar las pruebas. Las pruebas de escritura usan carpetas temporales. La biblioteca local y las copias de seguridad están en `data/`, ignorada por Git.




## Descubrir clanes instalados y versiones desactivadas

En Biblioteca, **Buscar clanes** revisa las rutas de `config/library-discovery.json`. También puedes introducir la carpeta de plugins de otro perfil. **Añadir carpeta** registra un clan activo; **Importar copia** abre los datos `.old` en una copia de trabajo independiente sin reactivar la instalación. Los archivos `.old` son datos válidos desactivados por Thunderstore. Los complementos sin clase propia se muestran con el filtro correspondiente. La revisión ampliada está en [REVISION-CLANES-INSTALADOS.md](REVISION-CLANES-INSTALADOS.md).

La vista de personaje escribe `extensions.character_art.transform.offset`. Lee `offset_position` histórico con aviso; al editar uno de sus desplazamientos migra el vector completo, conservando X/Y/Z y creando respaldo. Una transformación mal anidada genera avisos. Comprueba que el juego usa la versión de Trainworks correspondiente antes de probar estos ajustes.

### Crear arte independiente

En el inspector de Cartas o Unidades, selecciona un recurso en **Asignar arte existente** y despliega **Crear una copia de arte independiente**. Introduce un ID nuevo, pulsa **Previsualizar copia de arte** y revisa los archivos y la referencia antes de **Crear copia y asignarla con respaldo**. Se duplican objeto de arte, sprites y PNG, incluidos fotogramas locales de animación; varios sprites que usan la misma imagen comparten una única copia de ese PNG. La referencia se cambia solo en la carta/unidad elegida. Las transformaciones, pivotes, píxeles por unidad y campos desconocidos se conservan.

Después puedes sustituir el PNG desde Recursos visuales o ajustar el nuevo character art desde Vista de personaje. Límites, rutas y formatos no soportados se configuran en `config/visual-copy.json`. Se rechazan IDs/rutas ocupados y vistas previas obsoletas. Si falla la asignación final se retiran los archivos nuevos y se conserva el JSON original. Spine y referencias externas requieren un adaptador antes de copiarse.

### Asignar arte del catálogo existente

El inspector de **Cartas** y **Unidades** incluye **Asignar arte existente**: busca por nombre o ID, selecciona una imagen del tipo correspondiente, revisa sus dimensiones y usuarios compartidos, pulsa **Previsualizar asignación** y guarda con respaldo. Las reglas están en `config/visual-assignments.json`. La asignación modifica solo la referencia; seleccionar el mismo recurso conserva la representación original, incluidas referencias estructuradas. El PNG y las transformaciones no se modifican. Los IDs duplicados se excluyen del catálogo y se rechazan al guardar. Para usar un archivo nuevo, sustituye la imagen desde Recursos visuales; la copia independiente está disponible en el formulario descrito arriba; Spine y otros contextos requieren adaptadores.

### Elegir la unidad invocada

En el inspector de una carta de unidad, despliega **Unidad invocada · asignación guiada**. También está disponible al seleccionar su efecto en Mecánicas o Todos los objetos. Elige el efecto cuando la carta tenga varios, selecciona **Unidad principal** o **Unidad adicional**, busca un personaje por nombre/ID y revisa ataque, salud, tamaño y usos directos del efecto. Pulsa **Previsualizar invocación** y guarda con respaldo. La unidad adicional puede quitarse; la principal es obligatoria.

Los cambios afectan a todas las cartas que usan ese efecto compartido. Solo se modifica la referencia del personaje, conservando comentarios, formato y otros parámetros. Una selección idéntica no reescribe referencias estructuradas. Los IDs duplicados se excluyen; se rechazan vistas previas obsoletas y referencias inexistentes. Tipos y campos están en `config/spawn-assignment.json`. Las invocaciones por pool o con lógica personalizada requieren adaptadores; los usos desde C# no se detectan en esta lista.

### Crear y duplicar contenido

En **Cartas** puedes crear una carta de unidad o un hechizo. En **Unidades** puedes crear un personaje independiente. Selecciona una fila y pulsa **Duplicar selección** para copiar un objeto existente. Introduce un ID nuevo y un nombre, pulsa **Previsualizar** y revisa los objetos, avisos y JSON antes de guardar.

Cada creación añade un archivo `json/editor-ID.json` sin reescribir los originales. Los nuevos objetos usan `config/templates/content.json`; las cartas de unidad incluyen personaje, efecto de invocación y arte marcador. Los hechizos empiezan sin efectos. Después del guardado revisa los campos guiados, las mecánicas, los pools, los desbloqueos y las imágenes.

Al duplicar una carta de unidad se copian los personajes y efectos de invocación estándar, incluso si están definidos en otro archivo. El arte y las demás mecánicas permanecen compartidos y se avisa antes del guardado. Una unidad independiente no recibe automáticamente una carta. Las invocaciones por pool o personalizadas requieren un adaptador y se bloquean cuando no puede asegurarse la copia del personaje. Una copia de campeón no se conecta automáticamente al árbol de campeón.

### Editar pertenencia a pools

En **Pools**, elige un pool en la navegación lateral. Busca cartas por nombre, ID o archivo y filtra por tipo, rareza, pertenencia o cambios pendientes. Marca para añadir y desmarca para quitar. Los filtros no descartan la selección: la revisión incluye todas las cartas modificadas. Pulsa **Previsualizar cambios**, revisa las altas/bajas y **Guardar pertenencia con respaldo**. **Descartar cambios** restaura la selección original. Guarda o descarta antes de cambiar de pool o abrir una carta.

El catálogo incluye pools del juego configurados y pools locales como `@ID`. Conserva referencias estructuradas, referencias externas, comentarios, BOM/CRLF, desbloqueos y demás campos. El límite de lote, nombres del juego y avisos están en `config/pool-editor.json`, contrastados con el esquema y la wiki locales de Trainworks. Los pools desconocidos/duplicados y las cartas con IDs duplicados o listas inválidas quedan en solo lectura. Se rechazan hashes antiguos y vistas previas caducadas. Cada lote guarda copias originales y un registro de transacción; si falla una escritura, restaura los archivos ya aplicados salvo modificaciones externas posteriores, que se identifican para recuperación manual.

Esta pantalla edita las listas `pools` de las cartas, no la lógica C# que pueda generar miembros ni las cartas iniciales asignadas a campeones. Las referencias a otros mods se conservan y no se cuentan como miembros locales. La validación visual y la carga en el juego siguen pendientes.

### Crear y duplicar mejoras de campeón

En **Campeones y sendas**, debajo de los campeones, está **Catálogo de mejoras**. Busca por nombre, ID o archivo. Pulsa **Crear mejora** para comenzar con la plantilla, o elige una fila y pulsa **Duplicar selección**. Introduce ID y nombre, revisa el JSON y los avisos con **Previsualizar** y guarda el nuevo contenido.

La mejora se añade a `json/editor-ID.json`; no modifica el origen ni el árbol. Una copia conserva bonificaciones, descripciones, otros idiomas, referencias y campos desconocidos. Las referencias a arte y mecánicas siguen compartidas. Después pulsa **Abrir mejora** para editar sus campos y usa **Editar árbol de sendas** para asignarla a un nivel. El catálogo contiene también mejoras de cartas: revisa que la elegida corresponda a la senda.

Los valores de una mejora nueva están en `config/templates/content.json`, propiedad `upgrade`. Empieza con bonificaciones cero y descripción vacía; complétala antes de usarla. Crear una mejora no genera imágenes. Se rechazan colisiones, JSON inválidos, IDs duplicados y revisiones obsoletas; la revisión está ligada al ID, nombre, tipo y origen exactos. Las pruebas verifican el recorrido de crear, guardar y asignar a una senda, pero la aceptación visual y en el juego sigue pendiente.

### Crear pools propios

En **Pools**, pulsa **Crear pool** e introduce un ID técnico de 3–80 caracteres, sin `@`, empezando por una letra. Revisa el JSON con **Previsualizar** y guarda. Se crea un archivo independiente `json/editor-ID.json`, sin cambiar otros archivos ni generar imágenes. Los valores iniciales están en `config/templates/content.json`, propiedad `pool`, que debe empezar sin miembros.

Después del guardado se selecciona `@ID`. Marca las cartas que quieres incluir y usa el flujo de revisión y guardado de pertenencias. Crear el pool no lo conecta automáticamente a recompensas, estandartes o efectos; esas referencias se configuran en los objetos correspondientes. Guarda o descarta las pertenencias pendientes antes de crear otro pool.

**Abrir definición del pool** lleva a Todos los objetos y permite revisar su JSON. Si un pool existente declara miembros en su campo `cards`, la tabla muestra la unión con las pertenencias de las cartas, sin duplicarlas. Sus referencias directas se muestran en un desplegable, incluidas las externas o no resueltas. La pertenencia guiada permite editar esa variante: las altas conservan la lista directa y las bajas quitan ambas fuentes locales si existen. La revisión indica los archivos y listas afectados. Las reglas y avisos están en `config/pool-editor.json`. La copia guiada de pools locales se describe a continuación; los miembros y usos construidos desde C# requieren adaptadores.

### Pertenencias declaradas en el pool o en la carta

La tabla de **Pools** incluye **Declarada en**: `pool.cards`, `carta.pools` o ambas. Con la configuración predeterminada, las altas se añaden al campo `cards` cuando el pool ya declara esa lista, incluso vacía; en los demás casos se añaden a `pools` de la carta. La regla `useDirectListWhenDeclared` en `config/pool-editor.json` permite cambiar ese criterio de altas. Quitar una carta elimina todas sus referencias locales en ambas listas para que desaparezca realmente de la unión. Las referencias externas y no resueltas se conservan y pueden revisarse en el desplegable.

La previsualización muestra dónde se aplicará cada cambio. El respaldo y la recuperación del lote cubren tanto definiciones de pools como archivos de cartas. Seleccionar una pertenencia idéntica conserva la representación estructurada sin escribir; un cambio del pool tras la revisión invalida el guardado. Los pools duplicados, desconocidos o con un campo `cards` que no sea un array siguen en solo lectura. La lógica C# y la edición de referencias externas requieren adaptadores.

### Duplicar un pool local

En **Pools**, selecciona un pool local `@ID` y pulsa **Duplicar selección**. Introduce un ID nuevo, previsualiza y revisa el JSON, las referencias directas conservadas, las cartas añadidas desde sus pertenencias y los objetos que usan el pool original. Pulsa **Guardar copia**; se creará `json/editor-ID.json` y se seleccionará el pool nuevo.

Se copian la definición y sus campos desconocidos. Se conservan las referencias directas, incluidos sus metadatos, referencias externas, no resueltas y duplicados existentes. Las pertenencias declaradas en las cartas se reúnen en el campo `cards` de la copia, evitando añadir otra referencia local cuando ya está incluida directamente. Los archivos originales no se modifican. Si la referencia al pool en una carta contiene propiedades adicionales, la revisión avisa de que esas propiedades permanecen en la carta original.

Las cartas siguen compartidas: editar sus datos afecta a todos los pools que las usan. La copia tiene una lista de miembros independiente, pero no sustituye el pool original en recompensas, efectos o estandartes. Los usos y miembros creados desde C# no se detectan. Solo se copian definiciones locales únicas y listas válidas; los pools del juego sin definición local no admiten copia guiada. El límite de referencias está en `config/templates/content.json`, propiedad `poolCopy.maxReferences` (500 por defecto). Las revisiones obsoletas y colisiones se rechazan antes de escribir.

### Asignar un pool a un efecto

En el inspector de **Cartas** o de una reliquia en **Todos los objetos**, despliega **Pool del efecto · asignación guiada**. También aparece al abrir el efecto correspondiente en Mecánicas o Todos los objetos. Cuando haya varios efectos compatibles, elige uno; busca un pool por ID y revisa sus miembros locales y los usos compartidos del efecto. Pulsa **Previsualizar asignación de pool** y **Guardar pool del efecto con respaldo**.

La asignación modifica únicamente `param_card_pool` del efecto. Todos sus usuarios recibirán el cambio; los miembros del pool y las cartas se conservan. Seleccionar el mismo pool mantiene la referencia estructurada sin escribir. Las referencias locales usan `@ID`; los pools del juego usan su nombre configurado. El recuento del catálogo es de cartas locales detectadas, no de todos los miembros del juego, de otros mods o generados desde C#.

El catálogo de efectos, campo, etiqueta y alternativas individuales que bloquean la asignación están en `config/pool-assignment.json`, contrastado con las referencias locales de efectos de la wiki Trainworks. Se rechazan pools desconocidos/duplicados o con listas inválidas y vistas previas caducadas. Las invocaciones de unidades tienen su propio selector de pools de personajes. Los efectos personalizados requieren adaptadores específicos; las recompensas draft y card_pool disponen del selector descrito más abajo. Revisa que el contenido del pool sea apropiado para el efecto: asignar un pool no simula su ejecución en el juego.

### Editar pools de personajes de una invocación

En **Mecánicas**, abre un efecto compatible (por ejemplo `ClerkCheckIn` o `CookKitchenMorsel` de Sweetkin) y despliega **Pool de personajes · invocación aleatoria**. También aparece en el inspector de una carta cuando esta usa directamente un efecto compatible. Busca unidades por nombre/ID y marca para añadir o desmarca para quitar; sus estadísticas y el número de referencias actuales aparecen junto a cada unidad. Los cambios se mantienen al filtrar. Revisa la lista completa con **Previsualizar pool de personajes** y guarda con respaldo, o descarta los cambios.

Estos pools son listas inline en `param_character_pool`, no definiciones con ID como los pools de cartas. El editor conserva `param_character`, `param_character_2`, otros parámetros y los archivos de unidades/arte. Crear una lista nueva cambia la selección de la invocación, por lo que debe probarse en el juego. Las repeticiones existentes se conservan; desmarcar una unidad elimina todas sus referencias locales. Referencias externas, no resueltas o con IDs ambiguos se muestran y conservan; no admiten cambios guiados. Seleccionar la misma pertenencia no reescribe una referencia estructurada ni elimina repeticiones.

Efectos, campo, respaldo y límites están en `config/character-pool.json`: mínimo 1 y máximo 200 referencias, hasta 100 cambios por revisión, contando las referencias protegidas. Se rechazan listas malformadas, unidades inexistentes/ambiguas, invocaciones personalizadas sin adaptador y vistas previas caducadas. La lista de usos compartidos detecta referencias JSON locales; no simula probabilidades ni usos desde C#.

### Conectar un pool a una recompensa o estandarte

En **Todos los objetos**, filtra por `rewards` y abre una recompensa, o por `map_nodes` y abre un estandarte que utilice recompensas locales. Despliega **Pool de la recompensa · asignación guiada**. Si el nodo tiene varias recompensas, selecciona una; busca el pool por ID, comprueba sus miembros locales y los usos compartidos, previsualiza y guarda con respaldo.

Se admiten recompensas `draft` y `card_pool`. Sus rutas se definen en `config/pool-assignment.json`, propiedad `rewardAdapters`, según la wiki Custom-Clans y los esquemas locales de Trainworks. El editor cambia solo `extensions[index].draft.draft_pool` o `extensions[index].card_pool.card_pool`. Conserva costes, rarezas, número de opciones, metadatos adicionales y el nodo. Los `pools` del nodo son pools de aparición en el mapa y no se modifican con este selector.

Cambiar una recompensa afecta a todos los nodos/eventos que la comparten. Solo se detectan usos declarados en JSON y miembros locales; C# y contenido externo requieren revisión adicional. Extensiones ausentes, duplicadas o inválidas y tipos personalizados quedan fuera de la edición guiada. Seleccionar el mismo pool conserva su representación estructurada sin escribir. El guardado exige una revisión vigente del clan y crea un respaldo. Pendiente de aceptación visual y prueba en partida.

### Ajustar opciones y costes de recompensas

Dentro de **Pool de la recompensa · asignación guiada**, despliega **Ajustes de la recompensa**. Elige un campo, consulta la explicación, introduce el valor, pulsa **Previsualizar ajuste** y después **Guardar ajuste con respaldo**. Está disponible tanto en recompensas como al abrir un nodo que referencia una recompensa local.

Las recompensas draft permiten editar opciones (1 a 3), rareza mínima, copias adicionales, impedir omitir e ignorar cambios de rareza de reliquias. Draft y card_pool permiten editar costes sucesivos de compra en oro, separados por comas. No son costes de Ember. Los costes por rareza existentes pueden sustituir estos valores y se conservan; las reglas de partida y reliquias también pueden afectar al sorteo.

Las etiquetas, explicaciones, campos, tipos y límites están en config/reward-settings.json. Un campo ausente no se rellena automáticamente: mantiene el valor predeterminado del juego hasta que se guarde uno explícito. Se modifica un solo campo por revisión; el cambio afecta a todos los usuarios de la recompensa. Guardar requiere revisión vigente y respaldo. El selector no simula el resultado en partida ni permite borrar campos; para casos personalizados sigue disponible el JSON avanzado.

### Crear y duplicar recompensas

En **Todos los objetos**, pulsa **Crear recompensa**, introduce ID y nombre, elige el tipo configurado y un pool válido, previsualiza el JSON y guarda. Se crea `json/editor-ID.json`; la lista pasa a rewards y selecciona la recompensa nueva. Puedes continuar con sus ajustes y asignación de pool en el inspector. El filtro rewards está disponible aunque el clan no contenga recompensas todavía.

Selecciona una recompensa y pulsa **Duplicar selección** para conservar su tipo, costes, extensiones, referencias y textos de otros idiomas en una definición independiente. El nombre inglés se sustituye por el introducido. Los usuarios del origen siguen utilizando el origen; los pools y otras referencias conservadas permanecen compartidos.

Los tipos, etiquetas, extensiones, campos de pool y valores iniciales están en `config/templates/content.json`, propiedad rewards. Se incluyen draft y card_pool. La creación no genera imágenes ni requiere carpeta textures, y no conecta automáticamente la recompensa a nodos/eventos. Rechaza pools desconocidos/ambiguos/inválidos, colisiones y revisiones caducadas. Pendiente de aceptación visual y en partida.

### Símbolos de tooltip en Recursos visuales

El inventario incluye sprites y atlas_icons, con sección visible y categoría Símbolo de tooltip · atlas. Puedes filtrar esta categoría, revisar PNG/dimensiones y detectar archivos ausentes, rutas inválidas o mayúsculas distintas. Validación enlaza cada problema a su sección de origen.

Un mismo ID puede declarar un sprite de combate y un atlas de tooltip diferentes; el visor y los selectores de arte siguen resolviendo exclusivamente sprites. Los usos de atlas dentro del texto no se cuentan como referencias de sprites. La sustitución guiada de atlas sigue pendiente; su definición está accesible en Todos los objetos y su archivo permanece local.
