# Pierce y selección N-units · 08-10-2026

## Pierce

En el inspector de una unidad, selecciona Estados iniciales; en un efecto compatible, Estados y acumulaciones. En Estado que se añade elige **Conductor · Pierce**, pulsa Añadir estado y fija las acumulaciones. Revisa y guarda el campo con respaldo.

Se guarda `{ "status": { "id": "@pierce", "mod_reference": "Conductor" }, "count": 1 }`. La etiqueta visible no sustituye el ID ni el namespace. Las demás entradas y campos adicionales se conservan.

El código de Conductor usa acumulaciones + 1 como número de objetivos del ataque: Pierce 1 alcanza la primera unidad y una adicional; Pierce 2 alcanza hasta tres. No equivale a Perforante ni permite por sí mismo atravesar escudos. Requiere Conductor 0.5.14 o posterior instalado y declarado como dependencia. El editor no simula interacciones con otros estados ni el combate.

## Primeras o últimas N unidades

1. Todos los objetos → Crear definición → Efectos → **Conductor · seleccionar N unidades**.
2. Previsualiza y guarda. La plantilla crea CardEffectNULL con `target_mode: { "id": "@n-units", "mod_reference": "Conductor" }`, param_int 2 y param_bool3 false.
3. En el inspector configura Número total de unidades objetivo, Seleccionar desde el final y Equipo objetivo. N es un entero positivo; false selecciona primeras N y true últimas N.
4. Asigna el selector a la carta y añade después el efecto deseado con `target_mode: "last_targeted_characters"`. Conserva ese orden. El selector solo elige objetivos; no causa daño ni aplica estados.

Conductor exige CardEffectNULL para N-units en efectos de cartas/triggers. El editor señala combinaciones de otro efecto con el selector externo, cantidad inválida u orientación de tipo incorrecto. Los campos especializados requieren la combinación correcta de nombre de efecto, selector y namespace Conductor. No comprueba todavía que exista un efecto posterior con last_targeted_characters; esa conexión y su orden requieren revisión.

## Configuración y fuentes

- config/fields.json: presets externos de estados, cantidades/orientación/objetivos del selector y condiciones de aplicación de adaptadores.
- config/templates/content.json: plantilla del selector, objetivo externo y avisos.
- config/validation.json: comprobación de clase y parámetros de N-units.
- config/locales: etiquetas y ayudas ES/EN.
- Fuente local Conductor: code/TargetModes/NUnits.cs, code/StatusEffects/StatusEffectPierceState.cs, json/status_effects/pierce.json y registro de n-units en Plugin.cs. Trainworks CardEffectFinalizer resuelve el objetivo mediante referencia y namespace.

## Verificación

Compilación correcta y 121 pruebas completas superadas. Tres pruebas nuevas cubren plantilla/edición de selección, guardas/validación de clase y namespace y estado externo Pierce con conservación de datos y renderizado HTML. Pruebas ejecutadas en carpetas temporales, sin modificar clanes reales. Aceptación visual y en partida pendiente. Sin commit ni push.
