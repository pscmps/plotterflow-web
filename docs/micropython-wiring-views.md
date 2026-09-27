# MicroPython配線図の表示切替

開発中 → MicroPython RP STEP/DIR XY → 配線図に、2つのトグルボタンがあります。

- **機能配線図**：既定の表示。信号・機器の関係を見ます。
- **基板の端子位置**：ボード外形、表裏・USBの向き、端子番号を照合して接続場所を確認します。

切替は表示だけに作用します。ボード選択、GPIO割り当て、転送するPython、接続状態は変更しません。表示モードはブラウザに保存します。「自分でPIN設定をする」でピンを変更すると、図のハイライトと配線の出発点が更新されます。異なる信号線は交差しても同じ区間に重ねません。

## 対象と見方

| 対象 | 端子位置図の見方 |
| --- | --- |
| Pico / Pico W / Pico 2 / Pico 2 W | 部品面・USBを上。左右20端子、物理ピン1〜40とGPIO名を表示 |
| XIAO RP2040 / RP2350 | 部品面・USB-Cを上。左右7端子、D番号・GPIO名・上からの位置を表示。RP2350裏面の追加パッドは対象外 |
| Motor Shield v0.7の4構成 | 共通シールドの裏面・切り欠きを左。MCU/LCDは反対面。外部コネクタJ5〜J9の実パッド位置と番号を表示 |
| RP2040-GEEK / RP2350-GEEK | 実物コネクタの向きを未照合。推測した端子位置図は出さず、機能図と公式回路図を案内 |

シールドの端子番号は四角いパッドが1番です。KiCad上面座標のXを基板幅70 mmで反転し、裏面から見た向きへ変換しています。U1/U2は位置の目安で、ドライバモジュールの挿入方向を指示する図ではありません。**Pico 2 W compact基板は別基板なので、このv0.7図を使わないでください。**

単体ボード表示の接続先カード（ドライバ・サーボ）は機能表示のままです。ドライバ製品ごとに端子の並びが違うため、信号名を実物の印字と照合します。GND/3V3の場所も表示しますが、サーボやモータをMCUの3V3から給電してはいけません。配線作業時は電源を切り、電源の極性を確認してください。図は製造用の寸法図ではなく、主要部品のみの模式図です。実機での照合・通電検証はまだ行っていません。

## 実装・出典

- `micropython-board-view.js`：ボード外形、端子位置、シールド裏面変換。Pico Blocksの`app.js`内の`picoBoardDrawing`／`xiaoBoardDrawing`を流用・拡張。
- `app.js`／`index.html`／`profile.css`：トグルと状態保存。`micropython-setup.js`のGPIO設定を読み、別の設定を作りません。
- [Pico Blocks](https://github.com/pscmps/pico-blocks-studio)、[Pico 2公式ピン図](https://datasheets.raspberrypi.com/pico/Pico-2-Pinout.pdf)
- [XIAO RP2040公式ピン図](https://wiki.seeedstudio.com/XIAO-RP2040/)、[XIAO RP2350公式ピン図](https://wiki.seeedstudio.com/xiao_rp2350_arduino/)
- [Motor Shield v0.7設計](https://github.com/pscmps/plotterflow-motor-shield/tree/25aed48)：`hardware/plotterflow-motor-shield.kicad_pcb`のパッド座標・ネットを`design/parts.json`と照合。参照時のコミットは`25aed48`。
- [RP2040-GEEK公式回路図](https://files.waveshare.com/wiki/RP2040-GEEK/RP2040-GEEK-Schematic.pdf)、[RP2350-GEEK公式回路図](https://files.waveshare.com/wiki/RP2350-GEEK/RP2350-GEEK.pdf)

検証は`node tools/micropython-setup-test.cjs`で物理ピン対応、裏面反転、配線の重複を確認します。ブラウザ操作は隔離したローカルのPlaywright CLIセッションで`run-code --filename tools/micropython-browser-check.js`を使用します。トグルの押下状態、再読込、ピン変更、ファームウェア設定が変化しないこと、未照合ボードの案内を検証します。
