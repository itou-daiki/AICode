// module/blockdefs.js
// ブロックの定義をまとめた場所。
//
// 1つの表から「ブロックの見た目」「Python の生成」「Python からの読み取り」を
// すべて作るので、ブロックを増やすときはこの表に1行足すだけで往復できる。

/* ============================================================
 * 1. 表で定義できるブロック（関数呼び出しの形）
 * ========================================================== */

/**
 * @typedef {object} CallBlockDef
 * @property {string} type      ブロックの種類名
 * @property {string} call      対応する Python の呼び出し（例 'p5.circle'）
 * @property {string} message   ブロックの表示。引数は %1, %2… で書く
 * @property {Array}  args      [{name, shadow}] 引数の定義
 * @property {number} colour    ブロックの色
 * @property {string} tooltip   説明
 * @property {'statement'|'value'} kind 文として置くか、値として使うか
 * @property {string} [output]  値ブロックのときの型
 */

/** 描画モードで使う p5 のブロック */
export const P5_CALL_BLOCKS = [
  // --- かたち ---
  { type: 'p5_circle', call: 'p5.circle', kind: 'statement', colour: '#5B7C8D', tooltip: '円をかきます',
    message: '円 中心x %1 中心y %2 直径 %3',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'D', shadow: 80 }] },
  { type: 'p5_ellipse', call: 'p5.ellipse', kind: 'statement', colour: '#5B7C8D', tooltip: '楕円をかきます',
    message: '楕円 中心x %1 中心y %2 横 %3 縦 %4',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'W', shadow: 120 }, { name: 'H', shadow: 80 }] },
  { type: 'p5_rect', call: 'p5.rect', kind: 'statement', colour: '#5B7C8D', tooltip: '四角形をかきます',
    message: '四角 左上x %1 左上y %2 幅 %3 高さ %4',
    args: [{ name: 'X', shadow: 100 }, { name: 'Y', shadow: 100 }, { name: 'W', shadow: 120 }, { name: 'H', shadow: 80 }] },
  { type: 'p5_square', call: 'p5.square', kind: 'statement', colour: '#5B7C8D', tooltip: '正方形をかきます',
    message: '正方形 左上x %1 左上y %2 一辺 %3',
    args: [{ name: 'X', shadow: 150 }, { name: 'Y', shadow: 150 }, { name: 'S', shadow: 80 }] },
  { type: 'p5_line', call: 'p5.line', kind: 'statement', colour: '#5B7C8D', tooltip: '線をひきます',
    message: '線 始点x %1 始点y %2 終点x %3 終点y %4',
    args: [{ name: 'X1', shadow: 50 }, { name: 'Y1', shadow: 50 }, { name: 'X2', shadow: 350 }, { name: 'Y2', shadow: 350 }] },
  { type: 'p5_triangle', call: 'p5.triangle', kind: 'statement', colour: '#5B7C8D', tooltip: '三角形をかきます',
    message: '三角 %1 %2 / %3 %4 / %5 %6',
    args: [{ name: 'X1', shadow: 200 }, { name: 'Y1', shadow: 100 }, { name: 'X2', shadow: 150 },
           { name: 'Y2', shadow: 250 }, { name: 'X3', shadow: 250 }, { name: 'Y3', shadow: 250 }] },
  { type: 'p5_point', call: 'p5.point', kind: 'statement', colour: '#5B7C8D', tooltip: '点をうちます',
    message: '点 x %1 y %2',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }] },
  { type: 'p5_ellipse3', call: 'p5.ellipse', kind: 'statement', colour: '#5B7C8D', tooltip: '円をかきます（横と縦が同じ楕円）',
    message: '楕円 中心x %1 中心y %2 直径 %3',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'D', shadow: 80 }] },
  { type: 'p5_quad', call: 'p5.quad', kind: 'statement', colour: '#5B7C8D', tooltip: '4 つの頂点で四角形をかきます',
    message: '四角形 %1 %2 / %3 %4 / %5 %6 / %7 %8',
    args: [{ name: 'X1', shadow: 100 }, { name: 'Y1', shadow: 100 }, { name: 'X2', shadow: 300 },
           { name: 'Y2', shadow: 120 }, { name: 'X3', shadow: 280 }, { name: 'Y3', shadow: 300 },
           { name: 'X4', shadow: 120 }, { name: 'Y4', shadow: 280 }] },
  { type: 'p5_begin_shape', call: 'p5.begin_shape', kind: 'statement', colour: '#5B7C8D',
    tooltip: 'ここから頂点を集めはじめます（終わりに「形を終える」）', message: '形を始める', args: [] },
  { type: 'p5_vertex', call: 'p5.vertex', kind: 'statement', colour: '#5B7C8D', tooltip: '形の頂点を 1 つ足します',
    message: '頂点 x %1 y %2', args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 100 }] },
  { type: 'p5_end_shape', call: 'p5.end_shape', kind: 'statement', colour: '#5B7C8D',
    tooltip: '集めた頂点で形をかきます（最後と最初はつなぎません）', message: '形を終える', args: [] },
  { type: 'p5_end_shape_close', call: 'p5.end_shape', kind: 'statement', colour: '#5B7C8D',
    tooltip: '集めた頂点で形をかきます。CLOSE なら最後と最初をつないで閉じます',
    message: '形を終える %1', args: [{ name: 'MODE', constant: 'CLOSE' }] },
  { type: 'p5_arc', call: 'p5.arc', kind: 'statement', colour: '#5B7C8D', tooltip: '弧をかきます（角度はラジアン）',
    message: '弧 中心x %1 中心y %2 横 %3 縦 %4 開始 %5 終了 %6',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'W', shadow: 120 },
           { name: 'H', shadow: 120 }, { name: 'A1', shadow: 0 }, { name: 'A2', shadow: 3.14 }] },

  // --- いろ ---
  { type: 'p5_background', call: 'p5.background', kind: 'statement', colour: '#B07A4E', tooltip: '背景の色を決めます',
    message: '背景色 赤 %1 緑 %2 青 %3',
    args: [{ name: 'R', shadow: 240 }, { name: 'G', shadow: 240 }, { name: 'B', shadow: 250 }] },
  { type: 'p5_fill', call: 'p5.fill', kind: 'statement', colour: '#B07A4E', tooltip: '塗りつぶしの色を決めます',
    message: '塗り色 赤 %1 緑 %2 青 %3',
    args: [{ name: 'R', shadow: 255 }, { name: 'G', shadow: 100 }, { name: 'B', shadow: 100 }] },
  { type: 'p5_no_fill', call: 'p5.no_fill', kind: 'statement', colour: '#B07A4E', tooltip: '塗りつぶしをやめます',
    message: '塗りつぶしなし', args: [] },
  { type: 'p5_stroke', call: 'p5.stroke', kind: 'statement', colour: '#B07A4E', tooltip: '輪郭の色を決めます',
    message: '線の色 赤 %1 緑 %2 青 %3',
    args: [{ name: 'R', shadow: 60 }, { name: 'G', shadow: 60 }, { name: 'B', shadow: 90 }] },
  { type: 'p5_no_stroke', call: 'p5.no_stroke', kind: 'statement', colour: '#B07A4E', tooltip: '輪郭をやめます',
    message: '輪郭なし', args: [] },
  { type: 'p5_stroke_weight', call: 'p5.stroke_weight', kind: 'statement', colour: '#B07A4E', tooltip: '線の太さを決めます',
    message: '線の太さ %1', args: [{ name: 'W', shadow: 3 }] },
  // 色は書き方が 4 とおりある（明るさ／明るさとすけ具合／赤緑青／赤緑青とすけ具合）。
  // どれもブロックにできるよう、引数の数ごとに用意する。
  ...['background', 'fill', 'stroke'].flatMap(name => colourVariants(name)),
  { type: 'p5_stroke_cap', call: 'p5.stroke_cap', kind: 'statement', colour: '#B07A4E',
    tooltip: '線の端の形を決めます（ROUND / SQUARE / PROJECT）',
    message: '線の端の形 %1', args: [{ name: 'M', constant: 'ROUND' }] },

  // --- もじ ---
  { type: 'p5_text', call: 'p5.text', kind: 'statement', colour: '#6B8E6B', tooltip: '文字をかきます',
    message: '文字 %1 を x %2 y %3 に',
    args: [{ name: 'T', text: 'Hello' }, { name: 'X', shadow: 100 }, { name: 'Y', shadow: 100 }] },
  { type: 'p5_text_size', call: 'p5.text_size', kind: 'statement', colour: '#6B8E6B', tooltip: '文字の大きさを決めます',
    message: '文字の大きさ %1', args: [{ name: 'S', shadow: 24 }] },
  { type: 'p5_text_align', call: 'p5.text_align', kind: 'statement', colour: '#6B8E6B',
    tooltip: '文字をどこにそろえるかを決めます（LEFT / CENTER / RIGHT）',
    message: '文字のそろえ方 %1', args: [{ name: 'H', constant: 'CENTER' }] },
  { type: 'p5_text_align2', call: 'p5.text_align', kind: 'statement', colour: '#6B8E6B',
    tooltip: '文字のそろえ方を、横と縦で決めます（縦は TOP / CENTER / BOTTOM / BASELINE）',
    message: '文字のそろえ方 横 %1 縦 %2', args: [{ name: 'H', constant: 'CENTER' }, { name: 'V', constant: 'CENTER' }] },

  // --- へんかん ---
  { type: 'p5_push', call: 'p5.push', kind: 'statement', colour: '#8A7391', tooltip: '今の状態を保存します',
    message: '状態を保存', args: [] },
  { type: 'p5_pop', call: 'p5.pop', kind: 'statement', colour: '#8A7391', tooltip: '保存した状態に戻します',
    message: '状態を戻す', args: [] },
  { type: 'p5_translate', call: 'p5.translate', kind: 'statement', colour: '#8A7391', tooltip: '原点を動かします',
    message: '原点を動かす x %1 y %2',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }] },
  { type: 'p5_rotate', call: 'p5.rotate', kind: 'statement', colour: '#8A7391', tooltip: '回転します（ラジアン）',
    message: '回転する %1', args: [{ name: 'A', shadow: 0.785 }] },
  { type: 'p5_scale', call: 'p5.scale', kind: 'statement', colour: '#8A7391', tooltip: '拡大・縮小します',
    message: '拡大 横 %1 倍 縦 %2 倍',
    args: [{ name: 'X', shadow: 2 }, { name: 'Y', shadow: 2 }] },
  { type: 'p5_create_canvas', call: 'p5.create_canvas', kind: 'statement', colour: '#8A7391',
    tooltip: 'キャンバスの大きさを決めます（setup の中に書きます）',
    message: 'キャンバスの大きさ 横 %1 縦 %2',
    args: [{ name: 'W', shadow: 400 }, { name: 'H', shadow: 400 }] },
  { type: 'p5_clear', call: 'p5.clear', kind: 'statement', colour: '#8A7391', tooltip: 'キャンバスを消します',
    message: 'キャンバスを消す', args: [] },
  { type: 'p5_scale1', call: 'p5.scale', kind: 'statement', colour: '#8A7391', tooltip: '縦横同じだけ拡大・縮小します',
    message: '拡大 %1 倍', args: [{ name: 'S', shadow: 2 }] },
  { type: 'p5_frame_rate', call: 'frame_rate', kind: 'statement', colour: '#8A7391',
    tooltip: '1 秒に何コマ描くかを決めます（はじめは 60）',
    message: '1 秒のコマ数 %1', args: [{ name: 'F', shadow: 30 }] },
  { type: 'p5_no_loop', call: 'no_loop', kind: 'statement', colour: '#8A7391',
    tooltip: 'draw() のくり返しを止めます（1 回だけ描きたいとき）', message: 'くり返しを止める', args: [] },
  { type: 'p5_loop', call: 'loop', kind: 'statement', colour: '#8A7391',
    tooltip: '止めた draw() のくり返しを、もう一度動かします', message: 'くり返しを再開する', args: [] },
  { type: 'p5_angle_mode', call: 'p5.angle_mode', kind: 'statement', colour: '#8A7391',
    tooltip: '角度を度で書くかラジアンで書くかを決めます（DEGREES / RADIANS）',
    message: '角度の単位 %1', args: [{ name: 'M', constant: 'DEGREES' }] },
  { type: 'p5_rect_mode', call: 'p5.rect_mode', kind: 'statement', colour: '#8A7391',
    tooltip: '四角の x, y を左上にするか中心にするかを決めます（CORNER / CENTER）',
    message: '四角の置き方 %1', args: [{ name: 'M', constant: 'CENTER' }] },
  { type: 'p5_ellipse_mode', call: 'p5.ellipse_mode', kind: 'statement', colour: '#8A7391',
    tooltip: '円の x, y を中心にするか左上にするかを決めます（CENTER / CORNER）',
    message: '円の置き方 %1', args: [{ name: 'M', constant: 'CORNER' }] },
  { type: 'p5_random_seed', call: 'random_seed', kind: 'statement', colour: '#4E7A8A',
    tooltip: '乱数のたねを決めます（同じたねなら、毎回同じ乱数になります）',
    message: '乱数のたね %1', args: [{ name: 'S', shadow: 1 }] },
  { type: 'p5_reset_matrix', call: 'p5.reset_matrix', kind: 'statement', colour: '#8A7391',
    tooltip: '移動・回転・拡大をすべて元にもどします',
    message: '座標を元にもどす', args: [] },

  // --- 値として使うもの ---
  { type: 'p5_random', call: 'random', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '最小値から最大値までのランダムな数',
    message: 'ランダムな数 %1 〜 %2',
    args: [{ name: 'A', shadow: 0 }, { name: 'B', shadow: 400 }] },
  { type: 'p5_random1', call: 'random', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '0 以上、この数未満のランダムな数', message: 'ランダムな数 0 〜 %1', args: [{ name: 'B', shadow: 400 }] },
  { type: 'p5_random0', call: 'random', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '0 以上 1 未満のランダムな数', message: 'ランダムな数 0 〜 1', args: [] },
  { type: 'p5_noise', call: 'noise', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '0 〜 1 のなめらかに変わる乱数（少しずつ変えた値を入れます）',
    message: 'なめらかな乱数 %1', args: [{ name: 'X', shadow: 0.1 }] },
  { type: 'p5_noise2', call: 'noise', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '0 〜 1 のなめらかに変わる乱数（2 つの値から）',
    message: 'なめらかな乱数 %1 %2', args: [{ name: 'X', shadow: 0.1 }, { name: 'Y', shadow: 0.1 }] },
  { type: 'p5_dist', call: 'dist', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '2 つの点のあいだの距離', message: '( %1 , %2 ) と ( %3 , %4 ) の距離',
    args: [{ name: 'X1', shadow: 0 }, { name: 'Y1', shadow: 0 }, { name: 'X2', shadow: 200 }, { name: 'Y2', shadow: 200 }] },
  { type: 'p5_constrain', call: 'constrain', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '値が最小〜最大からはみ出さないようにします', message: '%1 を %2 〜 %3 におさめる',
    args: [{ name: 'V', shadow: 500 }, { name: 'LO', shadow: 0 }, { name: 'HI', shadow: 400 }] },
  { type: 'p5_lerp', call: 'lerp', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '2 つの数のあいだを、割合（0 〜 1）で取ります', message: '%1 から %2 へ 割合 %3 の位置',
    args: [{ name: 'A', shadow: 0 }, { name: 'B', shadow: 100 }, { name: 'T', shadow: 0.5 }] },
  { type: 'p5_map', call: 'map_value', py: 'map', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '値の範囲を変換します',
    message: '%1 を %2 〜 %3 から %4 〜 %5 に変換',
    args: [{ name: 'V', shadow: 100 }, { name: 'A1', shadow: 0 }, { name: 'A2', shadow: 400 },
           { name: 'B1', shadow: 0 }, { name: 'B2', shadow: 100 }] },
  { type: 'p5_cos', call: 'cos', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: 'コサイン（ラジアン）', message: 'cos %1', args: [{ name: 'A', shadow: 0 }] },
  { type: 'p5_sin', call: 'sin', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: 'サイン（ラジアン）', message: 'sin %1', args: [{ name: 'A', shadow: 0 }] },
  { type: 'p5_tan', call: 'tan', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: 'タンジェント（ラジアン）', message: 'tan %1', args: [{ name: 'A', shadow: 0 }] },
  { type: 'p5_atan2', call: 'atan2', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '点 (x, y) の向きの角度（ラジアン）。y を先に書きます', message: 'atan2 y %1 x %2',
    args: [{ name: 'Y', shadow: 1 }, { name: 'X', shadow: 1 }] },
  { type: 'p5_radians', call: 'radians', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '度をラジアンにします', message: '%1 度をラジアンに', args: [{ name: 'D', shadow: 45 }] },
  { type: 'p5_degrees', call: 'degrees', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: 'ラジアンを度にします', message: '%1 ラジアンを度に', args: [{ name: 'R', shadow: 3.14 }] },
  { type: 'p5_sqrt', call: 'sqrt', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '平方根', message: '%1 の平方根', args: [{ name: 'N', shadow: 2 }] },
  { type: 'p5_sq', call: 'sq', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '2 乗', message: '%1 の 2 乗', args: [{ name: 'N', shadow: 3 }] },
  { type: 'p5_floor', call: 'floor', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '小数点以下を切り捨てます', message: '%1 の切り捨て', args: [{ name: 'N', shadow: 3.7 }] },
  { type: 'p5_ceil', call: 'ceil', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '小数点以下を切り上げます', message: '%1 の切り上げ', args: [{ name: 'N', shadow: 3.2 }] },
  { type: 'p5_millis', call: 'millis', kind: 'value', output: 'Number', colour: '#4E7A8A',
    tooltip: '動かしはじめてからのミリ秒（1000 で 1 秒）', message: '始めてからのミリ秒', args: [] },
];

