# Efectos de animación de Conductor · 08-10-2026

## Cómo configurarlos

1. Abre el clan y entra en Todos los objetos. En creación de definiciones elige efectos y la plantilla **Conductor · reproducir animación** o **Conductor · cambiar variante animada**. Revisa la definición y guarda con respaldo.
2. Selecciona el efecto creado. En Editar campo configura la animación o el índice de variante y sus objetivos. Revisa antes de guardar cada campo.
3. Para cambiar variante, abre Conexiones y orden de referencias y selecciona Unidades compatibles con la variante. Busca y añade personajes locales o declara referencias externas; puedes retirar y ordenar entradas. El cambio afecta a todas las cartas que comparten el efecto.
4. Asigna la definición existente a la carta desde su inspector y comprueba el comportamiento en partida.

## Parámetros y límites

- Reproducir animación: anim_to_play selecciona none, idle, attack, hit_react, idle_relentless, spell o death. Hover/Talk no se ofrecen porque el código de Conductor advierte que se cancelan al jugar la carta. Para triggers de unidad, usa su soporte nativo de anim_to_play.
- Cambiar variante: param_int es un índice entero no negativo (0 es la primera variante); param_character_pool es la lista compatible, no un pool de invocación. El personaje debe tener las variantes preparadas. No cambia sus estadísticas ni crea animaciones.
- Objetivos: target_mode y target_team; monsters designa aliados y heroes enemigos.
- Requiere Conductor 0.5.14 o posterior, instalado y declarado como dependencia del mod. Las plantillas incluyen name: {id: @CardEffect..., mod_reference: Conductor}. El editor no instala bibliotecas ni modifica automáticamente dependencias del manifiesto o del plugin C#.
- La vista de personaje sigue estática. Los efectos no se ejecutan en ella ni se valida que un índice exista en el modelo. El código de Conductor omite ambos efectos en modo de previsualización del juego; reproducir animación también se omite en velocidad Instant.
- Audio opcional param_str no tiene control guiado nuevo: el código fuente local solo llama PlaySfx cuando IsNullOrEmpty devuelve verdadero. Conviene confirmar/corregir esa condición con Conductor antes de prometer reproducción de sonido. El editor conserva campos existentes de audio y demás parámetros.

## Implementación y verificación

Plantillas y avisos en config/templates/content.json; campos, límites y namespace en config/fields.json; lista compatible en config/reference-editor.json; textos ES/EN en config/locales. El filtro de adaptadores reconoce referencias estructuradas y exige el namespace Conductor para estos campos: una clase homónima de otro mod no obtiene el adaptador.

Compilación correcta y 114 pruebas completas superadas. Cuatro pruebas nuevas cubren creación/referencias de namespace, valores de animación e índices, conservación de externos/BOM/comentarios/campos vecinos y coincidencia de filtros de navegador/servidor. Solo se editaron carpetas temporales de pruebas. Aceptación visual y en partida pendiente. Cambios locales, sin commit ni push.
