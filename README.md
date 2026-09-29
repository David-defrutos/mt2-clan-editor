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
- En **Estadísticas**, cada cifra abre su desglose con búsqueda por nombre, ID o archivo. Los resultados con objeto definido se abren en **Todos los objetos** con su inspector. Las medianas muestran la muestra de unidades y promedian los dos valores centrales cuando hay un número par de valores. Las métricas y niveles técnicos excluidos del draft están en `config/stats.json`; las habilidades y cartas de nivel 99 no inflan las cifras de draft. El recuento de errores usa la misma validación que la ficha del clan.
- En **Progresión → Editar desbloqueos**, selecciona cartas de draft, filtra por nombre, archivo o nivel actual y asigna un nivel normal a varias cartas. **Previsualizar desbloqueos** muestra los cambios por carta y archivo antes de guardar. **Desde el inicio** elimina `unlock_level`. Iniciales, campeones, habilidades y niveles técnicos quedan fuera de esta edición. Los límites y el campo editable están en `config/progression.json` y `config/stats.json`.

- Edita campos guiados, asigna definiciones ya existentes de efectos, triggers y habilidades, y permite editar el JSON completo de un objeto. Antes de guardar se muestra una vista previa. Cada cambio crea una copia de seguridad en `data/backups/` y rechaza archivos modificados fuera del editor.
- Clasifica sprites por uso, informa dimensiones y referencias, y permite sustituir un PNG con vista previa y ajuste de tamaño. La imagen anterior queda respaldada.
- Comprueba sintaxis, IDs duplicados, estructura de campeones, cartas iniciales, algunos rangos, referencias locales entre objetos y recursos visuales. Las excepciones de referencias a clases y triggers externos están en `config/validation.json`, según los siete clanes de referencia. Los siete clanes se leen correctamente. La comprobación de mayúsculas detecta tres rutas de imagen que conviene corregir para Linux/Proton: `icon_Vizier` (Sandscourged), `LaceChampionIcon` (The Silk Song) y `FearstoneIcon` (Yokai).
- En **Publicación → Compilación local**, detecta proyectos C# del clan, ejecuta `dotnet build` en Release sin GitHub y muestra el registro. Si genera una DLL nueva, indica su ruta y SHA-256, incluso cuando el proyecto define un `AssemblyName` distinto a su nombre de archivo. El comando, los límites y la búsqueda de proyectos están en `config/build.json`.
- **Compilar con DLL instaladas** compila las fuentes C# en un proyecto aislado bajo `data/offline-builds/`, usando las referencias de `data/build-local.json`. Esta opción se ha probado con un clan recién generado y Trainworks 0.7.27, comprobando que todos los archivos del clan conservan su hash.
- **Preparar carpeta del mod** reúne la última DLL compilada desde el editor, `json/`, `textures/` y los archivos opcionales definidos en `config/artifacts.json`. Guarda la salida en una carpeta nueva de `data/packages/` con un registro de hashes. Detecta cambios en fuentes, DLL y contenido; cambiar JSON o texturas permite preparar de nuevo sin recompilar. Para DLL locales también comprueba las referencias y su configuración. Los pasos de compilación externos al árbol del clan todavía requieren revisión manual.

## Probar un clan nuevo

1. Inicia el editor y pulsa **Crear clan** en la biblioteca.
2. Elige una carpeta de destino nueva dentro de una carpeta que ya exista y completa identidad, campeones y cartas iniciales.
3. Revisa **Cartas**, **Campeones**, **Recursos visuales** y **Validación**.
4. En **Publicación**, selecciona `src/ID.Plugin.csproj` y pulsa **Compilar con DLL instaladas**. El resultado muestra la ruta de la DLL, SHA-256 y registro.
5. Pulsa **Preparar carpeta del mod**. Copia la carpeta indicada a un perfil de pruebas de BepInEx que tenga las dependencias del clan. Comprueba la selección de campeones, iniciales y estandarte dentro del juego y revisa `LogOutput.log` si falla.

