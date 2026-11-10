#!/usr/bin/env python3
"""Constitue le dossier photos/ : au moins 6 photos par modèle, largeur >= 1200 px.

Source : Wikimedia Commons (photos sous licence libre, avec attribution obligatoire).
Lit modeles.json (même dossier), écrit photos/<id>/NN_<angle>.jpg et photos/CREDITS.csv.

Usage :
    python3 telecharger_photos.py --dry-run          # liste ce qui serait téléchargé
    python3 telecharger_photos.py                    # télécharge tout
    python3 telecharger_photos.py --only toyota-rav4-3-20 --target 8

Bibliothèque standard uniquement. Nécessite un accès réseau à commons.wikimedia.org.
"""
import argparse
import csv
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "photos-voitures-famille/1.0 (script personnel, usage non commercial)"}
MIN_WIDTH = 1200
MAX_PER_MODEL = 10

EXCLUDE = re.compile(
    r"engine|motor\b|moteur|logo|badge|emblem|wheel|rim\b|headlight|taillight|tail light|"
    r"trunk|boot\b|luggage|gearshift|gear shift|pedal|key\b|diagram|drawing|crash|accident|"
    r"wreck|junkyard|scrap|camper|tuning|rally|racing|montgolfiade|balloon|police|polizei|ambulance|feuerwehr|pompier|gendarmerie|fuel cell|hydrogen|rail trail|trailhead",
    re.I,
)
INTERIOR = re.compile(r"interior|dashboard|cockpit|innenraum|cabin|instrument|intérieur|interieur|tableau de bord|console", re.I)
DASH_FIRST = re.compile(r"dashboard|cockpit|instrument|tableau de bord", re.I)
FRONT = re.compile(r"front|avant|vorne|frontansicht", re.I)
REAR = re.compile(r"rear|back\b|heck|arrière|arriere|hinten", re.I)
SIDE = re.compile(r"side|profile|profil|seite|lateral", re.I)


def api(params, retries=8):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < retries - 1:
                time.sleep(8 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            raise
    return {}


def category_files(cat, depth=1):
    """Titres de fichiers d'une catégorie Commons (sous-catégories incluses, profondeur limitée)."""
    titles = []
    cont = {}
    subcats = []
    while True:
        data = api(dict(action="query", list="categorymembers", cmtitle="Category:" + cat,
                        cmtype="file|subcat", cmlimit="500", **cont))
        for m in data.get("query", {}).get("categorymembers", []):
            if m["ns"] == 6:
                titles.append(m["title"])
            elif m["ns"] == 14:
                subcats.append(m["title"].split(":", 1)[1])
        if "continue" in data:
            cont = data["continue"]
        else:
            break
    if depth > 0:
        for sc in subcats[:12]:
            titles += category_files(sc, depth - 1)
    return titles


def search_files(query, limit=50):
    data = api(dict(action="query", list="search", srnamespace="6", srsearch=query, srlimit=str(limit)))
    return [h["title"] for h in data.get("query", {}).get("search", [])]


def image_info(titles):
    """Dimensions, URL, licence et auteur pour une liste de titres de fichiers."""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        data = api(dict(action="query", titles="|".join(batch), prop="imageinfo",
                        iiprop="url|size|mime|extmetadata", iiurlwidth="1600",
                        iiextmetadatafilter="Artist|LicenseShortName|Credit"))
        for p in data.get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            meta = ii.get("extmetadata", {})
            artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
            out[p["title"]] = {
                "title": p["title"],
                "width": ii.get("width", 0),
                "height": ii.get("height", 0),
                "mime": ii.get("mime", ""),
                "url": ii.get("url", ""),
                "thumb": ii.get("thumburl", ""),
                "license": meta.get("LicenseShortName", {}).get("value", ""),
                "author": html.unescape(artist),
                "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_")),
            }
        time.sleep(0.3)
    return out


def classify(title):
    if INTERIOR.search(title):
        return "tableau_de_bord" if DASH_FIRST.search(title) else "interieur"
    if FRONT.search(title) and REAR.search(title):
        return "exterieur"
    if FRONT.search(title):
        return "avant"
    if REAR.search(title):
        return "arriere"
    if SIDE.search(title):
        return "profil"
    return "exterieur"


