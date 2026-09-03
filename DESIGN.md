---
name: easyCode
description: 白い方眼の紙に朱 1 色。番号つきレーンと結線でプログラムの 4 つの姿をつなぐ、教室の投影に耐えるデザインシステム。
colors:
  paper: "#FCFCFA"
  paper-2: "#F4F5F2"
  paper-3: "#EAEBE6"
  rule: "#D8DAD3"
  rule-faint: "#E3E5DF"
  rule-major: "#D2D5CD"
  ink: "#16181A"
  ink-2: "#4A4E52"
  ink-3: "#63686C"
  ink-on-mark: "#FFFFFF"
  mark: "#C0392B"
  mark-deep: "#9C2C20"
  mark-faint: "#F6E4E1"
  hold: "#8A6D1F"
  void: "#63686C"
  code-bg: "#F4F5F2"
  code-gutter: "#63686C"
  code-keyword: "#A32B1E"
  code-string: "#2F6B3A"
  code-number: "#1F4E79"
  code-comment: "#5A5F63"
  code-line: "#E2E4DE"
typography:
  display:
    fontFamily: "BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0"
  headline:
    fontFamily: "BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0"
  subtitle:
    fontFamily: "BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "0"
  ui:
    fontFamily: "BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.02em"
  label:
    fontFamily: "Archivo Narrow, BIZ UDGothic, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.1em"
  code:
    fontFamily: "Sometype Mono, BIZ UDGothic, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0"
  grid-jp:
    fontFamily: "BIZ UDGothic, Hiragino Sans, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "0"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
  full: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "16px"
  sp-4: "24px"
  sp-5: "32px"
  sp-6: "48px"
  sp-7: "64px"
components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0.4em 0.85em"
  button-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.ink-on-mark}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0.4em 0.85em"
  button-primary-hover:
    backgroundColor: "{colors.mark-deep}"
    textColor: "{colors.ink-on-mark}"
  button-primary-disabled:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.void}"
  button-mark:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.mark-deep}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0.4em 0.85em"
  button-mark-hover:
    backgroundColor: "{colors.mark-faint}"
    textColor: "{colors.mark-deep}"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.mark}"
    typography: "{typography.ui}"
    rounded: "{rounded.full}"
    padding: "0.4em 1.1em"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0.4em 0.85em"
  icon-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    width: "30px"
    height: "30px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "0"
  panel-head:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "34px"
    padding: "4px 8px"
  tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "0.3em 0.8em"
  tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  mode-lane:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "0 16px"
  mode-lane-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.45em 0.65em"
  chip:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "0"
    padding: "0.1em 0.5em 0.1em 0.45em"
  note:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "0"
    padding: "8px 16px"
  code-surface:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "0"
---

# Design System: easyCode

## Overview

**Creative North Star: 「結線表（normalled jackfield）を白い紙に移したもの」**

放送局の機械室にある、番号を振った端子盤。どの端子も必ず番号のついた列に属し、
つないだところだけが 1 本の線で結ばれる。easyCode の画面はそれを白い方眼紙の上に
移したものとして作ってある。同じ 1 本のプログラムが Python コード・ブロック・
フローチャート・共通テスト用プログラム表記のどの姿になっても、必ず同じ行番号の列に
並ぶ。だから画面のいちばん下の材質が「番号のついた行」であり、いちばん強い装置が
「行どうしを結ぶ線」になる。

地は near-white の方眼（`#FCFCFA` に 8px の細罫と 32px の主罫）で、そこに引く色は
朱 1 色（`#C0392B`）だけ。書体は日本の教材と役所の文書の書体である BIZ UD 系、
番号は詰まったグロテスクの Archivo Narrow、コードは Sometype Mono。教室の
プロジェクターに映して後ろの席から読める、という制約が色と字の下限を決めている
（薄い色も暗い地も使わない）。

この世界は分野の定番を積極的に外している。角丸カードの反復、絵文字の見出し、
紫のアクセント、暗い IDE 風のコード面、影で浮かせた面。どれも使わない。
面は影ではなく罫で分け、状態は色ではなく線の描き分けで表す。

