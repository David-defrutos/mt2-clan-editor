# Impacto de Conductor y Trainworks · 08-10-2026

## Fuentes comprobadas

Se interpreta «constructor» como Conductor y «trainword_reloaded» como Trainworks Reloaded, por los paquetes presentes en el perfil Default. Revisión de las copias locales y sus commits; sin actualizar repositorios, cambiar mods instalados, compilar sus DLL ni publicar en GitHub.

- Instalado: Conductor **0.5.14**, dependencia mínima declarada Trainworks **0.7.26**. Fuente local: HEAD `a34ac5c` (05-10), posterior al commit de versión `e2a9acc` (28-09). El manifiesto no permite asegurar que la DLL instalada incluya los dos commits posteriores a esa versión.
- Instalado: Trainworks Reloaded **0.7.32**. Fuente local: HEAD `39a3cb9` (07-10); thunderstore.toml declara la misma versión.
- Editor: revisión de pool-editor.ts, pool-assignment.ts, stats.ts, mechanics-support.ts y configuración. No es una aceptación dentro del juego.

## Cambios e impacto

| Prioridad | Cambio comprobado | Impacto en el editor |
|---|---|---|
| P0 | Trainworks `799e45c` / 0.7.31 admite `{ "item": referencia, "count": N }` en pools de cartas, reliquias, mejoras y almas, y en pertenencias de cartas/reliquias. | pool-editor.ts solo interpreta strings u objetos con id: ignora este formato. Debe reconocer pertenencia y multiplicidad, conservar count/campos externos, quitar correctamente y evitar altas duplicadas. Revisar también asignadores, conexiones, copias y validación. |
| P0 | Mismo cambio en `cards[].pools`. | stats.ts solo cuenta strings en esa lista: cartas obtenibles, iniciales, estandarte y sus desgloses pueden infracontarse. Separar número de cartas distintas y multiplicidad; count no representa necesariamente la probabilidad final de draft. |
| P1 | Trainworks `556b8b8` / 0.7.32 registra CardsThatResolveSimultaneouslyOnUnplayed. | Falta en config/pool-editor.json. Añadir como pool reconocido y revisar descripción antes de ofrecerlo. |
| P1 | Plantilla del editor declara Trainworks 0.7.1 tanto en dependencia de manifiesto como en PackageReference. | Definir una versión mínima coherente para las funciones ofrecidas; actualizar ambas referencias juntas después de comprobar generación, restauración/compilación y carga. No modificar automáticamente proyectos existentes. |
| P1 | Conductor 0.5.14 incorpora CardEffectPlayCharacterAnimation, CardEffectSwitchCharacterAnimationModel, Pierce y selección de primeras/últimas N unidades. | No aparecen en los adaptadores actuales. La lectura conserva datos originales, pero falta configuración guiada con parámetros y dependencia correctos. La vista 2D no reproduce animaciones: no cambiar automáticamente la calibración estática por esta novedad. |
| P2 | Fuente Conductor `a34ac5c` incorpora param_card_pool a CardEffectRandomDiscardFromCardPile. | Permite restringir qué cartas se descartan. Ampliar adaptador/asignador tras confirmar versión publicada que contiene el cambio; no atribuirlo con certeza a la DLL 0.5.14 instalada. |
| P2 | Trainworks 0.7.32 permite map_nodes type custom_class + referencia custom_class. | Conservar configuración y C#; añadir soporte de formulario/informe si se necesitan nodos personalizados. No genera ni simula el código de la clase. |
| P2 | Trainworks `60ce1ec` distingue listas/objetos vacíos de campos ausentes al aplicar override: replace. | Ahora un [] explícito puede borrar una lista original en el juego, antes se ignoraba. Revisar ayuda y aceptación de overrides, no convertir vacío en ausencia. |
| P2 | Trainworks `559d47a` y versión 0.7.30 cambian buff_effect ausente a None. | Mejora la carga de triggers sin ese campo. Añadir caso de aceptación; no inventar buff_effect obligatorio. El mensaje de commit posterior dice «Probable Fix»: no garantiza comportamiento de todos los triggers. |
| P2 | Nuevas API de inicialización/gestores, recompensas y utilidades de Conductor. | Afectan a C# personalizado y bibliotecas. No obligan por sí solas a reescribir el editor TypeScript; revisar proyectos que consuman esas API al recompilar. |

## Reproducción aislada del fallo P0

Ejecutado contra las funciones actuales del editor en una carpeta temporal y eliminado al terminar. Solo se preparó una revisión; no se guardó ninguna edición de un mod real.

- Carta A: pools `[ { "item": "MegaPool", "count": 3 } ]`.
- Pool Weighted: cards `[ { "item": "@B", "count": 4 } ]`.
- Resultado: pertenencias de A y B aparecen vacías; draft da 0 cuando A debería contarse una vez.
- Al preparar el alta de B, ya presente, se genera `[ { "item": "@B", "count": 4 }, "@B" ]`: la edición guiada puede alterar su multiplicidad por no reconocer la entrada existente.
- El archivo original y sus campos se leen; conservar JSON sin editar no equivale a soporte correcto de pertenencias.

## Siguiente incremento

