#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras
import requests


SITE_NAME = "Programme Ce Soir"
SITE_URL = "https://programmecesoir.fr"
SITE_LOGO_URL = f"{SITE_URL}/apple-touch-icon.png"
AUTHOR_NAME = "La rédaction web"
DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_MAX_TOKENS = 2600
DEFAULT_MIN_WORDS = 200
DEFAULT_TARGET_MIN_WORDS = 450
DEFAULT_TARGET_MAX_WORDS = 650
MAX_BIRTHDAY_AGE = 90
PARIS_TZ = ZoneInfo("Europe/Paris")


@dataclass
class BirthdayCandidate:
    actor: dict[str, Any]
    slug: str
    birth_year: int | None
    mmdd: str
    exact_birthday: bool
    days_until_birthday: int


def load_env_file(env_path: Path, override: bool = False) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        normalized_key = key.strip()
        normalized_value = value.strip()
        if override or normalized_key not in os.environ:
            os.environ[normalized_key] = normalized_value


def load_env(args: argparse.Namespace) -> None:
    if args.env_file:
        load_env_file(Path(args.env_file))

    script_dir = Path(__file__).resolve().parent
    frontend_dir = script_dir.parent
    root_dir = frontend_dir.parent

    # Shared project credentials must override auxiliary task-specific env files.
    load_env_file(frontend_dir / ".env", override=True)
    load_env_file(root_dir / "scripts" / ".env", override=True)

    if not os.getenv("DEEPSEEK_API_KEY"):
        deepseek_file = root_dir / "DEEPSEEK.md"
        if deepseek_file.exists():
            match = re.search(r"DEEPSEEK_API_KEY\s*=\s*(.+)", deepseek_file.read_text(encoding="utf-8"))
            if match:
                os.environ["DEEPSEEK_API_KEY"] = match.group(1).strip()


def slugify(text: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFD", str(text or "")).encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower()).strip("-")
    return normalized


def strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or "")).strip()


def count_words(value: str) -> int:
    return len([part for part in strip_html(value).split(" ") if part])


def clean_html(value: str) -> str:
    cleaned = re.sub(r"^```(?:html|json)?", "", value.strip(), flags=re.I)
    cleaned = re.sub(r"```$", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"</?(html|head|body)[^>]*>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s(on\w+|style)=([\"']).*?\2", "", cleaned, flags=re.I)
    return cleaned.strip()


def unwrap_nested_body_html(value: str) -> str:
    text = str(value or "").strip()
    for _ in range(3):
        if not text.startswith("{"):
            break
        try:
            payload = json.loads(text)
        except Exception:
            break
        if not isinstance(payload, dict):
            break
        nested = payload.get("bodyHtml")
        if not nested:
            break
        text = str(nested).strip()
    return clean_html(text)


def get_today(args: argparse.Namespace) -> date:
    if args.today:
        month, day = [int(part) for part in args.today.split("-")]
        return date(datetime.now(timezone.utc).year, month, day)
    return datetime.now(timezone.utc).date()


def mmdd_from_birthdate(value: str) -> tuple[str | None, int | None]:
    parts = str(value).split("-")
    if len(parts) == 3:
        year, month, day = parts
        if month.isdigit() and day.isdigit():
            return f"{month.zfill(2)}-{day.zfill(2)}", int(year) if year.isdigit() else None
    if re.match(r"^\d{2}-\d{2}$", str(value)):
        return str(value), None
    return None, None


def next_birthday_date(mmdd: str, today: date) -> date:
    month, day = [int(part) for part in mmdd.split("-")]
    for year in (today.year, today.year + 1):
        try:
            target = date(year, month, day)
        except ValueError:
            if month == 2 and day == 29:
                target = date(year, 3, 1)
            else:
                raise
        if target >= today:
            return target
    return date(today.year + 1, month, min(day, 28))


def birthday_age_for_candidate(birth_year: int | None, today: date, exact_birthday: bool) -> int | None:
    if not birth_year:
        return None
    return (today.year - birth_year) if exact_birthday else (today.year - birth_year + 1)


def read_candidates(actors_dir: Path, today: date) -> list[BirthdayCandidate]:
    today_mmdd = today.strftime("%m-%d")
    candidates: list[BirthdayCandidate] = []

    for file_path in sorted(actors_dir.glob("*.json")):
      try:
        actor = json.loads(file_path.read_text(encoding="utf-8"))
      except Exception:
        continue

      birth_date = actor.get("birthDate")
      if not birth_date:
        continue

      mmdd, birth_year = mmdd_from_birthdate(str(birth_date))
      if not mmdd:
        continue

      exact = mmdd == today_mmdd
      try:
          upcoming_date = next_birthday_date(mmdd, today)
      except ValueError:
          continue
      days_until = 0 if exact else (upcoming_date - today).days
      birthday_age = birthday_age_for_candidate(birth_year, today, exact)
      if birthday_age is not None and birthday_age > MAX_BIRTHDAY_AGE:
          continue
      candidates.append(
          BirthdayCandidate(
              actor=actor,
              slug=file_path.stem,
              birth_year=birth_year,
              mmdd=mmdd,
              exact_birthday=exact,
              days_until_birthday=days_until,
          )
      )

    return candidates


def compare_key(candidate: BirthdayCandidate) -> tuple[int, int, int, str]:
    works = int(candidate.actor.get("worksCount") or 0)
    airings = len(candidate.actor.get("upcomingAirings") or [])
    known_for = len(candidate.actor.get("knownFor") or [])
    return (-works, -airings, -known_for, str(candidate.actor.get("name") or ""))


def select_candidate(candidates: list[BirthdayCandidate]) -> tuple[str, BirthdayCandidate | None, list[BirthdayCandidate], list[BirthdayCandidate]]:
    exact = sorted([item for item in candidates if item.exact_birthday], key=compare_key)
    if exact:
        return "exact", exact[0], exact, []

    upcoming = sorted(
        [item for item in candidates if item.days_until_birthday > 0],
        key=lambda item: (item.days_until_birthday,) + compare_key(item),
    )
    return "upcoming", (upcoming[0] if upcoming else None), [], upcoming