def select(infos, target, forced=(), banned=()):
    """Choisit des photos variées : angles extérieurs différents, puis 1 à 2 intérieurs."""
    ok = [i for i in infos
          if i["mime"] == "image/jpeg" and i["width"] >= MIN_WIDTH and not EXCLUDE.search(i["title"])
          and not any(b in i["title"] for b in banned)]
    for i in ok:
        i["angle"] = classify(i["title"])
    ok.sort(key=lambda i: i["width"] * i["height"], reverse=True)
    picked, seen = [], set()

    def take(pred, n):
        for i in ok:
            if n == 0:
                return
            if i["title"] not in seen and pred(i):
                picked.append(i)
                seen.add(i["title"])
                n -= 1

    for t in forced:  # fichiers imposés dans modeles.json (commons_files), dans l'ordre
        take(lambda i, t=t: i["title"] == t, 1)
    if len(picked) >= target:
        return picked[:MAX_PER_MODEL]
    take(lambda i: i["angle"] == "tableau_de_bord", 1)
    take(lambda i: i["angle"] in ("interieur", "tableau_de_bord"), 1)
    for angle in ("avant", "arriere", "profil"):
        take(lambda i, a=angle: i["angle"] == a, 1)
    take(lambda i: i["angle"] not in ("interieur", "tableau_de_bord"), max(target - len(picked), 0))
    take(lambda i: True, max(target - len(picked), 0))
    return picked[:MAX_PER_MODEL]


def candidates(model):
    titles = []
    for cat in model["photos"]["commons_categories"]:
        try:
            found = category_files(cat)
        except Exception as e:  # catégorie inexistante ou erreur réseau
            print(f"  catégorie '{cat}' ignorée ({e})", file=sys.stderr)
            continue
        titles += found
        time.sleep(0.3)
    return titles


def download(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        f.write(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="id d'un modèle")
    ap.add_argument("--target", type=int, default=6, help="nombre minimal de photos par modèle")
    args = ap.parse_args()

    base = pathlib.Path(__file__).resolve().parent
    models = json.load(open(base / "modeles.json", encoding="utf-8"))["modeles"]
    out_dir = base / "photos"
    credits, short = [], []

    for m in models:
        if args.only and m["id"] != args.only:
            continue
        print(f"{m['marque']} {m['modele']} ({m['id']})")
        forced = m["photos"].get("commons_files", [])
        banned = m["photos"].get("commons_exclude", [])
        titles = candidates(m) + forced
        infos = list(image_info(titles).values()) if titles else []
        chosen = select(infos, args.target, forced, banned)
        if len(chosen) < args.target:
            # complément par recherche libre, utile si la catégorie est vide ou trop pauvre
            extra = []
            for q in m["photos"]["commons_search"]:
                extra += search_files(q)
                time.sleep(0.3)
            known = {i["title"] for i in infos}
            infos += list(image_info([t for t in extra if t not in known]).values())
            chosen = select(infos, args.target, forced, banned)
            if chosen:
                print("  (complété par recherche libre : vérifier que ce sont bien les bonnes générations)")
        print(f"  {len(chosen)} photos retenues")
        if len(chosen) < args.target:
            short.append((m["id"], len(chosen)))
        dest_dir = out_dir / m["id"]
        for n, i in enumerate(chosen, 1):
            name = f"{n:02d}_{i['angle']}.jpg"
            print(f"   {name:28s} {i['width']}x{i['height']}  {i['title']}")
            credits.append([m["id"], name, i["title"], i["author"], i["license"], i["page"]])
            if not args.dry_run:
                dest_dir.mkdir(parents=True, exist_ok=True)
                src = i["thumb"] if i["width"] > 1600 and i["thumb"] else i["url"]
                download(src, dest_dir / name)
                time.sleep(0.5)

    if not args.dry_run and credits:
        out_dir.mkdir(exist_ok=True)
        with open(out_dir / "CREDITS.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["modele", "fichier", "titre_commons", "auteur", "licence", "page_commons"])
            w.writerows(credits)
        print(f"\nCréditées dans {out_dir / 'CREDITS.csv'} (à afficher sur votre page : attribution obligatoire).")
    if short:
        print("\nModèles sous l'objectif, à compléter à la main :")
        for i, n in short:
            print(f"  {i} : {n} photo(s)")


if __name__ == "__main__":
    main()
