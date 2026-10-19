import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE = Path(__file__).resolve().parents[1] / "scripts" / "fetch_external_articles.py"
spec = importlib.util.spec_from_file_location("external_articles", MODULE)
feeds = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = feeds
spec.loader.exec_module(feeds)


def rss(items):
    return f'<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>{items}</channel></rss>'.encode()


ZENN_ITEM = """
<item><title>A &amp; B</title><link>https://zenn.dev/issaimaru/articles/example</link>
<pubDate>Fri, 18 Sep 2026 07:36:58 GMT</pubDate>
<description>&lt;p&gt;Circuit &amp;amp; FPGA&lt;/p&gt;</description>
<enclosure url="https://res.cloudinary.com/zenn/cover.png"/></item>
"""


class ExternalArticleTests(unittest.TestCase):
    def test_zenn_feed_dates_entities_and_thumbnail(self):
        article, = feeds.parse_feed(rss(ZENN_ITEM), feeds.SOURCES["zenn"])
        self.assertEqual(article["title"], "A & B")
        self.assertEqual(article["summary"], "Circuit & FPGA")
        self.assertEqual(article["date"], "2026-09-18T07:36:58+00:00")
        self.assertEqual(article["image"], "https://res.cloudinary.com/zenn/cover.png")

    def test_note_media_namespace_and_japan_timezone(self):
        data = rss("""<item><title>note article</title>
        <link>https://note.com/issaimaru/n/n123</link>
        <pubDate>Sat, 22 Mar 2025 20:51:55 +0900</pubDate>
        <media:thumbnail>https://assets.st-note.com/image.jpeg</media:thumbnail>
        <description>&lt;p&gt;Body&lt;/p&gt;&lt;a&gt;続きをみる&lt;/a&gt;</description></item>""")
        article, = feeds.parse_feed(data, feeds.SOURCES["note"])
        self.assertEqual(article["date"], "2025-03-22T11:51:55+00:00")
        self.assertEqual(article["image"], "https://assets.st-note.com/image.jpeg")
        self.assertEqual(article["summary"], "Body")

    def test_duplicate_entries_and_invalid_dates_or_accounts_are_skipped(self):
        data = rss(ZENN_ITEM * 2 + ZENN_ITEM.replace("issaimaru/articles", "other/articles") + ZENN_ITEM.replace("example", "bad-date").replace("Fri, 18 Sep 2026 07:36:58 GMT", "invalid"))
        self.assertEqual(len(feeds.parse_feed(data, feeds.SOURCES["zenn"])), 1)

    def test_untrusted_thumbnail_is_not_fetched(self):
        data = rss(ZENN_ITEM.replace("https://res.cloudinary.com", "https://example.com"))
        self.assertEqual(feeds.parse_feed(data, feeds.SOURCES["zenn"])[0]["image"], "")

    def test_summary_drops_markup_scripts_and_heading_only_previews(self):
        self.assertEqual(feeds.plain_summary("<script>ignore</script><p>Hello</p><p>World</p>"), "Hello World")
        self.assertEqual(feeds.plain_summary("<h2>はじめに</h2><a>続きをみる</a>"), "")

    def test_sync_is_idempotent_and_network_failure_keeps_cached_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = rss(ZENN_ITEM.replace('url="https://res.cloudinary.com/zenn/cover.png"', 'url=""'))
            with patch.object(feeds, "fetch_bytes", return_value=data):
                self.assertEqual(feeds.sync_source("zenn", feeds.SOURCES["zenn"], root), 1)
                page = root / "zenn" / "example" / "index.md"
                before = page.read_bytes()
                mtime = page.stat().st_mtime_ns
                feeds.sync_source("zenn", feeds.SOURCES["zenn"], root)
                self.assertEqual(page.stat().st_mtime_ns, mtime)
            with patch.object(feeds, "fetch_bytes", side_effect=OSError("offline")):
                self.assertEqual(feeds.sync_source("zenn", feeds.SOURCES["zenn"], root), 0)
            self.assertEqual(page.read_bytes(), before)
            self.assertIn('render = "never"', before.decode())
            self.assertIn('date = "2026-09-18T16:36:58+09:00"', before.decode())

    def test_existing_manual_pages_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / "zenn" / "example" / "index.md"
            page.parent.mkdir(parents=True)
            page.write_text("Manual content")
            with patch.object(feeds, "fetch_bytes", return_value=rss(ZENN_ITEM)):
                with self.assertRaises(ValueError):
                    feeds.sync_source("zenn", feeds.SOURCES["zenn"], root)
            self.assertEqual(page.read_text(), "Manual content")


if __name__ == "__main__":
    unittest.main()
