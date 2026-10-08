# Distribución del editor

## Usar una distribución

Instala Node.js 24 o posterior. Windows: ejecuta `start-editor.cmd`. Linux/macOS: `sh start-editor.sh`. Abre http://127.0.0.1:4319/. La primera ejecución instala dependencias de ejecución mediante npm y requiere conexión. Mantén la terminal abierta; Ctrl+C detiene el servidor.

Los clanes de ejemplo aparecen en Biblioteca. **Abrir copia** crea una carpeta independiente bajo `data/example-workspaces/` y la añade a la biblioteca. Conserva arte, JSON, fuentes, licencia y atribución. No incluye DLL precompiladas ni dependencias de otros mods. Las compilaciones con pasos personalizados, generadores de PluginInfo o librerías propias requieren su proyecto C# y dependencias correspondientes; la compilación simplificada con DLL instaladas no sustituye esos pasos.

El editor guarda biblioteca, copias, respaldos y artefactos bajo su propia carpeta `data/`. No sobrescribe los originales de los ejemplos. Las rutas y hashes publicados se comprueban antes de copiar. Las imágenes oficiales no están incluidas: puedes extraerlas localmente siguiendo EXTRACCION-ARTE-OFICIAL.md.

## Preparar una distribución desde el repositorio fuente

1. `npm ci` y `npm run build`.
2. Crear `data/distribution-sources.json`, con rutas absolutas a las fuentes:

```json
{
  "fullclan": "RUTA_ABSOLUTA_A_FULLCLAN_CON_SU_PROYECTO_CSHARP",
  "the-free-company": "RUTA_ABSOLUTA_A_FREE_COMPANY"
}
```

3. `npm run package:editor`.

Configuración en `config/distribution.json` y `config/distribution-files.json`: ejemplos obligatorios, directorio, extensiones, exclusiones, límites y archivos del editor. Cada ejecución genera una carpeta nueva bajo `data/releases/`. Se conserva el manifiesto original del ejemplo y su versión; el índice registra los hashes de los archivos copiados.

La salida incorpora HTML/JS compilados y configuración, sin biblioteca personal, backups, referencias privadas a DLL, credenciales NuGet, repositorios Git ni node_modules. Las rutas de descubrimiento del equipo de desarrollo se vacían; el usuario elige su instalación. El único recurso de data copiado explícitamente es el fondo de referencia del visor. Los bundles de los ejemplos conservan su plataforma; no se convierten para otro sistema operativo.

## Ejemplos incluidos

Confirmado por el usuario: **FullClan 0.3.0** y **The Free Company 0.2.6**. Cada ejemplo declara su tipo en `config/distribution.json`: `source` para FullClan y `clan` para Free Company. El mínimo exige ambos ejemplos, no dos clases de clan.

FullClan es un ejemplo de modificación de código mediante Harmony. **Copiar fuentes** crea una copia independiente de su proyecto C#, documentación, licencia, imágenes y manifiesto. El panel muestra la carpeta creada para abrirla en un editor C#; no la añade a la biblioteca de clanes ni genera JSON ficticio. Para compilarlo se utiliza su proyecto y sus dependencias NuGet originales. La versión de las fuentes coincide con el manifiesto instalado (0.3.0); no se actualizan versiones automáticamente.

Free Company se abre como clan editable y se añade a la biblioteca. El empaquetador verifica una clase real para ejemplos `clan`, y archivos `.cs` y `.csproj` para ejemplos `source`. Conserva licencias y originales. El paquete normal ya se genera con `preview: false`, dos ejemplos y ninguna fuente pendiente. El modo `--preview` sigue disponible para pruebas y registra las ausencias.

## Comprobaciones

Pruebas de distribución con dos clanes temporales, copias independientes, conservación de fuentes/arte/licencia, exclusión de DLL y credenciales y bloqueo de paquetes sin clan. Distribución real de prueba instalada con `npm ci --omit=dev --offline`: 12 paquetes de ejecución, arranque HTTP correcto y apertura de una copia de Free Company con 891 definiciones. No se modificó el ejemplo original ni un mod instalado.

Windows comprobado. Linux/macOS tienen lanzador y matriz CI preparada; requieren ejecución y revisión visual en esos sistemas. GitHub Actions no se ha ejecutado porque los cambios no se han publicado.

Distribución normal con ambos ejemplos comprobada: FullClan copia fuentes como source y Free Company añade un clan a la biblioteca. Edición de una copia C# contrastada mediante hash con el original intacto. Suite completa: 129 pruebas superadas. Informe local: data/acceptance/distribution-full-smoke.json.
