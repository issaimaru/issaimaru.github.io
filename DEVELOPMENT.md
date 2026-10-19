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
このリポジトリのデフォルトブランチは `work` なので、変更を `work` にpushすると反映されます。
GitHub上のActions実行と書き込み権限が有効になっている必要があります。
定期実行の時刻にはGitHub側の混雑による遅延があり、公開リポジトリでは60日間の活動がないと
定期実行が無効になるため、その場合はActions画面から再度有効にします。

取得済みの記事・画像はリポジトリとActionsのキャッシュに保存します。
RSSや画像の取得が一時的に失敗した場合は、既存のキャッシュを維持してサイトをビルドします。
ブラウザからZenn・noteへのAPI呼び出しは行わず、APIキーも使いません。

## 検証

```bash
python3 -m unittest discover -s tests -v
node --test tests/parking-game.test.mjs
hugo --minify --environment production
```

# ホームのゲームとセクション

「ぴたり、停める。」は `layouts/partials/home/parking-game.html` と
`assets/js/parking-game.js` で実装しています。押した時間に応じて距離が増え、
ボタンを離すと車が走ります。タッチ・マウス・Space・Enterに対応しています。
日本時間の日付から3コースの目標・路面・風のパターンを決めます。
路面ごとに走行距離の倍率が変わり、ボタンを離した瞬間の風が距離を増減します。
PERFECTの許容誤差は順に±0.8m・±0.55m・±0.35mです。1走1,000点満点、
GREAT以上の連続成功には2走目に100点・3走目に200点を加算し、合計3,300点満点です。
3走完了時に当日の自己ベストをブラウザ内に保存します。ランキングや外部の保存先は使いません。
結果のコピーボタンから日付・得点・判定・ゲームのURLを共有できます。
ゲームの距離・判定ルールは `assets/js/parking-model.mjs` でテストできます。

Career・Skillsの内容は `content/home-extra.md` のフロントマターで編集できます。
見た目は `layouts/partials/home/profile-details.html`、
Posts・Worksの一覧は `layouts/partials/archive/main.html`、
各セクションのCSSは `assets/css/sections.css` にまとめています。
Blowfishのベースレイアウトと記事カードを引き続き使用しています。