**Key Characteristics:**
- 白い方眼の地に、信号は朱 1 色だけ
- すべての区画に番号（レーン）が振られ、行番号でそろう
- 状態は色ではなく線の描き分け（実線／点線／二重線／端の丸）
- 影は使わない（`--sh-1: none`）。角は 2〜4px でほぼ立てる
- 絵文字を一切使わず、20×20・線幅 1.6 の自作線画だけを使う
- 両端に必ず 16px の余白（`--gutter`）を残し、何も画面の端まで伸びない

## Colors

near-white の紙と墨のグレースケールに、朱がただ 1 色だけ差し込まれる。彩度のある
色は原則として朱しかない。

### Primary
- **朱（信号の朱, `mark`）**: いま動いているもの、いま選ばれている場所、主となる操作。
  面として塗ってよいのは主となる操作（実行）だけ。場所を示すときは太い罫として引く。
  ステップ実行中の行の帯、カーソル、選択、フォーカスリング、`::selection` も同じ朱。
- **朱・深（押し込みの朱, `mark-deep`)**: hover / active で沈むとき、および本文中のリンク文字色。
  紙の上で 4.5:1 を満たすので、小さい字にも使える。
- **朱・淡（敷きの朱, `mark-faint`)**: 朱の面をごく薄く敷くとき（選択範囲、ステップ実行の行、
  `.btn-mark` の hover、直すところの知らせ）。文字色には使わない。

### Secondary
朱だけでは危ういところにだけ使う 2 色。**どちらも面には使わない。細線と文字だけ。**
- **黄土（保留の黄土, `hold`)**: 待っている・注意（`.chip.is-warn` の点線、`.note.is-warn` の
  破線、予想が外れたときの点線）。正誤の「不正解」ではなく「まだ途中」を表す。
- **薄墨（無効の薄墨, `void`)**: 押せないもの・未着手。`ink-3` と同値だが、意味が違うので
  名前を分けてある。

### Neutral
- **紙（`paper`)**: すべての面の地。上端の帯もダイアログもこの色で、暗い面は一つも無い。
- **紙・一段沈め（`paper-2`)**: 凡例、区画の見出しの帯、コードの地、サイドバー。
- **紙・二段沈め（`paper-3`)**: いま編集している行の背景、押し込んだボタン、インラインコード。
- **主罫（`rule`)**: 区画と区画を分ける 1px の線。この世界で面を分ける唯一の手段。
- **細罫（`rule-faint`) / 方眼の主罫（`rule-major`)**: 地そのものの材質。8px と 32px で敷く。
- **墨（`ink`)**: 本文と見出し。上端の帯の下に引く 2px の罫もこの色。
- **墨・二（`ink-2`)**: 補助の文字、押していないタブやレーンの文字。
- **薄墨（`ink-3`)**: 番号、単位、プレースホルダ。小さい字でも紙の上で 5:1 以上ある。
- **白（`ink-on-mark`)**: 朱の面に抜くときだけ使う。

### コードの色
コード面は白地（`code-bg`）。暗い IDE 風にはしない。予約語は朱寄りの赤、文字列は緑、
数は青、コメントはグレー。いずれも紙の上で 4.5:1 以上を満たす暗さで選んである。

### Named Rules
**朱の面は 1 画面に 1 つの法則。** 朱で「塗る」ことが許されるのは、その画面の主となる
操作（実行）ただ 1 つだけ。いま開いているモードのレーン、いま見ている凡例の行、
選ばれているタブ — 場所を示すものはすべて、朱の**太い罫**で示す（`box-shadow: inset` の
2〜8px）。塗ってしまうと「今どこにいるか」と「次に何を押すか」が同じ強さになり、
学習者が押す先を見失う。これを防ぐための規則。

**色で意味を持たせない法則。** 正誤・種類・進み具合を色相で表さない。朱は「今」だけ、
黄土は「途中」だけを表す。それ以外の区別はすべて線の描き分けで行う。緑＝正解／
赤＝不正解という配色は、色覚と投影の両方で落ちるうえ、この世界の唯一の信号色である
朱の意味を薄める。

**投影の下限の法則。** 文字と地の明るさの差は、小さい字で 4.5:1 以上、大きい字で 3:1 以上。
`ink-3`（`#63686C`）が紙の上で使ってよい最も薄い墨で、これより薄い文字色を新しく
作らない。暗い地に薄い文字、という組み合わせは全ページで使わない。

