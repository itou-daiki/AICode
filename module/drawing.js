// module/drawing.js - 描画モード用のメインモジュール
import { appState } from './state.js';
import { reviewCode as aiReviewCode, fixCode as aiFixCode, callGemini } from './ai.js';

import { CodeCompletionEngine } from './completion.js';

let pyodide;
let editor;
let canvas;
let ctx;
let completionEngine; // コード補完エンジン

/**
 * Pythonコードを自動フォーマット
 * @param {CodeMirror} cm CodeMirrorインスタンス
 */
function formatCode(cm) {
  const code = cm.getValue();
  const lines = code.split('\n');
  const formattedLines = [];
  let indentLevel = 0;
  const indentUnit = cm.getOption('indentUnit') || 4;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 空行はそのまま
    if (trimmedLine === '') {
      formattedLines.push('');
      continue;
    }

    // dedentが必要な行（else, elif, except, finally等）
    const dedentKeywords = /^(else|elif|except|finally|case)/;
    if (dedentKeywords.test(trimmedLine) && indentLevel > 0) {
      indentLevel--;
    }

    // インデントを適用
    const indent = ' '.repeat(indentLevel * indentUnit);
    formattedLines.push(indent + trimmedLine);

    // インデントを増やす必要がある行（コロンで終わる行）
    if (trimmedLine.endsWith(':')) {
      indentLevel++;
    }

    // returnやbreakなど、ブロックを終了するキーワード
    // ただし、次の行がdedentキーワードでない場合のみ
    const blockEndKeywords = /^(return|break|continue|pass|raise)\b/;
    if (blockEndKeywords.test(trimmedLine)) {
      // 次の行をチェック
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (!dedentKeywords.test(nextLine) && nextLine !== '' && indentLevel > 0) {
          // 次の行がdedentキーワードでもなく、空行でもない場合は何もしない
        }
      }
    }

    // dedentが必要な行の後処理
    if (dedentKeywords.test(trimmedLine) && trimmedLine.endsWith(':')) {
      indentLevel++;
    }
  }

  // コードを置き換え
  const cursor = cm.getCursor();
  cm.setValue(formattedLines.join('\n'));
  cm.setCursor(cursor);
}

/**
 * タブキーの動作を改善
 * 選択範囲がある場合はインデント、ない場合は通常のタブ
 * @param {CodeMirror} cm CodeMirrorインスタンス
 */
function betterTab(cm) {
  if (cm.somethingSelected()) {
    cm.indentSelection('add');
  } else {
    cm.replaceSelection('    ', 'end');
  }
}

