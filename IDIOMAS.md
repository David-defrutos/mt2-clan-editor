# Idiomas del editor

## Estado de cierre · 08-10-2026

Español e inglés: 1.507 textos por catálogo. Pantallas de biblioteca, contenido, progresión, estadísticas, personaje, mecánicas, recursos, validación y publicación; formularios de arte y sus ayudas; errores y avisos propios del servidor. El selector inglés se muestra como English. Los textos originales de los clanes y los logs de herramientas externas no se traducen.

Los diagnósticos que llegan con parámetros ya insertados se reconocen mediante las plantillas registradas. Se conservan literalmente IDs, rutas y parámetros; no se vuelve a interpretar su contenido. Un diagnóstico de terceros sin plantilla se conserva tal como llegó. La elección de idioma continúa sin reiniciar formularios.

`npm run check:i18n` audita claves literales, errores, avisos, ayudas configuradas, igualdad de catálogos y parámetros; exige value explícito a opciones traducidas. Cinco pruebas de idiomas, incluyendo diagnósticos con rutas y llaves literales. Compilación y suite completa de 128 pruebas correctas. Recorrido visual pendiente por el fallo ACL del navegador; la cobertura de textos no acredita todavía el ajuste visual de todos los anchos.

## Uso

El selector está en la barra superior. Español es el idioma inicial; la elección se guarda en el navegador y se aplica al volver a abrir el editor. Cambiar de idioma actualiza los componentes montados sin reiniciar la pantalla ni borrar sus entradas.

La elección es local a ese navegador y origen (host/puerto). No se escribe en los archivos del clan. Si el navegador bloquea el almacenamiento, se puede cambiar de idioma durante la sesión, pero no se conserva tras recargar.

## Histórico de incrementos · 08-10-2026

- Español e inglés disponibles; inglés se identifica como **partial** porque la migración sigue abierta.
- Traducidos: navegación y barra superior, textos de biblioteca y confirmación de retirada, vista de personaje, filtros de uso, grupos de tamaño/movimiento, seis controles, tooltips y revisión de guardado.
- Ampliación: creación del clan, resumen, filtros/listados de cartas y unidades, explorador de objetos, formulario de creación/copia de contenido, campos comunes del inspector, editor JSON, asignador básico de mecánicas y formulario de estados. Incluye contadores y mensajes de creación/guardado con parámetros.
- Ampliación especializada: conexiones y orden de referencias (incluidas ayudas configuradas y posiciones numeradas), edición masiva y retirada, consulta/edición de desbloqueos, campeones/combinación de sendas, árbol de mejoras y catálogo de mejoras. Las etiquetas visibles conservan valores técnicos explícitos.
- Estadísticas: comparación global, métricas configuradas, desglose, filtros, contadores y exportación CSV. Los encabezados y nombres de métricas siguen el idioma seleccionado; cifras y nombres originales de clanes se conservan. Se mantiene CSV con BOM UTF-8 y escapado de comillas.
- Descubrimiento/importación: formulario de búsqueda, acciones, contadores y mensajes de importación, incluida la explicación de copias de archivos desactivados. Se traducen las cuatro razones estándar de clasificación; errores de archivos/rutas siguen pendientes.
- Pools e invocación: pertenencia de cartas, filtros, asignación de pools a efectos/recompensas, selección de unidades invocadas, pools de personajes aleatorios y ajustes de recompensas. Incluye ayudas configuradas, revisiones y avisos de guardado. IDs, rarezas técnicas, referencias y booleanos mantienen sus valores originales.
- Las fechas de la biblioteca usan el formato regional del idioma elegido. Los campos numéricos mantienen su comportamiento de edición.
- Los nombres del clan/personaje, IDs, rutas, referencias y valores guardados conservan su contenido original.
- Pendientes: pantalla de mecánicas, recursos, validación y publicación; formularios especializados de arte, y etiquetas/ayudas configuradas que aún no están en los catálogos; avisos y errores del servidor, incluidos los de personaje, desbloqueos y campeones. La traducción de un listado o título no acredita la traducción de todos sus formularios anidados.
- No hay traducción automática de los datos de los mods. Los textos todavía no migrados aparecen en su idioma original.