## Typography

**本文・見出し:** BIZ UDPGothic（`Hiragino Sans` → `Noto Sans JP` の順に落ちる）
**マス揃えの和文:** BIZ UDGothic（全角が等幅にそろう。表や共通テスト表記に使う）
**番号・凡例:** Archivo Narrow（`BIZ UDGothic` に落ちる）
**コード:** Sometype Mono（`BIZ UDGothic` → `ui-monospace` に落ちる）

**Character:** BIZ UD は日本の学校のプリントと役所の文書のための書体で、この題材の
世界にもともと在る物。そこに、番号だけを詰まったグロテスクの Archivo Narrow で打つ。
和文は読みやすく、番号は機械の刻印のように見える — この二層が結線表の見た目を作る。

### Hierarchy
- **Display**（700 / 44px / 1.35）: ページのいちばん上の題。数は少ない。
- **Headline**（700 / 32px / 1.25 / letter-spacing -0.01em）: レッスンの問題名など、
  その画面でいちばん大きい字。投影したときの見当になる。
- **Title**（700 / 24px / 1.35）: 節の見出し。
- **Subtitle**（700 / 20px / 1.35）: 小見出し、ダイアログの題、ブランド名。
- **Body**（400 / 16px / 1.75）: 本文。問題文は 1.8 まで空ける。
- **UI**（700 / 14px / 1.3）: ボタン、タブ、一覧の項目。画面の部品はここに揃う。
- **Label**（Archivo Narrow 600 / 12px / letter-spacing 0.1em）: レーン番号（01〜04）、
  区画の番号、難易度、ヒントの番号、`kbd`。凡例の書体は朱ではなく墨で打つ。
- **Code**（Sometype Mono 400 / 14px / 1.7）: エディタ、実行結果、変数の値。

段差は 1.25 以上。下限は 12px で止める（教室の後ろから読める大きさの下限）。

### Named Rules
**桁をそろえる法則。** 数字が並ぶところ（レーン番号、行番号、表）は必ず
`font-variant-numeric: tabular-nums`。番号がそろわないと、この世界の骨組みである
「番号つきレーン」が目に見えて崩れる。

**番号は Archivo Narrow の法則。** 01〜04 のモード番号、区画の記号、行番号、ヒントの
番号は、すべて同じ 12px の Archivo Narrow で打つ。和文書体で番号を打つと、番号が
本文の一部に見えて「レーン」として読めなくなる。

## Layout

地そのものが方眼で、8px の細罫と 32px の主罫が重なった二重の格子として敷いてある
（背景画像ではなく `linear-gradient` で作った面の材質）。間隔は 4px の格子
（4 / 8 / 16 / 24 / 32 / 48 / 64px）で、方眼のマスに吸着する。

**画面の骨組み。** 上端に高さ 52px（`--topbar-h`）の帯。地は紙のままで、下に墨の
2px の罫を引いて本体と分ける。帯の中は「名前 → 道具 → モードのレーン（01〜04）」の順。
本体は左に一覧・中央に課題・右にコードと結果、という三列（レッスン）か、
2×2 のグリッド（実験画面の code / flow / blocks / output）。

**両端の余白。** `--gutter: 16px` を左右と下に必ず残し、何も画面の端まで伸びない。
この余白から地の方眼が覗くことで、画面全体が「紙の上に置かれた盤」に見える。

**折り返し。**
- **900px 以下**: 上端の帯が折り返す。道具の列が 3 行目に落ちて全幅になり、
  モードのレーンは最小幅の指定を外して詰まる。
- **1000px 以下**: 本体の列が縦に積む（`#shell` が column に、`overflow` が auto に）。
  レッスンの「並べて結ぶ」タブは、左右に並べる幅が無いので消す。
- **720px 以下**: 道具の列を横スクロールから折り返しに変える。横スクロールのままだと
  右端の「共有」や「全消去」に気づけない、という実際の不具合を直したもの。
  同時に、指で押すところを 40px 以上にし、区画の見出しを 2 段にする
  （1 段のままだと見出しが「A <> P」まで潰れて読めなくなる）。

