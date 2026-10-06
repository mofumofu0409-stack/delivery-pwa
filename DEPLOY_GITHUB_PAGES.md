# iPhoneで使うための無料公開手順（GitHub Pages）

このフォルダは静的PWAなので、GitHub Pagesへそのまま公開できます。

## Codexに渡すプロンプト

以下をそのままCodexへ貼り付けてください。

```text
このフォルダの「定期配達サポート v0.2 PWA」をGitHub Pagesで無料公開したいです。
既存のHTML/CSS/JavaScriptの機能やUIロジックは変更しないでください。

やること：
1. gitリポジトリでなければ初期化
2. 必要ファイルをコミット
3. GitHub上に新規リポジトリ duskin-delivery-pwa を作成（公開用。実顧客データは絶対に入れない）
4. mainブランチへpush
5. GitHub Pagesをmainブランチのルートから公開
6. 公開URLを確認
7. HTTPSで index.html / manifest.webmanifest / sw.js が取得できることを確認
8. 最後に、iPhone Safariで開くURLだけを大きく表示して報告

注意：
- APIキーや秘密情報は追加しない
- 実顧客の氏名・住所・電話番号は入れない
- service worker、manifest、相対パスを壊さない
- 公開後にGoogle Mapsナビリンクが開くことも確認
```

## iPhone側

1. Codexが返したHTTPSのURLをSafariで開く
2. Safari下部の「共有」
3. 「ホーム画面に追加」
4. ホーム画面の「配達サポート」から起動

一度オンラインで開いて静的ファイルがキャッシュされれば、アプリ本体はオフラインでも起動しやすくなります。Google Mapsナビや地図情報の取得には通信が必要です。
