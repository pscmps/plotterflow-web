# PlotterFlow

> 自作ペンプロッタらっくん6Sの仕様に合わせているため、普通のペンプロッタでは使用しづらい部分がある可能性があります。ご了承ください。

SVG、手書き線、図形、テキスト、スタンプを同じキャンバスへ配置し、GRBLやFluidNC向けG-codeへ変換・保存・送信するペンプロッタ用レイアウト編集Webアプリです。サーバー処理やビルドは不要です。

ユーザーが読み込んだSVGも `svgObject` として扱い、スタンプと同じキャンバスで移動・拡大縮小・回転・反転・複製・レイヤ順変更ができます。

## 起動

Web Serialはセキュアコンテキストが必要です。ChromeまたはEdgeで、HTTPS配信かlocalhostを使用してください。

```powershell
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。GitHub Pagesや一般的な静的ホスティングにもそのまま配置できます。

## 基本操作

1. 「編集」でSVG、手書き線、図形、テキスト、スタンプを配置する
2. オブジェクトを選択し、移動・複製・レイヤ順・サイズ・回転・反転を調整する
3. 「G-code生成」でキャンバス全体を変換する
4. 「G-code」でプレビューを確認して保存する
5. 「Serial」で接続し、1行ごとの `ok` 応答を待ちながら送信する

G-codeタブでは生成結果のプレビューと編集を行い、`.gcode`、`.nc`、`.tap` ファイルも直接読み込めます。

設定の「リロード動作 G-code」は用紙送り用の動作を初期値にしています。Serialの「リロード」ボタンと、ジョブ選択の「リロード動作（設定）」はこの共通設定を実行します。描画・空走Feedrateの初期値はともに `500 mm/min` です。

保存済みG-codeは「ジョブ実行」で回数、前後Delay、前後コマンド、全体ループを設定して連続実行できます。

SerialタブにはXYジョグパッドがあります。移動量を `0.1 / 1 / 10 / 50 mm`、速度をmm/minで指定し、矢印を1回タップするごとにGRBL/FluidNC系の相対ジョグコマンド `$J=G91 G21 ...` を送信します。中央のSTOPはリアルタイム・ジョグキャンセル `0x85` を送信します。誤操作防止のためG-code送信中はジョグ移動できません。

設定の`XL330 ID1 単体安全テスト（開発中）`は、`dynamixel-pio-xl330-m077-t-rp2040`のPico SDK Cファーム`0.4.0-safe-test`向けです。初期化は`SCAN 1`、X左右は`TESTJOG`へ変換され、回転量とProfile Velocity raw値を指定します。Y方向、通常G-code、M17、ペン指令は無効のままです。初期値は1/16回転・raw 20、1操作は最大2回転で、ファームは毎回最後にTorqueをOFFにします。

PCではXYジョグの「矢印キー」トグルをONにすると、Serialタブ表示中だけ上下左右キーから同じジョグコマンドを送信できます。入力欄や選択欄の操作中とキー長押しによる自動リピートはジョグしません。ページを開いた直後は安全のためOFFです。

接続中は750msごとにGRBL/FluidNC系コントローラーへ `?` を送り、現在のワーク座標X/Yとコントローラー状態を表示します。`WPos` を優先し、`MPos` と `WCO` のみ返る構成では差分からワーク座標を算出します。「XYを0セット」は `G10 L20 P0 X0 Y0` を送り、機械座標を変更せず現在位置を選択中のワーク座標の原点に設定します。

## 編集キャンバス

初期キャンバスは30 × 30 mmです。プリセットまたは幅・高さ入力で変更できます。座標はキャンバス左上を `(0, 0)` とするmm単位で、そのままG-code座標になります。従来のSVG変換とお絵描きは「編集」タブへ統合されています。

- ペン: Pointer Events対応。マウス、タッチ、Apple Pencil、スタイラスで自由線を描画
- 四角、丸、星: ドラッグで作成。星は3〜24頂点
- テキスト: Noto Sans JPで日本語をアウトライン化。横書き・縦書き、ドラッグ移動、ピンチ拡大縮小
- 選択: 近くのオブジェクトを選択し、ドラッグで移動
- 消しゴム: 指やペンで触れた範囲だけを部分消去。直径をmm単位で変更可能
- Undo / Redo: ボタン、`Ctrl+Z`、`Ctrl+Y`（macOS/iPadの外部キーボードではCommandにも対応）
- 自由線: 描画終了時にRamer-Douglas-Peucker法で自動単純化

最後に編集した内容はlocalStorageへ自動保存されます。「保存 / 上書き」でブラウザ内ライブラリにも登録できます。

`.plotter.json` の読み込み・ダウンロード、Inkscapeで編集できるSVGのダウンロード、既存設定を使用したGRBLやFluidNC向けG-codeの直接生成に対応しています。

部分消去された図形は、残った線ごとに自由線オブジェクトへ分割されます。G-codeでは分割区間の間にペンアップと空走が入るため、消した範囲には線を描きません。

### SVGオブジェクト

「SVGを読み込んで配置」またはSVGテキスト貼り付けから、ユーザーSVGをキャンバス中央へ追加できます。内部では `type: "svgObject"` として、サニタイズ済みSVG要素、viewBox、mmサイズ、位置、倍率、回転、反転を `.plotter.json` に保存します。ノード・ベジェ・パス結合などの内部編集と部分消去は行わず、ひとつの素材として操作します。`text` と画像要素は取り込まないため、文字は事前にパス化してください。

選択したオブジェクトは種類を問わず複製・最前面・最背面・削除ができます。テキストとSVG素材はピンチで拡大縮小でき、SVG素材は選択枠のつまみまたはプロパティから回転できます。

### スタンプ

編集タブの「スタンプを追加」から、キャラクター・吹き出し・効果・定型線画を配置できます。スタンプはSVG本体ではなく、`stampId`、位置、倍率、回転、左右・上下反転とオブジェクト配列内のレイヤ順を `.plotter.json` に保存します。ドラッグ移動、ピンチ拡大縮小、選択枠上の回転つまみ、右クリック／長押し／プロパティボタンからの変形・削除・最前面／最背面移動に対応しています。

素材一覧は [`assets/stamps/catalog.json`](assets/stamps/catalog.json) で管理します。SVGファイルを `assets/stamps/` 以下へ追加し、ID・カテゴリ・パス・初期mmサイズをカタログへ登録すると一覧に表示されます。素材は `path`、`line`、`polyline`、`polygon`、`rect`、`circle`、`ellipse` の線画で作成し、文字は事前にパス化してください。素材はローカル配信され、表示・SVG出力・G-code生成時に読み込まれます。

テキストは入力後にキャンバス中央へ追加されます。選択すると「文字プロパティ」ボタンが表示され、PCでは右クリック、スマホでは長押しでも編集画面を開けます。フォントサイズ、文字間隔、行間、方向、回転角度を変更できます。保存データには文字列と設定を保持し、表示・SVG・G-code生成時に輪郭パスを再生成します。`renderMode: "outline"` を持つため、将来シングルライン方式を追加できます。

JSONは次の形式です。

```json
{
  "version": 1,
  "canvas": { "widthMm": 100, "heightMm": 100 },
  "objects": [
    { "type": "freehand", "points": [[10, 10], [15, 12], [20, 20]] },
    { "type": "rect", "x": 30, "y": 30, "width": 20, "height": 10 },
    { "type": "text", "text": "展示会", "x": 50, "y": 50, "fontSize": 8, "letterSpacing": 0, "lineHeight": 1.2, "writingMode": "horizontal", "rotation": 0, "renderMode": "outline" },
    { "type": "stamp", "stampId": "mekatororo_face", "x": 70, "y": 65, "scale": 1.2, "rotation": 15, "flipX": false, "flipY": false },
    { "type": "svgObject", "name": "logo.svg", "x": 50, "y": 40, "scale": 1, "rotation": 0, "flipX": false, "flipY": false, "widthMm": 30, "heightMm": 20, "viewBox": { "x": 0, "y": 0, "width": 300, "height": 200 }, "markup": "...", "presentation": { "fill": "none", "stroke": "#000" } }
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

設定タブの「Y軸反転」は実機の描画方向を補正します。編集キャンバスから生成した全オブジェクトへ、scale・offset X/Yとともに適用されます。

アップロードSVGのCSS、クリッピング、マスク、`text` 要素、ストローク幅、塗りつぶし領域のCAM化には対応していません。アップロードSVG内の文字はInkscapeでパスへ変換してください。編集タブのテキスト機能は別途アウトライン変換に対応しています。

## データ保存

設定、G-codeライブラリ、ジョブ設定はブラウザのlocalStorageへ保存します。ブラウザデータを消去すると削除されるため、重要なG-codeはダウンロードしてください。

### 実機向け反転と引きずり対策

Y軸反転をONにした場合、G-code座標には実機向けの反転を適用し、G-codeプレビューは編集キャンバスと同じ向きに戻して表示します。

`移動前リフト待ち`は、`overlap_up`でも空走前に必ず待つ最低クリアランス時間です。初期値は0.1秒です。残りのアップ待ち時間だけを空走時間と重ね、移動開始直後の引きずりを防ぎます。

## ライセンスと依存関係

- PlotterFlow本体: MIT License。詳細は [`LICENSE`](LICENSE) を参照
- [opentype.js](https://github.com/opentypejs/opentype.js) 2.0.0: MIT License。`vendor/opentypejs/` に同梱
- [three.js](https://threejs.org/): MIT License。`vendor/three/` に同梱
- Noto Sans JP: SIL Open Font License 1.1。`vendor/noto-sans-jp/` にフォントとライセンスを同梱

上記はすべてローカル配信され、実行時にCDNや外部APIへアクセスしません。SVG解析、保存、Serial通信はブラウザ標準APIを利用しています。

## 開発中: コントローラープロファイル

設定タブに「開発中」のコントローラープロファイル選択を追加しています。プロファイルを切り替えると、Baudrate、G-codeヘッダ／フッタ、ペン命令、`ok`応答timeout、停止方式、初期化・切断コマンドが関連欄とSerialタブへ反映されます。反映後も個別の値を調整でき、`カスタム（値を維持）`へ切り替えると現在値を保ったまま手動設定できます。

### GRBL / FluidNC（標準）

従来互換の既定プロファイルです。

- Baudrate: 115200
- Header: `G21`, `G90`
- Pen: `M3 S1400` / `M3 S1000`
- `ok` timeout: 15秒
- Stop: feed hold `!`の後にペンアップ
- 初期化・切断コマンド: なし

### Pico 2 TMC2209 XY Planar（開発中）

[KiCad 10 one-axis planar stepper](https://github.com/pscmps/kicad-10-one-axis-planar-stepper) のPico 2 + TMC2209ファームウェアを、PlotterFlowのUSBシリアルからペンプロッタ相当として操作するためのプロファイルです。TMC2209はSTEP/DIRでX/Y相当の平面リニアステッパを駆動し、PlotterFlow側はGRBL/FluidNC互換に近いG-code、`ok`応答、`?`ステータス、`$J`ジョグを使います。

- Web Serial: 115200設定（USB CDC）
- G-code Header: `M17`, `G21`, `G90`, `G10 L20 P0 X0 Y0`
- Pen: `M3 S1400` / `M3 S1000`（M3互換。実際のペン、電磁石、外部アクチュエータ割り当てはPico側で扱う）
- Feed初期値: 描画 300 mm/min、空走 500 mm/min
- Jog初期値: 40 mm、2400 mm/min（10 mmの電気周期を4サイクル、約1秒）
- `ok` timeout: 30秒
- Stop: motion cancel `0x85`、250 ms待機、ペンアップ
- 初期化: `M17`, `G21`, `G90`
- 切断: `M18`
- Status: `?<Idle|WPos:...|MPos:...|WCO:...>`形式
- Jog: `$J=G91 G21 X... Y... F...`
- Job footer: `M122 P`でX/Yを簡易診断した後、`M18`でドライバを無効化します。
- Debug log: このプロファイルの選択中だけ、送信中に受信した`[MSG:PFDBG ...]`をSerialログへ表示します。他プロファイルと通常メッセージは従来どおり送信中に抑制します。既にこのプロファイルを保存済みの場合は、設定画面で一度選び直すと新しいFooterが反映されます。

プロファイルを選択し直すとSerialタブのJog移動量と速度も即時に更新されます。Pico平面モータでは初回捕捉試験用に`0.625 mm / 30 mm/min`を設定し、各Jog完了後に`M18`を自動送信して発熱を抑えます。初期化ボタンも`M18`、`G21`、`G90`のみを送り、移動前からドライバを有効にしません。

初期キャンバスと実機確認範囲は30×30 mmを推奨します。まずTMCの電流制限、コイル発熱、XYの向き、ワーク原点を確認し、0.1 mmジョグで短距離移動を確認してから描画ジョブを流してください。プロファイルのHeaderはジョブ送信ごとに現在位置を `G10 L20 P0 X0 Y0` でワーク原点にするため、送信前に機構を安全な原点位置へ置いてください。

XL330 PIOプロファイルはDYNAMIXELのExtended Position Control Modeとセッション原点を使います。一方、このPico 2 TMC2209 XY PlanarプロファイルはTMCのSTEP/DIR駆動とPico側の現在座標を前提にし、`M17`でドライバ有効化、`M18`で無効化、`M3 S...`はペン互換の状態コマンドとして扱います。

### Pico 2 DRV8835 XY Planar（開発中）

[KiCad 10 one-axis planar stepper](https://github.com/pscmps/kicad-10-one-axis-planar-stepper)の
`pico2_gcode_drv8835_xy.uf2`を標準G-codeで操作するプロファイルです。TMC2209版とは別に残し、
DRV8835版を選んだ場合だけ`M980`を送ります。

- G-code Header: `M18`、`M281 U1000 D1800 T150 Z0.5`、`M980 U1 X100 Y100 H500 A1 C100`、`G0 Z1`、`M17`、`G21`、`G90`、`G10 L20 P0 X0 Y0 Z1`
- 初期化: `M18`、`M281 U1000 D1800 T150 Z0.5`、`M980 U1 X100 Y100 H500 A1 C100`、`G0 Z1`、`G21`、`G90`
- Pen: `G0 Z1` / `G1 Z0`
- Job footer: `M122`、`M18`
- Feed初期値: 描画300mm/min、空走500mm/min
- Jog初期値: 2.5mm、300mm/min
- Jog: `$J=G91 G21 X... Y... F...`
- Stop: motion cancel `0x85`、切断時は`M18`

`M980`の`U`は2.5mmの1状態を分割する数、`X/Y`は各軸のピークPWM duty、`H`は
移動終了後の保持時間msです。DRV8835は電流値を直接設定しないため、`X100/Y100`は100mAではなく
100% dutyを表します。`C100`はHi-Z解除時またはX/Y切替時に現在相を100ms保持し、磁石を捕捉してから
移動を始めます。既定の`U1`は1相だけを100%励磁する確実動作です。`U8`は滑らか動作用の実験設定で、
0.625mmジョグなどと組み合わせて比較できます。`A1`は移動軸だけ励磁し、X/Y単独移動時に停止軸をLowへします。斜め移動では
両軸を励磁します。従来どおり常に両軸を励磁する場合は`A0`です。VM 3V、電源制限1.5A、各相1.5Ω直列抵抗から確認してください。

PWMサーボの信号線はPico 2 / Pico 2 WのGP12（物理16番）です。サーボ電源は外部5 Vから供給し、Pico、サーボ、DRV8835のGNDを共通にします。Picoの3V3端子からサーボへ給電しないでください。実機取付方向に合わせてペン上を1000 us、ペン下を1800 usとします。`M281`の`U/D`は上下のパルス幅us、`T`は動作待機ms、`Z`は上下判定しきい値です。DYNAMIXELプロファイルは従来の`M3 S1400` / `M3 S1000`を維持し、DRV8835プロファイルを選んだ場合だけZ指令へ切り替わります。

Pico 2 DRV8835プロファイルを選ぶと、SerialタブのXYジョグ直下へAS5600 J1/J2を使う2関節アーム表示が現れます。「位置センサ通信」は起動時OFFで、ONにした場合だけ`M983 S1`を送り、`?`の取得周期を750msから250msへ変更します。OFFでは`M983 S0`へ戻すため、通常の描画中に不要なI2C読出しやシリアル転送は発生しません。J1/J2の片方または両方が未接続でもジョグとG-code送信は継続できます。「現在を真下基準」は両センサ接続時の現在角を`180 deg / 180 deg`として保存し、J1/J2反転はブラウザごとに保持します。

### M5Stack Basic DRV8835 XY Planar（開発中）

M5Stack Basic版ファームウェアでは、従来のUSBシリアル実行に加えて、PlotterFlowから
本体microSDへG-codeを保存できます。

1. M5Stackを起動し、画面で`USB SERIAL`を選択します。
2. 設定タブで`M5Stack Basic DRV8835 XY Planar`を選択します。
3. Serialタブから115200 bpsで接続します。
4. 送信対象を選び、送信先を`M5Stack SDカードへ保存`へ変更します。
5. 48文字以内のASCIIファイル名を確認して`SDカードへ転送`を押します。
6. 完了後にM5Stackを再起動し、`SD CARD`モードからファイルを選択します。

転送には`M28 filename.gcode`、G-code本文、`M29`の行単位プロトコルを使用します。
転送開始時にモータ出力をLowへ戻し、本文は実行せず一時ファイルへ保存します。`M29`が
成功した場合だけ正式名へ変更されます。停止、切断、書き込みエラー時はCtrl-Xで転送を
中止し、未完成ファイルを破棄します。

同名ファイルは安全のため上書きしません。M5Stackから既存ファイルを残したまま再転送する
場合は、PlotterFlowのSDファイル名を変更してください。

SD転送の選択肢はこのM5Stackプロファイルでだけ表示されます。他のプロファイルは
従来どおり接続先でG-codeを即時実行します。SDへ保存される内容には、エディタ内の
ヘッダ、ペン命令、移動命令、フッタがすべて含まれます。

同じSerial画面の`M5Stack操作モード`を`SDカード管理`へ変更すると、PlotterFlowが
`M21`でPC管理モードを指定し、続けて`M20`でmicroSD内のG-code一覧を同期します。
M5Stackが起動直後のモード選択画面でも、PCからこの操作を行えば本体ボタンで
`USB SERIAL`を選び直す必要はありません。

一覧では48文字以内のASCII名を入力して`名前変更`を押すか、確認ダイアログ後に
`削除`できます。使用するコマンドは`M993 old.gcode new.gcode`と
`M30 filename.gcode`です。管理終了時は`M22`を送り、通常操作へ戻ります。

- 対象はmicroSDルート直下の`.gcode`、`.gc`、`.nc`、`.tap`です。
- サブフォルダと安全なASCII名規則に合わないファイルは表示・変更しません。
- 改名先の同名ファイルは上書きしません。
- SD管理中はジョグ、通常送信、ジョブ実行を無効にします。
- この管理UIもM5Stack DRV8835プロファイルだけに表示します。

### RP2040-GEEK STS3215 direct-axis G-code

Select `RP2040-GEEK STS3215 XYZ直結G-code（XY実機テスト）` to send generated G-code without applying machine kinematics.

- Web Serial: USB CDC at 115200 baud
- Axis mapping defaults: X = STS3215 ID 2, Y = STS3215 ID 3, Z = ID 1 (disabled)
- Settings: per-axis servo ID, pulses/mm, direction inversion, and Z enable
- Configuration: PlotterFlow sends `M950 ...`, then `M17` captures the current positions as G-code XYZ zero
- Motion: generated `G0` / `G1` millimetre coordinates map directly to signed multi-turn servo positions
- Jog command: `TESTJOG <id> <delta>`
- Available increments: 11.25 to 2520 degrees (up to 7 turns per command)
- Firmware velocity: raw 3400 with acceleration raw 150 (fixed maximum-speed profile)
- Command timeout: 20 seconds in PlotterFlow; firmware calculates motion timeout from pulse distance plus a 4-second margin
- Requires Operating Mode 0, Min/Max Angle Limit 0, Phase BIT4 enabled, and Angle Resolution 1
- Each jog adds to the servo's current signed multi-turn position, does not return, then turns torque off
- Stop sends byte `0x85`
- GRBL status polling is disabled; normal G-code and job transfer are enabled

The current hardware scan found IDs 2 and 3; ID 1 did not respond. The default 128 pulses/mm makes 32 mm equal one servo turn. PlotterFlow does not rewrite servo IDs or EEPROM. `ENABLEMULTITURN <id>` remains an explicit maintenance command. The angle-based `TESTJOG` controls are also retained and use the X/Y IDs from settings.

### XL330 PIO / Pico・Pico 2（開発中）

[DYNAMIXEL XL330-M077-T direct half-duplex with Pico PIO](https://github.com/pscmps/dynamixel-pio-xl330-m077-t-rp2040) のMicroPythonファームウェアを、PlotterFlowのUSBシリアルから操作するためのプロファイルです。X/YのXL330はExtended Position Control Modeで符号付き多回転位置を扱い、ID 3はペンサーボとして使用します。

- Web Serial: 115200設定（USB CDC。DYNAMIXELバス自体は初期57,600 bps）
- G-code Header: `G21`, `G90`
- Pen: `M3 S1400` / `M3 S1000`
- `ok` timeout: 120秒
- Stop: motion cancel `0x85`、250 ms待機、ペンアップ
- 初期化: `M17`
- 切断: `M18`
- Status: `?<Idle|WPos:...|MPos:...|WCO:...>`形式
- Jog: `$J=G91 G21 X... Y... F...`

`M17`はX/YをExtended Position Control Modeへ設定してトルクを有効にし、その時点の現在位置をセッション原点にします。ジョブごとのG-codeヘッダへ自動挿入すると原点を取り直すため、XL330 PIOプロファイルではSerialタブにだけ `初期化 (M17)` ボタンを表示します。電源投入後、機構の安全と基準位置を確認してから1回実行してください。

Stop時は、通常のfeed holdでは後続のペンアップが処理されない可能性があるため、このプロファイルでは`0x85`で現在移動をキャンセルしてからペンアップを送ります。切断時には`M18`を送り、X/Y/ペンのトルクを無効にしてからUSBシリアルを閉じます。

XL330の多回転絶対位置は、電源再投入、Reboot、Operating Mode変更などをまたいで保持されません。現段階では電源投入ごとに原点確認が必要です。また、PIOの送受信切替、実サーボ応答、3台接続、停止シーケンスは実機検証前のため、このプロファイルは「開発中」として扱います。

関連実装ブランチ: [`feature/plotter-flow-serial-multiturn`](https://github.com/pscmps/dynamixel-pio-xl330-m077-t-rp2040/tree/feature/plotter-flow-serial-multiturn)