### Named Rules
**端まで伸ばさない法則。** どの面も `--gutter`（16px）の内側で止める。全幅に伸ばした帯や
画面いっぱいのカードは、この世界では作らない。

**行番号でそろえる法則。** 同じプログラムを並べて見せるときは、行の高さを一致させて
同じ行番号が必ず真横に来るようにする（`.pair-rail` の細罫は
`--pair-line` でエディタの行の高さから計算して敷く）。ずれた瞬間、この製品の
いちばんの主張が嘘になる。

## Elevation & Depth

**影は使わない。** `--sh-1: none` がその宣言で、面を浮かせるのではなく罫で分ける。
奥行きは 3 段の紙の濃さ（`paper` / `paper-2` / `paper-3`）と 1px の罫だけで作る。
`--sh-2` / `--sh-3`（`0 1px 0` / `0 2px 0 var(--c-rule)`）は影ではなく、
「下に引いた 1 本の罫」として使う目的で残してある。

いま選ばれているものの表現も影ではなく、`box-shadow: inset` で引いた**内側の罫**で行う
（タブの二重罫、レーンの下 4px の朱罫、一覧の左 3px の朱罫）。技術的には box-shadow だが、
見え方は必ず「罫」でなければならない。

### Shadow Vocabulary
- **無し**（`--sh-1: none`）: 既定。すべての面はここに属する。
- **下の罫**（`--sh-2: 0 1px 0 var(--c-rule)`）: 面の下に 1 本引く。ぼかさない。
- **下の太罫**（`--sh-3: 0 2px 0 var(--c-rule)`）: 同上、2px。
- **フォーカスの環**（`--ring: 0 0 0 2px var(--c-paper), 0 0 0 4px var(--c-mark)`）:
  紙で 2px あけてから朱で 2px 囲む。キーボードで進んだとき、今どこにいるかを示す唯一の装置。

### Named Rules
**ぼかさない法則。** `box-shadow` にぼかし半径（3 番目の値）を入れない。すべて
`0 Npx 0` の実線。ぼかした影が 1 つ入ると、白い紙の世界が一気に「よくある管理画面」に落ちる。

## Shapes

角はほぼ立てる。2px（`--r-sm`）／ 3px（`--r-md`）／ 4px（`--r-lg`, `--r-xl`）の 3 段しかなく、
区画（`.panel`）とタブと展開（`.expander`）は `border-radius: 0` の直角。
角丸のカードを反復して並べる構成は作らない。

例外は `--r-full`（999px）で、これは装飾ではなく意味を持つ。**端を丸で閉じた形は
「取り消せない操作」を表す**（`.btn-danger`、そして「並べて結ぶ」の結線の両端の
開いた輪 `.pair-mark::before/::after`）。結線表のパッチ端子の輪をそのまま持ってきたもの。

線はすべて 1px を基本にし、意味が強いところだけ 2px（上端の帯の下、`.note` の左、
結んだ線）、いま開いている場所だけ 3〜4px の朱罫。

### Named Rules
**丸は取り消せないもの法則。** `--r-full` を「かわいくするため」に使わない。丸まった端は、
押したら戻せない操作か、結線の端点のどちらかを意味する。

## Components

### Buttons
- **Shape:** ほぼ直角（2px, `--r-sm`）。内側 `0.4em 0.85em`。線で囲み、押したら沈む。
- **既定（`.btn`）:** 紙の地に薄墨の枠、墨の文字、700。hover で枠が墨になり地が一段沈む。
  active でさらに一段沈む。disabled は枠が主罫、文字が `void`。
- **主となる操作（`.btn-primary` / `.btn-run` / `.btn-accent`）:** 朱の面に白抜き。
  hover で朱・深に沈む。**1 画面に 1 つだけ。**
- **二番手（`.btn-mark`）:** 朱の枠と朱・深の文字、面は塗らず、下に 2px の朱罫を引く
  （`inset 0 -2px 0`）。hover でごく薄い朱を敷く。
- **取り消せない操作（`.btn-danger`）:** 朱の枠、端は丸（`--r-full`）、内側を 1.1em に広げる。
- **静かな操作（`.btn-quiet`）:** 枠も地も透明、文字は墨・二、太字にしない。hover で初めて枠が出る。
- **図だけのボタン（`.icon-btn`）:** 30×30、中は 16px の線画。`is-on` で枠と図が朱になる（面は塗らない）。
- **狭い画面（720px 以下）:** `.btn` は 40px、`.btn-sm` は 36px、`.icon-btn` は 40×40 まで背を伸ばす。

