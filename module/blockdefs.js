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
  { type: 'p5_circle', call: 'p5.circle', kind: 'statement', colour: 200, tooltip: '円をかきます',
    message: '円 中心x %1 中心y %2 直径 %3',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'D', shadow: 80 }] },
  { type: 'p5_ellipse', call: 'p5.ellipse', kind: 'statement', colour: 200, tooltip: '楕円をかきます',
    message: '楕円 中心x %1 中心y %2 横 %3 縦 %4',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'W', shadow: 120 }, { name: 'H', shadow: 80 }] },
  { type: 'p5_rect', call: 'p5.rect', kind: 'statement', colour: 200, tooltip: '四角形をかきます',
    message: '四角 左上x %1 左上y %2 幅 %3 高さ %4',
    args: [{ name: 'X', shadow: 100 }, { name: 'Y', shadow: 100 }, { name: 'W', shadow: 120 }, { name: 'H', shadow: 80 }] },
  { type: 'p5_square', call: 'p5.square', kind: 'statement', colour: 200, tooltip: '正方形をかきます',
    message: '正方形 左上x %1 左上y %2 一辺 %3',
    args: [{ name: 'X', shadow: 150 }, { name: 'Y', shadow: 150 }, { name: 'S', shadow: 80 }] },
  { type: 'p5_line', call: 'p5.line', kind: 'statement', colour: 200, tooltip: '線をひきます',
    message: '線 始点x %1 始点y %2 終点x %3 終点y %4',
    args: [{ name: 'X1', shadow: 50 }, { name: 'Y1', shadow: 50 }, { name: 'X2', shadow: 350 }, { name: 'Y2', shadow: 350 }] },
  { type: 'p5_triangle', call: 'p5.triangle', kind: 'statement', colour: 200, tooltip: '三角形をかきます',
    message: '三角 %1 %2 / %3 %4 / %5 %6',
    args: [{ name: 'X1', shadow: 200 }, { name: 'Y1', shadow: 100 }, { name: 'X2', shadow: 150 },
           { name: 'Y2', shadow: 250 }, { name: 'X3', shadow: 250 }, { name: 'Y3', shadow: 250 }] },
  { type: 'p5_point', call: 'p5.point', kind: 'statement', colour: 200, tooltip: '点をうちます',
    message: '点 x %1 y %2',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }] },
  { type: 'p5_arc', call: 'p5.arc', kind: 'statement', colour: 200, tooltip: '弧をかきます（角度はラジアン）',
    message: '弧 中心x %1 中心y %2 横 %3 縦 %4 開始 %5 終了 %6',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }, { name: 'W', shadow: 120 },
           { name: 'H', shadow: 120 }, { name: 'A1', shadow: 0 }, { name: 'A2', shadow: 3.14 }] },

  // --- いろ ---
  { type: 'p5_background', call: 'p5.background', kind: 'statement', colour: 20, tooltip: '背景の色を決めます',
    message: '背景色 赤 %1 緑 %2 青 %3',
    args: [{ name: 'R', shadow: 240 }, { name: 'G', shadow: 240 }, { name: 'B', shadow: 250 }] },
  { type: 'p5_fill', call: 'p5.fill', kind: 'statement', colour: 20, tooltip: '塗りつぶしの色を決めます',
    message: '塗り色 赤 %1 緑 %2 青 %3',
    args: [{ name: 'R', shadow: 255 }, { name: 'G', shadow: 100 }, { name: 'B', shadow: 100 }] },
  { type: 'p5_no_fill', call: 'p5.no_fill', kind: 'statement', colour: 20, tooltip: '塗りつぶしをやめます',
    message: '塗りつぶしなし', args: [] },
  { type: 'p5_stroke', call: 'p5.stroke', kind: 'statement', colour: 20, tooltip: '輪郭の色を決めます',
    message: '線の色 赤 %1 緑 %2 青 %3',
    args: [{ name: 'R', shadow: 60 }, { name: 'G', shadow: 60 }, { name: 'B', shadow: 90 }] },
  { type: 'p5_no_stroke', call: 'p5.no_stroke', kind: 'statement', colour: 20, tooltip: '輪郭をやめます',
    message: '輪郭なし', args: [] },
  { type: 'p5_stroke_weight', call: 'p5.stroke_weight', kind: 'statement', colour: 20, tooltip: '線の太さを決めます',
    message: '線の太さ %1', args: [{ name: 'W', shadow: 3 }] },

  // --- もじ ---
  { type: 'p5_text', call: 'p5.text', kind: 'statement', colour: 160, tooltip: '文字をかきます',
    message: '文字 %1 を x %2 y %3 に',
    args: [{ name: 'T', text: 'Hello' }, { name: 'X', shadow: 100 }, { name: 'Y', shadow: 100 }] },
  { type: 'p5_text_size', call: 'p5.text_size', kind: 'statement', colour: 160, tooltip: '文字の大きさを決めます',
    message: '文字の大きさ %1', args: [{ name: 'S', shadow: 24 }] },

  // --- へんかん ---
  { type: 'p5_push', call: 'p5.push', kind: 'statement', colour: 290, tooltip: '今の状態を保存します',
    message: '状態を保存', args: [] },
  { type: 'p5_pop', call: 'p5.pop', kind: 'statement', colour: 290, tooltip: '保存した状態に戻します',
    message: '状態を戻す', args: [] },
  { type: 'p5_translate', call: 'p5.translate', kind: 'statement', colour: 290, tooltip: '原点を動かします',
    message: '原点を動かす x %1 y %2',
    args: [{ name: 'X', shadow: 200 }, { name: 'Y', shadow: 200 }] },
  { type: 'p5_rotate', call: 'p5.rotate', kind: 'statement', colour: 290, tooltip: '回転します（ラジアン）',
    message: '回転する %1', args: [{ name: 'A', shadow: 0.785 }] },
  { type: 'p5_scale', call: 'p5.scale', kind: 'statement', colour: 290, tooltip: '拡大・縮小します',
    message: '拡大 横 %1 倍 縦 %2 倍',
    args: [{ name: 'X', shadow: 2 }, { name: 'Y', shadow: 2 }] },
  { type: 'p5_clear', call: 'p5.clear', kind: 'statement', colour: 290, tooltip: 'キャンバスを消します',
    message: 'キャンバスを消す', args: [] },
  { type: 'p5_reset_matrix', call: 'p5.reset_matrix', kind: 'statement', colour: 290,
    tooltip: '移動・回転・拡大をすべて元にもどします',
    message: '座標を元にもどす', args: [] },

  // --- 値として使うもの ---
  { type: 'p5_random', call: 'random', kind: 'value', output: 'Number', colour: 230,
    tooltip: '最小値から最大値までのランダムな数',
    message: 'ランダムな数 %1 〜 %2',
    args: [{ name: 'A', shadow: 0 }, { name: 'B', shadow: 400 }] },
  { type: 'p5_map', call: 'map_value', kind: 'value', output: 'Number', colour: 230,
    tooltip: '値の範囲を変換します',
    message: '%1 を %2 〜 %3 から %4 〜 %5 に変換',
    args: [{ name: 'V', shadow: 100 }, { name: 'A1', shadow: 0 }, { name: 'A2', shadow: 400 },
           { name: 'B1', shadow: 0 }, { name: 'B2', shadow: 100 }] },
  { type: 'p5_cos', call: 'cos', kind: 'value', output: 'Number', colour: 230,
    tooltip: 'コサイン（ラジアン）', message: 'cos %1', args: [{ name: 'A', shadow: 0 }] },
  { type: 'p5_sin', call: 'sin', kind: 'value', output: 'Number', colour: 230,
    tooltip: 'サイン（ラジアン）', message: 'sin %1', args: [{ name: 'A', shadow: 0 }] },
];

