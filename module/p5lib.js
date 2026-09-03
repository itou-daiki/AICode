// module/p5lib.js
// 描画モードで使う、p5.js に似た Python ライブラリ。
// Pyodide に読み込ませて、コードから p5.circle(...) のように呼べるようにする。

/** Pyodide に流し込む Python のソース */
export const P5_PYTHON_LIBRARY = `
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

        # デフォルト設定（p5.js に合わせる）
        # 塗りは白、線は黒、太さ1。fill() を呼ばなくても白い図形が黒い輪郭で描かれる。
        self.fill_color = 'rgb(255,255,255)'
        self.stroke_color = 'rgb(0,0,0)'
        self.stroke_width = 1
        self.no_fill_flag = False
        self.no_stroke_flag = False
        # stroke() を自分で呼んだかどうか。p5.js は、呼んでいなければ文字に輪郭を付けない。
        self._stroke_set = False

        # 角度モード（度数法/ラジアン）
        # 属性名の先頭に _ を付けているのは、同じ名前の設定メソッドを隠さないため
        self._angle_mode = 'radians'

        # 描画モード
        self._rect_mode = 'corner'  # corner, center, corners, radius
        self._ellipse_mode = 'center'  # center, radius, corner, corners

        # カスタム形状用
        self.vertices = []
        self.is_shape_open = False

        # テキスト設定
        self.text_align_horizontal = 'left'  # left, center, right
        self.text_align_vertical = 'baseline'  # top, bottom, middle, baseline
        self.text_leading_value = 0  # 行間

        # 線の設定
        self.stroke_cap_style = 'round'  # p5.js の既定は ROUND
        self.stroke_join_style = 'miter'  # miter, bevel, round

        # 色モード
        self._color_mode = 'rgb'  # rgb or hsb
        self.color_max_values = [255, 255, 255, 255]  # RGBA最大値

        # フレーム数とタイマー
        self.frame_count = 0
        self.start_time = None
        self._last_time = None
        
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
        self._stroke_set = True

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
        if self._ellipse_mode == 'center':
            cx, cy = x, y
            w, h = width, height
        elif self._ellipse_mode == 'radius':
            cx, cy = x, y
            w, h = width * 2, height * 2
        elif self._ellipse_mode == 'corner':
            cx, cy = x + width / 2, y + height / 2
            w, h = width, height
        elif self._ellipse_mode == 'corners':
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
        if self._rect_mode == 'corner':
            rx, ry = x, y
            rw, rh = width, height
        elif self._rect_mode == 'center':
            rx, ry = x - width / 2, y - height / 2
            rw, rh = width, height
        elif self._rect_mode == 'radius':
            rx, ry = x - width, y - height
            rw, rh = width * 2, height * 2
        elif self._rect_mode == 'corners':
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
        if self.no_stroke_flag:
            return
        self.ctx.beginPath()
        self.ctx.moveTo(x1, y1)
        self.ctx.lineTo(x2, y2)
        self.ctx.strokeStyle = self.stroke_color
        self.ctx.lineWidth = self.stroke_width
        self.ctx.stroke()
        
    def point(self, x, y):
        """点を描画（p5.js と同じく、線の色と太さで描く）"""
        if self.no_stroke_flag:
            return
        size = max(1, self.stroke_width)
        self.ctx.fillStyle = self.stroke_color
        if self.stroke_cap_style == 'round' and size > 1:
            self.ctx.beginPath()
            self.ctx.arc(x, y, size / 2, 0, math.pi * 2)
            self.ctx.fill()
        else:
            self.ctx.fillRect(x - size / 2, y - size / 2, size, size)
        
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
        if self._angle_mode == 'degrees':
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

        # p5.js は stroke() を明示的に呼んだときだけ、文字に輪郭を付ける
        if self._stroke_set and not self.no_stroke_flag:
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
            self._color_mode = mode
            self.color_max_values = [max1, max2, max3, max4]

    def get_pixel(self, x, y):
        """指定位置のピクセル色を取得 [r, g, b, a]"""
        pixel_data = self.ctx.getImageData(x, y, 1, 1).data
        return [pixel_data[0], pixel_data[1], pixel_data[2], pixel_data[3]]
        
    def reset_matrix(self):
        """移動・回転・拡大をすべて元にもどす（p5.js の resetMatrix と同じ）"""
        self.ctx.setTransform(1, 0, 0, 1, 0, 0)

    def begin_frame(self):
        """1回の描画を始める前に、座標系や重ね方をまっさらにする。

        p5.js は draw() のたびに座標系を戻すので、それに合わせている。
        こうしないと、push/pop を書き忘れた rotate がどんどん積み重なってしまう。
        """
        self.ctx.setTransform(1, 0, 0, 1, 0, 0)
        self.ctx.globalAlpha = 1.0
        self.ctx.globalCompositeOperation = 'source-over'

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
        if self._angle_mode == 'degrees':
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
        if mode not in ('radians', 'degrees'):
            raise ValueError("angle_mode に使えるのは 'radians' か 'degrees' です")
        self._angle_mode = mode

    def rect_mode(self, mode):
        """四角形描画モードを設定 ('corner', 'center', 'radius', 'corners')"""
        if mode not in ('corner', 'center', 'radius', 'corners'):
            raise ValueError("rect_mode に使えるのは 'corner' 'center' 'radius' 'corners' です")
        self._rect_mode = mode

    def ellipse_mode(self, mode):
        """楕円描画モードを設定 ('center', 'radius', 'corner', 'corners')"""
        if mode not in ('center', 'radius', 'corner', 'corners'):
            raise ValueError("ellipse_mode に使えるのは 'center' 'radius' 'corner' 'corners' です")
        self._ellipse_mode = mode

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

    def erase(self, strength_fill=255, strength_stroke=255):
        """消しゴムモードを開始（0〜255 で消す強さを決める）"""
        self._erase_alpha = max(0, min(255, strength_fill)) / 255
        self.ctx.globalCompositeOperation = 'destination-out'
        self.ctx.globalAlpha = self._erase_alpha

    def no_erase(self):
        """消しゴムモードを終了して、ふつうの描画にもどす"""
        self.ctx.globalCompositeOperation = 'source-over'
        self.ctx.globalAlpha = 1.0

    def blend_mode(self, mode):
        """重ね方を設定する（p5.js の BLEND / MULTIPLY などをそのまま使える）"""
        blend_modes = {
            'blend': 'source-over',
            'normal': 'source-over',
            'replace': 'copy',
            'remove': 'destination-out',
            'add': 'lighter',
            'darkest': 'darken',
            'lightest': 'lighten',
            'difference': 'difference',
            'exclusion': 'exclusion',
            'multiply': 'multiply',
            'screen': 'screen',
            'overlay': 'overlay',
            'hard_light': 'hard-light',
            'soft_light': 'soft-light',
            'dodge': 'color-dodge',
            'burn': 'color-burn',
        }
        key = str(mode).lower()
        if key not in blend_modes:
            raise ValueError(
                'blend_mode に使えるのは {} です（{} は使えません）'
                .format('/ '.join(sorted(blend_modes)), mode)
            )
        self.ctx.globalCompositeOperation = blend_modes[key]

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

# abs / round / min / max / pow は Python にもとからあるものをそのまま使う。
# （p5.js にも同じ名前があるが、Python の方が学習者の書き方に合う）

def exp(n):
    """指数関数"""
    return math.exp(n)

def log(n):
    """自然対数"""
    return math.log(n)

def ceil(n):
    """切り上げ"""
    return math.ceil(n)

def floor(n):
    """切り捨て"""
    return math.floor(n)

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

# アニメーションループ用のグローバル変数
_animation_running = False
_animation_id = None
frameCount = 0  # グローバルなフレームカウント
deltaTime = 0   # 前フレームからの経過時間（ミリ秒）


# 1 秒あたり何コマ描くか。p5.js と同じく、はじめは 60。
p5._target_fps = 60
p5._recent_fps = 0.0


def frame_rate(fps=None):
    """1秒あたりのコマ数を決める（p5.js の frameRate と同じ）

    frame_rate(30) … 1秒あたり30コマにする
    frame_rate()   … 今のコマ数を返す
    """
    if fps is None:
        return p5._recent_fps
    p5._target_fps = float(fps) if fps and float(fps) > 0 else 0
    return None


def get_frame_rate():
    """今のコマ数（p5.js の getTargetFrameRate ではなく、実測値）"""
    return p5._recent_fps


# p5.js のリファレンスは circle(200, 200, 80) のように前置きなしで書く。
# 教材やチュートリアルもその形なので、そのまま写して動くようにしておく。
# p5.circle(...) の書き方も今までどおり使える。
#
# ただし abs / max / min / pow / round は Python にもとからある関数なので、
# こちらで上書きすると max(リスト) のような書き方が壊れてしまう。上書きしない。
_EASYCODE_KEEP_BUILTINS = {'abs', 'max', 'min', 'pow', 'round'}


def _easycode_camel(name):
    """stroke_weight -> strokeWeight（p5.js と同じつづり）"""
    head, *rest = name.split('_')
    return head + ''.join(part.title() for part in rest)


def _easycode_expose_p5():
    for name in dir(p5):
        if name.startswith('_') or name in _EASYCODE_KEEP_BUILTINS:
            continue
        value = getattr(p5, name)
        if not callable(value):
            continue
        globals().setdefault(name, value)
        camel = _easycode_camel(name)
        if camel != name:
            globals().setdefault(camel, value)

    # frame_rate や random_seed のように、この場で定義した関数にも
    # p5.js と同じつづり（frameRate / randomSeed）を用意する。
    for name in list(globals()):
        if name.startswith('_') or '_' not in name or name in _EASYCODE_KEEP_BUILTINS:
            continue
        value = globals()[name]
        if not callable(value):
            continue
        camel = _easycode_camel(name)
        if camel != name:
            globals().setdefault(camel, value)


_easycode_expose_p5()
`;
