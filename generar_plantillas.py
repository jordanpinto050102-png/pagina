from pathlib import Path

import pandas as pd


TEMPLATES = {
    "equipos": ["codigo", "rubro", "ubicacion", "proceso", "sistema", "equipo", "componente", "estado"],
    "personal": ["codigo", "nombre", "cargo", "area", "estado"],
    "productos": ["codigo", "nombre", "unidad", "stock", "estado"],
    "repuestos": ["codigo", "nombre", "unidad", "stock", "estado"],
}


def main():
    output = Path("plantillas")
    output.mkdir(exist_ok=True)
    for name, columns in TEMPLATES.items():
        path = output / f"{name}.xlsx"
        pd.DataFrame(columns=columns).to_excel(path, index=False)
        print(f"Generado: {path}")


if __name__ == "__main__":
    main()