## Configuración

- `config/i18n.json`: idioma inicial, clave de almacenamiento, idiomas, nombres del selector, formato regional y archivo de catálogo.
- `config/locales/es.json` y `en.json`: textos de interfaz. Las claves son los textos originales de interfaz; los valores son sus traducciones. Se mantienen separados de las reglas de formato de Trainworks.
- `/api/languages`: entrega los catálogos al navegador. El servidor comprueba IDs únicos, idioma inicial, formato regional, tipos de texto y ubicación de los archivos dentro de configuración.

Ejemplo de catálogo:

```json
{
  "Altura": "Height",
  "{count} clanes": "{count} clans"
}
```

Un componente solicita el texto con `useLanguage().t(texto, valores)`. Los valores de `{count}`, `{name}` o `{backup}` se insertan sin modificar su contenido. React sigue tratándolos como texto. Si una clave no existe en el catálogo, se conserva el texto original. Un parámetro ausente permanece visible para que no se pierda información.

Para añadir otro idioma, crear su catálogo y declararlo en `i18n.json`, con un ID y formato regional válidos. Reiniciar el servidor si cambió el código; recargar el navegador para volver a cargar los catálogos. Traducir los textos configurados de los controles por sus claves, conservando IDs y paths técnicos.

## Verificación

Compilación correcta y 105 pruebas generales superadas. Cuatro pruebas de idiomas: persistencia y recuperación ante almacenamiento bloqueado; mismos parámetros y cobertura de navegación/ayudas configuradas; rechazo de configuración y catálogos inválidos; HTML de los selectores con valores booleanos y técnicos iguales en español e inglés. Corregido el selector de Verdadero/Falso para guardar `true`/`false` en lugar de su etiqueta visible. Comprobado por HTTP que se sirven ambos catálogos y que `Altura` se resuelve como `Height` en inglés.

Última ampliación: 432 textos por catálogo. Compilación correcta y las cuatro pruebas de idiomas superadas nuevamente, con comprobación de ayudas/etiquetas de conexiones configuradas, posiciones numeradas y niveles. Revisión de claves literales utilizadas: ninguna ausente. Comprobado por HTTP que ambos catálogos se sirven con los textos ampliados. La cifra de 105 corresponde a la suite completa de la ampliación anterior; no se repitió toda la suite para este cambio de textos.

Ampliación del 08-10-2026: 494 textos por catálogo; compilación correcta y seis pruebas relacionadas superadas (idiomas, cálculo de estadísticas y CSV). El CSV se prueba en español e inglés con comillas/comas en el nombre de un clan, valores decimales, desbloqueo técnico 99, coste -1 y clan ilegible. Los datos de entrada permanecen iguales. La selección de métrica conserva su ID; el título del desglose se traduce al mostrarlo, también al cambiar de idioma con el diálogo abierto.

Pendiente recorrido visual: cambiar idioma con un ajuste de personaje sin guardar, comprobar que el valor se conserva, abrir tooltips, recargar y comprobar la preferencia. También revisar textos largos, teclado y barra superior a distintos anchos. La automatización del navegador sigue sin una comprobación visual acreditada por el fallo ACL del entorno documentado en ACEPTACION.md.

Ampliación de pools del 08-10-2026: 613 textos por catálogo; compilación correcta y 27 pruebas relacionadas superadas (idiomas, pools directos y por carta, asignación de pools, recompensas y unidades invocadas). Cobertura de etiquetas y ayudas configuradas de recompensas/invocación añadida a la prueba de catálogos. Catálogos comprobados por HTTP; ninguna clave literal ausente. Recorrido visual pendiente.