### Chips
- **Style:** 面は塗らず、**左に 1px の線を引くだけ**の札。紙・一段沈めの地に 12px の太字。
- **State:** 動いている（`is-live`）＝墨の実線が途切れない。待っている（`is-warn`）＝
  黄土の線に 5px 間隔の切れ目（`background-size: 1px 5px` の繰り返しで作る点線）。

### Cards / Containers（区画 `.panel`）
- **Corner Style:** 直角（0）。角丸のカードを重ねない。
- **Background:** 本体は紙、見出しの帯は紙・一段沈め。
- **Shadow Strategy:** 無し。1px の主罫で囲むだけ。
- **見出し（`.panel-head`）:** 高さ 34px 以上、内側 4px/8px、下に 1px の罫。
  左に区画の番号（12px Archivo Narrow、薄墨）＋題（13px 700）、右に道具。
- **狭い画面（720px 以下）:** 見出しを 2 段に折り返す。

### Inputs / Fields
- **Style:** 紙の地に 1px の枠、角 3px、内側 `0.45em 0.65em`。
- **Focus:** 枠が朱になり、`--ring`（紙 2px → 朱 2px）が付く。
- **ラベル:** 13px 600 の墨・二を上に置く。プレースホルダは薄墨。

### Navigation（モードのレーン `.mode-switch`）
- **Style:** 上端の帯の右端に並ぶ、1px の罫で仕切った列。1 列に 2 段で
  上が番号（12px Archivo Narrow、薄墨、letter-spacing 0.1em）、下が名前（14px 700）。
  最小幅 74px。
- **既定 / hover:** 文字は墨・二。hover で地が一段沈み、文字が墨になる。
- **いま開いているレーン（`aria-current="page"`）:** 地は紙のまま、**下に 4px の朱罫**
  （`inset 0 -4px 0`）。番号だけ朱・深になる。面は塗らない。
- **モバイル:** 900px 以下で帯が折り返し、レーンは最小幅を捨てて詰まる。

### Tabs
- **Style:** 丸い錠剤ではなく、1px の罫で区切った札の列。角は 0。
- **選択（`aria-selected="true"`）:** 面を塗らず、下に**二重の朱罫**を引く
  （`inset` を重ねて 紙 3px → 朱 5px → 朱 8px と段を作る）。
  `.lane-switch` の `is-on` も同じ作りの短い版。

### 知らせ（`.note`）
- **Style:** 左に 2px の線、紙・一段沈めの地。角は 0。**色ではなく線の描き分けで種類を示す。**
- **うまくいった（`is-ok`）:** 墨の**実線**。
- **待っている（`is-warn`）:** 黄土の**破線**（`border-left-style: dashed`）。
- **直すところ（`is-bad`）:** 朱の線に、ごく薄い朱の地、さらに**下にもう 1 本**朱の罫
  （`inset 0 -1px 0`）。帯を太らせずに二重線で見分ける。

### コード面
- 白地（`code-bg`）。暗い IDE 風にしない。行番号は Archivo Narrow の `tabular-nums` で、
  紙の上で 5:1 以上ある薄墨。カーソルは朱の 2px。選択はごく薄い朱。
- **いま動いている行（`.step-line`）:** ごく薄い朱の帯に、左端 2px の朱罫。面は塗りつぶさない。
- 字下げの目安は方眼の細罫と同じ 1px。

### 一覧の項目（`.lesson-item`）— 状態を線で描き分ける代表例
14×12 の枠の中に線を引くだけで進み具合を示す。色は使わない。
- **解けた（`done`）:** 14×2px の**実線**（墨）。
- **未着手（`todo`）:** 4×2px の**切れ目のある線**（薄墨）。
- **模試（`mock`）:** 14×2px を上下 2 本引いた**二重線**（墨）。
- **いま開いている項目:** 印が朱の実線に変わり、左端に 3px の朱罫が入る。地は塗らない。

