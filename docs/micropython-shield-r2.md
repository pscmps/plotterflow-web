# 基板r2とMicroPython配布版の対応

参照元：ローカル正本 `plotterflow-motor-shield` の `7c90efd`、`docs/firmware-handoff.md`、各版の`firmware/board-mappings.json`と実PCB。対象はPlotterFlow WebのSTEP/DIR用MicroPythonバンドルです。Zephyr版・Rθ・STS3215には変更を加えていません。

今回の修正先はPlotterFlow Web同梱の配布版です。別の`plotterflow-micropython-rp`開発リポジトリへの同期は別途確認中で、自動的に上書きしていません。

## 選択と更新

1. PlotterFlowの「開発中」→「MicroPython RP STEP/DIR XY」を選びます。
2. 「自分でPIN設定をする」はOFF。対象ボードから実物と同じ基板を選びます。
3. 新小型基板は「専用2層 … v0.1 r2」です。汎用4層版と混同しないでください。
4. 実機の電源・配線を確認後、既存MicroPythonへの更新は同画面の永続保存で9ファイルを転送します。今回は実機への書き込みを行っていません。

| 選択 | 寸法 | ボタン設定 | PWM |
| --- | --- | --- | --- |
| Pico 2 W 専用2層 | 60×40mm | GP9/10/11 | GP12 |
| LCD1.47-A 専用2層 | 60×34mm | GP25/26/27 | GP9 |
| LCD2/-C 専用2層 | 66×40mm | 3入力ともNone、再割当しない | GP9 |
| 汎用4層 v0.7 | 70×45mm | 元の各MCU定義を維持 | MCUごとの既存割り当て |

保存済みの選択を勝手に小型版へ移行しません。汎用Touch-LCD-2はルートJSONと基板にボタンが残っているため従来定義を維持し、小型Touch-LCD-2だけ`disabled_signals`に従って無効にしています。LCD2はカメラ/FPCを外す前提です。LCD/タッチ表示・ボタン操作自体の実装を追加したわけではありません。

## r2で変えた動作

- X_LIMIT/Y_LIMITは`Pin.IN`＋`Pin.PULL_UP`。GNDへ閉じる接点でLOWになります。J10/J11の1–2間に接点を接続し、3番3V3は接点には使いません。5VをGPIOへ入れないでください。
- ENABLEを無効レベルにしてからSTEP/DIRをLOWにし、PIOへ渡します。M17を受けるまでドライバは有効化しません。
- PWM GPIOを出力LOWにし、PWMをduty=0で初期化します。従来の起動時自動pen-upを止め、M3/M5/Z命令を受けてからパルスを出します。
- M119でLIMIT状態を返します。未割当はNCです。LOWを観測したら直ちに次のM17/G0/G1を拒否し、HIGHが20ms安定するまで解除しません。入力確認はコマンド境界です。
- 拒否時は`error:limit_triggered`、ENABLE無効、論理座標は更新しません。移動途中の実位置を推定・復旧する機能ではありません。
- Ctrl-Cでraw REPLへ移る際も、ENABLEを無効化し、PWMを停止してLOWへ戻します。

Pinの初期値・内部プルアップは[MicroPython公式Pin API](https://docs.micropython.org/en/latest/library/machine.Pin.html)、PWMの初期dutyは[公式PWM API](https://docs.micropython.org/en/latest/library/machine.PWM.html)に従います。電源投入からPython実行前までの浮遊状態は、このアプリケーションの初期化では制御できません。安全性や実電圧・起動波形は実機で別途確認が必要です。

## 未対応・注意点

これは安全認証されたリミット機能ではありません。移動中の常時監視・即時停止、ホーミング、方向別のリミット脱出は未実装です。作動中はどちら向きも移動を拒否します。電源を切って機構・接点を確認し、解除後に再初期化してください。既存の加減速・速度厳密性・FIFO完了待ちの制限も残ります。通常運転には使わず開発中・動作未確認として扱います。

TMC UART・電流の自動設定・シリアルサーボは追加していません。TMCのジャンパ、VREF電流制限、放熱を基板・モータに合わせて確認してください。基板r2の抵抗削除によってPWM端子がなくなったわけではありません。U1/U2の全16端子、外部コネクタ、穴・外形は実PCBと照合していますが、物理的な装着・通電は未検証です。

## ファイルと検証

- `micropython-shield-data.js`：GPIO・予約・無効信号・実パッド座標のスナップショット。
- `micropython-shield-recipes.js`：汎用4＋小型3構成の設定。
- `firmware/micropython/rp_stepdir/inputs.py`：入力の内部プルアップ、デバウンス、LIMIT報告。
- 同ディレクトリの`main.py`、`pio_stepper.py`、`pen.py`、`protocol.py`：初期化・終了処理と事前チェック。
- `node tools/micropython-setup-test.cjs`：GPIO/生成Python/予約ピン/無効ボタン/配線ネット/全16端子の回転/他端子付近の線の余白。
- `python tools/micropython-r2-test.py`：fake machine APIによる起動順序、起動時パルスなし、NCを触らないこと、デバウンス、移動拒否、M119、Ctrl-C後の無効化。
- `python tools/micropython-pio-test.py`：既存PIO命令モデルの同期エッジと非連番STEP。
- `tools/micropython-browser-check.js`：Playwright CLIによる7基板選択、9ファイルの転送内容、表示切替・保存・旧プロファイル分離、3基板のスクリーンショット。

ソフトウェア側の検査だけで実機検証済みとはしません。
