#!/usr/bin/env python3
"""Import public RSS entries as Blowfish external-link pages. No dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Source:
    name: str
    feed: str
    article_prefix: str
    image_hosts: tuple[str, ...]


SOURCES = {
    "zenn": Source("Zenn", "https://zenn.dev/issaimaru/feed", "https://zenn.dev/issaimaru/articles/", ("res.cloudinary.com",)),
    "note": Source("note", "https://note.com/issaimaru/rss", "https://note.com/issaimaru/n/", ("assets.st-note.com",)),
}
CONTENT_DIR = Path(__file__).resolve().parents[1] / "content" / "external"
GENERATOR = 'generatedBy = "external-feeds"'


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if tag in ("p", "br", "h1", "h2", "h3", "li", "div"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
        self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_summary(value):
    parser = PlainText()
    parser.feed(value)
    text = re.sub(r"\s+", " ", "".join(parser.parts)).strip()
    text = re.sub(r"(?:続きを読む|続きをみる)\s*$", "", text).strip()
    # Some note previews contain only a heading, rather than a useful excerpt.
    if text in ("", "はじめに", "概要"):
        return ""
    return text if len(text) <= 160 else text[:159] + "…"


def parse_feed(data, source):
    root = ElementTree.fromstring(data)
    channel = root.find("channel")
    if channel is None:
        raise ValueError("RSS channel is missing")
    articles = []
    seen = set()
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        url = (item.findtext("link") or "").strip()
        if not title or not url.startswith(source.article_prefix) or url in seen:
            continue
        article_id = urlsplit(url).path.rstrip("/").split("/")[-1]
        if not re.fullmatch(r"[A-Za-z0-9_-]+", article_id):
            continue
        try:
            date = parsedate_to_datetime(item.findtext("pubDate") or "")
            date = date.replace(tzinfo=date.tzinfo or timezone.utc).astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            continue
        thumbnail = item.find("{http://search.yahoo.com/mrss/}thumbnail")
        image = ""
        if thumbnail is not None:
            image = thumbnail.get("url") or thumbnail.text or ""
        enclosure = item.find("enclosure")
        if not image and enclosure is not None:
            image = enclosure.get("url", "")
        image_parts = urlsplit(image.strip())
        if image_parts.scheme != "https" or image_parts.hostname not in source.image_hosts:
            image = ""
        articles.append({
            "id": article_id, "title": title, "url": url, "date": date.isoformat(),
            "summary": plain_summary(item.findtext("description") or ""), "image": image.strip(),
        })
        seen.add(url)
    return sorted(articles, key=lambda article: article["date"], reverse=True)


def fetch_bytes(url):
    request = Request(url, headers={"User-Agent": "issaimaru-portfolio/1.0"})
    with urlopen(request, timeout=20) as response:
        data = response.read(8_000_001)
    if len(data) > 8_000_000:
        raise ValueError("Response is too large")
    return data


def cache_image(bundle, url, previous):
    if not url:
        return previous
    if url == previous and any(bundle.glob("featured.*")):
        return previous
    try:
        data = fetch_bytes(url)
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            extension = "png"
        elif data.startswith(b"\xff\xd8\xff"):
            extension = "jpg"
        elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
            extension = "webp"
        else:
            raise ValueError("Unsupported image format")
        path = bundle / f"featured.{extension}"
        path.write_bytes(data)
        for old in bundle.glob("featured.*"):
            if old != path:
                old.unlink()
        return url
    except Exception as error:
        print(f"Warning: thumbnail unavailable; keeping cached image ({error})", file=sys.stderr)
        return previous


def sync_source(key, source, content_dir=CONTENT_DIR):
    try:
        articles = parse_feed(fetch_bytes(source.feed), source)
        if not articles:
            raise ValueError("RSS contains no valid articles")
    except Exception as error:
        print(f"Warning: {source.name} feed unavailable; keeping cached articles ({error})", file=sys.stderr)
        return 0
    for article in articles:
        bundle = content_dir / key / article["id"]
        page = bundle / "index.md"
        existing = page.read_text() if page.exists() else ""
        if existing and GENERATOR not in existing:
            raise ValueError(f"Refusing to overwrite a manually maintained page: {page}")
        bundle.mkdir(parents=True, exist_ok=True)
        match = re.search(r"^thumbnailSource = (.+)$", existing, re.MULTILINE)
        previous = json.loads(match[1]) if match else ""
        thumbnail = cache_image(bundle, article["image"], previous)
        values = {
            "title": article["title"], "date": datetime.fromisoformat(article["date"]).astimezone(ZoneInfo("Asia/Tokyo")).isoformat(), "type": "external",
            "externalUrl": article["url"], "source": source.name,
            "description": article["summary"], "summary": article["summary"],
            "thumbnailSource": thumbnail,
        }
        lines = ["+++", GENERATOR]
        lines.extend(f"{name} = {json.dumps(value, ensure_ascii=False)}" for name, value in values.items())
        lines.extend(["showReadingTime = false", "showDate = true", "[_build]", 'render = "never"', 'list = "always"', "+++", ""])
        text = "\n".join(lines)
        if text != existing:
            page.write_text(text)
    print(f"{source.name}: synced {len(articles)} articles")
    return len(articles)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=SOURCES, help="Refresh only one service")
    args = parser.parse_args()
    for key, source in SOURCES.items():
        if not args.source or args.source == key:
            sync_source(key, source)


if __name__ == "__main__":
    main()