def build_known_for(actor: dict[str, Any]) -> str:
    known_for = actor.get("knownFor") or []
    if not known_for:
        return "Aucune œuvre notable renseignée."
    parts = []
    for item in known_for[:6]:
        title = item.get("title") or "Œuvre"
        year = item.get("year")
        parts.append(f'"{title}" ({year})' if year else f'"{title}"')
    return ", ".join(parts)


def build_airings(actor: dict[str, Any]) -> str:
    airings = actor.get("upcomingAirings") or []
    if not airings:
        return "Aucune diffusion confirmée dans les prochains jours."
    lines = []
    for item in airings[:5]:
        channel = item.get("channelName") or item.get("channel") or "une chaîne TV"
        dt = item.get("date") or ""
        lines.append(f'- "{item.get("title") or "Programme"}" sur {channel}{f" le {dt}" if dt else ""}')
    return "\n".join(lines)


def paris_date_from_iso(value: str | None) -> str | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(PARIS_TZ).date().isoformat()


def filter_airings_for_publication(actor: dict[str, Any], published_date_iso: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for airing in actor.get("upcomingAirings") or []:
        paris_day = paris_date_from_iso(airing.get("startTime"))
        if paris_day and paris_day < published_date_iso:
            continue
        key = (
            str(airing.get("programSlug") or ""),
            str(airing.get("channelSlug") or ""),
            str(airing.get("startTime") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(airing)
    return result


def build_prompt(candidate: BirthdayCandidate, age: int | None, mode: str, args: argparse.Namespace, published_date_iso: str) -> list[dict[str, str]]:
    actor = candidate.actor
    actor_for_prompt = dict(actor)
    actor_for_prompt["upcomingAirings"] = filter_airings_for_publication(actor, published_date_iso)
    if mode == "exact":
        headline = f'{actor.get("name")} fête aujourd\'hui ses {age or "N"} ans'
        timing = f"né(e) le {actor.get('birthDate')}"
    else:
        headline = f'{actor.get("name")} fêtera bientôt ses {age or "N"} ans'
        timing = f"né(e) le {actor.get('birthDate')}, prochain anniversaire dans {candidate.days_until_birthday} jour(s)"

    return [
        {
            "role": "system",
            "content": (
                "Tu es journaliste culture et télévision pour programmecesoir.fr. "
                "Tu écris en français naturel, factuel et chaleureux. "
                "Tu ne dois jamais inventer de dates, de récompenses, de films ou de séries non fournis. "
                "Réponds uniquement avec un objet JSON valide ayant exactement les clés: title, bodyHtml, metaDescription."
            ),
        },
        {
            "role": "user",
            "content": (
                "Rédige un article éditorial HTML pour la rubrique \"Anniversaire du jour\".\n\n"
                f"Sujet:\n- {headline}\n- {timing}\n"
                f"- Nationalité: {actor.get('nationality') or 'non précisée'}\n"
                f"- Métier: {actor.get('jobTitle') or 'acteur / actrice'}\n"
                f"- Connu(e) pour: {build_known_for(actor)}\n"
                f"- Diffusions TV à venir:\n{build_airings(actor_for_prompt)}\n\n"
                "Contraintes fortes:\n"
                "- Français de France\n"
                f"- Article complet de {args.target_min_words} à {args.target_max_words} mots\n"
                f"- Minimum absolu: {args.min_words} mots\n"
                "- Premier paragraphe sans titre intermédiaire\n"
                "- Utiliser uniquement ces balises HTML: <p>, <h2>, <ul>, <li>, <strong>, <em>\n"
                "- Inclure une section \"À voir à la télévision\"\n"
                "- Mentionner programmecesoir.fr au moins une fois\n"
                "- Le ton doit être éditorial, accessible et crédible\n"
                "- Si certaines informations manquent, ne pas les combler\n"
                "- Si le mode est \"upcoming\", préciser clairement qu'il s'agit du prochain anniversaire et non de l'anniversaire du jour\n\n"
                "Le JSON doit respecter:\n"
                "- title: titre SEO éditorial\n"
                "- bodyHtml: HTML complet de l'article\n"
                "- metaDescription: 140 à 160 caractères\n\n"
                "Réponds en JSON uniquement."
            ),
        },
    ]


def dry_run_article(candidate: BirthdayCandidate, age: int | None, mode: str) -> dict[str, Any]:
    actor = candidate.actor
    title = (
        f"{actor.get('name')} fête ses {age or 'N'} ans : carrière, rôles marquants et programmes TV"
        if mode == "exact"
        else f"{actor.get('name')} bientôt à l'honneur : son prochain anniversaire et ses programmes TV"
    )
    intro = (
        f"{actor.get('name')} est à l'honneur aujourd'hui sur Programme Ce Soir."
        if mode == "exact"
        else f"{actor.get('name')} sera bientôt célébré(e) sur Programme Ce Soir."
    )
    body_html = clean_html(
        f"""
        <p>{html.escape(intro)} L'occasion de revenir sur un parcours artistique marquant, sur les rôles qui ont construit sa réputation et sur les œuvres que les téléspectateurs peuvent retrouver à l'antenne dans les prochains jours. Sur programmecesoir.fr, cette mise en avant éditoriale sert de point d'entrée simple pour retrouver ses films, ses séries et ses prochaines diffusions télévisées.</p>
        <h2>Une présence reconnaissable à l'écran</h2>
        <p>{html.escape(actor.get('name') or 'Cet artiste')} {html.escape(actor.get('descriptionAi') or actor.get('description') or 'demeure une figure reconnue du paysage audiovisuel.')} Cette approche éditoriale évite les extrapolations tout en gardant une vraie utilité pour les lecteurs qui cherchent quoi regarder ce soir. L'idée n'est pas de reconstituer artificiellement une biographie encyclopédique, mais de valoriser de manière claire les éléments fiables déjà présents dans le catalogue et de les transformer en lecture agréable pour l'utilisateur.</p>
        <h2>Œuvres à retenir</h2>
        <p>Parmi les titres associés à {html.escape(actor.get('name') or 'cet artiste')}, plusieurs œuvres ressortent nettement dans le catalogue. Cette sélection sert de repère éditorial: elle aide le lecteur à rattacher un nom à quelques programmes concrets, à comprendre dans quel univers artistique l'acteur ou l'actrice s'inscrit, et à identifier plus rapidement les films ou séries qui méritent un détour quand ils reviennent à l'antenne.</p>
        <ul>{"".join(f"<li><strong>{html.escape(item.get('title') or 'Œuvre')}</strong></li>" for item in (actor.get('knownFor') or [])[:5]) or "<li>Aucune œuvre notable renseignée.</li>"}</ul>
        <h2>À voir à la télévision</h2>
        <p>Le vrai intérêt de cette page anniversaire sur programmecesoir.fr est de transformer une information éditoriale en usage concret. Au lieu d'un simple hommage, la page met en avant des diffusions immédiatement exploitables, avec des titres, des chaînes et un horizon de visionnage clair. C'est cette articulation entre contexte culturel et service TV qui donne sa valeur à la rubrique.</p>
        <ul>{"".join(f"<li><strong>{html.escape(item.get('title') or 'Programme')}</strong> sur {html.escape(item.get('channelName') or item.get('channel') or 'une chaîne TV')}</li>" for item in (actor.get('upcomingAirings') or [])[:5]) or "<li>Aucune diffusion confirmée dans les prochains jours.</li>"}</ul>
        <p>Cette logique éditoriale garde la promesse du site: relier la culture TV, l'actualité des grilles et l'intention de visionnage. Quand un anniversaire tombe le bon jour, l'article devient une porte d'entrée naturelle vers les œuvres à revoir. Et lorsqu'il faut préparer un prochain anniversaire, la mécanique éditoriale reste lisible, honnête et utile. C'est exactement le type de contenu de service que la rédaction web peut faire vivre dans le temps.</p>
        """
    )
    plain_text = strip_html(body_html)
    return {
        "title": title,
        "bodyHtml": body_html,
        "metaDescription": (
            f"{actor.get('name')} fête ses {age or ''} ans aujourd'hui. Biographie, œuvres marquantes et diffusions TV à retrouver sur programmecesoir.fr."
            if mode == "exact"
            else f"Le prochain anniversaire de {actor.get('name')} approche. Découvrez ses œuvres marquantes et ses diffusions TV sur programmecesoir.fr."
        )[:160],
        "plainText": plain_text,
        "excerpt": f"{plain_text[:200].strip()}…",
        "wordCount": count_words(plain_text),
    }


def parse_json_or_html(content: str, candidate: BirthdayCandidate, age: int | None, mode: str) -> dict[str, Any]:
    text = content.strip()
    try:
        payload = json.loads(text)
    except Exception:
        match = re.search(r"\{[\s\S]*\}\s*$", text)
        if match:
            try:
                payload = json.loads(match.group(0))
            except Exception:
                payload = None
        else:
            payload = None

    if isinstance(payload, dict):
        body_html = unwrap_nested_body_html(str(payload.get("bodyHtml") or ""))
        plain_text = strip_html(body_html)
        return {
            "title": str(payload.get("title") or "").strip(),
            "bodyHtml": body_html,
            "metaDescription": str(payload.get("metaDescription") or "").strip()[:160],
            "plainText": plain_text,
            "excerpt": f"{plain_text[:200].strip()}…",
            "wordCount": count_words(plain_text),
        }

    body_html = clean_html(content)
    plain_text = strip_html(body_html)
    title = (
        f"{candidate.actor.get('name')} fête ses {age or 'N'} ans : carrière, rôles marquants et programmes TV"
        if mode == "exact"
        else f"{candidate.actor.get('name')} bientôt à l'honneur : son prochain anniversaire et ses programmes TV"
    )
    meta = (
        f"{candidate.actor.get('name')} fête ses {age or ''} ans aujourd'hui. Biographie, œuvres marquantes et diffusions TV à retrouver sur programmecesoir.fr."
        if mode == "exact"
        else f"Le prochain anniversaire de {candidate.actor.get('name')} approche. Découvrez ses œuvres marquantes et ses diffusions TV sur programmecesoir.fr."
    )[:160]
    return {
        "title": title,
        "bodyHtml": body_html,
        "metaDescription": meta,
        "plainText": plain_text,
        "excerpt": f"{plain_text[:200].strip()}…",
        "wordCount": count_words(plain_text),
    }


def normalize_article_shape(article: dict[str, Any], candidate: BirthdayCandidate, age: int | None, mode: str) -> dict[str, Any]:
    body_html = str(article.get("bodyHtml") or "").strip()
    if not body_html.startswith("{"):
        return article

    nested = parse_json_or_html(body_html, candidate, age, mode)
    return {
        "title": article.get("title") or nested.get("title"),
        "bodyHtml": nested.get("bodyHtml"),
        "metaDescription": article.get("metaDescription") or nested.get("metaDescription"),
        "plainText": nested.get("plainText"),
        "excerpt": nested.get("excerpt"),
        "wordCount": nested.get("wordCount"),
    }


def normalize_stored_article(article_row: dict[str, Any], candidate: BirthdayCandidate, age: int | None, mode: str) -> dict[str, Any]:
    raw_body = article_row.get("article_body_html") or ""
    parsed = parse_json_or_html(str(raw_body), candidate, age, mode)
    title = str(article_row.get("article_title") or parsed.get("title") or "").strip()
    excerpt = str(article_row.get("article_excerpt") or "").strip()
    meta = str(article_row.get("meta_description") or parsed.get("metaDescription") or "").strip()[:160]
    plain_text = parsed.get("plainText") or strip_html(parsed.get("bodyHtml") or "")
    cleaned_excerpt = excerpt if excerpt and not excerpt.startswith("{") else f"{plain_text[:200].strip()}…"
    return normalize_article_shape({
        "title": title or parsed.get("title"),
        "bodyHtml": parsed.get("bodyHtml"),
        "metaDescription": meta,
        "plainText": plain_text,
        "excerpt": cleaned_excerpt,
        "wordCount": count_words(plain_text),
    }, candidate, age, mode)


def validate_article(article: dict[str, Any], candidate: BirthdayCandidate, mode: str, args: argparse.Namespace) -> list[str]:
    errors: list[str] = []
    plain_text = article.get("plainText") or ""
    body_html = article.get("bodyHtml") or ""
    if not article.get("title"):
        errors.append("title manquant")
    if not body_html:
        errors.append("bodyHtml manquant")
    if not article.get("metaDescription"):
        errors.append("metaDescription manquant")
    if int(article.get("wordCount") or 0) < args.min_words:
        errors.append(f"article trop court ({article.get('wordCount')} mots)")
    if "programmecesoir.fr" not in plain_text:
        errors.append("mention programmecesoir.fr absente")
    if str(candidate.actor.get("name") or "").lower() not in plain_text.lower():
        errors.append("nom acteur absent")
    if mode == "upcoming" and not re.search(r"bient[oô]t|prochain anniversaire", plain_text, flags=re.I):
        errors.append("fallback prochain anniversaire non explicite")
    if mode == "exact" and not re.search(r"anniversaire|f[eê]te aujourd'hui|fete aujourd'hui", plain_text, flags=re.I):
        errors.append("contexte anniversaire insuffisant")
    if "<h2>" not in body_html.lower():
        errors.append("section h2 absente")
    if "À voir à la télévision".lower() not in body_html.lower():
        errors.append("section TV absente")
    if re.search(r"<(script|style|html|body|head)", body_html, flags=re.I):
        errors.append("balises interdites")
    return errors


def call_deepseek(candidate: BirthdayCandidate, age: int | None, mode: str, args: argparse.Namespace, published_date_iso: str) -> dict[str, Any]:
    if args.dry_run:
        return dry_run_article(candidate, age, mode)

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY manquante")

    last_error: Exception | None = None
    for _ in range(3):
        try:
            response = requests.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json={
                    "model": "deepseek-chat",
                    "temperature": 0.55,
                    "max_tokens": args.max_tokens,
                    "messages": build_prompt(candidate, age, mode, args, published_date_iso),
                },
                timeout=args.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            content = str((((payload.get("choices") or [{}])[0]).get("message") or {}).get("content") or "").strip()
            article = parse_json_or_html(content, candidate, age, mode)
            errors = validate_article(article, candidate, mode, args)
            if not errors:
                return article
            last_error = RuntimeError(f"Validation éditoriale échouée: {', '.join(errors)}")
        except Exception as exc:
            last_error = exc
    raise last_error or RuntimeError("Échec génération DeepSeek")


def build_structured_data(article: dict[str, Any], candidate: BirthdayCandidate, article_slug: str, today_iso: str) -> dict[str, Any]:
    article_url = f"{SITE_URL}/anniversaire/{article_slug}"
    external_ids = candidate.actor.get("externalIds") or {}
    same_as = []
    if external_ids.get("wikidata"):
        same_as.append(f"https://www.wikidata.org/wiki/{external_ids['wikidata']}")
    if external_ids.get("wikipedia"):
        same_as.append(external_ids["wikipedia"])
    if external_ids.get("imdb"):
        same_as.append(f"https://www.imdb.com/name/{external_ids['imdb']}/")
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": f"{article_url}#article",
        "headline": article["title"],
        "description": article["metaDescription"],
        "url": article_url,
        "mainEntityOfPage": {"@type": "WebPage", "@id": article_url},
        "author": {"@type": "Person", "name": AUTHOR_NAME},
        "publisher": {
            "@type": "Organization",
            "name": SITE_NAME,
            "url": SITE_URL,
            "logo": {"@type": "ImageObject", "url": SITE_LOGO_URL},
        },
        "datePublished": f"{today_iso}T06:00:00+01:00",
        "dateModified": datetime.now(timezone.utc).isoformat(),
        "inLanguage": "fr-FR",
        "articleSection": "Anniversaire du jour",
        "about": {
            "@type": "Person",
            "name": candidate.actor.get("name"),
            "birthDate": candidate.actor.get("birthDate"),
        },
    }
    if same_as:
        data["about"]["sameAs"] = same_as
    if candidate.actor.get("nationality"):
        data["about"]["nationality"] = {"@type": "Country", "name": candidate.actor["nationality"]}
    return data


def build_og(article: dict[str, Any], article_slug: str) -> dict[str, Any]:
    article_url = f"{SITE_URL}/anniversaire/{article_slug}"
    return {
        "type": "article",
        "siteName": SITE_NAME,
        "locale": "fr_FR",
        "title": article["title"],
        "description": article["metaDescription"],
        "url": article_url,
        "image": f"{SITE_URL}/static/img/programmecesoir-social.jpg",
    }


def article_exists(conn: Any, slug: str, published_date: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM birthday_articles
            WHERE entity_slug = %s AND published_date = %s
            LIMIT 1
            """,
            (slug, published_date),
        )
        return cur.fetchone() is not None


def fetch_existing_article(conn: Any, slug: str, published_date: str) -> dict[str, Any] | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT published_date, entity_slug, entity_name, article_title, article_slug, article_body_html,
                   article_excerpt, image_url, image_alt, upcoming_airings, known_for, external_ids,
                   meta_description, age_today, generation_model
            FROM birthday_articles
            WHERE entity_slug = %s AND published_date = %s
            LIMIT 1
            """,
            (slug, published_date),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def save_article(conn: Any, candidate: BirthdayCandidate, article: dict[str, Any], age: int | None, published_date: str) -> str:
    article_slug = f"{candidate.slug}-anniversaire-{published_date}"
    payload = (
        published_date,
        candidate.mmdd,
        candidate.birth_year,
        age,
        "actor",
        candidate.slug,
        candidate.actor.get("name"),
        article["title"],
        article_slug,
        article["bodyHtml"],
        article["excerpt"],
        None,
        None,
        json.dumps(candidate.actor.get("upcomingAirings")) if candidate.actor.get("upcomingAirings") is not None else None,
        json.dumps(candidate.actor.get("knownFor")) if candidate.actor.get("knownFor") is not None else None,
        json.dumps(candidate.actor.get("externalIds")) if candidate.actor.get("externalIds") is not None else None,
        article["metaDescription"],
        True,
        "deepseek-chat",
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO birthday_articles (
              published_date,
              birth_date_mmdd,
              birth_year,
              age_today,
              entity_type,
              entity_slug,
              entity_name,
              article_title,
              article_slug,
              article_body_html,
              article_excerpt,
              image_url,
              image_alt,
              upcoming_airings,
              known_for,
              external_ids,
              meta_description,
              is_published,
              generation_model
            ) VALUES (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s
            )
            ON CONFLICT (entity_slug, published_date)
            DO UPDATE SET
              article_title = EXCLUDED.article_title,
              article_slug = EXCLUDED.article_slug,
              article_body_html = EXCLUDED.article_body_html,
              article_excerpt = EXCLUDED.article_excerpt,
              image_url = EXCLUDED.image_url,
              image_alt = EXCLUDED.image_alt,
              upcoming_airings = EXCLUDED.upcoming_airings,
              known_for = EXCLUDED.known_for,
              external_ids = EXCLUDED.external_ids,
              meta_description = EXCLUDED.meta_description,
              is_published = EXCLUDED.is_published,
              generation_model = EXCLUDED.generation_model
            RETURNING article_slug
            """,
            payload,
        )
        row = cur.fetchone()
    conn.commit()
    return str(row[0])


def write_report(report_path: Path, payload: dict[str, Any]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_public_payload(
    article: dict[str, Any],
    candidate: BirthdayCandidate,
    article_slug: str,
    today_iso: str,
    age: int | None,
    mode: str,
    exact_matches: list[BirthdayCandidate],
    upcoming_matches: list[BirthdayCandidate],
    structured_data: dict[str, Any],
    og: dict[str, Any],
    dry_run: bool,
) -> dict[str, Any]:
    actor_image = ((candidate.actor.get("image") or {}).get("url") if isinstance(candidate.actor.get("image"), dict) else None)
    publication_day = date.fromisoformat(today_iso)
    published_airings = filter_airings_for_publication(candidate.actor, today_iso)
    return {
        "ok": True,
        "mode": mode,
        "dryRun": dry_run,
        "publishedDate": today_iso,
        "selectedActor": candidate.actor.get("name"),
        "selectedSlug": candidate.slug,
        "exactMatches": [item.actor.get("name") for item in exact_matches],
        "exactMatchItems": [
            {
                "name": item.actor.get("name"),
                "slug": item.slug,
                "age": birthday_age_for_candidate(item.birth_year, publication_day, True),
            }
            for item in exact_matches
        ],
        "upcomingMatches": [
            {"name": item.actor.get("name"), "daysUntilBirthday": item.days_until_birthday}
            for item in upcoming_matches
        ],
        "age": age,
        "articleSlug": article_slug,
        "title": article["title"],
        "bodyHtml": article["bodyHtml"],
        "excerpt": article["excerpt"],
        "metaDescription": article["metaDescription"],
        "wordCount": article["wordCount"],
        "imageUrl": None,
        "imageAlt": None,
        "actorImageUrl": actor_image,
        "actorBirthDate": candidate.actor.get("birthDate"),
        "actorNationality": candidate.actor.get("nationality"),
        "actorJobTitle": candidate.actor.get("jobTitle"),
        "upcomingAirings": published_airings,
        "knownFor": candidate.actor.get("knownFor") or [],
        "externalIds": candidate.actor.get("externalIds") or {},
        "og": og,
        "structuredData": structured_data,
    }


def write_public_payload(public_file: Path, article_slug: str, payload: dict[str, Any]) -> None:
    public_file.parent.mkdir(parents=True, exist_ok=True)
    public_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    archive_file = public_file.parent / "articles" / f"{article_slug}.json"
    archive_file.parent.mkdir(parents=True, exist_ok=True)
    archive_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_archive_payload(public_file: Path) -> None:
    base_dir = public_file.parent
    articles_dir = base_dir / "articles"
    current_payload = None
    if public_file.exists():
        try:
            current_payload = json.loads(public_file.read_text(encoding="utf-8"))
        except Exception:
            current_payload = None

    entries: list[dict[str, Any]] = []
    if articles_dir.exists():
        for file_path in sorted(articles_dir.glob("*.json")):
            try:
                payload = json.loads(file_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if payload.get("ok") is not True:
                continue
            entries.append({
                "articleSlug": payload.get("articleSlug") or file_path.stem,
                "selectedActor": payload.get("selectedActor"),
                "selectedSlug": payload.get("selectedSlug"),
                "publishedDate": payload.get("publishedDate"),
                "title": payload.get("title"),
                "excerpt": payload.get("excerpt"),
                "age": payload.get("age"),
                "actorBirthDate": payload.get("actorBirthDate"),
                "actorImageUrl": payload.get("actorImageUrl"),
                "exactMatchCount": len(payload.get("exactMatchItems") or payload.get("exactMatches") or []),
            })

    entries.sort(key=lambda item: str(item.get("publishedDate") or ""), reverse=True)

    archive_payload = {
        "ok": True,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "current": current_payload if isinstance(current_payload, dict) and current_payload.get("ok") is True else None,
        "pastArticles": entries,
    }
    (base_dir / "archive.json").write_text(json.dumps(archive_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def escape_attr(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def make_jsonld_script(payload: dict[str, Any], data_seo: str) -> str:
    return f'<script type="application/ld+json" data-seo="{data_seo}">{json.dumps(payload, ensure_ascii=False)}</script>'


def build_birthday_breadcrumb() -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE_URL},
            {"@type": "ListItem", "position": 2, "name": "Anniversaire du jour", "item": f"{SITE_URL}/anniversaire-du-jour"},
        ],
    }


def format_dt_label(value: str | None) -> str:
    if not value:
        return ""
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(PARIS_TZ).strftime("%A %-d %B %Y à %H:%M")


def build_birthday_fallback_html(payload: dict[str, Any]) -> str:
    actor_slug = payload.get("selectedSlug") or ""
    actor_name = payload.get("selectedActor") or "cet acteur"
    meta = payload.get("metaDescription") or payload.get("excerpt") or ""
    airings = payload.get("upcomingAirings") or []
    airings_html = ""
    if airings:
        items = []
        for airing in airings[:8]:
            program_url = airing.get("programUrl") or "#"
            title = airing.get("title") or "Programme"
            label = format_dt_label(airing.get("startTime")) or str(airing.get("date") or "")
            items.append(
                f'<li><a href="{escape_attr(program_url)}">{html.escape(str(title))}</a> - {html.escape(label)}</li>'
            )
        airings_html = (
            '<h2 style="font-size:1.3rem;margin:0 0 12px;">À voir à la télévision</h2>'
            '<ul style="margin:0;padding-left:18px;">'
            + "".join(items)
            + "</ul>"
        )
    return (
        f'<h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">{html.escape(str(payload.get("title") or ""))}</h1>'
        f'<p style="margin:0 0 16px;">{html.escape(str(meta))}</p>'
        f'<p style="margin:0 0 16px;"><a href="/acteur/{escape_attr(actor_slug)}">Voir la fiche acteur de {html.escape(str(actor_name))}</a></p>'
        f'{airings_html}'
    )


def build_home_fallback_html(payload: dict[str, Any]) -> str:
    birthday_block = ""
    if payload.get("ok") is True and payload.get("articleSlug"):
        birthday_block = (
            '<section style="margin:0 0 24px;">'
            + build_birthday_fallback_html(payload)
            + "</section>"
        )
    return (
        birthday_block
        + '<h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Programme TV TNT ce soir</h1>'
        + '<p style="margin:0 0 16px;">Découvrez le programme TV TNT de ce soir : toutes les chaînes en un coup d’œil, horaires détaillés, films, séries et émissions.</p>'
        + '<h2 style="font-size:1.3rem;margin:0 0 12px;">Pages head prioritaires</h2>'
        + '<ul style="margin:0 0 20px;padding-left:18px;">'
        + '<li><a href="/en-direct">Programme en direct</a></li>'
        + '<li><a href="/film-ce-soir">Films ce soir</a></li>'
        + '<li><a href="/sport-ce-soir">Sport ce soir</a></li>'
        + '<li><a href="/demain">Programme TV demain</a></li>'
        + '<li><a href="/">Programme TV ce soir</a></li>'
        + '<li><a href="/series-ce-soir">Séries ce soir</a></li>'
        + '<li><a href="/documentaires-ce-soir">Documentaires ce soir</a></li>'
        + '<li><a href="/infos-ce-soir">Info ce soir</a></li>'
        + '<li><a href="/recherche">Recherche programmes</a></li>'
        + '<li><a href="/credits">Crédits</a></li>'
        + "</ul>"
        + '<h2 style="font-size:1.3rem;margin:0 0 12px;">Chaînes prioritaires</h2>'
        + '<ul style="margin:0;padding-left:18px;">'
        + '<li><a href="/tf1">Programme TF1 ce soir</a></li>'
        + '<li><a href="/france-2">Programme France 2 ce soir</a></li>'
        + '<li><a href="/france-3">Programme France 3 ce soir</a></li>'
        + '<li><a href="/m6">Programme M6 ce soir</a></li>'
        + '<li><a href="/arte">Programme ARTE ce soir</a></li>'
        + '<li><a href="/tmc">Programme TMC ce soir</a></li>'
        + "</ul>"
        + """
      <section style="margin:24px 0 0;">
        <h2 style="font-size:1.5rem;margin:0 0 12px;">Questions fréquentes</h2>
        <div style="display:grid;gap:12px;">
          <details style="border:1px solid #cbd5e1;border-radius:16px;padding:14px 16px;background:#f8fafc;">
            <summary style="font-weight:700;cursor:pointer;">Que passe-t-il ce soir à la télévision ?</summary>
            <p style="margin:12px 0 0;line-height:1.7;">Retrouvez tous les programmes TV du soir sur programmecesoir.fr : films, séries, documentaires et émissions sur TF1, France 2, M6, Arte et toutes les chaînes TNT.</p>
          </details>
          <details style="border:1px solid #cbd5e1;border-radius:16px;padding:14px 16px;background:#f8fafc;">
            <summary style="font-weight:700;cursor:pointer;">Quel film passe ce soir à la télé ?</summary>
            <p style="margin:12px 0 0;line-height:1.7;">Consultez notre sélection de films ce soir sur toutes les chaînes TNT françaises avec horaires, synopsis et chaînes sur programmecesoir.fr.</p>
          </details>
          <details style="border:1px solid #cbd5e1;border-radius:16px;padding:14px 16px;background:#f8fafc;">
            <summary style="font-weight:700;cursor:pointer;">Quelles séries sont diffusées ce soir ?</summary>
            <p style="margin:12px 0 0;line-height:1.7;">Découvrez toutes les séries diffusées ce soir sur la TNT, avec les horaires et chaînes, sur programmecesoir.fr/series-ce-soir.</p>
          </details>
          <details style="border:1px solid #cbd5e1;border-radius:16px;padding:14px 16px;background:#f8fafc;">
            <summary style="font-weight:700;cursor:pointer;">Comment voir le programme TV de demain ?</summary>
            <p style="margin:12px 0 0;line-height:1.7;">Le programme TV de demain est disponible sur programmecesoir.fr/demain avec tous les horaires et chaînes TNT.</p>
          </details>
        </div>
      </section>
        """
    )


def replace_first(pattern: str, replacement: str, content: str) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Pattern not found for replacement: {pattern}")
    return updated


def collapse_bootstrap_script(content: str, replacement: str) -> str:
    without_bootstrap = re.sub(
        r'\s*<script id="app-bootstrap-data" type="application/json">.*?</script>',
        '',
        content,
        flags=re.S,
    )
    return without_bootstrap.replace('</head>', f'  {replacement}\n</head>', 1)


def extract_bootstrap_payload(content: str) -> dict[str, Any] | None:
    match = re.search(
        r'<script id="app-bootstrap-data" type="application/json">(.*?)</script>',
        content,
        flags=re.S,
    )
    if not match:
        return None

    raw = match.group(1).strip()
    if not raw:
        return None

    try:
        return json.loads(raw)
    except Exception:
        return None


def refresh_static_birthday_pages(public_file: Path, payload: dict[str, Any]) -> None:
    public_root = public_file.parent.parent
    birthday_file = public_root / "anniversaire-du-jour.html"

    if not birthday_file.exists():
        return

    birthday_html = birthday_file.read_text(encoding="utf-8")
    birthday_bootstrap = json.dumps(
        {
            "routePath": "/anniversaire-du-jour",
            "pageState": {"type": "birthday"},
            "birthdayArticle": payload,
        },
        ensure_ascii=False,
    )

    article_url = f"{SITE_URL}/anniversaire/{payload.get('articleSlug')}"
    description = escape_attr(payload.get("metaDescription") or payload.get("excerpt") or payload.get("title") or "")
    title = escape_attr(f"Anniversaire de {payload.get('selectedActor')} - Fêtez-le avec les programmes à la TV")
    og_image = escape_attr(payload.get("imageUrl") or payload.get("actorImageUrl") or payload.get("og", {}).get("image") or f"{SITE_URL}/static/img/programmecesoir-social.jpg")
    birthday_scripts = (
        make_jsonld_script(build_birthday_breadcrumb(), "birthday")
        + "\n  "
        + make_jsonld_script(payload.get("structuredData") or {}, "birthday")
    )

    birthday_html = re.sub(r'<script type="application/ld\+json" data-seo="birthday">.*?</script>\s*<script type="application/ld\+json" data-seo="birthday">.*?</script>', birthday_scripts, birthday_html, count=1, flags=re.S)
    birthday_html = replace_first(r'<title>.*?</title>', f'<title>{title}</title>', birthday_html)
    birthday_html = replace_first(r'<meta name="description" content=".*?">', f'<meta name="description" content="{description}">', birthday_html)
    birthday_html = replace_first(r'<meta property="og:title" content=".*?">', f'<meta property="og:title" content="{title}">', birthday_html)
    birthday_html = replace_first(r'<meta property="og:description" content=".*?">', f'<meta property="og:description" content="{description}">', birthday_html)
    birthday_html = replace_first(r'<meta property="og:image" content=".*?">', f'<meta property="og:image" content="{og_image}">', birthday_html)
    birthday_html = replace_first(r'<meta name="twitter:title" content=".*?">', f'<meta name="twitter:title" content="{title}">', birthday_html)
    birthday_html = replace_first(r'<meta name="twitter:description" content=".*?">', f'<meta name="twitter:description" content="{description}">', birthday_html)
    birthday_html = replace_first(r'<meta name="twitter:image" content=".*?">', f'<meta name="twitter:image" content="{og_image}">', birthday_html)
    birthday_html = collapse_bootstrap_script(
        birthday_html,
        f'<script id="app-bootstrap-data" type="application/json">{birthday_bootstrap}</script>',
    )
    birthday_html = replace_first(
        r'<main id="crawler-fallback"[^>]*>[\s\S]*?</main>',
        f'<main id="crawler-fallback" style="max-width:1200px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;">{build_birthday_fallback_html(payload)}</main>',
        birthday_html,
    )

    birthday_file.write_text(birthday_html, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default="")
    parser.add_argument("--actors-dir", default="")
    parser.add_argument("--report-file", default="")
    parser.add_argument("--public-file", default="")
    parser.add_argument("--today", default="")
    parser.add_argument("--timeout-seconds", type=int, default=int(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)))
    parser.add_argument("--max-tokens", type=int, default=int(os.getenv("DEEPSEEK_MAX_TOKENS", DEFAULT_MAX_TOKENS)))
    parser.add_argument("--min-words", type=int, default=int(os.getenv("BIRTHDAY_MIN_WORDS", DEFAULT_MIN_WORDS)))
    parser.add_argument("--target-min-words", type=int, default=int(os.getenv("BIRTHDAY_TARGET_MIN_WORDS", DEFAULT_TARGET_MIN_WORDS)))
    parser.add_argument("--target-max-words", type=int, default=int(os.getenv("BIRTHDAY_TARGET_MAX_WORDS", DEFAULT_TARGET_MAX_WORDS)))
    parser.add_argument("--allow-upcoming-fallback", action="store_true", default=os.getenv("ALLOW_UPCOMING_FALLBACK", "false").lower() == "true")
    parser.add_argument("--dry-run", action="store_true", default=os.getenv("DRY_RUN", "false").lower() == "true")
    parser.add_argument("--force", action="store_true", default=os.getenv("FORCE_REGENERATE", "false").lower() == "true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env(args)

    actors_dir = Path(args.actors_dir or os.getenv("ACTORS_DIR") or "/home/u914016995/domains/programmecesoir.fr/public_html/entities-data/actors")
    report_file = Path(args.report_file or os.getenv("BIRTHDAY_REPORT_FILE") or "/home/u914016995/programmecesoir_birthday/last-run.json")
    public_file = Path(args.public_file or os.getenv("BIRTHDAY_PUBLIC_FILE") or str(actors_dir.parent.parent / "birthday-data" / "current.json"))
    today = get_today(args)
    today_iso = today.isoformat()
    today_mmdd = today.strftime("%m-%d")

    candidates = read_candidates(actors_dir, today)
    mode, selected, exact_matches, upcoming_matches = select_candidate(candidates)

    print(f"🎂 Recherche anniversaire pour {today_iso} ({today_mmdd})")
    print(f"• Candidats exacts: {len(exact_matches)}")
    print(f"• Candidats à venir: {len(upcoming_matches)}")

    if mode == "upcoming" and not args.allow_upcoming_fallback:
        empty_payload = {
            "ok": True,
            "mode": "none",
            "publishedDate": today_iso,
            "reason": "Aucun anniversaire exact aujourd'hui. Fallback désactivé.",
        }
        write_report(report_file, empty_payload)
        public_file.parent.mkdir(parents=True, exist_ok=True)
        public_file.write_text(json.dumps(empty_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        write_archive_payload(public_file)
        print("ℹ️ Aucun anniversaire exact aujourd'hui. Fallback désactivé, arrêt propre.")
        return 0

    if not selected:
        empty_payload = {
            "ok": True,
            "mode": "none",
            "publishedDate": today_iso,
            "reason": "Aucun acteur exploitable trouvé.",
        }
        write_report(report_file, empty_payload)
        public_file.parent.mkdir(parents=True, exist_ok=True)
        public_file.write_text(json.dumps(empty_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        write_archive_payload(public_file)
        print("ℹ️ Aucun acteur exploitable trouvé.")
        return 0

    age = (today.year - selected.birth_year) if selected.birth_year else None
    if mode == "upcoming" and age is not None:
        age += 1

    print(
        f"→ Sélection: {selected.actor.get('name')} "
        f"({'anniversaire exact' if mode == 'exact' else f'prochain anniversaire dans {selected.days_until_birthday} jour(s)'})"
    )

    db_url = os.getenv("DATABASE_URL")
    if not db_url and not args.dry_run:
        raise RuntimeError("DATABASE_URL manquante")

    conn = None
    try:
        if not args.dry_run:
            conn = psycopg2.connect(db_url)
            if article_exists(conn, selected.slug, today_iso) and not args.force:
                existing = fetch_existing_article(conn, selected.slug, today_iso)
                if existing:
                    existing_slug = str(existing.get("article_slug") or f"{selected.slug}-anniversaire-{today_iso}")
                    stored_article = normalize_stored_article(existing, selected, age, mode)
                    structured_data = build_structured_data(stored_article, selected, existing_slug, today_iso)
                    og = build_og(stored_article, existing_slug)
                    public_payload = build_public_payload(
                        article=stored_article,
                        candidate=selected,
                        article_slug=existing_slug,
                        today_iso=today_iso,
                        age=existing.get("age_today") if existing.get("age_today") is not None else age,
                        mode=mode,
                        exact_matches=exact_matches,
                        upcoming_matches=upcoming_matches,
                        structured_data=structured_data,
                        og=og,
                        dry_run=args.dry_run,
                    )
                    public_payload["imageUrl"] = existing.get("image_url")
                    public_payload["imageAlt"] = existing.get("image_alt")
                    public_payload["reason"] = "Article déjà présent, payload public régénéré."
                    write_report(report_file, public_payload)
                    write_public_payload(public_file, existing_slug, public_payload)
                    write_archive_payload(public_file)
                    refresh_static_birthday_pages(public_file, public_payload)
                else:
                    write_report(report_file, {
                        "ok": True,
                        "mode": mode,
                        "publishedDate": today_iso,
                        "selectedActor": selected.actor.get("name"),
                        "selectedSlug": selected.slug,
                        "reason": "Article déjà présent, skip.",
                    })
                print("⏭️ Article déjà généré pour aujourd'hui, arrêt.")
                return 0

        article = normalize_article_shape(call_deepseek(selected, age, mode, args, today_iso), selected, age, mode)
        errors = validate_article(article, selected, mode, args)
        if errors:
            raise RuntimeError(f"Validation finale échouée: {', '.join(errors)}")

        article_slug = (
            f"{selected.slug}-anniversaire-{today_iso}"
            if args.dry_run
            else save_article(conn, selected, article, age, today_iso)
        )
        structured_data = build_structured_data(article, selected, article_slug, today_iso)
        og = build_og(article, article_slug)
        public_payload = build_public_payload(
            article=article,
            candidate=selected,
            article_slug=article_slug,
            today_iso=today_iso,
            age=age,
            mode=mode,
            exact_matches=exact_matches,
            upcoming_matches=upcoming_matches,
            structured_data=structured_data,
            og=og,
            dry_run=args.dry_run,
        )

        write_report(report_file, public_payload)
        write_public_payload(public_file, article_slug, public_payload)
        write_archive_payload(public_file)
        refresh_static_birthday_pages(public_file, public_payload)

        print(f"✅ Article prêt: /anniversaire/{article_slug}")
        print(f"• Mots: {article['wordCount']}")
        print(f"• OG site_name: {og['siteName']}")
        print(f"• Auteur schema: {AUTHOR_NAME}")
        print(f"• Report: {report_file}")
        print(f"• Public JSON: {public_file}")
        return 0
    finally:
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"❌ {exc}", file=sys.stderr)
        raise
