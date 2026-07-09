#!/usr/bin/env python3
"""Download reference images found via z-ai image-search."""
import json
import os
import sys
import urllib.request

REF_DIR = "/home/z/my-project/download/game-assets/references"
QUERIES = {
    "iso-character": "isometric RPG character sprite sheet walk cycle",
    "iso-terrain": "isometric terrain tile set grass stone game art",
    "ragnarok-style": "Ragnarok Online sprite character animation style",
    "solo-leveling": "Solo Leveling manhwa shadow purple rift art",
    "ff8-seed": "Final Fantasy 8 SEED garden uniform character",
    "iso-weapons": "isometric game weapon icons sword staff sprite",
    "iso-vfx": "isometric RPG magic effect sprite animation",
    "iso-ui": "RPG game UI health bar skill icon manhwa style",
}

def search(query, count=4):
    import subprocess
    out = subprocess.run(
        ["z-ai", "image-search", "-q", query, "-c", str(count), "--gl", "us", "--no-rank"],
        capture_output=True, text=True, timeout=180,
    )
    # Strip non-JSON leading lines
    text = out.stdout
    json_start = text.find("{")
    if json_start < 0:
        print(f"[!] No JSON in response for query: {query}", file=sys.stderr)
        return []
    try:
        data = json.loads(text[json_start:])
        return data.get("results", [])
    except json.JSONDecodeError as e:
        print(f"[!] JSON decode failed for {query}: {e}", file=sys.stderr)
        return []

def download(url, out_path):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(out_path, "wb") as f:
            f.write(data)
        return len(data)
    except Exception as e:
        print(f"[!] Download failed {url}: {e}", file=sys.stderr)
        return 0

def main():
    os.makedirs(REF_DIR, exist_ok=True)
    manifest = {}
    for slug, query in QUERIES.items():
        print(f"==> {slug}: {query}")
        results = search(query, count=4)
        manifest[slug] = []
        for i, r in enumerate(results):
            url = r.get("original_url", "")
            if not url:
                continue
            ext = ".jpg" if ".jpg" in url.lower() else ".png"
            out_path = os.path.join(REF_DIR, f"{slug}_{i+1}{ext}")
            size = download(url, out_path)
            if size:
                manifest[slug].append({
                    "path": out_path,
                    "url": url,
                    "source": r.get("source", ""),
                    "width": r.get("original_width", ""),
                    "height": r.get("original_height", ""),
                })
                print(f"    [{i+1}] {size//1024}KB  {r.get('source','')}  {r.get('original_width','')}x{r.get('original_height','')}")
    with open(os.path.join(REF_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n[+] Manifest saved to {REF_DIR}/manifest.json")

if __name__ == "__main__":
    main()
