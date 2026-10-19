# ローカルでの確認

Hugoで起動します。npmのインストールは通常のプレビューには不要です。

```bash
hugo server -D
```

http://localhost:1313/ を開きます。停止は `Ctrl+C` です。
デザインの調整はBlowfishのレイアウトを使い、主に `assets/css/custom.css` に追加しています。

# Zenn・noteの記事

公開RSSを `scripts/fetch_external_articles.py` で取り込みます。
タイトル、公開日、短い紹介文と画像だけを保存し、カードは元記事へリンクします。
取り込み先の `content/external/` は生成ファイルです。記事本文の転載ページは作りません。

```bash
python3 scripts/fetch_external_articles.py
```

`hugo server` 起動中なら保存後に表示が更新されます。
「最近の記事」はこのサイト・Zenn・noteを公開日順に並べ、掲載先で絞り込めます。
最初は6件を表示し、「もっと見る」で続きを表示します。

## 自動更新の有効化

`.github/workflows/deploy-portfolio.yml` は6時間ごと（日本時間03:17・09:17・15:17・21:17）に
`work` ブランチをチェックアウトし、記事の取得・Hugoのビルド・`deploy` ブランチへの公開を行います。
`work` へのpushとGitHub Actionsの手動実行でも更新できます。

GitHubの定期実行は**デフォルトブランチにあるワークフロー**から動きます。
有効化には、サイトの変更を `work` に反映したうえで、このワークフローファイルを
デフォルトブランチにも反映してください。ブランチ構成を変える必要はありません。
GitHub上のActions実行と書き込み権限が有効になっている必要があります。
定期実行の時刻にはGitHub側の混雑による遅延があり、公開リポジトリでは60日間の活動がないと
定期実行が無効になるため、その場合はActions画面から再度有効にします。

取得済みの記事・画像はリポジトリとActionsのキャッシュに保存します。
RSSや画像の取得が一時的に失敗した場合は、既存のキャッシュを維持してサイトをビルドします。
ブラウザからZenn・noteへのAPI呼び出しは行わず、APIキーも使いません。

## 検証

```bash
python3 -m unittest discover -s tests -v
hugo --minify --environment production
```