/**
 * background / fill / stroke の、引数の数ちがいのブロック
 * @param {string} name
 * @returns {CallBlockDef[]}
 */
function colourVariants(name) {
  const label = { background: '背景色', fill: '塗り色', stroke: '線の色' }[name];
  const base = { call: `p5.${name}`, kind: 'statement', colour: '#B07A4E' };
  return [
    { ...base, type: `p5_${name}_gray`, message: `${label} %1`,
      tooltip: `${label}を決めます。数なら明るさ（0 で黒、255 で白）。'red' のような色の名前も使えます`,
      args: [{ name: 'V', shadow: 220 }] },
    { ...base, type: `p5_${name}_gray_alpha`, message: `${label} 明るさ %1 すけ具合 %2`,
      tooltip: `${label}を明るさで決めます。すけ具合は 0 で透明、255 で不透明`,
      args: [{ name: 'V', shadow: 220 }, { name: 'A', shadow: 128 }] },
    { ...base, type: `p5_${name}_rgba`, message: `${label} 赤 %1 緑 %2 青 %3 すけ具合 %4`,
      tooltip: `${label}を赤・緑・青で決めます。すけ具合は 0 で透明、255 で不透明`,
      args: [{ name: 'R', shadow: 255 }, { name: 'G', shadow: 100 }, { name: 'B', shadow: 100 }, { name: 'A', shadow: 128 }] },
  ];
}