La pantalla conserva la última compilación correcta aunque vuelvas a abrirla. **Actualizar comprobación** contrasta fuentes y contenido con la salida preparada. Cambios en C# o en el proyecto requieren recompilar; cambios solo en JSON o texturas requieren preparar de nuevo. La salida incluye los directorios configurados; añade a `config/artifacts.json` cualquier otro directorio de recursos que necesite un proyecto importado. El editor no instala la carpeta automáticamente.

Para configurar esta opción en otro equipo, copia `config/build-local.example.json` a `data/build-local.json`, sustituye los valores por rutas absolutas a las DLL y escribe la versión instalada de Trainworks. Los nombres de referencias y el framework están en `config/offline-build.json`. Las rutas locales permanecen fuera de Git. Reinicia el editor o vuelve a entrar en Publicación después de cambiar la configuración.

La opción con DLL instaladas está pensada para las fuentes de la plantilla generada: usa el framework configurado y no reproduce propiedades, generadores, recursos incrustados ni pasos personalizados del proyecto original. Para proyectos importados que necesiten esos pasos, usa **Compilar DLL local**, que ejecuta su `.csproj` completo. Una DLL compilada aún necesita los JSON y texturas del clan y la comprobación de carga en el juego.

## Estado y límites de esta versión

El guardado de desbloqueos conserva comentarios, formato y campos ajenos. Comprueba todos los hashes antes de escribir y respalda los originales bajo `data/backups/`; si falla un reemplazo, intenta revertir los archivos ya escritos sin sobrescribir cambios externos. `transaction.json` registra el resultado. Una interrupción del proceso entre archivos puede requerir recuperar las copias originales: el guardado completo de varios archivos no es una operación atómica del sistema de archivos.

La creación produce una **base editable**. Los gráficos de color son marcadores y las cartas de draft son unidades simples. La estructura generada ya incluye el estandarte y pasa pruebas de referencias internas, pero aún no está confirmada por una carga en el juego. El proyecto requiere revisión de equilibrio, iconos, recompensas y mecánicas antes de distribuirse. La compilación local se ha probado con una biblioteca .NET sin dependencias. Además, el C# generado compiló sin errores contra las DLL de Trainworks Reloaded 0.7.27 instaladas en este equipo; esa prueba no equivale a compilar el proyecto generado con su dependencia declarada 0.7.1 ni a cargarlo en el juego. Ese build normal sigue bloqueado porque GitHub Packages responde `401` al restaurar `TrainworksReloaded.Base`. La [guía de Trainworks](https://github.com/Monster-Train-2-Modding-Group/Trainworks-Reloaded/wiki/Getting-Setup-for-Modding) indica usar una credencial con `read:packages` para ese feed. Las credenciales se configuran en NuGet fuera del proyecto; no deben añadirse al repositorio.

La pantalla de publicación muestra Git, crea un commit limitado a la carpeta del clan, envía la rama a `origin` y consulta los runs de GitHub Actions asociados al SHA actual. Puede descargar el artefacto de un run exitoso del SHA actual y comprobar que incluye una DLL; no instala el archivo en el juego. La validación todavía no comprueba todas las referencias de Trainworks ni confirma el resultado dentro del juego. Los perfiles de dimensiones de arte y las reglas de edición están en `config/`; el editor conserva campos desconocidos de los clanes importados.

El workflow de los clanes nuevos comprueba que el repositorio tenga los secretos `GH_AUTH_USER` y `GH_AUTH_TOKEN` (token con `read:packages`) antes de restaurar paquetes. El token se usa solo en el runner de Actions y no se incluye en los archivos generados.

Nunca se editan los siete mods por ejecutar las pruebas. Las pruebas de escritura usan carpetas temporales. La biblioteca local y las copias de seguridad están en `data/`, ignorada por Git.




