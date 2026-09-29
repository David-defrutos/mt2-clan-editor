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

- Abre y recorre los siete clanes de referencia (The Free Company, SuccClan, Sandscourged, The Silk Song, Pathogens, Equestrian y Yokai). Deva queda fuera de alcance por ahora.
- Genera un proyecto nuevo con dos campeones, tres sendas de tres niveles para cada uno, dos cartas iniciales, N unidades de draft (mínimo dos de estandarte), dos pools propios, circuito de estandarte, recursos visuales de clan y campeón, manifiesto, fuente C# y workflow de compilación. Las cantidades y los perfiles del proyecto nuevo salen de `config/templates/new-clan.json`.
- Busca y filtra cartas, unidades, todos los objetos JSON, pools, mecánicas e imágenes; muestra progresión inspirada en Yokai y compara estadísticas globales.
- Edita campos guiados, asigna definiciones ya existentes de efectos, triggers y habilidades, y permite editar el JSON completo de un objeto. Antes de guardar se muestra una vista previa. Cada cambio crea una copia de seguridad en `data/backups/` y rechaza archivos modificados fuera del editor.
- Clasifica sprites por uso, informa dimensiones y referencias, y permite sustituir un PNG con vista previa y ajuste de tamaño. La imagen anterior queda respaldada.
- Comprueba sintaxis, IDs duplicados, estructura de campeones, cartas iniciales, algunos rangos y recursos visuales. Los siete clanes se leen correctamente. La comprobación de mayúsculas detecta tres rutas de imagen que conviene corregir para Linux/Proton: `icon_Vizier` (Sandscourged), `LaceChampionIcon` (The Silk Song) y `FearstoneIcon` (Yokai).
- En **Publicación → Compilación local**, detecta proyectos C# del clan, ejecuta `dotnet build` en Release sin GitHub y muestra el registro. Si genera una DLL nueva, indica su ruta y SHA-256. El comando, los límites y la búsqueda de proyectos están en `config/build.json`.

## Estado y límites de esta versión

La creación produce una **base editable**. Los gráficos de color son marcadores y las cartas de draft son unidades simples. La estructura generada ya incluye el estandarte y pasa pruebas de referencias internas, pero aún no está confirmada por una carga en el juego. El proyecto requiere revisión de equilibrio, iconos, recompensas y mecánicas antes de distribuirse. La compilación local se ha probado con una biblioteca .NET sin dependencias; la plantilla del clan sigue bloqueada porque GitHub Packages responde `401` al restaurar `TrainworksReloaded.Base` 0.7.1. La [guía de Trainworks](https://github.com/Monster-Train-2-Modding-Group/Trainworks-Reloaded/wiki/Getting-Setup-for-Modding) indica usar una credencial con `read:packages` para ese feed. Las credenciales se configuran en NuGet fuera del proyecto; no deben añadirse al repositorio.

La pantalla de publicación muestra Git, crea un commit limitado a la carpeta del clan, envía la rama a `origin` y consulta los runs de GitHub Actions asociados al SHA actual. Puede descargar el artefacto de un run exitoso del SHA actual y comprobar que incluye una DLL; no instala el archivo en el juego. La validación todavía no comprueba todas las referencias de Trainworks ni confirma el resultado dentro del juego. Los perfiles de dimensiones de arte y las reglas de edición están en `config/`; el editor conserva campos desconocidos de los clanes importados.

El workflow de los clanes nuevos comprueba que el repositorio tenga los secretos `GH_AUTH_USER` y `GH_AUTH_TOKEN` (token con `read:packages`) antes de restaurar paquetes. El token se usa solo en el runner de Actions y no se incluye en los archivos generados.

Nunca se editan los siete mods por ejecutar las pruebas. Las pruebas de escritura usan carpetas temporales. La biblioteca local y las copias de seguridad están en `data/`, ignorada por Git.




