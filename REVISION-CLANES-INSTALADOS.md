# Revisión de clanes y complementos instalados · 30-09-2026

Se revisó el perfil Default de Thunderstore usando sus archivos locales. El sufijo `.old` marca archivos desactivados: no implica que estén deteriorados. Los datos se importan a `data/imports/` retirando el sufijo solo en la copia; se conservan originales, activación y archivos instalados. Volver a importar reutiliza la copia registrada para preservar las modificaciones del usuario.

## Biblioteca ampliada

| Mod | Resultado |
| --- | --- |
| Deva | Añadido desde su carpeta con JSON activos; vuelve a entrar en el alcance. |
| Steward Clan 0.7.0 | Copia editable de archivos `.old`; 38 cartas y 12 personajes. |
| Disciple Clan 0.0.2 | Copia editable; 41 cartas y 16 personajes; clase Chrono y mecánicas personalizadas conservadas. |
| FreeCompany original | Copia separada de la versión David; 103 cartas y 23 personajes. |
| Sandscourged 0.5.5 original | Copia separada; 59 cartas y 16 personajes. |
| Yokai 1.0.5 original | Copia separada; 62 cartas y 16 personajes. |
| Silk Song 0.4.0 original | Copia añadida. Contiene IDs repetidos, incluyendo variantes en `json/champion/Nueva carpeta/`; aparecen en Validación. No se eliminan ni se elige una variante automáticamente. La edición ambigua dentro de un archivo se bloquea. |
| Sweetkin Back On Track 1.1.0 | Detectado adicionalmente e importado; 64 cartas y 28 personajes. |

Se conservan también las siete carpetas David y el proyecto de demostración. Las versiones originales y portadas son proyectos independientes; no se fusionan por ID de clase.

## Complementos sin clan propio

Según los README instalados y la ausencia de definiciones `classes`:

- FullClan 0.3.0 permite elegir el mismo clan principal y aliado.
- Dual Champions 2 1.2.1 añade campeones aliados a la partida.
- Better Random Start / Prevent Logbook Duplicates 1.2.0 selecciona combinaciones aleatorias para completar el registro.
- CustomClanHelper 1.2.0 adapta el libro de registro a clanes personalizados.

La búsqueda los muestra al activar «Mostrar también complementos y formatos no compatibles». No se registran como clanes vacíos. Esto no implica compatibilidad completa con sus parches C# ni una prueba de partida con esas combinaciones.

## Transformaciones y actualización comunicada por Brandon

La transformación debe estar dentro de `extensions.character_art.transform`, junto al sprite dentro de la extensión. La información aportada por el usuario indica que la corrección reciente de Trainworks utiliza `offset` en lugar de `offset_position`. El checkout local consultado todavía utiliza el nombre antiguo; por eso se conserva lectura histórica con aviso y debe verificarse la versión de Trainworks que ejecuta el juego.

- Los ajustes nuevos escriben `transform.offset.x/y` en la ubicación correcta.
- Editar un desplazamiento antiguo migra el vector completo a `offset`, conservando sus otros ejes y Z; la vista previa indica la migración y el guardado crea respaldo.
- Si ambos nombres coexisten, se avisa y se bloquea su edición hasta resolver la ambigüedad.
- Las transformaciones colocadas fuera de la extensión generan avisos en Validación y Vista de personaje; no se aplican silenciosamente a la previsualización.
- Los cambios anunciados de Memory Leak, Emergency Protocol y `event_titles` requieren revisar la nueva versión concreta de Steward. No se reescriben sus mecánicas a partir de una conversación: los campos actuales y desconocidos se conservan.

## Comprobación

Pruebas con carpetas temporales de descubrimiento, lectura de `.old`, copia independiente, conservación de originales, reutilización de copias, desplazamientos actuales e históricos, Z y ambigüedad de IDs. Lectura de las copias reales desde la API local. La ejecución de estos clanes en el juego y la calibración exacta del pie/suelo siguen pendientes.
