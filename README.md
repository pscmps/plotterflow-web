# PlotterFlow

SVGをブラウザ内で点列化し、FluidNC向けG-codeへ変換・保存・送信するペンプロッタ用Webアプリです。サーバー処理やビルドは不要です。

SVGを用意せず、ブラウザ上で簡単なベクター図形や手書き線を描いて直接G-codeへ変換する「お絵描き」機能も備えています。

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

SerialタブにはXYジョグパッドがあります。移動量を `0.1 / 1 / 10 / 50 mm`、速度をmm/minで指定し、矢印を1回タップするごとにFluidNCの相対ジョグコマンド `$J=G91 G21 ...` を送信します。中央のSTOPはリアルタイム・ジョグキャンセル `0x85` を送信します。誤操作防止のためG-code送信中はジョグ移動できません。

接続中は750msごとにFluidNCへ `?` を送り、現在のワーク座標X/Yとコントローラー状態を表示します。`WPos` を優先し、`MPos` と `WCO` のみ返る構成では差分からワーク座標を算出します。「XYを0セット」は `G10 L20 P0 X0 Y0` を送り、機械座標を変更せず現在位置を選択中のワーク座標の原点に設定します。

## お絵描き

初期キャンバスは30 × 30 mmです。プリセットまたは幅・高さ入力で変更できます。座標はキャンバス左上を `(0, 0)` とするmm単位で、そのままG-code座標になります。

- ペン: Pointer Events対応。マウス、タッチ、Apple Pencil、スタイラスで自由線を描画
- 四角、丸、星: ドラッグで作成。星は3〜24頂点
- テキスト: Noto Sans JPで日本語をアウトライン化。横書き・縦書き、ドラッグ移動、ピンチ拡大縮小
- 選択: 近くのオブジェクトを選択し、ドラッグで移動
- 消しゴム: 指やペンで触れた範囲だけを部分消去。直径をmm単位で変更可能
- Undo / Redo: ボタン、`Ctrl+Z`、`Ctrl+Y`（macOS/iPadの外部キーボードではCommandにも対応）
- 自由線: 描画終了時にRamer-Douglas-Peucker法で自動単純化

最後に編集した内容はlocalStorageへ自動保存されます。「保存 / 上書き」でブラウザ内ライブラリにも登録できます。

`.plotter.json` の読み込み・ダウンロード、Inkscapeで編集できるSVGのダウンロード、既存設定を使用したFluidNC G-codeの直接生成に対応しています。

部分消去された図形は、残った線ごとに自由線オブジェクトへ分割されます。G-codeでは分割区間の間にペンアップと空走が入るため、消した範囲には線を描きません。

テキストは入力後にキャンバス中央へ追加されます。選択すると「文字プロパティ」ボタンが表示され、PCでは右クリック、スマホでは長押しでも編集画面を開けます。フォントサイズ、文字間隔、行間、方向、回転角度を変更できます。保存データには文字列と設定を保持し、表示・SVG・G-code生成時に輪郭パスを再生成します。`renderMode: "outline"` を持つため、将来シングルライン方式を追加できます。

JSONは次の形式です。

```json
{
  "version": 1,
  "canvas": { "widthMm": 100, "heightMm": 100 },
  "objects": [
    { "type": "freehand", "points": [[10, 10], [15, 12], [20, 20]] },
    { "type": "rect", "x": 30, "y": 30, "width": 20, "height": 10 },
    { "type": "text", "text": "展示会", "x": 50, "y": 50, "fontSize": 8, "letterSpacing": 0, "lineHeight": 1.2, "writingMode": "horizontal", "rotation": 0, "renderMode": "outline" }
  ]
}
```

## Delayと最適化

- `safe`: ペンアップ後に必要時間をすべて待ってから空走します。
- `overlap_up`: 空走時間をペンアップ待ち時間へ充当し、不足分だけ待ちます（推奨）。
- `overlap_down`: 開始点の手前でペンダウンを開始します。機構によっては線を引きずるため実験モードです。
- `off`: 移動時間を考慮せず設定Delayを適用します。

アップDelayは固定、移動距離しきい値、距離比例から選択できます。Delayが0のとき `G4` は出力しません。

## 対応SVG

`path`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse` とブラウザが解釈できる `transform` に対応します。曲線は `getTotalLength()` と `getPointAtLength()` で直線列へ変換します。

SVG変換タブの「180°回転＋左右反転」は実機の描画方向を補正します。この2操作の合成結果はY軸反転と同じです。初期状態はONで、設定タブの「Y軸反転」と同期します。

アップロードSVGのCSS、クリッピング、マスク、`text` 要素、ストローク幅、塗りつぶし領域のCAM化には対応していません。アップロードSVG内の文字はInkscapeでパスへ変換してください。お絵描きタブのテキスト機能は別途アウトライン変換に対応しています。

## データ保存

設定、G-codeライブラリ、ジョブ設定はブラウザのlocalStorageへ保存します。ブラウザデータを消去すると削除されるため、重要なG-codeはダウンロードしてください。

## ライセンスと依存関係

- [opentype.js](https://github.com/opentypejs/opentype.js) 2.0.0: MIT License。`vendor/opentypejs/` に同梱
- Noto Sans JP: SIL Open Font License 1.1。`vendor/noto-sans-jp/` にフォントとライセンスを同梱

上記はすべてローカル配信され、実行時にCDNや外部APIへアクセスしません。SVG解析、保存、Serial通信はブラウザ標準APIを利用しています。
