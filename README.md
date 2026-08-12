# Mantto Web Propio - Alimentos Cielo SAC

Sistema web con servidor propio para mantenimiento. No depende de Vento.

## Incluye

- Servidor API FastAPI.
- Base de datos SQLite central en `mantto_web.db`.
- Pagina web responsive para PC y celular.
- Login con usuarios y roles.
- Dashboard general en el login con indicadores y barras visuales.
- Pantalla principal solo con opciones de trabajo, sin dashboard como segmento.
- Cada opcion abre una pantalla independiente.
- Barra lateral derecha para desplazarse entre pantallas en PC.
- Barra superior desplazable en celular.
- Actualizacion automatica cada pocos segundos, sin recargar la pagina.
- Generar aviso.
- Generar aviso con combos desde la DB de equipos: rubro, ubicacion, proceso, sistema, equipo y codigo.
- Mensajes de confirmacion al terminar cada proceso.
- Atender aviso y generar OT.
- Generar OT directa.
- Peticion de item.
- Atender item.
- Configuracion de equipos, personal, productos, repuestos y usuarios.
- Importacion Excel para tablas maestras.

## Usuario inicial

Al primer inicio se crea:

```text
usuario: admin
clave: admin123
rol: admin
```

Cambia esa clave despues de entrar.

## Prueba rapida

```bat
pip install -r requirements.txt
python servidor.py
```

Luego abre:

```text
http://127.0.0.1:8000
```

## Uso en red local

En la PC servidor:

```bat
python servidor.py
```

Busca la IP:

```bat
ipconfig
```

Ejemplo de IP:

```text
192.168.1.50
```

Desde otra PC o celular conectado al mismo WiFi/red, abre:

```text
http://192.168.1.50:8000
```

Si no abre, permite el puerto TCP 8000 en el Firewall de Windows.

## Excel de equipos

Para que los filtros funcionen bien, el Excel de equipos debe tener estas columnas:

```text
codigo, rubro, ubicacion, proceso, sistema, equipo, componente, estado
```

Si tu Excel tiene columnas extra, el sistema las ignora al importar.

## Archivos principales

```text
static/styles.css   Diseno visual, colores y responsive.
static/index.html   Orden de pantallas e interfaz.
static/app.js       Botones, filtros, actualizacion y confirmaciones.
servidor.py         API del servidor.
db.py               Tablas de la base de datos.
```