/** 名前だけの値ブロック（変数のように使う） */
export const P5_NAME_BLOCKS = [
  { type: 'p5_frame_count', name: 'frameCount', label: 'フレーム数', colour: 230, output: 'Number',
    tooltip: 'アニメーションが始まってからのコマ数' },
  { type: 'p5_width', name: 'p5.width', label: 'キャンバスの幅', colour: 230, output: 'Number',
    tooltip: 'キャンバスの横の大きさ' },
  { type: 'p5_height', name: 'p5.height', label: 'キャンバスの高さ', colour: 230, output: 'Number',
    tooltip: 'キャンバスの縦の大きさ' },
  { type: 'p5_pi', name: 'PI', label: '円周率 π', colour: 230, output: 'Number',
    tooltip: '約 3.14159' },
];

/** def setup(): / def draw(): をそのままブロックにしたもの */
export const DEF_BLOCKS = [
  { type: 'p5_setup', name: 'setup', message: '最初に1回だけ %1', colour: 340,
    tooltip: 'ページを開いたときに1回だけ実行されます' },
  { type: 'p5_draw', name: 'draw', message: 'くり返し描く %1', colour: 340,
    tooltip: '1秒に何十回もくり返し実行されます（アニメーション）' },
];

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
  if (!python.__easycodeInit) {
    const originalInit = python.init.bind(python);
    python.init = function (workspace) {
      originalInit(workspace);
      delete this.definitions_['variables'];
    };
    python.__easycodeInit = true;
  }

  // --- どのモードでも使う基本ブロック ---
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'py_input',
      message0: 'キーボードから入力 %1',
      args0: [{ type: 'input_value', name: 'PROMPT' }],
      output: 'String', colour: 160, inputsInline: true,
      tooltip: 'input() でキーボードから文字列を受け取ります',
    },
    {
      type: 'py_to_int', message0: '整数にする %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'Number', colour: 230, inputsInline: true, tooltip: 'int() で整数に変換します',
    },
    {
      type: 'py_to_float', message0: '小数にする %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'Number', colour: 230, inputsInline: true, tooltip: 'float() で小数に変換します',
    },
    {
      type: 'py_to_text', message0: '文字列にする %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'String', colour: 160, inputsInline: true, tooltip: 'str() で文字列に変換します',
    },
    {
      type: 'py_comment', message0: 'メモ %1',
      args0: [{ type: 'field_input', name: 'TEXT', text: 'ここに説明' }],
      previousStatement: null, nextStatement: null, colour: 60,
      tooltip: 'Python のコメント（# ...）になります',
    },
    {
      type: 'py_raw', message0: 'Python %1',
      args0: [{ type: 'field_input', name: 'CODE', text: 'print("hello")' }],
      previousStatement: null, nextStatement: null, colour: 60,
      tooltip: 'Python のコードを1行そのまま書きます',
    },
    {
      type: 'py_raw_value', message0: 'Python %1',
      args0: [{ type: 'field_input', name: 'CODE', text: 'x' }],
      output: null, colour: 60, tooltip: 'Python の式をそのまま書きます',
    },
  ]);

  const Order = (typeof python !== 'undefined' && window.python && window.python.Order) ||
    { NONE: 99, FUNCTION_CALL: 2, ATOMIC: 0 };

  const value = (block, generator, name, fallback) =>
    generator.valueToCode(block, name, Order.NONE) || fallback;

  python.forBlock['py_input'] = (b, g) => [`input(${value(b, g, 'PROMPT', "''")})`, Order.FUNCTION_CALL];
  python.forBlock['py_to_int'] = (b, g) => [`int(${value(b, g, 'VALUE', '0')})`, Order.FUNCTION_CALL];
  python.forBlock['py_to_float'] = (b, g) => [`float(${value(b, g, 'VALUE', '0')})`, Order.FUNCTION_CALL];
  python.forBlock['py_to_text'] = (b, g) => [`str(${value(b, g, 'VALUE', "''")})`, Order.FUNCTION_CALL];
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
      // p5.js のリファレンスと同じ書き方（circle(...)）で出す。
      // p5.circle(...) と書かれたコードも、読みこむときは同じブロックになる。
      const code = `${bareName(def.call)}(${args})`;
      return def.kind === 'value' ? [code, Order.FUNCTION_CALL] : `${code}\n`;
    };
  }

  for (const def of P5_NAME_BLOCKS) {
    python.forBlock[def.type] = () => [def.name, Order.ATOMIC];
  }

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
  return String(arg.shadow ?? 0);
}

