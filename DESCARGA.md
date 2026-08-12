# Descarga del proyecto Mantto Web Propio

Si el archivo comprimido no descarga directamente, usa cualquiera de estas dos opciones.

## Opcion 1: descargar archivos sueltos

Crea esta estructura en tu PC:

```text
mantto_web_propio/
  servidor.py
  db.py
  requirements.txt
  iniciar_servidor.bat
  README.md
  PASO_A_PASO.md
  generar_plantillas.py
  static/
    index.html
    app.js
    styles.css
  plantillas/
    README.md
```

Descarga cada archivo desde el navegador y guardalo con el mismo nombre.

## Opcion 2: descargar paquete base64

Descarga:

```text
mantto_web_propio.tar.gz.b64.txt
```

Luego, en Windows, abre CMD en la carpeta donde descargaste el archivo y ejecuta:

```bat
certutil -decode mantto_web_propio.tar.gz.b64.txt mantto_web_propio.tar.gz
```

Despues descomprime `mantto_web_propio.tar.gz` con 7-Zip o WinRAR.

## Ejecutar

Entra a la carpeta del proyecto:

```bat
cd C:\Mantto\mantto_web_propio
```

Instala paquetes:

```bat
pip install -r requirements.txt
```

Inicia el servidor:

```bat
python servidor.py
```

Abre:

```text
http://127.0.0.1:8000
```

Usuario inicial:

```text
admin
admin123
```
