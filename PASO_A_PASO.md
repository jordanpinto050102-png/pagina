# Paso a paso - Mantto Web Propio

## 1. Elegir la PC servidor

Elige una PC que estara prendida mientras los usuarios trabajen.

En esa PC se guardara la base central:

```text
mantto_web.db
```

No borres ese archivo.

## 2. Instalar Python

Descarga Python para Windows:

```text
https://www.python.org/downloads/
```

Durante la instalacion marca:

```text
Add Python to PATH
```

Para verificar, abre CMD y ejecuta:

```bat
python --version
```

Debe mostrar una version de Python.

## 3. Copiar el proyecto

Copia la carpeta:

```text
mantto_web_propio
```

Por ejemplo:

```text
C:\Mantto\mantto_web_propio
```

## 4. Instalar librerias

Abre CMD y entra a la carpeta:

```bat
cd C:\Mantto\mantto_web_propio
```

Instala dependencias:

```bat
pip install -r requirements.txt
```

## 5. Iniciar el servidor

Ejecuta:

```bat
python servidor.py
```

Debe aparecer algo parecido a:

```text
Uvicorn running on http://0.0.0.0:8000
```

No cierres esa ventana.

## 6. Entrar desde la misma PC

Abre Chrome o Edge:

```text
http://127.0.0.1:8000
```

Usuario inicial:

```text
usuario: admin
clave: admin123
```

## 7. Entrar desde otra PC o celular

En la PC servidor abre CMD:

```bat
ipconfig
```

Busca la IPv4. Ejemplo:

```text
192.168.1.50
```

Desde otra PC o celular conectado a la misma red WiFi/LAN abre:

```text
http://192.168.1.50:8000
```

Cambia `192.168.1.50` por la IP real de tu servidor.

## 8. Configurar Firewall de Windows

Si desde otra PC no abre, en la PC servidor permite:

```text
Puerto TCP 8000
```

O permite Python en el Firewall cuando Windows pregunte.

## 9. Crear usuarios

Entra con:

```text
admin / admin123
```

Luego:

```text
Configuracion > Usuarios
```

Crea usuarios para cada persona.

Roles disponibles:

```text
admin       Puede configurar usuarios e importar Excel.
supervisor  Puede registrar y atender operaciones.
tecnico     Puede generar avisos, OT y peticiones.
almacen     Puede atender peticiones de items.
```

Ejemplos:

```text
usuario: tecnico1
clave: 123456
rol: tecnico

usuario: almacen
clave: 123456
rol: almacen

usuario: supervisor
clave: 123456
rol: supervisor
```

Despues cambia la clave inicial `admin123`.

## 10. Preparar Excel

Puedes importar estas tablas:

```text
equipos
personal
productos
repuestos
```

Columnas esperadas para equipos:

```text
codigo, rubro, ubicacion, proceso, sistema, equipo, componente, estado
```

Columnas esperadas para personal:

```text
codigo, nombre, cargo, area, estado
```

Columnas esperadas para productos:

```text
codigo, nombre, unidad, stock, estado
```

Columnas esperadas para repuestos:

```text
codigo, nombre, unidad, stock, estado
```

Tambien puedes generar plantillas con:

```bat
python generar_plantillas.py
```

Se crearan en:

```text
plantillas\
```

## 11. Importar Excel

Entra al sistema:

```text
Configuracion
```

Selecciona:

```text
Equipos / Personal / Productos / Repuestos
```

Elige el Excel y pulsa:

```text
Importar
```

Solo el usuario `admin` puede importar.

## 12. Uso diario

Flujo de pantallas:

```text
Login + dashboard general
Menu principal de opciones
Pantalla independiente de cada modulo
```

Pantallas del menu principal:

```text
Generar aviso
Generar OT
Peticion de item
Atender item
Atender aviso
Configuracion
```

## 13. Donde se modifica cada parte del codigo

Diseño visual, colores, orden visual, dashboard y responsive celular:

```text
static/styles.css
```

Estructura de pantallas, formularios, campos y orden de la interfaz:

```text
static/index.html
```

Botones, filtros, graficas, mensajes de confirmacion y actualizacion automatica:

```text
static/app.js
```

API del servidor, login, usuarios, importacion Excel y guardado de datos:

```text
servidor.py
```

Tablas de la base de datos SQLite:

```text
db.py
```

La base real se guarda en:

```text
mantto_web.db
```

No borres `mantto_web.db` cuando actualices el sistema, porque ahi quedan tus OT, avisos, usuarios y configuraciones.

Cuando atiendes un aviso, el sistema genera automaticamente una OT.

Cuando atiendes una peticion de item, registra el usuario y la fecha de atencion.

## 13. Copia de seguridad

Cada dia copia este archivo:

```text
mantto_web.db
```

Guardalo en USB, nube o disco externo.

Ese archivo contiene la informacion del sistema.

## 14. Donde se cambia cada parte del codigo

Diseno visual:

```text
static/styles.css
```

Ahi se cambian colores, tamanos, barra derecha, botones, formularios, dashboard y vista celular.

Orden de pantallas e interfaz HTML:

```text
static/index.html
```

Ahi se cambia el orden del login, menu principal, generar aviso, generar OT, peticion, atender item, atender aviso y configuracion.

Logica de botones, combos, filtros y actualizacion automatica:

```text
static/app.js
```

Ahi se cambia cada accion del navegador: login, cambiar pantalla, cargar datos, filtrar equipos, guardar aviso, guardar OT, generar peticion, atender item, atender aviso, importar Excel y mostrar confirmaciones.

API del servidor:

```text
servidor.py
```

Ahi se cambian las rutas de la API, permisos, login, importacion Excel y operaciones principales.

Tablas y estructura de la base de datos:

```text
db.py
```

Ahi se crean las tablas y columnas.

## 15. Que tabla usa cada modulo

Login + dashboard:

```text
ots
avisos
peticiones
equipos
```

Generar aviso:

```text
avisos
equipos
```

Los combobox de rubro, ubicacion, proceso, sistema, equipo y codigo salen de la tabla `equipos`, que se carga desde Excel.

Generar OT:

```text
ots
equipos
personal
```

Peticion de item:

```text
peticiones
ots
productos
repuestos
```

Atender item:

```text
peticiones
```

Atender aviso:

```text
avisos
ots
```

Configuracion:

```text
equipos
personal
productos
repuestos
users
```