/* ============================================================
 * 3. ツールボックス
 * ========================================================== */

const numberShadow = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const textShadow = (v) => ({ shadow: { type: 'text', fields: { TEXT: v } } });

/** 表のブロックをツールボックス用の形にする */
function toToolboxBlock(def) {
  const inputs = {};
  for (const arg of def.args) {
    inputs[arg.name] = arg.text !== undefined ? textShadow(arg.text) : numberShadow(arg.shadow ?? 0);
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
  const drawingCategories = drawing ? [
    {
      kind: 'category', name: '🎨 かたち', colour: '200',
      contents: ['p5_circle', 'p5_ellipse', 'p5_rect', 'p5_square', 'p5_line', 'p5_triangle', 'p5_point', 'p5_arc']
        .map(type => toToolboxBlock(P5_CALL_BLOCKS.find(d => d.type === type))),
    },
    {
      kind: 'category', name: '🖌 いろ', colour: '20',
      contents: ['p5_background', 'p5_fill', 'p5_no_fill', 'p5_stroke', 'p5_no_stroke', 'p5_stroke_weight']
        .map(type => toToolboxBlock(P5_CALL_BLOCKS.find(d => d.type === type))),
    },
    {
      kind: 'category', name: '🔄 うごき', colour: '290',
      contents: [
        ...DEF_BLOCKS.map(def => ({ kind: 'block', type: def.type })),
        ...['p5_push', 'p5_pop', 'p5_translate', 'p5_rotate', 'p5_scale', 'p5_reset_matrix', 'p5_clear']
          .map(type => toToolboxBlock(P5_CALL_BLOCKS.find(d => d.type === type))),
        ...P5_NAME_BLOCKS.map(def => ({ kind: 'block', type: def.type })),
        ...['p5_random', 'p5_map', 'p5_cos', 'p5_sin']
          .map(type => toToolboxBlock(P5_CALL_BLOCKS.find(d => d.type === type))),
      ],
    },
    {
      kind: 'category', name: '🔠 もじ', colour: '160',
      contents: ['p5_text', 'p5_text_size']
        .map(type => toToolboxBlock(P5_CALL_BLOCKS.find(d => d.type === type))),
    },
  ] : [];

  return {
    kind: 'categoryToolbox',
    contents: [
      ...drawingCategories,
      {
        kind: 'category', name: '🖨 入出力', colour: '160',
        contents: [
          { kind: 'block', type: 'text_print', inputs: { TEXT: textShadow('こんにちは') } },
          { kind: 'block', type: 'py_input', inputs: { PROMPT: textShadow('入力してください: ') } },
          { kind: 'block', type: 'py_to_int' },
          { kind: 'block', type: 'py_to_float' },
          { kind: 'block', type: 'py_to_text' },
        ],
      },
      {
        kind: 'category', name: '🔁 制御', colour: '210',
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
        kind: 'category', name: '⚖️ 論理', colour: '210',
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
        kind: 'category', name: '🔢 数', colour: '230',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic', inputs: { A: numberShadow(1), B: numberShadow(1) } },
          { kind: 'block', type: 'math_single', inputs: { NUM: numberShadow(9) } },
          { kind: 'block', type: 'math_round', inputs: { NUM: numberShadow(3.1) } },
          { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: numberShadow(64), DIVISOR: numberShadow(10) } },
          { kind: 'block', type: 'math_number_property', inputs: { NUMBER_TO_CHECK: numberShadow(0) } },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: numberShadow(1), TO: numberShadow(100) } },
          { kind: 'block', type: 'math_constant' },
        ],
      },
      {
        kind: 'category', name: '🔤 文字', colour: '160',
        contents: [
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'text_join' },
          { kind: 'block', type: 'text_length', inputs: { VALUE: textShadow('abc') } },
          { kind: 'block', type: 'text_isEmpty', inputs: { VALUE: textShadow('') } },
          { kind: 'block', type: 'text_indexOf', inputs: { VALUE: textShadow('abc') } },
          { kind: 'block', type: 'text_charAt' },
          { kind: 'block', type: 'text_changeCase', inputs: { TEXT: textShadow('abc') } },
          { kind: 'block', type: 'text_trim', inputs: { TEXT: textShadow(' abc ') } },
        ],
      },
      {
        kind: 'category', name: '📋 リスト', colour: '260',
        contents: [
          { kind: 'block', type: 'lists_create_with', extraState: { itemCount: 0 } },
          { kind: 'block', type: 'lists_create_with' },
          { kind: 'block', type: 'lists_repeat', inputs: { NUM: numberShadow(5) } },
          { kind: 'block', type: 'lists_length' },
          { kind: 'block', type: 'lists_isEmpty' },
          { kind: 'block', type: 'lists_indexOf' },
          { kind: 'block', type: 'lists_getIndex' },
          { kind: 'block', type: 'lists_setIndex' },
          { kind: 'block', type: 'lists_getSublist' },
          { kind: 'block', type: 'lists_sort' },
          { kind: 'block', type: 'lists_split', inputs: { DELIM: textShadow(',') } },
        ],
      },
      { kind: 'category', name: '📦 変数', colour: '330', custom: 'VARIABLE' },
      { kind: 'category', name: '🧰 関数', colour: '290', custom: 'PROCEDURE' },
      {
        kind: 'category', name: '🐍 その他', colour: '60',
        contents: [
          { kind: 'block', type: 'py_comment' },
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
  const names = new Set([def.call, bare, toCamel(bare)]);
  for (const name of names) {
    CALL_BLOCK_INDEX.set(`${name}/${def.args.length}`, def);
  }
}

/** 名前 → ブロック定義（frameCount など） */
export const NAME_BLOCK_INDEX = new Map(P5_NAME_BLOCKS.map(def => [def.name, def]));

/** 関数名 → ブロック定義（setup / draw） */
export const DEF_BLOCK_INDEX = new Map(DEF_BLOCKS.map(def => [def.name, def]));