/** 名前だけの値ブロック（変数のように使う） */
export const P5_NAME_BLOCKS = [
  { type: 'p5_frame_count', name: 'frameCount', label: 'コマ数', colour: '#4E7A8A', output: 'Number',
    tooltip: 'アニメーションが始まってからのコマ数' },
  // p5.js のリファレンスどおり width と書く。前からの p5.width も同じブロックにする
  { type: 'p5_width', name: 'width', aliases: ['p5.width'], label: 'キャンバスの幅', colour: '#4E7A8A', output: 'Number',
    tooltip: 'キャンバスの横の大きさ' },
  { type: 'p5_height', name: 'height', aliases: ['p5.height'], label: 'キャンバスの高さ', colour: '#4E7A8A', output: 'Number',
    tooltip: 'キャンバスの縦の大きさ' },
  { type: 'p5_mouse_x', name: 'mouseX', aliases: ['mouse_x'], label: 'マウスの x', colour: '#4E7A8A', output: 'Number',
    tooltip: 'マウスの横の位置' },
  { type: 'p5_mouse_y', name: 'mouseY', aliases: ['mouse_y'], label: 'マウスの y', colour: '#4E7A8A', output: 'Number',
    tooltip: 'マウスの縦の位置' },
  { type: 'p5_pmouse_x', name: 'pmouseX', label: '1 コマ前のマウスの x', colour: '#4E7A8A', output: 'Number',
    tooltip: '1 コマ前のマウスの横の位置' },
  { type: 'p5_pmouse_y', name: 'pmouseY', label: '1 コマ前のマウスの y', colour: '#4E7A8A', output: 'Number',
    tooltip: '1 コマ前のマウスの縦の位置' },
  { type: 'p5_mouse_is_pressed', name: 'mouseIsPressed', aliases: ['mouse_is_pressed'], label: 'マウスが押されている',
    colour: '#4E7A8A', output: 'Boolean', tooltip: 'マウスのボタンを押している間は True' },
  { type: 'p5_key', name: 'key', label: '押されたキー', colour: '#4E7A8A', output: 'String',
    tooltip: "最後に押されたキーの文字（'a' など）" },
  { type: 'p5_key_code', name: 'keyCode', label: '押されたキーの番号', colour: '#4E7A8A', output: 'Number',
    tooltip: '最後に押されたキーの番号（矢印キーなど、文字の無いキーに使います）' },
  { type: 'p5_key_is_pressed', name: 'keyIsPressed', aliases: ['key_is_pressed'], label: 'キーが押されている',
    colour: '#4E7A8A', output: 'Boolean', tooltip: 'キーを押している間は True' },
  { type: 'p5_pi', name: 'PI', label: '円周率 π', colour: '#4E7A8A', output: 'Number',
    tooltip: '約 3.14159' },
  { type: 'p5_two_pi', name: 'TWO_PI', label: '2π', colour: '#4E7A8A', output: 'Number', tooltip: '円 1 周（360 度）' },
  { type: 'p5_half_pi', name: 'HALF_PI', label: 'π/2', colour: '#4E7A8A', output: 'Number', tooltip: '90 度' },
  { type: 'p5_quarter_pi', name: 'QUARTER_PI', label: 'π/4', colour: '#4E7A8A', output: 'Number', tooltip: '45 度' },
];

/**
 * p5.js の決まった言葉（textAlign(CENTER) の CENTER など）。
 * 1 つのブロックで選べるようにする。
 */
export const P5_CONSTANTS = [
  ['CENTER', '中央 CENTER'], ['LEFT', '左 LEFT'], ['RIGHT', '右 RIGHT'], ['TOP', '上 TOP'],
  ['BOTTOM', '下 BOTTOM'], ['BASELINE', 'ベースライン BASELINE'], ['CORNER', '角 CORNER'],
  ['CORNERS', '2 つの角 CORNERS'], ['RADIUS', '半径 RADIUS'], ['DEGREES', '度 DEGREES'],
  ['RADIANS', 'ラジアン RADIANS'], ['CLOSE', '閉じる CLOSE'], ['RGB', 'RGB'], ['HSB', 'HSB'],
  ['ROUND', '丸 ROUND'], ['SQUARE', '平ら SQUARE'], ['PROJECT', 'はみ出す PROJECT'],
  ['MITER', 'とがる MITER'], ['BEVEL', '面取り BEVEL'],
];

/** def setup(): / def draw(): をそのままブロックにしたもの */
const DEF_BLOCKS_CAMEL = [
  { type: 'p5_setup', name: 'setup', message: '最初に1回だけ %1', colour: '#6E7378',
    tooltip: 'ページを開いたときに1回だけ実行されます' },
  { type: 'p5_draw', name: 'draw', message: 'くり返し描く %1', colour: '#6E7378',
    tooltip: '1秒に何十回もくり返し実行されます（アニメーション）' },
  { type: 'p5_mouse_pressed', name: 'mousePressed', aliases: ['mouse_pressed'], message: 'マウスを押したとき %1',
    colour: '#6E7378', tooltip: 'マウスのボタンを押したときに 1 回実行されます' },
  { type: 'p5_mouse_released', name: 'mouseReleased', aliases: ['mouse_released'], message: 'マウスをはなしたとき %1',
    colour: '#6E7378', tooltip: 'マウスのボタンをはなしたときに 1 回実行されます' },
  { type: 'p5_key_pressed', name: 'keyPressed', aliases: ['key_pressed'], message: 'キーを押したとき %1',
    colour: '#6E7378', tooltip: 'キーを押したときに 1 回実行されます（押されたキーは「押されたキー」で分かります）' },
];

/**
 * def mouse_pressed(): のような snake_case のつづりにも、同じ見た目のブロックを用意する。
 * 1 つのブロックにまとめると、ブロックから作り直すときに名前が mousePressed に変わり、
 * mouse_pressed() と呼んでいるところが動かなくなるため、つづりごとに別のブロックにする。
 */
export const DEF_BLOCKS = [
  ...DEF_BLOCKS_CAMEL,
  ...DEF_BLOCKS_CAMEL.flatMap(def => (def.aliases || []).map(alias => ({
    type: `${def.type}_${alias}`, name: alias, message: def.message, colour: def.colour, tooltip: def.tooltip,
  }))),
];

/** 関数を呼ぶブロックを用意する引数の数（0〜5 個） */
const CALL_ARITIES = [0, 1, 2, 3, 4, 5];

/**
 * 関数を呼ぶブロック（文として置くもの・値として使うもの）の JSON
 * @param {number} n 引数の数
 */
function callBlockJson(n) {
  const holes = Array.from({ length: n }, (_, i) => `%${i + 2}`).join(' , ');
  const args0 = [
    { type: 'field_input', name: 'NAME', text: 'nanika' },
    ...Array.from({ length: n }, (_, i) => ({ type: 'input_value', name: `ARG${i}` })),
  ];
  const withArgs = n ? `（ ${holes} を渡す）` : '';
  return [
    {
      type: `py_call_${n}`, message0: `%1 を呼ぶ${withArgs}`, args0,
      previousStatement: null, nextStatement: null, colour: '#A55B80', inputsInline: true,
      tooltip: '関数を呼びます。関数の名前と、渡すものを入れます',
    },
    {
      type: `py_callv_${n}`, message0: `%1 の答え${withArgs}`, args0,
      output: null, colour: '#A55B80', inputsInline: true,
      tooltip: '関数を呼んで、返ってきた答えを使います',
    },
  ];
}

/** def のように、前に空行を置くブロック */
const DEF_LIKE = /^(py_def|p5_setup|p5_draw|p5_mouse_|p5_key_pressed)/;

/** そのブロックが「関数を作る」ものか（Python のままのブロックでも、def / class で始まるもの） */
function isDefLike(block) {
  if (!block) return false;
  if (DEF_LIKE.test(block.type) && block.type !== 'p5_mouse_x' && block.type !== 'p5_mouse_y'
      && !block.type.startsWith('p5_mouse_is')) return true;
  if (block.type !== 'py_raw') return false;
  // 何行かにわたる Python のままのブロックは、字下げの無い 1 行目で見分ける
  let head = block;
  while (head && head.type === 'py_raw' && /^\s/.test(head.getFieldValue('CODE') || '')) head = head.getPreviousBlock();
  if (!head || head.type !== 'py_raw' || insideTripleString(head)) return false;
  return /^(def|class|async\s+def|@)\b/.test(head.getFieldValue('CODE') || '');
}

/**
 * Python のままのブロックが、三重引用符の文字列の途中の行か。
 * 文字列の中の「def は関数を作る」のような行を、関数とまちがえて空行を入れないため。
 */
