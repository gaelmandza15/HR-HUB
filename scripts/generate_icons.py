"""Génère les icônes de l'application HR HUB à partir d'une image carrée.

Applique un masque à coins arrondis (carré légèrement arrondi, façon icône
d'application) puis exporte toutes les tailles requises par Tauri.
"""

from PIL import Image, ImageDraw
import os

SRC = r"C:\Users\Gael\Downloads\Gemini_Generated_Image_yns9v8yns9v8yns9.jpg"
# Le script vit dans <racine>/scripts : la racine du projet est son parent.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(PROJECT_ROOT, "src-tauri", "icons")

# Rayon d'arrondi en proportion du côté (carré "un peu arrondi").
# ~22 % correspond aux proportions typiques d'une icône d'application moderne.
RADIUS_RATIO = 0.22


def rounded(img: Image.Image, radius_ratio: float = RADIUS_RATIO) -> Image.Image:
    """Retourne une copie RGBA de l'image avec les quatre coins arrondis."""
    img = img.convert("RGBA")
    w, h = img.size
    side = min(w, h)
    radius = int(side * radius_ratio)

    # Masque anti-aliasé : on dessine à 4x puis on réduit pour lisser les bords.
    scale = 4
    mask = Image.new("L", (side * scale, side * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, side * scale - 1, side * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    mask = mask.resize((side, side), Image.LANCZOS)

    out = img.copy()
    out.putalpha(mask)
    return out


def center_square(img: Image.Image) -> Image.Image:
    """Recadre au carré centré (au cas où l'image ne serait pas exactement carrée)."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def main() -> None:
    src = Image.open(SRC)
    base = center_square(src)
    icon = rounded(base)

    os.makedirs(ICON_DIR, exist_ok=True)

    # Tailles requises par tauri.conf.json + tailles supplémentaires utiles.
    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }
    for name, size in sizes.items():
        icon.resize((size, size), Image.LANCZOS).save(os.path.join(ICON_DIR, name))

    # Format .ico multi-résolution (icône Windows de l'exécutable).
    icon.save(
        os.path.join(ICON_DIR, "icon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # Copie pour le frontend (favicon d'onglet + logo de la sidebar).
    public_dir = os.path.join(PROJECT_ROOT, "public")
    os.makedirs(public_dir, exist_ok=True)
    icon.resize((256, 256), Image.LANCZOS).save(os.path.join(public_dir, "icon.png"))
    icon.save(
        os.path.join(public_dir, "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )

    print("Icônes générées dans :", ICON_DIR)
    for f in sorted(os.listdir(ICON_DIR)):
        p = os.path.join(ICON_DIR, f)
        print(f"  {f:24s} {os.path.getsize(p):>8d} octets")


if __name__ == "__main__":
    main()
