#!/usr/bin/env python3
"""
Generate high-CTR square thumbnail cards (600x600) for /en-direct/[slug] pages.
Features:
- Pure white background with subtle rounded border
- Centered, crisply scaled channel logo
- High-visibility red pill badge with live dot: "EN DIRECT"
- Subtle brand footer: ProgrammeCeSoir.fr
"""

import os
import glob
import re
from PIL import Image, ImageDraw, ImageFont

CARD_SIZE = 600
OUT_DIR = os.path.join(os.path.dirname(__file__), '../astro/public/og/direct')
LOGOS_DIR = os.path.join(os.path.dirname(__file__), '../astro/public/loghi')

def find_font(size=24, bold=True):
    candidates = [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/SFNS.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def generate_card(slug: str, logo_filename: str):
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{slug}.png")
    
    img = Image.new('RGBA', (CARD_SIZE, CARD_SIZE), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 1. Subtle soft card border (Slate-200)
    border_color = (226, 232, 240, 255)
    draw.rounded_rectangle([4, 4, CARD_SIZE - 5, CARD_SIZE - 5], radius=32, outline=border_color, width=3)

    # 2. Centered Logo
    logo_path = os.path.join(LOGOS_DIR, logo_filename) if logo_filename else None
    loaded_logo = False

    if logo_path and os.path.exists(logo_path) and logo_path.endswith('.png'):
        try:
            logo = Image.open(logo_path).convert('RGBA')
            max_w, max_h = 360, 240
            w, h = logo.size
            if w > 0 and h > 0:
                ratio = min(max_w / w, max_h / h)
                new_w, new_h = max(1, int(w * ratio)), max(1, int(h * ratio))
                logo_resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
                logo_x = (CARD_SIZE - new_w) // 2
                logo_y = 105 + (max_h - new_h) // 2
                img.alpha_composite(logo_resized, (logo_x, logo_y))
                loaded_logo = True
        except Exception as e:
            print(f"Warn: failed loading logo {logo_path}: {e}")

    if not loaded_logo:
        # Fallback text avatar for channel
        name = slug.replace('-', ' ').upper()
        font_avatar = find_font(38, bold=True)
        bbox = font_avatar.getbbox(name)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(((CARD_SIZE - tw) // 2, 190), name, fill=(15, 23, 42, 255), font=font_avatar)

    # 3. Red pill badge: 'EN DIRECT'
    badge_w = 230
    badge_h = 56
    badge_x = (CARD_SIZE - badge_w) // 2
    badge_y = 410
    pill_color = (220, 38, 38, 255) # Red-600

    draw.rounded_rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], radius=badge_h // 2, fill=pill_color)

    # White dot indicator
    dot_r = 5
    dot_cx = badge_x + 36
    dot_cy = badge_y + badge_h // 2
    draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=(255, 255, 255, 255))

    # Badge text
    font_badge = find_font(24, bold=True)
    text = 'EN DIRECT'
    bbox_b = font_badge.getbbox(text)
    tw_b = bbox_b[2] - bbox_b[0]
    th_b = bbox_b[3] - bbox_b[1]
    draw.text((dot_cx + 16, badge_y + (badge_h - th_b) // 2 - 2), text, fill=(255, 255, 255, 255), font=font_badge)

    # 4. Brand footer: ProgrammeCeSoir.fr
    font_brand = find_font(15, bold=False)
    brand_text = 'ProgrammeCeSoir.fr'
    bbox_br = font_brand.getbbox(brand_text)
    bw = bbox_br[2] - bbox_br[0]
    draw.text(((CARD_SIZE - bw) // 2, 520), brand_text, fill=(148, 163, 184, 255), font=font_brand)

    img.convert('RGB').save(out_path, quality=92, optimize=True)

def main():
    channel_logos_ts = os.path.join(os.path.dirname(__file__), '../astro/src/utils/channelLogos.ts')
    slug_map = {}
    if os.path.exists(channel_logos_ts):
        with open(channel_logos_ts, 'r', encoding='utf-8') as f:
            text = f.read()
            for m in re.finditer(r"'([a-z0-9\-]+)':\s*'/loghi/([^']+)'", text):
                slug_map[m.group(1)] = m.group(2)

    # Add any PNG found in astro/public/loghi/
    for p in glob.glob(os.path.join(LOGOS_DIR, '*.png')):
        base = os.path.splitext(os.path.basename(p))[0]
        if base not in slug_map:
            slug_map[base] = os.path.basename(p)

    print(f"Generating high-CTR /en-direct cards for {len(slug_map)} channels...")
    count = 0
    for slug, logo_file in slug_map.items():
        generate_card(slug, logo_file)
        count += 1

    print(f"Successfully generated {count} channel cards in {OUT_DIR}")

if __name__ == '__main__':
    main()
