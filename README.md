# PlotterFlow

SVGをブラウザ内で点列化し、FluidNC向けG-codeへ変換・保存・送信するペンプロッタ用Webアプリです。サーバー処理やビルドは不要です。

## 起動

Web Serialはセキュアコンテキストが必要です。ChromeまたはEdgeで、HTTPS配信かlocalhostを使用してください。

```powershell
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。GitHub Pagesや一般的な静的ホスティングにもそのまま配置できます。

## 基本操作

1. 「SVG変換」でSVGを読み込む
2. 「設定」でペン、Delay、Feed、座標変換を調整する
3. 「G-code生成」で変換する
4. 「G-code」で内容を確認して保存する
5. 「Serial」で接続し、1行ごとの `ok` 応答を待ちながら送信する

保存済みG-codeは「ジョブ実行」で回数、前後Delay、前後コマンド、全体ループを設定して連続実行できます。

## Delayと最適化

- `safe`: ペンアップ後に必要時間をすべて待ってから空走します。
- `overlap_up`: 空走時間をペンアップ待ち時間へ充当し、不足分だけ待ちます（推奨）。
- `overlap_down`: 開始点の手前でペンダウンを開始します。機構によっては線を引きずるため実験モードです。
- `off`: 移動時間を考慮せず設定Delayを適用します。

アップDelayは固定、移動距離しきい値、距離比例から選択できます。Delayが0のとき `G4` は出力しません。

## 対応SVG

`path`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse` とブラウザが解釈できる `transform` に対応します。曲線は `getTotalLength()` と `getPointAtLength()` で直線列へ変換します。

SVGのCSS、クリッピング、マスク、テキスト、ストローク幅、塗りつぶし領域のCAM化には対応していません。文字はInkscapeでパスへ変換してください。複雑なCSSで非表示にした要素はブラウザの計算結果に従います。

## データ保存

設定、G-codeライブラリ、ジョブ設定はブラウザのlocalStorageへ保存します。ブラウザデータを消去すると削除されるため、重要なG-codeはダウンロードしてください。

## ライセンスと依存関係

外部JavaScriptライブラリは使用していません。SVG解析、点列化、保存、Serial通信はブラウザ標準APIのみで実装しています。