// p5.jsライクな描画ライブラリをPythonで実装
const P5_PYTHON_LIBRARY = `
import math
import random as _random

# p5.js定数
PI = math.pi
TWO_PI = math.pi * 2
HALF_PI = math.pi / 2
QUARTER_PI = math.pi / 4

class P5:
    def __init__(self, canvas_id='canvas'):
        import js
        self.canvas = js.document.getElementById(canvas_id)
        self.ctx = self.canvas.getContext('2d')
        self.width = self.canvas.width
        self.height = self.canvas.height

        # デフォルト設定
        self.fill_color = 'black'
        self.stroke_color = 'black'
        self.stroke_width = 1
        self.no_fill_flag = False
        self.no_stroke_flag = False

        # 角度モード（度数法/ラジアン）
        self.angle_mode = 'radians'

        # 描画モード
        self.rect_mode = 'corner'  # corner, center, corners, radius
        self.ellipse_mode = 'center'  # center, radius, corner, corners

        # カスタム形状用
        self.vertices = []
        self.is_shape_open = False

        # テキスト設定
        self.text_align_horizontal = 'left'  # left, center, right
        self.text_align_vertical = 'baseline'  # top, bottom, middle, baseline
        self.text_leading_value = 0  # 行間

        # 線の設定
        self.stroke_cap_style = 'butt'  # butt, round, square
        self.stroke_join_style = 'miter'  # miter, bevel, round

        # 色モード
        self.color_mode = 'rgb'  # rgb or hsb
        self.color_max_values = [255, 255, 255, 255]  # RGBA最大値

        # フレーム数とタイマー
        self.frame_count = 0
        self.start_time = None
        
    def clear(self):
        """キャンバスをクリア"""
        self.ctx.clearRect(0, 0, self.width, self.height)
        
    def background(self, r, g=None, b=None):
        """背景色を設定"""
        if g is None and b is None:
            # グレースケール
            color = f'rgb({r},{r},{r})'
        else:
            color = f'rgb({r},{g},{b})'
        self.ctx.fillStyle = color
        self.ctx.fillRect(0, 0, self.width, self.height)
        
    def fill(self, r, g=None, b=None, a=None):
        """塗りつぶし色を設定"""
        if g is None and b is None:
            # グレースケール
            if a is not None:
                self.fill_color = f'rgba({r},{r},{r},{a/255})'
            else:
                self.fill_color = f'rgb({r},{r},{r})'
        else:
            if a is not None:
                self.fill_color = f'rgba({r},{g},{b},{a/255})'
            else:
                self.fill_color = f'rgb({r},{g},{b})'
        self.no_fill_flag = False

    def no_fill(self):
        """塗りつぶしを無効にする"""
        self.no_fill_flag = True
        
    def stroke(self, r, g=None, b=None, a=None):
        """輪郭色を設定"""
        if g is None and b is None:
            # グレースケール
            if a is not None:
                self.stroke_color = f'rgba({r},{r},{r},{a/255})'
            else:
                self.stroke_color = f'rgb({r},{r},{r})'
        else:
            if a is not None:
                self.stroke_color = f'rgba({r},{g},{b},{a/255})'
            else:
                self.stroke_color = f'rgb({r},{g},{b})'
        self.no_stroke_flag = False

    def no_stroke(self):
        """輪郭を無効にする"""
        self.no_stroke_flag = True
        
    def stroke_weight(self, weight):
        """輪郭の太さを設定"""
        self.stroke_width = weight
        
    def circle(self, x, y, diameter):
        """円を描画"""
        radius = diameter / 2
        self.ctx.beginPath()
        self.ctx.arc(x, y, radius, 0, 2 * math.pi)

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def ellipse(self, x, y, width, height=None):
        """楕円を描画"""
        if height is None:
            height = width

        # ellipseModeに応じて座標を調整
        if self.ellipse_mode == 'center':
            cx, cy = x, y
            w, h = width, height
        elif self.ellipse_mode == 'radius':
            cx, cy = x, y
            w, h = width * 2, height * 2
        elif self.ellipse_mode == 'corner':
            cx, cy = x + width / 2, y + height / 2
            w, h = width, height
        elif self.ellipse_mode == 'corners':
            cx, cy = (x + width) / 2, (y + height) / 2
            w, h = abs(width - x), abs(height - y)

        self.ctx.save()
        self.ctx.beginPath()
        self.ctx.translate(cx, cy)
        self.ctx.scale(w/2, h/2)
        self.ctx.arc(0, 0, 1, 0, 2 * math.pi)
        self.ctx.restore()

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def rect(self, x, y, width, height=None, tl=0, tr=0, br=0, bl=0):
        """四角形を描画（角の丸みオプション付き）"""
        if height is None:
            height = width

        # rectModeに応じて座標を調整
        if self.rect_mode == 'corner':
            rx, ry = x, y
            rw, rh = width, height
        elif self.rect_mode == 'center':
            rx, ry = x - width / 2, y - height / 2
            rw, rh = width, height
        elif self.rect_mode == 'radius':
            rx, ry = x - width, y - height
            rw, rh = width * 2, height * 2
        elif self.rect_mode == 'corners':
            rx, ry = x, y
            rw, rh = width - x, height - y

        # 角丸がある場合
        if tl > 0 or tr > 0 or br > 0 or bl > 0:
            self.ctx.beginPath()
            self.ctx.moveTo(rx + tl, ry)
            self.ctx.lineTo(rx + rw - tr, ry)
            if tr > 0:
                self.ctx.arcTo(rx + rw, ry, rx + rw, ry + tr, tr)
            self.ctx.lineTo(rx + rw, ry + rh - br)
            if br > 0:
                self.ctx.arcTo(rx + rw, ry + rh, rx + rw - br, ry + rh, br)
            self.ctx.lineTo(rx + bl, ry + rh)
            if bl > 0:
                self.ctx.arcTo(rx, ry + rh, rx, ry + rh - bl, bl)
            self.ctx.lineTo(rx, ry + tl)
            if tl > 0:
                self.ctx.arcTo(rx, ry, rx + tl, ry, tl)
            self.ctx.closePath()

            if not self.no_fill_flag:
                self.ctx.fillStyle = self.fill_color
                self.ctx.fill()

            if not self.no_stroke_flag:
                self.ctx.strokeStyle = self.stroke_color
                self.ctx.lineWidth = self.stroke_width
                self.ctx.stroke()
        else:
            # 通常の四角形
            if not self.no_fill_flag:
                self.ctx.fillStyle = self.fill_color
                self.ctx.fillRect(rx, ry, rw, rh)

            if not self.no_stroke_flag:
                self.ctx.strokeStyle = self.stroke_color
                self.ctx.lineWidth = self.stroke_width
                self.ctx.strokeRect(rx, ry, rw, rh)

    def square(self, x, y, size):
        """正方形を描画"""
        self.rect(x, y, size, size)
            
    def line(self, x1, y1, x2, y2):
        """線を描画"""
        self.ctx.beginPath()
        self.ctx.moveTo(x1, y1)
        self.ctx.lineTo(x2, y2)
        self.ctx.strokeStyle = self.stroke_color
        self.ctx.lineWidth = self.stroke_width
        self.ctx.stroke()
        
    def point(self, x, y):
        """点を描画"""
        self.ctx.fillStyle = self.stroke_color
        self.ctx.fillRect(x, y, 1, 1)
        
    def triangle(self, x1, y1, x2, y2, x3, y3):
        """三角形を描画"""
        self.ctx.beginPath()
        self.ctx.moveTo(x1, y1)
        self.ctx.lineTo(x2, y2)
        self.ctx.lineTo(x3, y3)
        self.ctx.closePath()

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def quad(self, x1, y1, x2, y2, x3, y3, x4, y4):
        """四角形（任意の4点）を描画"""
        self.ctx.beginPath()
        self.ctx.moveTo(x1, y1)
        self.ctx.lineTo(x2, y2)
        self.ctx.lineTo(x3, y3)
        self.ctx.lineTo(x4, y4)
        self.ctx.closePath()

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def arc(self, x, y, width, height, start_angle, end_angle):
        """弧を描画"""
        if self.angle_mode == 'degrees':
            start_angle = math.radians(start_angle)
            end_angle = math.radians(end_angle)

        self.ctx.save()
        self.ctx.beginPath()
        self.ctx.translate(x, y)
        self.ctx.scale(width/2, height/2)
        self.ctx.arc(0, 0, 1, start_angle, end_angle)
        self.ctx.restore()

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def text(self, text_string, x, y):
        """テキストを描画"""
        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fillText(str(text_string), x, y)

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.strokeText(str(text_string), x, y)
            
    def text_size(self, size):
        """テキストサイズを設定"""
        self.ctx.font = f'{size}px Arial'

    def text_align(self, horizontal, vertical='baseline'):
        """テキストの配置を設定"""
        self.text_align_horizontal = horizontal
        self.text_align_vertical = vertical

        # Canvas APIに適用
        if horizontal == 'left':
            self.ctx.textAlign = 'left'
        elif horizontal == 'center':
            self.ctx.textAlign = 'center'
        elif horizontal == 'right':
            self.ctx.textAlign = 'right'

        if vertical == 'top':
            self.ctx.textBaseline = 'top'
        elif vertical == 'bottom':
            self.ctx.textBaseline = 'bottom'
        elif vertical == 'middle':
            self.ctx.textBaseline = 'middle'
        elif vertical == 'baseline':
            self.ctx.textBaseline = 'alphabetic'

    def text_width(self, text_string):
        """テキストの幅を取得"""
        metrics = self.ctx.measureText(str(text_string))
        return metrics.width

    def text_leading(self, leading):
        """テキストの行間を設定"""
        self.text_leading_value = leading

    def stroke_cap(self, cap):
        """線の端のスタイルを設定 ('butt', 'round', 'square')"""
        if cap in ['butt', 'round', 'square']:
            self.stroke_cap_style = cap
            self.ctx.lineCap = cap

    def stroke_join(self, join):
        """線の接合部のスタイルを設定 ('miter', 'bevel', 'round')"""
        if join in ['miter', 'bevel', 'round']:
            self.stroke_join_style = join
            self.ctx.lineJoin = join

    def color_mode(self, mode, max1=255, max2=255, max3=255, max4=255):
        """色モードを設定 ('rgb' or 'hsb')"""
        if mode in ['rgb', 'hsb']:
            self.color_mode = mode
            self.color_max_values = [max1, max2, max3, max4]

    def get_pixel(self, x, y):
        """指定位置のピクセル色を取得 [r, g, b, a]"""
        pixel_data = self.ctx.getImageData(x, y, 1, 1).data
        return [pixel_data[0], pixel_data[1], pixel_data[2], pixel_data[3]]
        
    def push(self):
        """現在の描画設定を保存"""
        self.ctx.save()
        
    def pop(self):
        """保存された描画設定を復元"""
        self.ctx.restore()
        
    def translate(self, x, y):
        """座標系を移動"""
        self.ctx.translate(x, y)
        
    def rotate(self, angle):
        """座標系を回転"""
        if self.angle_mode == 'degrees':
            import math
            angle = math.radians(angle)
        self.ctx.rotate(angle)
        
    def scale(self, x, y=None):
        """座標系をスケール"""
        if y is None:
            y = x
        self.ctx.scale(x, y)

    # モード設定関数
    def angle_mode(self, mode):
        """角度モードを設定 ('radians' または 'degrees')"""
        if mode in ['radians', 'degrees']:
            self.angle_mode = mode

    def rect_mode(self, mode):
        """四角形描画モードを設定 ('corner', 'center', 'radius', 'corners')"""
        if mode in ['corner', 'center', 'radius', 'corners']:
            self.rect_mode = mode

    def ellipse_mode(self, mode):
        """楕円描画モードを設定 ('center', 'radius', 'corner', 'corners')"""
        if mode in ['center', 'radius', 'corner', 'corners']:
            self.ellipse_mode = mode

    # カスタム形状描画
    def begin_shape(self):
        """カスタム形状の描画を開始"""
        self.vertices = []
        self.is_shape_open = True

    def vertex(self, x, y):
        """カスタム形状に頂点を追加"""
        if self.is_shape_open:
            self.vertices.append((x, y))

    def end_shape(self, close=None):
        """カスタム形状の描画を終了"""
        if not self.is_shape_open or len(self.vertices) < 2:
            return

        self.ctx.beginPath()
        self.ctx.moveTo(self.vertices[0][0], self.vertices[0][1])

        for i in range(1, len(self.vertices)):
            self.ctx.lineTo(self.vertices[i][0], self.vertices[i][1])

        if close == 'CLOSE':
            self.ctx.closePath()

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()

        self.vertices = []
        self.is_shape_open = False

    # 曲線描画
    def bezier(self, x1, y1, x2, y2, x3, y3, x4, y4):
        """ベジェ曲線を描画"""
        self.ctx.beginPath()
        self.ctx.moveTo(x1, y1)
        self.ctx.bezierCurveTo(x2, y2, x3, y3, x4, y4)

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()

    def curve(self, x1, y1, x2, y2, x3, y3, x4, y4):
        """カーディナルスプライン曲線を描画（簡易版）"""
        # 簡易的なカーブ実装（実際のp5.jsとは異なる可能性あり）
        self.ctx.beginPath()
        self.ctx.moveTo(x2, y2)

        # 制御点を使った曲線の近似
        cp1x = x2 + (x3 - x1) / 6
        cp1y = y2 + (y3 - y1) / 6
        cp2x = x3 - (x4 - x2) / 6
        cp2y = y3 - (y4 - y2) / 6

        self.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x3, y3)

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()

    def quadratic_vertex(self, cx, cy, x, y):
        """二次ベジェ曲線の頂点を追加（begin_shape内で使用）"""
        if self.is_shape_open:
            # 直接Canvas APIを使用
            if len(self.vertices) == 0:
                self.ctx.moveTo(x, y)
            else:
                self.ctx.quadraticCurveTo(cx, cy, x, y)
            self.vertices.append((x, y))

    def bezier_vertex(self, x2, y2, x3, y3, x4, y4):
        """三次ベジェ曲線の頂点を追加（begin_shape内で使用）"""
        if self.is_shape_open:
            # 直接Canvas APIを使用
            self.ctx.bezierCurveTo(x2, y2, x3, y3, x4, y4)
            self.vertices.append((x4, y4))

    def curve_vertex(self, x, y):
        """曲線の頂点を追加（begin_shape内で使用）"""
        if self.is_shape_open:
            self.vertices.append((x, y))

    # 追加の図形描画
    def polygon(self, *vertices):
        """多角形を描画（可変長引数で座標を指定）"""
        if len(vertices) < 3:
            return

        self.ctx.beginPath()
        # 頂点は (x1, y1, x2, y2, ...) の形式
        self.ctx.moveTo(vertices[0], vertices[1])
        for i in range(2, len(vertices), 2):
            self.ctx.lineTo(vertices[i], vertices[i+1])
        self.ctx.closePath()

        if not self.no_fill_flag:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()

        if not self.no_stroke_flag:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()

    def erase(self, alpha=255):
        """消しゴムモードを開始"""
        self.ctx.globalCompositeOperation = 'destination-out'

    def no_erase(self):
        """消しゴムモードを終了"""
        self.ctx.globalCompositeOperation = 'source-over'

    def blend_mode(self, mode):
        """ブレンドモードを設定"""
        blend_modes = {
            'blend': 'source-over',
            'add': 'lighter',
            'darkest': 'darken',
            'lightest': 'lighten',
            'difference': 'difference',
            'exclusion': 'exclusion',
            'multiply': 'multiply',
            'screen': 'screen',
            'overlay': 'overlay'
        }
        if mode in blend_modes:
            self.ctx.globalCompositeOperation = blend_modes[mode]

    def save_canvas(self, filename):
        """キャンバスを画像として保存（ブラウザのダウンロード）"""
        import js
        link = js.document.createElement('a')
        link.download = filename
        link.href = self.canvas.toDataURL()
        link.click()

# グローバルユーティリティ関数

# 乱数とノイズ
def random(low=None, high=None):
    """乱数を生成"""
    if low is None and high is None:
        return _random.random()
    elif high is None:
        return _random.random() * low
    else:
        return low + _random.random() * (high - low)

def random_seed(seed):
    """乱数のシードを設定"""
    _random.seed(seed)

def random_gaussian(mean=0, std=1):
    """ガウス分布に基づく乱数を生成"""
    return _random.gauss(mean, std)

# ノイズ関数（Perlin noise の簡易実装）
_noise_seed = 0
def noise(x, y=0, z=0):
    """Perlin noise（簡易版）"""
    # 簡易的なノイズ実装
    import math
    n = (math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1.0
    return abs(n)

def noise_seed(seed):
    """ノイズのシードを設定"""
    global _noise_seed
    _noise_seed = seed

# 数学関数
def map_value(value, start1, stop1, start2, stop2):
    """値を範囲変換"""
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1))

def constrain(value, min_val, max_val):
    """値を範囲内に制限"""
    return max(min_val, min(max_val, value))

def lerp(start, stop, amt):
    """線形補間"""
    return start + (stop - start) * amt

def norm(value, start, stop):
    """値を0-1の範囲に正規化"""
    return (value - start) / (stop - start)

def dist(x1, y1, x2=None, y2=None, z1=None, z2=None):
    """2点間の距離を計算"""
    if z1 is None:
        # 2D距離
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    else:
        # 3D距離
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)

def sq(n):
    """平方を計算"""
    return n * n

def sqrt(n):
    """平方根を計算"""
    return math.sqrt(n)

def pow(n, e):
    """べき乗を計算"""
    return n ** e

def exp(n):
    """指数関数"""
    return math.exp(n)

def log(n):
    """自然対数"""
    return math.log(n)

def abs(n):
    """絶対値"""
    return math.fabs(n)

def ceil(n):
    """切り上げ"""
    return math.ceil(n)

def floor(n):
    """切り捨て"""
    return math.floor(n)

def round(n, decimals=0):
    """四捨五入"""
    return __builtins__.round(n, decimals)

def min(*args):
    """最小値"""
    return __builtins__.min(*args)

def max(*args):
    """最大値"""
    return __builtins__.max(*args)

# 三角関数
def sin(angle):
    """サイン"""
    return math.sin(angle)

def cos(angle):
    """コサイン"""
    return math.cos(angle)

def tan(angle):
    """タンジェント"""
    return math.tan(angle)

def asin(value):
    """アークサイン"""
    return math.asin(value)

def acos(value):
    """アークコサイン"""
    return math.acos(value)

def atan(value):
    """アークタンジェント"""
    return math.atan(value)

def atan2(y, x):
    """2引数アークタンジェント"""
    return math.atan2(y, x)

# 角度変換
def degrees(radians):
    """ラジアンを度数法に変換"""
    return math.degrees(radians)

def radians(degrees):
    """度数法をラジアンに変換"""
    return math.radians(degrees)

# 色関連
def color(r, g=None, b=None, a=255):
    """色を作成（辞書として返す）"""
    if g is None:
        # グレースケール
        return {'r': r, 'g': r, 'b': r, 'a': a}
    else:
        return {'r': r, 'g': g, 'b': b, 'a': a}

def red(col):
    """色から赤成分を取得"""
    if isinstance(col, dict):
        return col.get('r', 0)
    return 0

def green(col):
    """色から緑成分を取得"""
    if isinstance(col, dict):
        return col.get('g', 0)
    return 0

def blue(col):
    """色から青成分を取得"""
    if isinstance(col, dict):
        return col.get('b', 0)
    return 0

def alpha(col):
    """色からアルファ成分を取得"""
    if isinstance(col, dict):
        return col.get('a', 255)
    return 255

def lerp_color(c1, c2, amt):
    """2つの色を補間"""
    if isinstance(c1, dict) and isinstance(c2, dict):
        return {
            'r': lerp(c1['r'], c2['r'], amt),
            'g': lerp(c1['g'], c2['g'], amt),
            'b': lerp(c1['b'], c2['b'], amt),
            'a': lerp(c1.get('a', 255), c2.get('a', 255), amt)
        }
    return c1

# 時間関連
import datetime

def millis():
    """プログラム開始からのミリ秒"""
    return int(datetime.datetime.now().timestamp() * 1000)

def second():
    """現在の秒"""
    return datetime.datetime.now().second

def minute():
    """現在の分"""
    return datetime.datetime.now().minute

def hour():
    """現在の時"""
    return datetime.datetime.now().hour

def day():
    """現在の日"""
    return datetime.datetime.now().day

def month():
    """現在の月"""
    return datetime.datetime.now().month

def year():
    """現在の年"""
    return datetime.datetime.now().year

# グローバルなp5インスタンスを作成
p5 = P5()
`;

