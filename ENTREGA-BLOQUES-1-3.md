# Entrega de arte, estructura y mecánicas · 02-10-2026

Continuación conjunta de los bloques 1, 2 y 3 solicitados. Cambios locales; la aceptación visual y en partida se realiza en el bloque 4. Traducción/multiplataforma y comparación oficial conservan su orden posterior.

## 1. Arte

- Inspector de clases: icono, icono bloqueado y retrato de cada campeón; personaje de selección por posición del array; estilo de cartas del clan. No se crean posiciones de campeón inexistentes al asignar arte.
- Inspector de reliquias: icono principal y pequeño/HUD. Mejoras: sprite de icono, incluyendo las usadas por equipo y sala. Cartas de equipo/sala conservan su card_art y el marco de su estilo.
- Inspector de objetos de arte: cambiar el sprite de card_art o character_art. Referencias locales estructuradas conservan propiedades adicionales; elegir un recurso externo distinto sustituye la referencia de forma explícita en la revisión.
- Checklist: recursos de reliquias/mejoras y marcos del estilo realmente enlazado al clan, además de los roles previos.
- Recursos visuales: sustitución de PNG para sprites y atlas_icons, discriminando sección aun cuando compartan ID. Si varios recursos usan el mismo PNG, reemplazarlo afecta a esos usuarios.
- Panel de comparación: superposición a la misma escala de píxel y centrada por lienzo; opacidad ajustable para revisar marcos/estados. No reproduce la cámara del juego.
- Bundles: inventario de rutas Windows/macOS/Linux, presencia/tamaño y referencias bundle/asset_path. Recursos del bundle se distinguen de un PNG inválido. Para su contenido interno hace falta Unity/Spine o comprobarlo en el juego; no se reconstruye un bundle al cambiar un PNG.
- Reemplazo con compensación opcional de escala: para personajes estáticos con el mismo PNG, escala nueva por eje = escala anterior × dimensión anterior / dimensión nueva. PPU y pivote se conservan. La revisión enumera objetos/archivos y excepciones. Animaciones, Spine y transformaciones incompatibles se excluyen. No garantiza el apoyo de los pies si cambian márgenes o dibujo.
- El PNG y los JSON compensados se respaldan juntos; si falla una escritura se recuperan los cambios propios que no hayan sido modificados por otro proceso.

Configuración: visual-assignments.json, fields.json, art-checklist.json, resource-review.json, character-preview.json y assets.json.

## 2. Estructura y conexiones

- Todos los objetos → Crear o duplicar definición: nodos de recompensa, recompensas, reliquias y mecánicas. Los nodos nuevos requieren elegir una recompensa y un objeto map_node_icon local único. Después se ajustan sus pools de aparición y estados visuales.
- Conexiones y orden de referencias: añadir/quitar/reordenar recompensas del nodo; sustituir prefab; asignar carta del campeón e inicial; ordenar efectos/triggers y efectos de reliquia.
- Eventos: edición de possible_rewards. El archivo Ink se conserva: las llamadas del guion y sus índices deben seguir correspondiendo con las recompensas declaradas; no se recompila ni reescribe Ink.
- Campeones → Editar árbol → Añadir o retirar sendas y niveles. Máximos configurables; nueva senda con una mejora elegida en sus niveles para personalizar después. Retirar referencias no elimina sus definiciones. Árbol mal formado o clase ambigua bloquea esta operación.
- Campos de identidad: nombre, descripción y componentes RGB de colores. Reliquias: descripción y desbloqueo.
- Todos los objetos → Editar campos de varias cartas o unidades: coste/rareza y ataque/salud/tamaño. Búsqueda, selección mantenida al filtrar, revisión por objeto, respaldo y recuperación de lote.
- Inspector → Retirar definición: revisión de una definición; bloqueada si hay referencias JSON detectadas o su ID aparece en fuentes C# revisadas. No borra PNG ni dependencias. Los usos dinámicos/externos no pueden deducirse automáticamente.

Configuración: templates/content.json, reference-editor.json, content-actions.json, champions.json y fields.json.

## 3. Mecánicas

- Crear/copiar efectos y triggers desde plantillas. Catálogo inicial: 8 efectos de carta, 5 de reliquia y triggers de carta/unidad; parámetros contrastados con los esquemas locales de Trainworks Reloaded.
- Formularios por clase: cantidades/rangos/factores, objetivos/equipos/filtros, condiciones/opciones booleanas. Ausencias conservan el valor predeterminado del juego; no se rellenan campos al abrir.
- Estados y acumulaciones: selección de estado base o local y cantidad; conserva campos adicionales por entrada. Referencias estructuradas existentes permanecen visibles y sus cantidades se pueden editar.
- Mejoras del efecto: selector de upgrades para las mecánicas compatibles, con referencias locales o externas.
- Listas de efectos/triggers: alta, baja y orden con revisión. Habilidades de unidad: selección de cartas declaradas is_an_ability.
- Referencias externas: ID del juego o ID/mod_reference de otro mod, sin instalar dependencias ni inventar sus definiciones. La revisión muestra exactamente qué se sustituye.
- Mecánicas → Compatibilidad de mecánicas y código propio: filtra formuladas, C# propio, otros mods y fuera del catálogo; muestra archivos donde se encuentra una declaración de clase. Encontrar una declaración no asegura compilación ni comportamiento.

### Añadir un adaptador sin programar una pantalla

1. Añadir una regla a config/fields.json en la sección correspondiente. Ejemplo para una clase local ya existente:

```json
{
  "path": "param_int",
  "label": "Cantidad de la mecánica",
  "type": "number",
  "integer": true,
  "optional": true,
  "names": ["@MiEfecto"],
  "help": "Cantidad utilizada por MiEfecto según su implementación C#."
}
```

2. Declarar en reference-editor.json las referencias que use ese adaptador, indicando sección de origen, campo, modo single/list y names. Se admiten paths con [] para posiciones existentes, sin fabricar elementos ausentes.
3. Si hace falta crear la definición, añadir su variante a templates/content.json → objects → sección → variants. El campo name es la clase C# que se ejecuta, no un nombre decorativo.
4. Reiniciar/recargar el editor y revisar en una copia del clan. El C# se aporta como fuente; se compila por las vías locales ya implementadas. Una clase sin adaptador conserva acceso al JSON.

Las etiquetas, campos, clases compatibles, variantes, límites, tabs y reglas de referencia están en configuración. Los textos de ayuda procedentes del esquema se traducirán en el bloque de idiomas.

## Verificación y cierre

Pruebas en carpetas temporales: campeones independientes, límites de índices, metadatos, fuentes/arte originales intactos, referencias protegidas, nodos conectados, reparación de árboles, parámetros por clase, atlas/bundles, compensación estática y recuperación ante fallos en operaciones de varios archivos.

Queda el bloque 4: recorrido visual/teclado y pruebas en un perfil de juego, incluyendo alineación de arte, ejecución de efectos, desbloqueos, circuitos de mapa y comportamiento de código propio. No se considera un archivo legible o una DLL compilada como prueba de aceptación en el juego.

Evidencia final de esta entrega: 100 pruebas superadas, compilación correcta y catálogos comprobados por HTTP con Free Company (14 roles de clase, 6 de arte de campeones, 8 plantillas de efectos de carta, informe de 201 mecánicas y 5 campos de edición masiva). Comprobaciones reales de lectura; las escrituras de prueba se hicieron en carpetas temporales. Editor reiniciado en http://127.0.0.1:4319/. Pendiente aceptación visual y en el juego.