function insideTripleString(block) {
  let double = 0;
  let single = 0;
  for (let prev = block.getPreviousBlock(); prev && prev.type === 'py_raw'; prev = prev.getPreviousBlock()) {
    const code = prev.getFieldValue('CODE') || '';
    double += (code.match(/"""/g) || []).length;
    single += (code.match(/'''/g) || []).length;
  }
  return double % 2 === 1 || single % 2 === 1;
}

/** 一番外側に置かれた文のうち、関数のすぐ前・すぐ後ろにあるものには空行を入れる */
function needsBlankLineBefore(block) {
  if (!block.previousConnection || block.getSurroundParent()) return false;
  const previous = block.getPreviousBlock();
  if (!previous) return false;
  // Python のままのブロックが何行か続くときは、その途中（字下げの中や、文字列の中）に空行を入れない
  if (block.type === 'py_raw' && (/^\s/.test(block.getFieldValue('CODE') || '') || insideTripleString(block))) return false;
  return isDefLike(block) || isDefLike(previous);
}

/* ============================================================
 * 1.6 いろいろな書き方を受けとめるブロック
 *
 * Python ブロックがなるべく出ないよう、生徒がよく書く書き方にブロックを用意する。
 * どれも、書いたコードと同じ意味のコードに戻る（tests/run-browser.js で ast を比べて確かめる）。
 * ========================================================== */

/** 値を入れる穴 */
const hole = (name, check) => ({ type: 'input_value', name, ...(check ? { check } : {}) });
/** 文字を書く欄 */
const field = (name, text = '') => ({ type: 'field_input', name, text });
const STMT = { previousStatement: null, nextStatement: null };

/** メソッド呼び出し（値に続けて書く .名前(…)）を用意する引数の数 */
const METHOD_ARITIES = [0, 1, 2, 3];
/** タプルの個数・辞書の組の数・まとめて代入する個数 */
const TUPLE_SIZES = [0, 1, 2, 3, 4, 5];
const DICT_SIZES = [0, 1, 2, 3, 4];
const MULTI_SIZES = [1, 2, 3, 4];

const holes = (n, prefix = 'ARG', from = 2) => Array.from({ length: n }, (_, i) => `%${i + from}`).join(' , ');

/** いろいろな書き方のブロックの JSON */
function extraBlocksJson() {
  return [
    // --- 値 ---
    { type: 'py_attr', message0: '%1 の %2', args0: [hole('OBJ'), field('NAME', 'real')],
      output: null, colour: '#7A7A96', inputsInline: true, tooltip: '値の中の名前を使います（a.b）' },
    { type: 'py_dotted', message0: '%1', args0: [field('NAME', 'math.pi')],
      output: null, colour: '#7A7A96', tooltip: 'モジュールの中の名前です（math.pi など）' },
    { type: 'py_literal', message0: '%1', args0: [field('TEXT', '1e3')],
      output: null, colour: '#4E7A8A', tooltip: '書いたままの値です（1e3、0x10、r"…" など）' },
    { type: 'py_fstring', message0: '値を入れた文字 f %1', args0: [field('TEXT', '{x} 点')],
      output: 'String', colour: '#6B8E6B', tooltip: '{ } の中に書いた値が入る文字です（f"…"）' },
    ...METHOD_ARITIES.flatMap(n => {
      const args0 = [hole('OBJ'), field('NAME', 'split'), ...Array.from({ length: n }, (_, i) => hole(`ARG${i}`))];
      const tail = n ? `（ ${holes(n, 'ARG', 3)} ）` : '（）';
      return [
        { type: `py_method_${n}`, message0: `%1 の %2 ${tail}`, args0,
          output: null, colour: '#A55B80', inputsInline: true, tooltip: '値に続けてメソッドを呼びます（a.b(…)）' },
        { type: `py_methods_${n}`, message0: `%1 の %2 ${tail} を実行`, args0, ...STMT,
          colour: '#A55B80', inputsInline: true, tooltip: '値に続けてメソッドを呼びます（a.b(…)）' },
      ];
    }),
    { type: 'py_kwarg', message0: '%1 = %2', args0: [field('NAME', 'sep'), hole('VALUE')],
      output: null, colour: '#7A7A96', inputsInline: true, tooltip: '名前をつけて渡す引数です（sep="," など）' },
    { type: 'py_star', message0: '%1 %2 をばらして', args0: [
      { type: 'field_dropdown', name: 'STARS', options: [['*', '*'], ['**', '**']] }, hole('VALUE')],
      output: null, colour: '#7A7A96', inputsInline: true, tooltip: '中身をばらして渡します（*Data）' },
    { type: 'py_slice', message0: '%1 の [ %2 : %3 : %4 ]', args0: [hole('LIST'), hole('START'), hole('STOP'), hole('STEP')],
      output: null, colour: '#8A7391', inputsInline: true,
      tooltip: '一部を切り出します（s[1:3]）。空の穴は「はじめから」「最後まで」です' },
    { type: 'py_slice2', message0: '%1 の [ %2 : %3 ]', args0: [hole('LIST'), hole('START'), hole('STOP')],
      output: null, colour: '#8A7391', inputsInline: true,
      tooltip: '一部を切り出します（s[1:3]）。空の穴は「はじめから」「最後まで」です' },
    { type: 'py_membership', message0: '%1 が %2 の中に %3', args0: [hole('A'), hole('B'),
      { type: 'field_dropdown', name: 'OP', options: [['ある（in）', 'in'], ['ない（not in）', 'not in']] }],
      output: 'Boolean', colour: '#5B80A5', inputsInline: true, tooltip: '中にあるかどうかを調べます（in）' },
    { type: 'py_identity', message0: '%1 %2 %3', args0: [hole('A'),
      { type: 'field_dropdown', name: 'OP', options: [['is', 'is'], ['is not', 'is not']] }, hole('B')],
      output: 'Boolean', colour: '#5B80A5', inputsInline: true, tooltip: '同じものかどうかを調べます（x is None など）' },
    { type: 'py_chain', message0: '%1 %2 %3 %4 %5', args0: [hole('A'),
      { type: 'field_dropdown', name: 'OP1', options: CHAIN_OPS }, hole('B'),
      { type: 'field_dropdown', name: 'OP2', options: CHAIN_OPS }, hole('C')],
      output: 'Boolean', colour: '#5B80A5', inputsInline: true, tooltip: 'つなげた比べ方です（0 < x < 10 は「0 < x かつ x < 10」）' },
    { type: 'py_repeat', message0: '%1 を %2 回つなげる', args0: [hole('VALUE'), hole('TIMES')],
      output: null, colour: '#6B8E6B', inputsInline: true, tooltip: '同じものを何回もつなげます（"*" * 5）' },
    ...TUPLE_SIZES.map(n => ({
      type: `py_tuple_${n}`, message0: n ? `組 ( ${holes(n, 'I', 1)} )` : '空の組 ( )',
      args0: Array.from({ length: n }, (_, i) => hole(`I${i}`)),
      output: null, colour: '#8A7391', inputsInline: true, tooltip: 'いくつかの値をひと組にします（タプル）',
    })),
    ...DICT_SIZES.map(n => ({
      type: `py_dict_${n}`,
      message0: n ? `辞書 { ${Array.from({ length: n }, (_, i) => `%${i * 2 + 1} : %${i * 2 + 2}`).join(' , ')} }` : '空の辞書 { }',
      args0: Array.from({ length: n }, (_, i) => [hole(`K${i}`), hole(`V${i}`)]).flat(),
      output: null, colour: '#8A7391', inputsInline: true, tooltip: 'キーと値の組を集めます（辞書）',
    })),
    { type: 'py_comp', message0: '[ %1 を %2 が %3 の中を動く間 ]', args0: [hole('VALUE'), field('VARS', 'x'), hole('ITER')],
      output: null, colour: '#8A7391', inputsInline: true, tooltip: 'くり返しでリストを作ります（[x*x for x in Data]）' },
    { type: 'py_comp_if', message0: '[ %1 を %2 が %3 の中を動く間、 %4 のときだけ ]',
      args0: [hole('VALUE'), field('VARS', 'x'), hole('ITER'), hole('COND')],
      output: null, colour: '#8A7391', inputsInline: true, tooltip: '条件に合うものだけでリストを作ります' },
    { type: 'py_lambda', message0: '%1 を受け取って %2 を返す関数', args0: [field('PARAMS', 'x'), hole('VALUE')],
      output: null, colour: '#A55B80', inputsInline: true, tooltip: '名前のない短い関数です（lambda）' },
    { type: 'py_callexpr', message0: '%1 を呼ぶ（ %2 ）', args0: [hole('CALLEE'), hole('ARG0')],
      output: null, colour: '#A55B80', inputsInline: true, tooltip: '値を関数として呼びます' },

    // --- 文 ---
    { type: 'py_set_index', message0: '%1 の [ %2 ] %3 %4', args0: [hole('LIST'), hole('INDEX'),
      { type: 'field_dropdown', name: 'OP', options: ASSIGN_OPS }, hole('VALUE')],
      ...STMT, colour: '#A55B80', inputsInline: true,
      tooltip: '配列や辞書の中身を書きかえます（Data[i] = 値、Data[i] += 1）' },
    { type: 'py_set_attr', message0: '%1 の %2 %3 %4', args0: [hole('OBJ'), field('NAME', 'x'),
      { type: 'field_dropdown', name: 'OP', options: ASSIGN_OPS }, hole('VALUE')],
      ...STMT, colour: '#A55B80', inputsInline: true, tooltip: '値の中の名前に入れます（a.b = 値）' },
    ...MULTI_SIZES.map(n => ({
      type: `py_multi_${n}`, message0: `%1 に まとめて ${holes(n, 'V', 2)} を入れる`,
      args0: [field('TARGETS', 'a, b'), ...Array.from({ length: n }, (_, i) => hole(`V${i}`))],
      ...STMT, colour: '#A55B80', inputsInline: true,
      tooltip: 'いくつかの変数にまとめて入れます（a, b = b, a）',
    })),
    { type: 'py_chain_assign', message0: '%1 に同じ %2 を入れる', args0: [field('TARGETS', 'x = y'), hole('VALUE')],
      ...STMT, colour: '#A55B80', inputsInline: true, tooltip: 'いくつかの変数に同じ値を入れます（x = y = 0）' },
    { type: 'py_aug', message0: '%1 %2 %3', args0: [field('TARGET', 'x'),
      { type: 'field_dropdown', name: 'OP', options: ASSIGN_OPS.slice(1) }, hole('VALUE')],
      ...STMT, colour: '#A55B80', inputsInline: true, tooltip: '今の値に計算して入れ直します（x += 1）' },
    { type: 'py_for_vars', message0: '%1 が %2 の中を順に動く間 %3 %4', args0: [field('VARS', 'i, x'), hole('ITER'),
      { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      ...STMT, colour: '#5BA55B', tooltip: 'いくつかの変数で順に取り出します（for i, x in enumerate(Data)）' },
    { type: 'py_try', message0: 'ためしにやってみる %1 うまくいかなかったら（ %2 ） %3',
      args0: [{ type: 'input_statement', name: 'BODY' }, field('EXC', 'ValueError'), { type: 'input_statement', name: 'HANDLER' }],
      ...STMT, colour: '#6E7378', tooltip: 'エラーになったときの動きを決めます（try / except）。（ ）は空でもかまいません' },
    { type: 'py_assert', message0: '%1 のはず（ちがったら止める）', args0: [hole('VALUE')],
      ...STMT, colour: '#6E7378', inputsInline: true, tooltip: '成り立つはずのことを確かめます（assert）' },
    { type: 'py_del', message0: '%1 を消す', args0: [hole('VALUE')],
      ...STMT, colour: '#6E7378', inputsInline: true, tooltip: '配列の中身などを消します（del）' },
    { type: 'py_import', message0: '%1 を使えるようにする', args0: [field('NAME', 'math')],
      ...STMT, colour: '#6E7378', tooltip: 'モジュールを読みこみます（import）' },
    { type: 'py_from', message0: '%1 から %2 を使えるようにする', args0: [field('MODULE', 'random'), field('NAMES', 'randint')],
      ...STMT, colour: '#6E7378', tooltip: 'モジュールの一部を読みこみます（from … import …）' },
    { type: 'py_expr', message0: '%1 を実行', args0: [hole('VALUE')],
      ...STMT, colour: '#6E7378', inputsInline: true, tooltip: '式を実行します' },
  ];
}

/** Blockly の Python 生成器と同じ、演算子の強さ（数が小さいほど強い） */
const PY_ORDER = {
  ATOMIC: 0, COLLECTION: 1, MEMBER: 2.1, FUNCTION_CALL: 2.2, EXPONENTIATION: 3, UNARY_SIGN: 4,
  MULTIPLICATIVE: 5, ADDITIVE: 6, RELATIONAL: 11, LOGICAL_NOT: 12, LOGICAL_AND: 13, LOGICAL_OR: 14,
  CONDITIONAL: 15, LAMBDA: 16, NONE: 99,
};

const CHAIN_OPS = [['<', '<'], ['<=', '<='], ['>', '>'], ['>=', '>='], ['==', '=='], ['!=', '!=']];
const ASSIGN_OPS = [['= 入れる', '='], ['+= 増やす', '+='], ['-= 減らす', '-='], ['*= 倍にする', '*='],
  ['/= 割る', '/='], ['//= 商にする', '//='], ['%= 余りにする', '%='], ['**= 乗する', '**=']];

/**
 * いろいろな書き方のブロックの Python 生成
 * @param {object} python Blockly の Python 生成器
 * @param {object} Order 演算子の強さ
 */
function defineExtraGenerators(python, Order = PY_ORDER) {
  const code = (b, g, name, order = Order.NONE) => g.valueToCode(b, name, order);
  const args = (b, g, n) => Array.from({ length: n }, (_, i) => code(b, g, `ARG${i}`) || 'None').join(', ');
  const quote = (text) => (String(text).includes('"') && !String(text).includes("'") ? `'${text}'` : `"${text}"`);

  // 5.real と書くと小数点と読まれるので、整数のあとは (5).real にする
  const objCode = (b, g) => {
    const obj = code(b, g, 'OBJ', Order.MEMBER) || 'None';
    return /^\d+$/.test(obj) ? `(${obj})` : obj;
  };
  python.forBlock['py_attr'] = (b, g) => [`${objCode(b, g)}.${b.getFieldValue('NAME')}`, Order.MEMBER];
  python.forBlock['py_dotted'] = (b) => [b.getFieldValue('NAME') || 'None', Order.MEMBER];
  python.forBlock['py_literal'] = (b) => [b.getFieldValue('TEXT') || 'None', Order.ATOMIC];
  python.forBlock['py_fstring'] = (b) => [`f${quote(b.getFieldValue('TEXT') ?? '')}`, Order.ATOMIC];
  for (const n of METHOD_ARITIES) {
    const call = (b, g) => `${objCode(b, g)}.${b.getFieldValue('NAME')}(${args(b, g, n)})`;
    python.forBlock[`py_method_${n}`] = (b, g) => [call(b, g), Order.FUNCTION_CALL];
    python.forBlock[`py_methods_${n}`] = (b, g) => `${call(b, g)}\n`;
  }
  python.forBlock['py_kwarg'] = (b, g) => [`${b.getFieldValue('NAME')}=${code(b, g, 'VALUE') || 'None'}`, Order.NONE];
  python.forBlock['py_star'] = (b, g) => [`${b.getFieldValue('STARS')}${code(b, g, 'VALUE', Order.UNARY_SIGN) || 'None'}`, Order.NONE];
  python.forBlock['py_slice'] = (b, g) => [
    `${code(b, g, 'LIST', Order.MEMBER) || 'None'}[${code(b, g, 'START')}:${code(b, g, 'STOP')}:${code(b, g, 'STEP')}]`, Order.MEMBER];
  python.forBlock['py_slice2'] = (b, g) => [
    `${code(b, g, 'LIST', Order.MEMBER) || 'None'}[${code(b, g, 'START')}:${code(b, g, 'STOP')}]`, Order.MEMBER];
  python.forBlock['py_membership'] = (b, g) => [
    `${code(b, g, 'A', Order.RELATIONAL) || 'None'} ${b.getFieldValue('OP')} ${code(b, g, 'B', Order.RELATIONAL) || 'None'}`, Order.RELATIONAL];
  python.forBlock['py_identity'] = (b, g) => [
    `${code(b, g, 'A', Order.RELATIONAL) || 'None'} ${b.getFieldValue('OP')} ${code(b, g, 'B', Order.RELATIONAL) || 'None'}`, Order.RELATIONAL];
  python.forBlock['py_chain'] = (b, g) => [
    `${code(b, g, 'A', Order.RELATIONAL) || '0'} ${b.getFieldValue('OP1')} ${code(b, g, 'B', Order.RELATIONAL) || '0'} ${b.getFieldValue('OP2')} ${code(b, g, 'C', Order.RELATIONAL) || '0'}`,
    Order.RELATIONAL];
  python.forBlock['py_repeat'] = (b, g) => [
    `${code(b, g, 'VALUE', Order.MULTIPLICATIVE) || "''"} * ${code(b, g, 'TIMES', Order.MULTIPLICATIVE + 0.5) || '1'}`, Order.MULTIPLICATIVE];
  for (const n of TUPLE_SIZES) {
    python.forBlock[`py_tuple_${n}`] = (b, g) => {
      const items = Array.from({ length: n }, (_, i) => code(b, g, `I${i}`) || 'None');
      return [n === 1 ? `(${items[0]},)` : `(${items.join(', ')})`, Order.ATOMIC];
    };
  }
  for (const n of DICT_SIZES) {
    python.forBlock[`py_dict_${n}`] = (b, g) => [
      `{${Array.from({ length: n }, (_, i) => `${code(b, g, `K${i}`) || 'None'}: ${code(b, g, `V${i}`) || 'None'}`).join(', ')}}`, Order.ATOMIC];
  }
  python.forBlock['py_comp'] = (b, g) => [
    `[${code(b, g, 'VALUE') || 'None'} for ${b.getFieldValue('VARS')} in ${code(b, g, 'ITER', Order.LOGICAL_OR) || '[]'}]`, Order.ATOMIC];
  python.forBlock['py_comp_if'] = (b, g) => [
    `[${code(b, g, 'VALUE') || 'None'} for ${b.getFieldValue('VARS')} in ${code(b, g, 'ITER', Order.LOGICAL_OR) || '[]'} if ${code(b, g, 'COND', Order.LOGICAL_OR) || 'True'}]`, Order.ATOMIC];
  python.forBlock['py_lambda'] = (b, g) => {
    const params = b.getFieldValue('PARAMS').trim();
    return [`lambda${params ? ` ${params}` : ''}: ${code(b, g, 'VALUE', Order.LAMBDA) || 'None'}`, Order.LAMBDA];
  };
  python.forBlock['py_callexpr'] = (b, g) => [`${code(b, g, 'CALLEE', Order.FUNCTION_CALL) || 'None'}(${code(b, g, 'ARG0')})`, Order.FUNCTION_CALL];

  python.forBlock['py_set_index'] = (b, g) =>
    `${code(b, g, 'LIST', Order.MEMBER) || 'None'}[${code(b, g, 'INDEX') || '0'}] ${b.getFieldValue('OP')} ${code(b, g, 'VALUE') || 'None'}\n`;
  python.forBlock['py_set_attr'] = (b, g) =>
    `${code(b, g, 'OBJ', Order.MEMBER) || 'None'}.${b.getFieldValue('NAME')} ${b.getFieldValue('OP')} ${code(b, g, 'VALUE') || 'None'}\n`;
  for (const n of MULTI_SIZES) {
    python.forBlock[`py_multi_${n}`] = (b, g) => {
      const values = Array.from({ length: n }, (_, i) => code(b, g, `V${i}`) || 'None');
      return `${b.getFieldValue('TARGETS')} = ${values.join(', ')}\n`;
    };
  }
  python.forBlock['py_chain_assign'] = (b, g) => `${b.getFieldValue('TARGETS')} = ${code(b, g, 'VALUE') || 'None'}\n`;
  python.forBlock['py_aug'] = (b, g) => `${b.getFieldValue('TARGET')} ${b.getFieldValue('OP')} ${code(b, g, 'VALUE') || '0'}\n`;
  python.forBlock['py_for_vars'] = (b, g) => {
    const body = g.statementToCode(b, 'DO') || `${g.INDENT}pass\n`;
    return `for ${b.getFieldValue('VARS')} in ${code(b, g, 'ITER') || '[]'}:\n${body}`;
  };
  python.forBlock['py_try'] = (b, g) => {
    const body = g.statementToCode(b, 'BODY') || `${g.INDENT}pass\n`;
    const handler = g.statementToCode(b, 'HANDLER') || `${g.INDENT}pass\n`;
    const exc = (b.getFieldValue('EXC') || '').trim();
    return `try:\n${body}except${exc ? ` ${exc}` : ''}:\n${handler}`;
  };
  python.forBlock['py_assert'] = (b, g) => `assert ${code(b, g, 'VALUE') || 'True'}\n`;
  python.forBlock['py_del'] = (b, g) => `del ${code(b, g, 'VALUE') || 'None'}\n`;
  python.forBlock['py_import'] = (b) => `import ${b.getFieldValue('NAME')}\n`;
  python.forBlock['py_from'] = (b) => `from ${b.getFieldValue('MODULE')} import ${b.getFieldValue('NAMES')}\n`;
  python.forBlock['py_expr'] = (b, g) => `${code(b, g, 'VALUE') || 'None'}\n`;
}

/* ============================================================
 * 2. Blockly へブロックを登録する
 * ========================================================== */

/** 表から Blockly の JSON 定義を作る */
function toBlocklyJson(def) {
  const json = {
    type: def.type,
    message0: def.message,
    args0: def.args.map(arg => ({ type: 'input_value', name: arg.name })),
    colour: def.colour,
    tooltip: def.tooltip,
    inputsInline: def.args.length <= 4,
  };
  if (def.kind === 'value') {
    json.output = def.output || null;
  } else {
    json.previousStatement = null;
    json.nextStatement = null;
  }
  return json;
}

/**
 * カスタムブロックをまとめて登録する
 * @param {object} options
 * @param {boolean} [options.drawing] 描画モード用のブロックも登録するか
 */
export function defineBlocks({ drawing = false } = {}) {
  const python = Blockly.Python;

  // Python の慣習に合わせて、生成コードの字下げは4スペースにする
  python.INDENT = '    ';

  // Blockly は使った変数を先頭で「x = None」と宣言する。
  // Python では不要で、コードとブロックを往復させると邪魔になるので消す。
  // Blockly は変数名に英数字以外があると、合計 → _E5_90_88_… のように書きかえる。
  // Python では日本語の名前も使えるので、Python の名前として正しければそのまま使う。
  if (!Blockly.Names.prototype.__easycodeSafeName) {
    const originalSafeName = Blockly.Names.prototype.safeName;
    Blockly.Names.prototype.safeName = function (name) {
      return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) ? name : originalSafeName.call(this, name);
    };
    Blockly.Names.prototype.__easycodeSafeName = true;
  }
  // Python は型を決めずに書く言語なので、if n % 2: や for c in "abc": のような書き方もある。
  // Blockly の型の確かめ（数の穴に文字は入れない など）で止めると、読みこみ全体が Python ブロックに
  // なってしまうので、型では止めない。
  if (!Blockly.ConnectionChecker.prototype.__easycodeLoose) {
    Blockly.ConnectionChecker.prototype.doTypeChecks = function () { return true; };
    Blockly.ConnectionChecker.prototype.__easycodeLoose = true;
  }

  if (!python.__easycodeInit) {
    const originalInit = python.init.bind(python);
    python.init = function (workspace) {
      originalInit(workspace);
      delete this.definitions_['variables'];
      this.__easycodeWorkspace = workspace;
    };
    // Blockly は乱数や平方根のブロックがあると、先頭に import random / import math を足す。
    // 自分で import を書いてあるときは、同じ行が 2 回並ばないよう足さない
    const originalFinish = python.finish.bind(python);
    python.finish = function (code) {
      const workspace = this.__easycodeWorkspace;
      if (workspace) {
        const imported = new Set(workspace.getAllBlocks(false)
          .filter(b => b.type === 'py_import' && !b.getSurroundParent())
          .flatMap(b => String(b.getFieldValue('NAME')).split(',').map(name => name.trim()))
          .filter(name => /^[\w.]+$/.test(name)));
        for (const key of Object.keys(this.definitions_)) {
          if (key.startsWith('import_') && imported.has(key.slice('import_'.length))) delete this.definitions_[key];
        }
      }
      return originalFinish(code);
    };
    python.__easycodeInit = true;
  }

  // --- どのモードでも使う基本ブロック ---
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'py_input',
      message0: 'キーボードから入力 %1',
      args0: [{ type: 'input_value', name: 'PROMPT' }],
      output: 'String', colour: '#6B8E6B', inputsInline: true,
      tooltip: 'input() でキーボードから文字列を受け取ります',
    },
    {
      type: 'py_to_int', message0: '整数にする %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'Number', colour: '#4E7A8A', inputsInline: true, tooltip: 'int() で整数に変換します',
    },
    {
      type: 'py_to_float', message0: '小数にする %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'Number', colour: '#4E7A8A', inputsInline: true, tooltip: 'float() で小数に変換します',
    },
    {
      type: 'py_to_text', message0: '文字列にする %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'String', colour: '#6B8E6B', inputsInline: true, tooltip: 'str() で文字列に変換します',
    },
    {
      type: 'py_comment', message0: 'メモ %1',
      args0: [{ type: 'field_input', name: 'TEXT', text: 'ここに説明' }],
      previousStatement: null, nextStatement: null, colour: '#6E7378',
      tooltip: 'Python のコメント（# ...）になります',
    },
    {
      type: 'py_newline', message0: '改行する',
      previousStatement: null, nextStatement: null, colour: '#6B8E6B',
      tooltip: '何も書かずに、次の行へ送ります（print()）',
    },
    {
      type: 'py_print_end', message0: '%1 を表示して、うしろに %2 をつける',
      args0: [
        { type: 'input_value', name: 'TEXT' },
        { type: 'field_input', name: 'END', text: ' ' },
      ],
      previousStatement: null, nextStatement: null, colour: '#6B8E6B', inputsInline: true,
      tooltip: '改行せずに表示します（print(..., end="...")）。うしろにつける文字は変えられます',
    },
    {
      type: 'py_print_two', message0: '%1 と %2 を空白で区切って表示',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'input_value', name: 'B' },
      ],
      previousStatement: null, nextStatement: null, colour: '#6B8E6B', inputsInline: true,
      tooltip: 'print(a, b) と同じです。あいだに空白が 1 つ入ります',
    },
    {
      type: 'py_index', message0: '%1 の %2 番目',
      args0: [
        { type: 'input_value', name: 'LIST' },
        { type: 'input_value', name: 'INDEX' },
      ],
      output: null, colour: '#8A7391', inputsInline: true,
      tooltip: 'リストの中身を取り出します（番号は 0 から数えます）',
    },
    {
      type: 'py_append', message0: '%1 の最後に %2 を足す',
      args0: [
        { type: 'input_value', name: 'LIST' },
        { type: 'input_value', name: 'ITEM' },
      ],
      previousStatement: null, nextStatement: null, colour: '#8A7391', inputsInline: true,
      tooltip: 'リストの最後に 1 つ足します（append）',
    },
    {
      type: 'py_floor_div', message0: '%1 ÷ %2 の商',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'input_value', name: 'B' },
      ],
      output: 'Number', colour: '#7A7A96', inputsInline: true,
      tooltip: '割り算の商だけを整数で求めます（//）',
    },
    {
      type: 'py_global', message0: '外の変数 %1 を使う',
      args0: [{ type: 'field_input', name: 'NAMES', text: 'x' }],
      previousStatement: null, nextStatement: null, colour: '#A55B80',
      tooltip: '関数の中から、外で作った変数を書きかえられるようにします（global）。'
        + '名前はカンマで区切って、いくつでも書けます',
    },
    {
      type: 'py_join', message0: '%1 と %2 をつなぐ',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'input_value', name: 'B' },
      ],
      output: 'String', colour: '#6B8E6B', inputsInline: true,
      tooltip: '文字と文字をつなぎます（+）。数をつなぐときは「文字列にする」で文字にしてから',
    },
    // 自分で作る関数。Blockly にもとからある関数ブロックは、コードに global を勝手に足すので、
    // 書いたコードのまま往復できる専用のブロックにする
    {
      type: 'py_def', message0: '関数 %1 を作る　受け取るもの %2 %3',
      args0: [
        { type: 'field_input', name: 'NAME', text: 'nanika' },
        { type: 'field_input', name: 'PARAMS', text: '' },
        { type: 'input_statement', name: 'BODY' },
      ],
      previousStatement: null, nextStatement: null, colour: '#A55B80',
      tooltip: '関数を作ります（def）。受け取るものは「a, b」のようにカンマで区切ります。何も受け取らないなら空のまま',
    },
    {
      type: 'py_return', message0: '%1 を返す',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      previousStatement: null, nextStatement: null, colour: '#A55B80', inputsInline: true,
      tooltip: '関数の答えを返して、関数を終わります（return）',
    },
    {
      type: 'py_return_none', message0: '呼び出し元にもどる',
      previousStatement: null, nextStatement: null, colour: '#A55B80',
      tooltip: '何も返さずに、関数を終わります（return）',
    },
    {
      type: 'py_pass', message0: '何もしない',
      previousStatement: null, nextStatement: null, colour: '#A55B80',
      tooltip: '何もしません（pass）。中身をあとで書くときの、場所とりに使います',
    },
    ...CALL_ARITIES.flatMap(n => callBlockJson(n)),
    ...extraBlocksJson(),
    {
      type: 'py_raw', message0: 'Python %1',
      args0: [{ type: 'field_input', name: 'CODE', text: 'print("hello")' }],
      previousStatement: null, nextStatement: null, colour: '#6E7378',
      tooltip: 'Python のコードを1行そのまま書きます',
    },
    {
      type: 'py_raw_value', message0: 'Python %1',
      args0: [{ type: 'field_input', name: 'CODE', text: 'x' }],
      output: null, colour: '#6E7378', tooltip: 'Python の式をそのまま書きます',
    },
  ]);

  const Order = (typeof python !== 'undefined' && window.python && window.python.Order) ||
    { NONE: 99, FUNCTION_CALL: 2, ATOMIC: 0 };

  const value = (block, generator, name, fallback) =>
    generator.valueToCode(block, name, Order.NONE) || fallback;

  python.forBlock['py_input'] = (b, g) => [`input(${g.valueToCode(b, 'PROMPT', Order.NONE)})`, Order.FUNCTION_CALL];
  python.forBlock['py_to_int'] = (b, g) => [`int(${value(b, g, 'VALUE', '0')})`, Order.FUNCTION_CALL];
  python.forBlock['py_to_float'] = (b, g) => [`float(${value(b, g, 'VALUE', '0')})`, Order.FUNCTION_CALL];
  python.forBlock['py_to_text'] = (b, g) => [`str(${value(b, g, 'VALUE', "''")})`, Order.FUNCTION_CALL];
  // Python の演算子の強さ（Blockly の Python 生成器と同じ数）。
  // ここを NONE のままにすると (a + b) // 2 の括弧が落ちて、意味が変わってしまう。
  const MEMBER = 2.1;
  const MULTIPLICATIVE = 5;

  /** 文字を Python の文字列リテラルにする */
  const quote = (g, text) => (g.quote_ ? g.quote_(text) : JSON.stringify(text));

  python.forBlock['py_newline'] = () => 'print()\n';
  python.forBlock['py_print_end'] = (b, g) =>
    `print(${value(b, g, 'TEXT', "''")}, end=${quote(g, b.getFieldValue('END') ?? '')})\n`;
  python.forBlock['py_print_two'] = (b, g) =>
    `print(${value(b, g, 'A', "''")}, ${value(b, g, 'B', "''")})\n`;
  python.forBlock['py_index'] = (b, g) => {
    const list = g.valueToCode(b, 'LIST', MEMBER) || '[]';
    const index = g.valueToCode(b, 'INDEX', Order.NONE) || '0';
    return [`${list}[${index}]`, MEMBER];
  };
  python.forBlock['py_append'] = (b, g) => {
    const list = g.valueToCode(b, 'LIST', MEMBER) || '[]';
    return `${list}.append(${value(b, g, 'ITEM', 'None')})\n`;
  };
  python.forBlock['py_floor_div'] = (b, g) => {
    const left = g.valueToCode(b, 'A', MULTIPLICATIVE) || '0';
    const right = g.valueToCode(b, 'B', MULTIPLICATIVE) || '1';
    return [`${left} // ${right}`, MULTIPLICATIVE];
  };
  python.forBlock['py_global'] = (b) => {
    // 「x y」のように区切りを忘れても、読めない Python にならないよう、空白でも区切る
    const names = String(b.getFieldValue('NAMES') || '').split(/[\s,、]+/)
      .filter(name => /^[A-Za-z_]\w*$/.test(name));
    return names.length ? `global ${names.join(', ')}\n` : '';
  };
  // 足し算と同じ強さ。左右に足し算がきても、かっこを足さずに済む
  const ADDITIVE = 6;
  python.forBlock['py_join'] = (b, g) => {
    // 左に「つなぐ」が続くときは、かっこが無くても同じ意味（"a" + b + "c"）なので付けない
    const leftBlock = b.getInputTargetBlock('A');
    const leftOrder = leftBlock && leftBlock.type === 'py_join' ? Order.NONE : ADDITIVE;
    const left = g.valueToCode(b, 'A', leftOrder) || "''";
    // 右にくる足し算・引き算は、かっこが要る（'a' + (x - y)）
    const right = g.valueToCode(b, 'B', ADDITIVE) || "''";
    return [`${left} + ${right}`, ADDITIVE];
  };
  python.forBlock['py_def'] = (b, g) => {
    const body = g.statementToCode(b, 'BODY') || `${g.INDENT}pass\n`;
    const params = String(b.getFieldValue('PARAMS') || '').split(',').map(p => p.trim()).filter(Boolean).join(', ');
    return `def ${b.getFieldValue('NAME') || 'nanika'}(${params}):\n${body}`;
  };
  python.forBlock['py_return'] = (b, g) => {
    // return a, b はかっこを付けずに書く（書いたままの形に戻すため）
    const child = b.getInputTargetBlock('VALUE');
    if (child && /^py_tuple_([2-9])$/.test(child.type)) {
      const n = Number(child.type.split('_')[2]);
      const items = Array.from({ length: n }, (_, i) => g.valueToCode(child, `I${i}`, Order.NONE) || 'None');
      return `return ${items.join(', ')}\n`;
    }
    return `return ${value(b, g, 'VALUE', 'None')}\n`;
  };
  python.forBlock['py_return_none'] = () => 'return\n';
  python.forBlock['py_pass'] = () => 'pass\n';
  defineExtraGenerators(python);
  for (const n of CALL_ARITIES) {
    const args = (b, g) => Array.from({ length: n }, (_, i) => value(b, g, `ARG${i}`, 'None')).join(', ');
    python.forBlock[`py_call_${n}`] = (b, g) => `${b.getFieldValue('NAME') || 'nanika'}(${args(b, g)})\n`;
    python.forBlock[`py_callv_${n}`] = (b, g) => [`${b.getFieldValue('NAME') || 'nanika'}(${args(b, g)})`, Order.FUNCTION_CALL];
  }

  // 関数（def）の前後には空行を 1 つ入れる。ブロックを通すたびに空行が消えて、
  // setup と draw がくっついて読みにくくなるのを防ぐ
  if (!python.__easycodeBlankLines) {
    // ブロックに付けたコメントは、行の上ではなく、その行の末尾に「  # 説明」で書く（読みこんだときの形に戻す）
    python.scrub_ = function (block, code, thisOnly) {
      let out = code;
      const comment = block.outputConnection ? null : block.getCommentText();
      if (comment && typeof out === 'string') {
        const text = comment.replace(/\s*\n\s*/g, ' ');
        const end = out.indexOf('\n');
        out = end >= 0 ? `${out.slice(0, end)}  # ${text}${out.slice(end)}` : `${out}  # ${text}`;
      }
      const next = block.nextConnection && block.nextConnection.targetBlock();
      const result = out + (thisOnly ? '' : this.blockToCode(next));
      return needsBlankLineBefore(block) ? `\n${result}` : result;
    };
    python.__easycodeBlankLines = true;
  }
  python.forBlock['py_comment'] = (b) => `# ${b.getFieldValue('TEXT')}\n`;
  python.forBlock['py_raw'] = (b) => `${b.getFieldValue('CODE') || ''}\n`;
  python.forBlock['py_raw_value'] = (b) => {
    const code = (b.getFieldValue('CODE') || 'None').trim();
    const atomic = /^[A-Za-z_][\w.]*(\(.*\)|\[.*\])?$/.test(code) ||
      /^-?\d+(\.\d+)?$/.test(code) || /^['"][\s\S]*['"]$/.test(code) ||
      /^[[(][\s\S]*[\])]$/.test(code);
    return [code, atomic ? Order.ATOMIC : Order.NONE];
  };

  if (!drawing) return;

  // --- 描画モードのブロック ---
  Blockly.defineBlocksWithJsonArray([
    ...P5_CALL_BLOCKS.map(toBlocklyJson),
    ...P5_NAME_BLOCKS.map(def => ({
      type: def.type,
      message0: def.label,
      output: def.output,
      colour: def.colour,
      tooltip: def.tooltip,
    })),
    {
      type: 'p5_constant',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'NAME', options: P5_CONSTANTS.map(([name, label]) => [label, name]) }],
      output: null,
      colour: '#4E7A8A',
      tooltip: 'p5.js の決まった言葉（文字のそろえ方や、角度の単位などに使います）',
    },
    ...DEF_BLOCKS.map(def => ({
      type: def.type,
      message0: def.message,
      args0: [{ type: 'input_statement', name: 'BODY' }],
      // setup と draw を縦に並べられるようにする
      previousStatement: null,
      nextStatement: null,
      colour: def.colour,
      tooltip: def.tooltip,
    })),
  ]);

  for (const def of P5_CALL_BLOCKS) {
    python.forBlock[def.type] = (block, generator) => {
      const args = def.args
        .map(arg => generator.valueToCode(block, arg.name, Order.NONE) || defaultFor(arg))
        .join(', ');
      // p5.js のリファレンスと同じ書き方（circle(...) や createCanvas(...)）で出す。
      // p5.circle(...) や create_canvas(...) と書かれたコードも、読みこむときは同じブロックになる。
      const code = `${pythonName(def)}(${args})`;
      return def.kind === 'value' ? [code, Order.FUNCTION_CALL] : `${code}\n`;
    };
  }

  for (const def of P5_NAME_BLOCKS) {
    python.forBlock[def.type] = () => [def.name, Order.ATOMIC];
  }
  python.forBlock['p5_constant'] = (b) => [b.getFieldValue('NAME') || 'CENTER', Order.ATOMIC];

  for (const def of DEF_BLOCKS) {
    python.forBlock[def.type] = (block, generator) => {
      const body = generator.statementToCode(block, 'BODY') || `${generator.INDENT}pass\n`;
      return `def ${def.name}():\n${body}`;
    };
  }
}

/** 引数のはじめの値 */
function defaultFor(arg) {
  if (arg.text !== undefined) return `'${arg.text}'`;
  if (arg.constant !== undefined) return arg.constant;
  return String(arg.shadow ?? 0);
}

/** ブロックから出す Python の名前（p5.js のリファレンスと同じつづり） */
function pythonName(def) {
  return def.py || toCamel(bareName(def.call));
}

/* ============================================================
 * 3. ツールボックス
 * ========================================================== */

const numberShadow = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const textShadow = (v) => ({ shadow: { type: 'text', fields: { TEXT: v } } });
const constantShadow = (v) => ({ shadow: { type: 'p5_constant', fields: { NAME: v } } });

/** 表のブロックをツールボックス用の形にする */
function toToolboxBlock(def) {
  const inputs = {};
  for (const arg of def.args) {
    inputs[arg.name] = arg.text !== undefined ? textShadow(arg.text)
      : arg.constant !== undefined ? constantShadow(arg.constant)
        : numberShadow(arg.shadow ?? 0);
  }
  return { kind: 'block', type: def.type, inputs };
}

/**
 * ツールボックスを組み立てる
 * @param {object} [options]
 * @param {boolean} [options.drawing] 描画カテゴリを入れるか
 * @returns {object}
 */
export function buildToolbox({ drawing = false } = {}) {
  const byType = (types) => types.map(type => toToolboxBlock(P5_CALL_BLOCKS.find(d => d.type === type)));
  const names = (types) => types.map(type => ({ kind: 'block', type }));
  const drawingCategories = drawing ? [
    {
      kind: 'category', name: 'しくみ', colour: '290',
      contents: [
        ...DEF_BLOCKS_CAMEL.map(def => ({ kind: 'block', type: def.type })),
        { kind: 'block', type: 'py_global' },
        ...byType(['p5_create_canvas', 'p5_frame_rate', 'p5_no_loop', 'p5_loop']),
        ...names(['p5_frame_count', 'p5_width', 'p5_height']),
      ],
    },
    {
      kind: 'category', name: 'かたち', colour: '200',
      contents: byType(['p5_circle', 'p5_ellipse', 'p5_ellipse3', 'p5_rect', 'p5_square', 'p5_line', 'p5_triangle',
        'p5_quad', 'p5_point', 'p5_arc', 'p5_begin_shape', 'p5_vertex', 'p5_end_shape', 'p5_end_shape_close',
        'p5_rect_mode', 'p5_ellipse_mode']),
    },
    {
      kind: 'category', name: 'いろ', colour: '20',
      contents: byType(['p5_background_gray', 'p5_background', 'p5_background_gray_alpha', 'p5_background_rgba',
        'p5_fill_gray', 'p5_fill', 'p5_fill_gray_alpha', 'p5_fill_rgba', 'p5_no_fill',
        'p5_stroke_gray', 'p5_stroke', 'p5_stroke_gray_alpha', 'p5_stroke_rgba', 'p5_no_stroke',
        'p5_stroke_weight', 'p5_stroke_cap']),
    },
    {
      kind: 'category', name: 'うごき', colour: '290',
      contents: [
        ...byType(['p5_push', 'p5_pop', 'p5_translate', 'p5_rotate', 'p5_scale', 'p5_scale1',
          'p5_reset_matrix', 'p5_angle_mode', 'p5_clear']),
        ...names(['p5_pi', 'p5_two_pi', 'p5_half_pi', 'p5_quarter_pi']),
        { kind: 'block', type: 'p5_constant' },
      ],
    },
    {
      kind: 'category', name: 'マウスとキー', colour: '200',
      contents: names(['p5_mouse_x', 'p5_mouse_y', 'p5_pmouse_x', 'p5_pmouse_y', 'p5_mouse_is_pressed',
        'p5_key', 'p5_key_code', 'p5_key_is_pressed']),
    },
    {
      kind: 'category', name: '計算と乱数', colour: '230',
      contents: byType(['p5_random', 'p5_random1', 'p5_random0', 'p5_random_seed', 'p5_noise', 'p5_noise2',
        'p5_map', 'p5_constrain', 'p5_lerp', 'p5_dist', 'p5_sin', 'p5_cos', 'p5_tan', 'p5_atan2',
        'p5_radians', 'p5_degrees', 'p5_sqrt', 'p5_sq', 'p5_floor', 'p5_ceil', 'p5_millis']),
    },
    {
      kind: 'category', name: 'もじ', colour: '160',
      contents: byType(['p5_text', 'p5_text_size', 'p5_text_align', 'p5_text_align2']),
    },
  ] : [];

  return {
    kind: 'categoryToolbox',
    contents: [
      ...drawingCategories,
      {
        kind: 'category', name: '入出力', colour: '160',
        contents: [
          { kind: 'block', type: 'text_print', inputs: { TEXT: textShadow('こんにちは') } },
          { kind: 'block', type: 'py_print_two' },
          { kind: 'block', type: 'py_print_end', inputs: { TEXT: textShadow('*') } },
          { kind: 'block', type: 'py_newline' },
          { kind: 'block', type: 'py_input', inputs: { PROMPT: textShadow('入力してください: ') } },
          { kind: 'block', type: 'py_to_int' },
          { kind: 'block', type: 'py_to_float' },
          { kind: 'block', type: 'py_to_text' },
        ],
      },
      {
        kind: 'category', name: '制御', colour: '210',
        contents: [
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'controls_if', extraState: { elseIfCount: 0, hasElse: true } },
          { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: numberShadow(10) } },
          { kind: 'block', type: 'controls_whileUntil' },
          {
            kind: 'block', type: 'controls_for',
            inputs: { FROM: numberShadow(1), TO: numberShadow(10), BY: numberShadow(1) },
          },
          { kind: 'block', type: 'controls_forEach' },
          { kind: 'block', type: 'controls_flow_statements' },
        ],
      },
      {
        kind: 'category', name: '論理', colour: '210',
        contents: [
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'logic_ternary' },
          { kind: 'block', type: 'logic_null' },
        ],
      },
      {
        kind: 'category', name: '数', colour: '230',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic', inputs: { A: numberShadow(1), B: numberShadow(1) } },
          { kind: 'block', type: 'math_single', inputs: { NUM: numberShadow(9) } },
          { kind: 'block', type: 'math_round', inputs: { NUM: numberShadow(3.1) } },
          { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: numberShadow(64), DIVISOR: numberShadow(10) } },
          { kind: 'block', type: 'py_floor_div', inputs: { A: numberShadow(7), B: numberShadow(2) } },
          { kind: 'block', type: 'math_number_property', inputs: { NUMBER_TO_CHECK: numberShadow(0) } },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: numberShadow(1), TO: numberShadow(100) } },
          { kind: 'block', type: 'math_constant' },
        ],
      },
      {
        kind: 'category', name: '文字', colour: '160',
        contents: [
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'text_join' },
          { kind: 'block', type: 'py_join', inputs: { A: textShadow('点数: '), B: textShadow('10') } },
          { kind: 'block', type: 'text_length', inputs: { VALUE: textShadow('abc') } },
          { kind: 'block', type: 'text_isEmpty', inputs: { VALUE: textShadow('') } },
          { kind: 'block', type: 'text_indexOf', inputs: { VALUE: textShadow('abc') } },
          { kind: 'block', type: 'text_charAt' },
          { kind: 'block', type: 'text_changeCase', inputs: { TEXT: textShadow('abc') } },
          { kind: 'block', type: 'text_trim', inputs: { TEXT: textShadow(' abc ') } },
        ],
      },
      {
        kind: 'category', name: 'リスト', colour: '260',
        contents: [
          { kind: 'block', type: 'lists_create_with', extraState: { itemCount: 0 } },
          { kind: 'block', type: 'lists_create_with' },
          { kind: 'block', type: 'lists_repeat', inputs: { NUM: numberShadow(5) } },
          { kind: 'block', type: 'lists_length' },
          { kind: 'block', type: 'py_index' },
          { kind: 'block', type: 'py_append' },
          { kind: 'block', type: 'math_on_list' },
          { kind: 'block', type: 'lists_isEmpty' },
          { kind: 'block', type: 'lists_indexOf' },
          { kind: 'block', type: 'lists_getIndex' },
          { kind: 'block', type: 'lists_setIndex' },
          { kind: 'block', type: 'lists_getSublist' },
          { kind: 'block', type: 'lists_sort' },
          { kind: 'block', type: 'lists_split', inputs: { DELIM: textShadow(',') } },
        ],
      },
      { kind: 'category', name: '変数', colour: '330', custom: 'VARIABLE' },
      {
        kind: 'category', name: '関数', colour: '290',
        contents: [
          { kind: 'block', type: 'py_def' },
          { kind: 'block', type: 'py_return' },
          { kind: 'block', type: 'py_return_none' },
          { kind: 'block', type: 'py_pass' },
          { kind: 'block', type: 'py_call_0' },
          { kind: 'block', type: 'py_call_1' },
          { kind: 'block', type: 'py_call_2' },
          { kind: 'block', type: 'py_callv_1' },
          { kind: 'block', type: 'py_callv_2' },
        ],
      },
      {
        kind: 'category', name: 'その他', colour: '60',
        contents: [
          { kind: 'block', type: 'py_comment' },
          { kind: 'block', type: 'py_global' },
          { kind: 'block', type: 'py_raw' },
          { kind: 'block', type: 'py_raw_value' },
        ],
      },
    ],
  };
}

/* ============================================================
 * 4. Python から読み取るための索引
 * ========================================================== */

/** p5.circle -> circle */
function bareName(call) {
  return call.startsWith('p5.') ? call.slice(3) : call;
}

/** stroke_weight -> strokeWeight（p5.js と同じつづり） */
function toCamel(name) {
  const [head, ...rest] = name.split('_');
  return head + rest.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/**
 * 呼び出し名 → ブロック定義（py2blocks.js が使う）
 *
 * 描画モードでは p5.circle(...) と circle(...) と circle(...) の camelCase、
 * どの書き方でも同じブロックになるようにしておく。
 * p5.js のリファレンスから写したコードも、そのままブロックになってほしいため。
 */
export const CALL_BLOCK_INDEX = new Map();

for (const def of P5_CALL_BLOCKS) {
  const bare = def.call.startsWith('p5.') ? def.call.slice(3) : def.call;
  const names = new Set([def.call, bare, toCamel(bare), pythonName(def)]);
  // Processing のつづり size(400, 400) も、同じブロックとして受ける
  if (bare === 'create_canvas') names.add('size');
  for (const name of names) {
    CALL_BLOCK_INDEX.set(`${name}/${def.args.length}`, def);
  }
}

/** 名前 → ブロック定義（frameCount や mouseX など。mouse_x のような別のつづりも） */
export const NAME_BLOCK_INDEX = new Map(
  P5_NAME_BLOCKS.flatMap(def => [def.name, ...(def.aliases || [])].map(name => [name, def])),
);

/** 決まった言葉（CENTER など） */
export const CONSTANT_NAMES = new Set(P5_CONSTANTS.map(([name]) => name));

/** 関数名 → ブロック定義（setup / draw / mousePressed など） */
export const DEF_BLOCK_INDEX = new Map(DEF_BLOCKS.map(def => [def.name, def]));