### 並べて結ぶ（`.pair-grid` / `.pair-rail` / `.pair-mark`）— この製品の署名
左に Python、右に共通テスト用プログラム表記、その間に幅 28px の帯（rail）。
- 帯の地は紙で、左右に 1px の罫。**エディタの行の高さ（`--pair-line`、既定 21px）と
  同じ間隔で細罫を敷き**、上端を `--pair-top`（既定 8px）でエディタの 1 行目に合わせる。
  この 2 つの変数は `drawPairMark()` が実測して入れる。
- **いま光っている行だけ**、左右を朱の 2px の線で結ぶ。線の両端は
  6×6px・線幅 2px の**開いた輪**（中は紙で抜く）＝結線表のパッチ端子。
- 1000px 以下では、左右に並べる幅が無いのでタブごと隠す。

### ブロック（Blockly `easycode-ink` テーマ）
地は紙（`#FCFCFA`）、道具箱は紙・一段沈め。カーソル・挿入位置・選択の光はすべて朱。
ブロックの面だけは種類ごとに刷り分けた 1 色を持つが、**すべて彩度を落とした
「刷り色」**で、原色は使わない（論理 `#5B7C8D` / 繰り返し `#6B8E6B` / 数 `#7A7A96` /
文字 `#9A7B5A` / 配列 `#8A7391` / 変数 `#B07A4E` / 関数 `#4E7A8A`）。
最初のブロック（hat）だけが朱（`#C0392B`）で、プログラムの始まりを示す。
方眼の目は 8px で、地の方眼と同じ刻み。

### フローチャート（mermaid）
面は紙、枠と線は墨・二、文字は墨。図の中でも色は増やさない。

### 線画（`module/icons.js`）
20×20 の升目に線幅 1.6、角は落とさない（`stroke-linecap: square` / `stroke-linejoin: miter`）、
塗りは無し、色は `currentColor`。既定の大きさは `1em`、上端の帯の中では 14px、
区画の見出しの中では 13px、図だけのボタンでは 16px。**絵文字は製品のどこにも使わない。**

## Do's and Don'ts

### Do:
- **Do** 朱の面（塗り）を、その画面の主となる操作 1 つだけに取っておく。
  場所を示すときは、朱の太い罫（`inset` の 2〜8px）を使う。
- **Do** 状態を線の描き分けで表す。実線＝進行中／切れ目＝未着手・保留／
  二重線＝いま開いている・模試／端の丸＝取り消せない操作。
- **Do** すべての区画に番号を振り、番号は 12px の Archivo Narrow で、
  `tabular-nums` を効かせて打つ。
- **Do** 面を分けるときは罫（1px）と紙の 3 段（`paper` / `paper-2` / `paper-3`）で分ける。
- **Do** 両端に `--gutter`（16px）を残し、地の方眼を覗かせる。
- **Do** 小さい字で 4.5:1、大きい字で 3:1 の明るさの差を守る。
  紙の上で使ってよい最も薄い墨は `ink-3`（`#63686C`）まで。
- **Do** 図が要るときは `module/icons.js` に 20×20・線幅 1.6 で描き足す。
- **Do** 並べて見せるものは、行の高さを実測してそろえる（`--pair-line` / `--pair-top`）。

### Don't:
- **Don't** グラデーションを使う（製品側からの明示的な指示。地の方眼は
  `linear-gradient` で作った罫であって、ぼかした階調ではない）。
- **Don't** 絵文字を置く。端末ごとに形も色も変わり、線の太さがそろわない。
- **Don't** 影で面を浮かせる。`box-shadow` にぼかし半径を入れない（すべて `0 Npx 0`）。
- **Don't** 暗い地・暗い IDE 風のコード面を作る。教室で投影すると沈む。
- **Don't** 角丸のカードを反復して並べる。角は 2〜4px、区画は直角。
- **Don't** 正誤や種類を色相で表す（緑＝正解／赤＝不正解をやらない）。
  区別は線の描き分けで行う。
- **Don't** `--r-full` を装飾として使う。丸い端は「取り消せない」か「結線の端点」の意味を持つ。
- **Don't** 新しい彩度のある色を足す。朱・黄土・薄墨の 3 つで足りないなら、
  たいてい線の描き分けで解ける。
- **Don't** 番号を和文書体で打つ。レーンとして読めなくなる。