// エディタの初期化
async function initDrawingEditor() {
    // Pyodide の初期化
    pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/' });
    
    // JavaScript オブジェクトへのアクセスを提供
    pyodide.globals.set('js', window);
    
    // P5 Python ライブラリを読み込み
    await pyodide.runPython(P5_PYTHON_LIBRARY);
    
    // CodeMirror エディタの初期化
    editor = CodeMirror.fromTextArea(document.getElementById('code'), {
        mode: 'python',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        smartIndent: true,
        electricChars: true,
        extraKeys: {
            'Ctrl-/': 'toggleComment',
            'Cmd-/': 'toggleComment',
            'Ctrl-Shift-F': formatCode,
            'Cmd-Shift-F': formatCode,
            'Ctrl-B': formatCode,
            'Cmd-B': formatCode,
            'Tab': betterTab,
            'Shift-Tab': 'indentLess'
        }
    });

    // コード補完エンジンの初期化
    try {
        completionEngine = new CodeCompletionEngine(editor);
        console.log('描画モード: コード補完エンジン初期化完了');
    } catch (error) {
        console.error('描画モード: コード補完エンジン初期化エラー:', error);
    }

    // キャンバスの初期化
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    // イベントリスナーの設定
    setupEventListeners();

    // UI の表示
    document.getElementById('loader').style.display = 'none';
    document.getElementById('run-btn').disabled = false;
    document.getElementById('ai-fix-code').disabled = false;
}

