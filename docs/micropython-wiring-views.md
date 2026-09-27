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

シールドの端子番号は四角いパッドが1番です。KiCad上面座標のXを基板幅70 mmで反転し、裏面から見た向きへ変換しています。U1/U2にはBTT TMC2209 V1.2の放熱面と端子を描き、左上EN・右上VMの挿入方向を示します。STEP/DIR/EN/VDD/GNDはシールド内で配線済みなので、外部ジャンパは描きません。J5/J6からモータ巻線、J7/J8から電源、J9からサーボまで外部配線を描きます。**Pico 2 W compact基板は別基板なので、このv0.7図を使わないでください。**

単体ボード表示では、MCUの実端子からX/Yの**BIGTREETECH TMC2209 V1.2（長方形StepStick）**の実端子まで線をつなぎます。モータ、PWMサーボ、外部電源まで省略しません。詳細図は文字を読める大きさを保ち、狭い画面では図の内部だけ横スクロールできます。図は製造用の寸法図ではなく、主要部品のみの模式図です。実機での照合・通電検証はまだ行っていません。

## BTT TMC2209 V1.2の向きと端子

金色の放熱面（公式図のTOP）を手前、電流調整用トリマを右上にします。ICが見えるBOTTOM面から見ると左右が逆になります。外形比15.24 × 20.32 mm、端子間隔2.54 mm、列間隔12.7 mmを基にした模式図です。

| 上から | 左列 | 右列 |
| --- | --- | --- |
| 1 | EN | VM |
| 2 | MS1 | GND |
| 3 | MS2 | A2 |
| 4 | PDN(4) | A1 |
| 5 | PDN(5) | B1 |
| 6 | CLK | B2 |
| 7 | STEP | VDD（VCC_IO） |
| 8 | DIR | GND |

他社TMC2209や別リビジョンを同じ配置と決めつけないでください。PDN(4)/(5)は別位置として扱います。公式マニュアルでは出荷時は4番を使用し、5番を使うには抵抗の付け替えが必要です。今回の単体配線例ではUARTを使わず、両方ともNC（未接続）です。VREF/INDEX/DIAGの追加パッドは配線対象外です。

### 単体ボードの配線条件

- X/YにSTEP・DIRをそれぞれ接続し、共通ENABLEを両方のENへ分岐します。
- VDDはMCUの3V3、両ドライバの各2個のGND端子は共通GND。CLKもGNDに接続します。
- **MS1=MS2=GNDは1/8マイクロステップ**です。フルステップではありません。図の表示切替ではPython設定を変更しないので、`steps/mm`はモータ・マイクロステップ・伝達機構に合わせて設定してください。
- VMは独立したモータ電源、サーボV+は別の5V電源を使います。VMのドライバ定格は4.75〜28Vですが、電源電圧・電流制限は使用モータに合わせて選定します。サーボも5V対応品を前提とし、実機の定格を確認します。
- MCU・モータ電源・サーボ電源のGNDを共通にします。**3V3・VM・サーボ5Vの＋同士は接続しません。**
- モータ側はコネクタの決め打ちではなく巻線A/Bを示します。導通で2本ずつの巻線ペアを識別し、A1/A2とB1/B2へつなぎます。線色やプラグ順は機種によって異なります。
- サーボはSIGNAL/PWM、V+、GNDを描きますが、プラグの左右や線色を全製品共通とはしません。実物の仕様と照合してください。
- ●は接続・分岐、線が交差するだけでは非接続。異なるネットの線は同一区間に重ねません。

シールドではMS/UART設定が内部配線に従うため、上記の単体1/8配線例をそのまま適用しません。必ず全電源を切って装着・配線してください。通電中のドライバ／モータの抜き差しは禁止です。出荷時の電流が適切とは限らないので、公式手順に従いVREFで電流調整し、放熱も行ってください。

## 実装・出典

- `micropython-board-view.js`：ボード外形、端子位置、シールド裏面変換。Pico Blocksの`app.js`内の`picoBoardDrawing`／`xiaoBoardDrawing`を流用・拡張。
- `micropython-tmc-view.js`：BTTモジュールの16端子・放熱面・トリマ、モータ巻線、サーボ、電源のSVG。端子ID付き配線モデルから描画します。
- `app.js`／`index.html`／`profile.css`：トグルと状態保存。`micropython-setup.js`のGPIO設定を読み、別の設定を作りません。
- [Pico Blocks](https://github.com/pscmps/pico-blocks-studio)、[Pico 2公式ピン図](https://datasheets.raspberrypi.com/pico/Pico-2-Pinout.pdf)
- [XIAO RP2040公式ピン図](https://wiki.seeedstudio.com/XIAO-RP2040/)、[XIAO RP2350公式ピン図](https://wiki.seeedstudio.com/xiao_rp2350_arduino/)
- [Motor Shield v0.7設計](https://github.com/pscmps/plotterflow-motor-shield/tree/25aed48)：`hardware/plotterflow-motor-shield.kicad_pcb`のパッド座標・ネットを`design/parts.json`と照合。参照時のコミットは`25aed48`。
- [BIGTREETECH公式TMC2209 V1.2マニュアル](https://github.com/bigtreetech/BIGTREETECH-TMC2209-V1.2/blob/master/manual/TMC2209-V1.2-manual.pdf)：4〜5ページの表裏・寸法・端子図、6ページのMS表、7ページのUART端子切替と注意事項を照合。
- [RP2040-GEEK公式回路図](https://files.waveshare.com/wiki/RP2040-GEEK/RP2040-GEEK-Schematic.pdf)、[RP2350-GEEK公式回路図](https://files.waveshare.com/wiki/RP2350-GEEK/RP2350-GEEK.pdf)

検証は`node tools/micropython-setup-test.cjs`で物理ピン対応、裏面反転、全ネットの配線重複、ENの2台への分岐、電源・GND・モータ・サーボの端子間接続、電源混線なし、PDNのNCを確認します。ブラウザ操作は隔離したローカルのPlaywright CLIセッションで`run-code --filename tools/micropython-browser-check.js`を使用します。トグルの押下状態、再読込、ピン変更、ファームウェア設定が変化しないこと、実物形状と端子の存在、横スクロール、未照合ボードの案内を検証します。実際のSVGを別のプレビューに取り出して全幅スクリーンショットも確認します。
