# Aplicación de Gestión BOM – Mantos Blancos

## Descripción

Esta aplicación web permite la consulta, búsqueda y gestión de estructuras BOM (Bill of Materials) asociadas a equipos, optimizando el acceso a la información y reduciendo los tiempos de análisis en el área de programación y mantenimiento.

La herramienta funciona de manera local (frontend puro) y permite trabajar con archivos JSON como base de datos estructurada.



## Objetivo del Proyecto

Optimizar el proceso de consulta y gestión de información técnica (BOM), mediante la digitalización, estandarización y centralización de los datos, mejorando la trazabilidad y reduciendo tiempos de análisis.


#Herramientas

- HTML5
- CSS3
- JavaScript
- JSON (Base de datos estructurada)
- Visual Studio Code (desarrollo)
- GitHub (control de versiones)
- Google Drive (almacenamiento compartido)
- PWA (Progressive Web App)
  - `manifest.json`
  - `service-worker.js`



#Estructura#


# Funcionamiento General

1. La aplicación carga la base de datos desde `data/bom.json`.
2. Se indexa la información para permitir búsquedas rápidas.
3. El usuario puede filtrar, buscar y consultar información.
4. Los cambios pueden exportarse en formato JSON.
5. El archivo actualizado debe reemplazar la versión anterior en la carpeta compartida.


# Cómo Actualizar la Base de Datos

# Método recomendado:

1. Editar la base en Excel (`bom.csv`).
2. Convertir a formato JSON.
3. Reemplazar el archivo `bom.json` dentro de la carpeta `/data`.
4. Actualizar la constante de versión si corresponde (ej: `CSV_VER` en `app.js`).
5. Subir los cambios al repositorio o a la carpeta compartida oficial.

# Importante
- Mantener los mismos nombres de columnas.
- No modificar la estructura del JSON.
- Reemplazar el archivo anterior, no duplicarlo.

# Control de Versiones

El proyecto utiliza GitHub como sistema de control de versiones, lo que permite:

- Registro de cambios
- Recuperación de versiones anteriores
- Distribución de la aplicación
- Documentación técnica


# Notas Técnicas

- La aplicación funciona de manera local.
- No existe integración directa con SAP.
- Los códigos utilizados corresponden a registros generados en SAP-PM dentro del entorno operativo.
- Se recomienda mantener una única versión oficial del archivo JSON en la carpeta compartida.