// イベントリスナーの設定
function setupEventListeners() {
    // 実行ボタン
    document.getElementById('run-btn').addEventListener('click', runDrawingCode);

    // フォーマットボタン
    document.getElementById('format-btn').addEventListener('click', () => {
        formatCode(editor);
    });

    // クリアボタン
    document.getElementById('clear-btn').addEventListener('click', clearCanvas);

    // AIコードレビューボタン
    const reviewBtn = document.getElementById('btn-review');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', reviewDrawingCode);
    }

    // AIコード修正ボタン
    const fixCodeBtn = document.getElementById('ai-fix-code');
    if (fixCodeBtn) {
        fixCodeBtn.addEventListener('click', fixDrawingCode);
    }

    // サンプルコードの挿入
    document.querySelectorAll('.example-code').forEach(example => {
        example.addEventListener('click', () => {
            const code = example.textContent.split(' //')[0].trim(); // コメント部分を除去
            const cursor = editor.getCursor();
            editor.replaceRange(code + '\n', cursor);
            editor.focus();
        });
    });
}

// 描画コードの実行
async function runDrawingCode() {
    const outputEl = document.getElementById('output');
    outputEl.textContent = '実行中...\n';
    
    const code = editor.getValue();
    
    try {
        // キャンバスをクリア
        clearCanvas();
        
        // Python コードを実行用にラップ
        const wrappedCode = `
import sys, traceback
from io import StringIO

_out = StringIO()
_err = StringIO()
_orig_stdout, _orig_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _out, _err

try:
${code.split('\n').map(l => l.trim() ? '    ' + l : '').join('\n')}
except Exception:
    traceback.print_exc(file=_err)
finally:
    sys.stdout, sys.stderr = _orig_stdout, _orig_stderr

_out.getvalue() + _err.getvalue()
        `;
        
        const result = await pyodide.runPython(wrappedCode);
        outputEl.textContent = result || '実行完了（出力なし）';
        
    } catch (err) {
        outputEl.textContent = 'エラー: ' + err.message;
        console.error('描画エラー:', err);
    }
}