1. Añadir lector compartido de referencias con cantidad, limitado a los campos que Trainworks procesa así, conservando referencias externas y metadatos.
2. Integrarlo en lectura, revisión/guardado de pertenencias, estadísticas, asignadores y conexiones/copia afectadas. Primero conservar y reconocer cantidades; edición de count mediante control específico configurable después.
3. Probar cantidades >1, referencias estructuradas/externas, listas mixtas, duplicados existentes, selección idéntica sin escritura y retirada completa, sin alterar archivos vecinos. Distinguir regla del esquema (entero >=1) del comportamiento del runtime, que limita count a mínimo 1.
4. Añadir el pool nuevo y acordar mínimo Trainworks en configuración; comprobar compilación y carga de un clan generado.
5. Ampliar adaptadores Conductor y nodos personalizados, y casos de aceptación de listas vacías/triggers. Retomar después traducción y resto del cierre.

## Incremento implementado · 08-10-2026

Corregida la lectura de referencias item/count en pertenencias de cartas y miembros directos de pools. Las cantidades válidas se conservan; altas idénticas no escriben ni duplican, bajas quitan todas las referencias locales de ambas fuentes y conservan las externas. Referencias ponderadas malformadas bloquean esos guardados y copias y se señalan en Validación.

- Configuración común en config/pool-references.json: claves de item/count, mínimo y campos de validación por sección/ruta. El lector ponderado se usa en listas de pool; no se extiende a parámetros de efectos.
- Estadísticas y desgloses reconocen pertenencias ponderadas y referencias estructuradas locales. Cuentan cartas distintas, excluyendo pertenencias de otros mods.
- Asignación de pools a efectos/recompensas recibe el catálogo y miembros corregidos. Añadido CardsThatResolveSimultaneouslyOnUnplayed con aviso de uso técnico.
- Tabla de Pools: nueva columna Entradas locales, suma de cantidades de ambas fuentes; tooltip aclara que no calcula probabilidad final. El contador lateral y el asignador siguen contando cartas distintas. Las altas pendientes cuentan una entrada; las bajas, cero.
- Copia: conserva referencias directas y externas. Cuando hay cantidades en las fuentes de una carta, materializa las pertenencias de carta adicionales preservando cantidad y metadatos. Los pools sin cantidades conservan su política previa de unión. Los archivos originales no cambian.
- Tokens de revisión incluyen la configuración nueva para bloquear guardados si cambia durante la revisión.
- Detectada discrepancia local de Trainworks: SoulPoolFinalizer lee souls, pero el esquema 0.7.32 llama relics a esa lista. Validación revisa ambos nombres; no se genera un pool de almas automáticamente.

Compilación correcta y suite completa de 110 pruebas superada. Cuatro regresiones nuevas verifican pertenencia/cantidades/estadísticas/asignación, no duplicación ni escritura idéntica, retirada preservando externos/BOM/comentarios y copia con ambas fuentes/errores de cantidad. Pruebas realizadas con carpetas temporales, no con guardados en mods instalados. Aceptación visual y en juego pendiente.

Pendiente: control específico para editar count; versión mínima de generador y prueba de compilación/carga; adaptadores de nuevas mecánicas Conductor, nodos personalizados y aceptación de overrides/triggers. Sin commit ni push.

## Cantidades editables · 08-10-2026

Cerrado el control específico de count para pertenencias de cartas: panel por entrada desde Pools, con revisión y respaldo. Conserva entradas vecinas y externos, modifica solo count si ya existe o envuelve la referencia original en item/count. Rango configurable de enteros positivos hasta 2147483647. No infiere probabilidad ni consolida duplicados. Cantidades de pools de reliquias/mejoras/almas permanecen disponibles mediante JSON avanzado y validación, sin formulario específico nuevo. Compilación y 12 pruebas relacionadas correctas; aceptación visual/en juego pendiente.


### Generador alineado con Trainworks 0.7.32 · 08-10-2026

- Nuevos clanes declaran Trainworks 0.7.32 en manifest.json y en TrainworksReloaded.Base del proyecto C#. La versión se define una sola vez en config/templates/new-clan.json; la dependencia usa {{trainworksVersion}} y se resuelve antes de escribir. Una configuración incoherente o una versión mal formada bloquea la generación antes de crear la carpeta.
- README generado explica requisitos, dotnet build, autenticación de GitHub Packages, alternativa con DLL instaladas y comprobación en partida. No modifica proyectos existentes ni añade Conductor automáticamente.
- Se mantiene transform.position en selección de campeón: es la posición absoluta soportada por GameObjectCharacterArtFinalizer, distinta de transform.offset que se añade a la altura base. Regresión de generación comprueba versiones coincidentes, ausencia de marcadores pendientes y posición anidada.
- Compilación del editor y prueba de generación correctas. Clan temporal compilado con dotnet 10.0.203 y DLL instalada de TrainworksReloaded.Base 0.7.32.0: cero errores y cero avisos. Esta comprobación usa referencias locales, no verifica la restauración del paquete privado de GitHub ni la carga en el juego. Los archivos temporales del clan se retiraron; la DLL de comprobación permanece en data/offline-builds, excluido del repositorio.
- Corregida la versión informativa local de data/build-local.json (0.7.27 → 0.7.32), contrastada con la DLL y el manifiesto instalado, con copia previa en data/build-local.before-0732.json. No se cambiaron referencias ni DLL instaladas.

Pendiente: aceptación en partida y restauración autenticada de GitHub Packages, nodos custom_class, revisión de overrides vacíos/triggers, cierre de idiomas y distribución. Comparación oficial mantiene prioridad final. Sin commit ni push.
