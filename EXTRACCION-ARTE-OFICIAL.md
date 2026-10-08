# Extracción local de arte oficial · 02-10-2026

## Resultado verificado

- Instalación: `C:/Juegos/Steam/steamapps/common/Monster Train 2/MonsterTrain2_Data`.
- Salida: `data/official-art/characters-20261002-072927-470160`.
- 25 paquetes `characterprefabs-*.bundle`, 1.916 PNG (527 sprites y 1.389 texturas), 1.683 TextAsset auxiliares, 0 errores de extracción; aproximadamente 281 MB incluyendo el índice.
- Los números son recursos, no personajes únicos. Un personaje puede tener varios atlas/texturas y una imagen estática; sprites y texturas pueden duplicar arte.
- Shield Steward: sprite `PLR_TrainSteward_Shield`, 308 × 344 px, 100 píxeles por unidad, pivote (0.5, 0.5), revisado visualmente. Archivo dentro de `characterprefabs-misc_assets_all`.
- `manifest.json` registra nombres, bundle, pathId, archivo, dimensiones, hashes, PPU/pivote cuando existen y errores. Se conserva un checkpoint tras cada paquete.

## Repetir la extracción

Desde la carpeta del editor, en PowerShell:

```powershell
python -m venv data/tools/unity-extract
& 'data/tools/unity-extract/Scripts/python.exe' -m pip install -r scripts/requirements-official-art.txt
& 'data/tools/unity-extract/Scripts/python.exe' scripts/extract-official-art.py --game-data 'C:/Juegos/Steam/steamapps/common/Monster Train 2/MonsterTrain2_Data'
```

La ruta de instalación se recibe como argumento. Tipos, patrón de paquetes y carpeta de salida están en `config/official-art-extraction.json`. Cada ejecución crea una carpeta nueva. Solo se leen los archivos de la instalación; la salida permanece bajo `data/`, ignorada por Git. No se distribuyen los recursos oficiales con el código del editor.

Herramienta: [UnityPy, documentación y código oficial](https://github.com/K0lb3/UnityPy), versión 1.25.3 instalada en entorno aislado.

## Alcance y siguiente paso

Se extrajeron los paquetes de personajes aliados y enemigos. No se extrajeron todos los paquetes de cartas, escenarios, interfaz o vídeos del juego.

Hay imágenes estáticas completas y atlas Spine con piezas del personaje. Los TextAsset conservan datos `.atlas` y `.skel` como `.bytes`, con su nombre original en el índice. Obtener una pose animada requiere cargar el esqueleto y sus atlas; extraer un atlas no produce por sí solo una imagen ensamblada.

La extracción no determina por sí sola la escala/posición final del prefab ni enlaza automáticamente cada recurso con su CharacterData. Pendientes: resolver ese vínculo, recuperar transformaciones y añadir selector de referencia oficial al visor. La extracción está disponible; la integración en el visor aún no está implementada.


## Integración del visor · 08-10-2026

Vista de personaje → Comparar con una unidad oficial. Catálogo local de 353 sprites únicos PLR_/ENM_ del dataset más reciente de data/official-art, con búsqueda y filtro aliados/enemigos. Solo sprites con tamaño, PPU y pivote válidos; se excluyen Texture2D, FX y atlas sin ensamblar. Se verifica la ruta y el hash al servir el PNG. El índice se reutiliza mientras no cambien manifiesto o reglas.

La referencia se dibuja a la derecha, alineando el borde inferior del lienzo con el suelo; no se infiere el apoyo de los pies. Su escala manual y selección solo afectan a la vista. Las transformaciones finales del prefab, la perspectiva y las animaciones no se han recuperado. Esta función facilita comparar arte estático, sin garantizar el tamaño real de todas las unidades oficiales.

Configuración: config/official-art-viewer.json. Ausencia de extracción: el panel informa de que no hay sprites, sin bloquear el editor. Los datos oficiales siguen excluidos de Git y de la distribución. Lectura HTTP comprobada: 353 entradas y un PNG con respuesta 200 image/png. Revisión visual pendiente.