// キャンバスのクリア
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Python側のキャンバスもクリア
    if (pyodide) {
        pyodide.runPython('p5.clear()');
    }
}

/**
 * 描画コードのレビュー機能
 */
async function reviewDrawingCode() {
    const reviewDiv = document.getElementById('review');
    if (!reviewDiv) return;

    reviewDiv.textContent = '生成中...';

    try {
        const code = editor.getValue();
        if (!code.trim()) {
            reviewDiv.textContent = 'レビューするコードを入力してください。';
            return;
        }

        const prompt = `以下のPythonによる描画コード（p5.jsライクなライブラリを使用）をレビューしてください。

コード:
\`\`\`python
${code}
\`\`\`

以下の観点でレビューしてください：
1. **描画ロジック**: 図形の配置、色の使い方、構造が適切か
2. **コードの品質**: Pythonらしい書き方、可読性、効率性
3. **改善提案**: より良いビジュアル表現や実装方法の提案
4. **学習ポイント**: 描画プログラミングで学べる点

簡潔に3-4文でレビューしてください。`;

        const response = await callGemini(prompt, 400);

        // Markdownを簡易的にHTMLに変換
        reviewDiv.innerHTML = markdownToHtml(response);
    } catch (error) {
        console.error('コードレビューエラー:', error);
        reviewDiv.textContent = 'レビュー生成中にエラーが発生しました: ' + error.message;
    }
}

