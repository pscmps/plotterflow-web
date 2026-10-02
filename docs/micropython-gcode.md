# MicroPython 配布版のG-code入力

PlotterFlow Web同梱の `firmware/micropython/rp_stepdir/` が対象です。別の `plotterflow-micropython-rp` 開発リポジトリは変更していません。

## 受理する形式

1行につきコマンドは1個です。大文字・小文字、単語間の空白なし、コマンド番号の先頭ゼロ（`g01x1y2`）、符号付き小数（`X+.5`）、数値の指数表記（`F3e2`）を使えます。コマンド番号は整数表記に限ります。空行、`;` 以降、入れ子のない閉じた `(コメント)` は読み飛ばします。

| コマンド | 任意の引数 | 動作 |
| --- | --- | --- |
| G0 / G1 | X、Y、Z、F | 既存の移動・ペン指令。G90/G91とG20/G21に従う |
| G92 | X、Y、Z | 指定した軸の論理座標を再設定。G91中も絶対値として扱い、inchをmmへ換算する。移動はしない |
| G90 / G91 | なし | 絶対／相対座標 |
| G20 / G21 | なし | inch／mm。保持している内部座標とFはmm系のまま |
| M17 / M18 | なし | ENABLE有効化／停止・無効化 |
| M3 / M5 | S | ペン下／上。従来互換のS数値は受理するが、位置やPWM幅には反映しない |
| M115 / M119 | なし | 既存の機能／LIMIT状態応答 |

省略した座標軸とFは保持します。Fの既存の最小値1 mm/minへの補正は維持しますが、速度の厳密な反映は未完成です。`G92`で軸を省略しても0には戻しません。

## 拒否と状態

不正な文字・数値、重複する引数、1行の複数コマンド、未対応の引数、閉じていない／入れ子のコメントを `error:invalid_gcode` で拒否します。例は `G0.1 X1`、`G1 Xgarbage`、`G1X1M18`、`G1 X1e309` です。数値が有限でも、単位換算・相対加算・steps/mm換算で非有限になれば拒否します。未対応のコマンド自体は `error:unsupported` です。

構文・数値の拒否はLIMITの読み取りや出力操作より前に行い、ENABLE・STEP/DIR・ペン、論理座標・feed・座標モードを変えません。数値検査とステップ列生成を終えてから出力へ渡します。ステップ列のメモリ確保が失敗した場合は `error:plan_too_large` で返し、座標と出力を変えません。これは新しい移動距離上限やストリーム化ではなく、既存のステップ列確保に対する例外処理です。

有効なM17/G0/G1に対するLIMIT作動時は、引き続き `error:limit_triggered` と停止・ENABLE無効化を行います。出力開始後の機器例外や途中までの物理移動を取り消す機能はありません。FIFO完了待ち、即時STOP、加減速、電気的・機械的な動作確認も今回の対象外です。

## ホスト検証

```text
python -B tools/micropython-gcode-test.py
node tools/micropython-setup-test.cjs
python -B tools/micropython-pio-test.py
python -B tools/micropython-r2-test.py
```

回帰テストは偽stepper・pen・LIMITとCPythonで実行します。基板への転送、GPIOやシリアル通信、実機動作は行いません。ソフト検証の成功はMicroPython実機検証済みを意味しません。