/**
 * 描画コードの修正機能
 */
async function fixDrawingCode() {
    const button = document.getElementById('ai-fix-code');
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = '修正中...';
    button.disabled = true;

    try {
        const code = editor.getValue();
        if (!code.trim()) {
            alert('修正するコードを入力してください。');
            return;
        }

        const prompt = `以下のPythonによる描画コード（p5.jsライクなライブラリを使用）を改善してください。

元のコード:
\`\`\`python
${code}
\`\`\`

以下の観点で改善してください：
1. より視覚的に魅力的な描画に改善
2. コードの可読性と構造を向上
3. Pythonらしい書き方（Pythonic）に修正
4. 色の組み合わせやレイアウトを改善
5. コメントを追加して、各部分の説明を明確に

改善されたコードのみを出力してください（説明は不要）。元のコードの意図を保ちながら、より良いバージョンを作成してください。`;

        const response = await callGemini(prompt, 600);

        // コードブロックから実際のコードを抽出
        let cleanedCode = response;
        const codeMatch = response.match(/```python\n([\s\S]*?)\n```/);
        if (codeMatch) {
            cleanedCode = codeMatch[1];
        } else {
            // ```で囲まれていない場合は、そのまま使用
            cleanedCode = response.replace(/```/g, '').trim();
        }

        // エディタに修正されたコードを設定
        editor.setValue(cleanedCode);

        alert('コードが改善されました！実行して結果を確認してください。');

    } catch (error) {
        console.error('コード修正エラー:', error);
        alert('コードの修正中にエラーが発生しました: ' + error.message);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

/**
 * Markdownを簡易的にHTMLに変換
 */
function markdownToHtml(markdown) {
    // まず、コードブロックを一時的に置換
    const codeBlocks = [];
    let processedMarkdown = markdown.replace(/```([\s\S]*?)```/g, (match, code) => {
        codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 通常の変換処理
    processedMarkdown = processedMarkdown
        .replace(/^# (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h4>$1</h4>')
        .replace(/^### (.*$)/gm, '<h5>$1</h5>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // リスト項目の処理
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        .replace(/^\* (.*$)/gm, '<li>$1</li>')
        .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
        // 段落の処理
        .replace(/\n\n+/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // 段落タグで囲む
    processedMarkdown = '<p>' + processedMarkdown + '</p>';

    // リスト項目を<ul>で囲む
    processedMarkdown = processedMarkdown.replace(/(<li>.*?<\/li>)(<br>)?/g, (match) => {
        return match.replace(/<br>$/, '');
    });
    processedMarkdown = processedMarkdown.replace(/(<li>.*?<\/li>)+/g, (match) => {
        return '<ul>' + match + '</ul>';
    });

    // コードブロックを元に戻す
    codeBlocks.forEach((block, index) => {
        processedMarkdown = processedMarkdown.replace(`__CODE_BLOCK_${index}__`, block);
    });

    // 空の段落を削除
    processedMarkdown = processedMarkdown.replace(/<p><\/p>/g, '');

    return processedMarkdown;
}

// DOM読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', () => {
    initDrawingEditor();
});

// エクスポート（必要に応じて他のモジュールから使用）
export { initDrawingEditor, runDrawingCode, clearCanvas, reviewDrawingCode, fixDrawingCode };