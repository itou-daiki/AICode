// module/p5lib.js
// 描画モードで使う、p5.js に似た Python ライブラリ。
// Pyodide に読み込ませて、コードから p5.circle(...) のように呼べるようにする。

/** Pyodide に流し込む Python のソース */
export const P5_PYTHON_LIBRARY = `
import math
import random as _random
import time as _ec_time

# p5.js定数
PI = math.pi
TWO_PI = math.pi * 2
TAU = TWO_PI
HALF_PI = math.pi / 2
QUARTER_PI = math.pi / 4

# p5.js のリファレンスどおり textAlign(CENTER) や endShape(CLOSE) と書けるようにする。
# 中身は、このライブラリが受けつける文字列にしておく。
CENTER = 'center'
LEFT = 'left'
RIGHT = 'right'
TOP = 'top'
BOTTOM = 'bottom'
BASELINE = 'baseline'
CORNER = 'corner'
CORNERS = 'corners'
RADIUS = 'radius'
DEGREES = 'degrees'
RADIANS = 'radians'
RGB = 'rgb'
HSB = 'hsb'
HSL = 'hsl'
CLOSE = 'CLOSE'
# キーの番号（p5.js の keyCode と同じ値）。if keyCode == LEFT_ARROW: のように使う
BACKSPACE = 8
TAB = 9
ENTER = 13
RETURN = 13
SHIFT = 16
CONTROL = 17
ALT = 18
ESCAPE = 27
LEFT_ARROW = 37
UP_ARROW = 38
RIGHT_ARROW = 39
DOWN_ARROW = 40
# マウスカーソルの形（cursor(HAND) のように使う）
ARROW = 'default'
CROSS = 'crosshair'
HAND = 'pointer'
MOVE = 'move'
TEXT = 'text'
WAIT = 'wait'
# 線の端とつなぎ目。p5.js の SQUARE は「平らに切る」で、canvas では 'butt' にあたる
ROUND = 'round'
SQUARE = 'butt'
PROJECT = 'square'
MITER = 'miter'
BEVEL = 'bevel'

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
        self._text_size = 12  # p5.js の既定は 12
        self._text_font = 'sans-serif'

        # 線の設定
        self.stroke_cap_style = 'round'  # p5.js の既定は ROUND
        self.stroke_join_style = 'miter'  # miter, bevel, round

        # 色モード。最大値はモードごとに覚えておく（p5.js と同じ既定値）
        self._color_mode = 'rgb'  # rgb, hsb, hsl
        self._color_maxes = {
            'rgb': [255, 255, 255, 255],
            'hsb': [360, 100, 100, 1],
            'hsl': [360, 100, 100, 1],
        }
        self.color_max_values = self._color_maxes['rgb']  # いまのモードの最大値

        # push() で保存した、Python 側の設定（色・太さ・モードなど）
        self._style_stack = []

        # フレーム数とタイマー。millis() はここからの時間を返す
        self.frame_count = 0
        self.start_time = _ec_time.time()
        self._last_time = None

        # 線の端・文字の大きさなどを、キャンバスにも入れておく
        self._apply_ctx_style()

    def _apply_ctx_style(self):
        """Python 側で覚えている線や文字の設定を、キャンバスに入れ直す

        キャンバスの大きさを変えると、これらの設定は消えてしまうので、そのたびに呼ぶ。
        """
        self.ctx.lineCap = self.stroke_cap_style
        self.ctx.lineJoin = self.stroke_join_style
        self.ctx.font = f'{self._text_size}px {self._text_font}'
        self.ctx.textAlign = self.text_align_horizontal
        self.ctx.textBaseline = {'middle': 'middle', 'center': 'middle', 'top': 'top',
                                 'bottom': 'bottom'}.get(self.text_align_vertical, 'alphabetic')

    # --- 色 ---
    def _css_check(self, text):
        """CSS の色の文字列をキャンバスに読ませ、読めたら整えた形を、読めなければ None を返す

        キャンバスは読めない色を黙って無視するので、2 つのちがう色から試して、
        どちらからでも同じ色になったら「読めた」とみなす。
        """
        ctx = self.ctx
        saved = ctx.fillStyle
        ctx.fillStyle = '#000000'
        ctx.fillStyle = text
        first = ctx.fillStyle
        ctx.fillStyle = '#ffffff'
        ctx.fillStyle = text
        second = ctx.fillStyle
        ctx.fillStyle = saved
        return str(first) if first == second else None

    def _rgba(self, args, name):
        """色の指定を (r, g, b, a) にそろえる。どれも 0〜255 の数

        受けつける形（p5.js と同じ）:
          'red' / '#ff0000' / 'rgb(255,0,0)' … CSS の色の文字列
          color(...) で作った色、[255, 0, 0] のようなリスト
          1 つ … 灰色、2 つ … 灰色と透明度、3 つ … 色、4 つ … 色と透明度
        数は colorMode() で決めたモード（RGB / HSB / HSL）と最大値で読む。
        """
        def fail():
            if len(args) == 1 and isinstance(args[0], str):
                shown = args[0]
            else:
                shown = ', '.join(repr(a) if isinstance(a, str) else str(a) for a in args)
            raise ValueError(
                f"{name}() に渡した色 '{shown}' は使えません。"
                f"{name}(255, 0, 0) や {name}('red') のように書きます"
            )

        if len(args) == 1:
            value = args[0]
            if isinstance(value, dict):
                try:
                    return (float(value['r']), float(value['g']), float(value['b']),
                            float(value.get('a', 255)))
                except (KeyError, TypeError, ValueError):
                    fail()
            if isinstance(value, (list, tuple)):
                if not value or len(value) > 4:
                    fail()
                return self._rgba(tuple(value), name)
            if isinstance(value, str):
                css = self._css_check(value.strip())
                if css is None:
                    fail()
                return _ec_parse_css(css) or fail()

        if not 1 <= len(args) <= 4:
            fail()
        for a in args:
            if isinstance(a, bool) or not isinstance(a, (int, float)):
                fail()

        maxes = self._color_maxes[self._color_mode]
        clamp = lambda v: max(0.0, min(1.0, v))
        if len(args) <= 2:
            # 灰色。p5.js と同じく、3 つ目（明るさ）の最大値で読む
            gray = clamp(args[0] / maxes[2])
            alpha = clamp(args[1] / maxes[3]) if len(args) == 2 else 1.0
            return (gray * 255, gray * 255, gray * 255, alpha * 255)

        alpha = clamp(args[3] / maxes[3]) if len(args) == 4 else 1.0
        if self._color_mode == 'rgb':
            r, g, b = (clamp(args[i] / maxes[i]) for i in range(3))
        else:
            h = (args[0] / maxes[0]) % 1.0
            s = clamp(args[1] / maxes[1])
            v = clamp(args[2] / maxes[2])
            if self._color_mode == 'hsl':
                # HSL を HSB に直してから計算する
                light = v
                v = light + s * min(light, 1 - light)
                s = 0.0 if v == 0 else 2 * (1 - light / v)
            i = int(h * 6) % 6
            f = h * 6 - int(h * 6)
            p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
            r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
        return (r * 255, g * 255, b * 255, alpha * 255)

    def _to_css(self, *args, name='fill'):
        """fill / stroke / background に渡された色を、キャンバスが読める文字列にする"""
        if len(args) == 1 and isinstance(args[0], str):
            css = self._css_check(args[0].strip())
            if css is not None:
                return args[0].strip()
        r, g, b, a = self._rgba(args, name)
        r, g, b = (int(round(c)) for c in (r, g, b))
        if a >= 255:
            return f'rgb({r},{g},{b})'
        return f'rgba({r},{g},{b},{round(a / 255, 4)})'

    def clear(self):
        """キャンバスをクリア"""
        self.ctx.clearRect(0, 0, self.width, self.height)

    def background(self, *args):
        """背景色を設定（色の書き方は fill() と同じ。background(0, 20) で残像も作れる）"""
        color = self._to_css(*args, name='background')
        # p5.js と同じく、移動や回転に関係なく全体を塗る。塗りの色は元にもどす
        self.ctx.save()
        self.ctx.setTransform(1, 0, 0, 1, 0, 0)
        self.ctx.fillStyle = color
        self.ctx.fillRect(0, 0, self.width, self.height)
        self.ctx.restore()

    def fill(self, *args):
        """塗りつぶし色を設定"""
        self.fill_color = self._to_css(*args, name='fill')
        self.no_fill_flag = False

    def no_fill(self):
        """塗りつぶしを無効にする"""
        self.no_fill_flag = True

    def stroke(self, *args):
        """輪郭色を設定"""
        self.stroke_color = self._to_css(*args, name='stroke')
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
            
    def text_size(self, size=None):
        """テキストサイズを設定（引数なしなら、今の大きさを返す）"""
        if size is None:
            return self._text_size
        self._text_size = size
        self.ctx.font = f'{size}px {self._text_font}'

    def text_font(self, font, size=None):
        """文字の書体を設定（p5.js の textFont と同じ。'serif' や 'monospace' なども使える）"""
        self._text_font = str(font)
        if size is not None:
            self._text_size = size
        self.ctx.font = f'{self._text_size}px {self._text_font}'

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
        elif vertical in ('middle', 'center'):
            # p5.js では縦の中央も CENTER と書く
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

    def color_mode(self, mode, max1=None, max2=None, max3=None, max4=None):
        """色モードを設定（RGB / HSB / HSL）

        color_mode(HSB)               … 色相 0〜360、彩度・明るさ 0〜100 で読む
        color_mode(RGB, 1)            … すべて 0〜1 で読む
        color_mode(HSB, 360, 100, 100) … 3 つの最大値を決める
        """
        key = str(mode).lower()
        if key not in self._color_maxes:
            raise ValueError("color_mode に使えるのは RGB / HSB / HSL です")
        maxes = self._color_maxes[key]
        if max1 is not None and max2 is None:
            maxes[:] = [max1, max1, max1, max1]
        elif max1 is not None:
            maxes[:3] = [max1, max2, max3 if max3 is not None else maxes[2]]
            if max4 is not None:
                maxes[3] = max4
        self._color_mode = key
        self.color_max_values = maxes

    def get_pixel(self, x, y):
        """指定位置のピクセル色を取得 [r, g, b, a]"""
        pixel_data = self.ctx.getImageData(x, y, 1, 1).data
        return [pixel_data[0], pixel_data[1], pixel_data[2], pixel_data[3]]
        
    def reset_matrix(self):
        """移動・回転・拡大をすべて元にもどす（p5.js の resetMatrix と同じ）"""
        self.ctx.setTransform(1, 0, 0, 1, 0, 0)

    def create_canvas(self, w, h):
        """キャンバスの大きさを決める（p5.js の createCanvas と同じ）

        p5.js のサンプルは setup() の 1 行目に必ずこれを書くので、
        写してきたコードがそのまま動くようにしてある。
        """
        self.canvas.width = int(w)
        self.canvas.height = int(h)
        self.width = int(w)
        self.height = int(h)
        # 大きさを変えると絵は消えるので、p5.js と同じく白紙から始める
        self.ctx.setTransform(1, 0, 0, 1, 0, 0)
        self.ctx.fillStyle = 'rgb(255,255,255)'
        self.ctx.fillRect(0, 0, self.width, self.height)
        # 大きさを変えると線の端や文字の設定も消えるので、入れ直す
        self._apply_ctx_style()
        _easycode_sync_size()
        return None

    def begin_frame(self):
        """1回の描画を始める前に、座標系や重ね方をまっさらにする。

        p5.js は draw() のたびに座標系を戻すので、それに合わせている。
        こうしないと、push/pop を書き忘れた rotate がどんどん積み重なってしまう。
        """
        # pop() を書き忘れた push() が、コマごとにたまっていかないようにする（座標系を戻す前に外す）
        if self._style_stack:
            for _ in self._style_stack:
                self.ctx.restore()
            self._style_stack = []
        self.ctx.setTransform(1, 0, 0, 1, 0, 0)
        self.ctx.globalAlpha = 1.0
        self.ctx.globalCompositeOperation = 'source-over'

    # push() で一緒に保存する、Python 側の設定の名前
    _STYLE_KEYS = (
        'fill_color', 'stroke_color', 'stroke_width', 'no_fill_flag', 'no_stroke_flag',
        '_stroke_set', '_rect_mode', '_ellipse_mode', '_angle_mode', '_color_mode',
        '_text_size', '_text_font', 'text_align_horizontal', 'text_align_vertical',
        'text_leading_value', 'stroke_cap_style', 'stroke_join_style',
    )

    def push(self):
        """現在の描画設定を保存（座標系に加えて、色・太さ・モード・文字の設定も）"""
        self.ctx.save()
        style = {k: getattr(self, k) for k in self._STYLE_KEYS}
        style['_color_maxes'] = {k: list(v) for k, v in self._color_maxes.items()}
        self._style_stack.append(style)

    def pop(self):
        """保存された描画設定を復元"""
        self.ctx.restore()
        if not self._style_stack:
            return
        style = self._style_stack.pop()
        self._color_maxes = style.pop('_color_maxes')
        for k, v in style.items():
            setattr(self, k, v)
        self.color_max_values = self._color_maxes[self._color_mode]
        
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

    def no_cursor(self):
        """キャンバスの上でマウスカーソルを消す（p5.js の noCursor と同じ）"""
        self.canvas.style.cursor = 'none'

    def cursor(self, kind='default'):
        """マウスカーソルの形を決める（cursor(HAND) など。引数なしでふつうの矢印）"""
        self.canvas.style.cursor = str(kind)

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
    """乱数を生成

    random()          … 0 以上 1 未満
    random(10)        … 0 以上 10 未満
    random(5, 10)     … 5 以上 10 未満
    random(['赤', '青']) … リストの中から 1 つ選ぶ（p5.js と同じ）
    """
    if high is None and isinstance(low, (list, tuple, str)):
        if len(low) == 0:
            raise ValueError('random() に空のリストを渡しました。選ぶものを 1 つ以上入れてください')
        return _random.choice(low)
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

# ノイズ関数（p5.js の noise と同じしくみのパーリンノイズ）
# 4096 個の乱数の表を、なめらかにつないで値を作る。
_PERLIN_SIZE = 4095
_perlin = None
_perlin_octaves = 4      # 重ねる細かさの段数
_perlin_falloff = 0.5    # 細かい段ほど、どれだけ弱くするか


def _perlin_fill(seed=None):
    """ノイズのもとになる乱数の表を作る（random_seed とは別の乱数を使う）"""
    global _perlin
    rng = _random.Random(seed)
    _perlin = [rng.random() for _ in range(_PERLIN_SIZE + 1)]


def _scaled_cosine(i):
    return 0.5 * (1.0 - math.cos(i * math.pi))


def noise(x, y=0, z=0):
    """パーリンノイズ（0〜1 のなめらかに変わる値。少しずつ x を変えて使う）"""
    if _perlin is None:
        _perlin_fill()
    x, y, z = abs(x), abs(y), abs(z)
    xi, yi, zi = int(x), int(y), int(z)
    xf, yf, zf = x - xi, y - yi, z - zi
    r = 0.0
    ampl = 0.5
    for _ in range(_perlin_octaves):
        of = xi + (yi << 4) + (zi << 8)
        rxf = _scaled_cosine(xf)
        ryf = _scaled_cosine(yf)

        n1 = _perlin[of & _PERLIN_SIZE]
        n1 += rxf * (_perlin[(of + 1) & _PERLIN_SIZE] - n1)
        n2 = _perlin[(of + 16) & _PERLIN_SIZE]
        n2 += rxf * (_perlin[(of + 17) & _PERLIN_SIZE] - n2)
        n1 += ryf * (n2 - n1)

        of += 256
        n2 = _perlin[of & _PERLIN_SIZE]
        n2 += rxf * (_perlin[(of + 1) & _PERLIN_SIZE] - n2)
        n3 = _perlin[(of + 16) & _PERLIN_SIZE]
        n3 += rxf * (_perlin[(of + 17) & _PERLIN_SIZE] - n3)
        n2 += ryf * (n3 - n2)

        n1 += _scaled_cosine(zf) * (n2 - n1)
        r += n1 * ampl
        ampl *= _perlin_falloff

        xi, yi, zi = xi << 1, yi << 1, zi << 1
        xf, yf, zf = xf * 2, yf * 2, zf * 2
        if xf >= 1.0:
            xi, xf = xi + 1, xf - 1
        if yf >= 1.0:
            yi, yf = yi + 1, yf - 1
        if zf >= 1.0:
            zi, zf = zi + 1, zf - 1
    return r


def noise_detail(lod, falloff=None):
    """ノイズの細かさを決める（p5.js の noiseDetail と同じ。段数と、弱くする割合）"""
    global _perlin_octaves, _perlin_falloff
    if lod > 0:
        _perlin_octaves = int(lod)
    if falloff is not None and falloff > 0:
        _perlin_falloff = falloff


def noise_seed(seed):
    """ノイズのシードを設定（同じシードなら、毎回同じノイズになる）"""
    _perlin_fill(seed)

# 数学関数
def map(*args):
    """p5.js の map(値, 元の下限, 元の上限, 先の下限, 先の上限) と、Python の map の両方を受ける

    p5.js のリファレンスどおり map(v, 0, 10, 0, 100) と書けるようにしておく。
    引数が 5 つの数なら p5.js の意味、それ以外は Python のもとの map。
    """
    if len(args) == 5 and all(isinstance(a, (int, float)) for a in args):
        return map_value(*args)
    return _easycode_builtin_map(*args)


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

def dist(*args):
    """2点間の距離を計算

    dist(x1, y1, x2, y2)         … 平面の 2 点
    dist(x1, y1, z1, x2, y2, z2) … 空間の 2 点（p5.js と同じ順）
    """
    if len(args) == 4:
        x1, y1, x2, y2 = args
        return math.hypot(x2 - x1, y2 - y1)
    if len(args) == 6:
        x1, y1, z1, x2, y2, z2 = args
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
    raise TypeError('dist() には数を 4 つ（平面）か 6 つ（空間）渡します')

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
# p5.js と同じく、angleMode(DEGREES) のときは角度を「度」で受け取り、「度」で返す。
def _to_rad(angle):
    return math.radians(angle) if p5._angle_mode == 'degrees' else angle

def _from_rad(angle):
    return math.degrees(angle) if p5._angle_mode == 'degrees' else angle

def sin(angle):
    """サイン"""
    return math.sin(_to_rad(angle))

def cos(angle):
    """コサイン"""
    return math.cos(_to_rad(angle))

def tan(angle):
    """タンジェント"""
    return math.tan(_to_rad(angle))

def asin(value):
    """アークサイン"""
    return _from_rad(math.asin(value))

def acos(value):
    """アークコサイン"""
    return _from_rad(math.acos(value))

def atan(value):
    """アークタンジェント"""
    return _from_rad(math.atan(value))

def atan2(y, x):
    """2引数アークタンジェント"""
    return _from_rad(math.atan2(y, x))

# 角度変換
def degrees(radians):
    """ラジアンを度数法に変換"""
    return math.degrees(radians)

def radians(degrees):
    """度数法をラジアンに変換"""
    return math.radians(degrees)

# 色関連
def _ec_parse_css(css):
    """キャンバスが整えた色の文字列（'#ff0000' や 'rgba(255, 0, 0, 0.5)'）を (r, g, b, a) にする"""
    css = css.strip()
    try:
        if css.startswith('#') and len(css) == 7:
            return (int(css[1:3], 16), int(css[3:5], 16), int(css[5:7], 16), 255)
        if css.startswith('rgb'):
            parts = [float(p) for p in css[css.index('(') + 1:css.rindex(')')].split(',')]
            a = parts[3] * 255 if len(parts) == 4 else 255
            return (parts[0], parts[1], parts[2], a)
    except ValueError:
        pass
    return None


def color(*args):
    """色を作成（辞書として返す）

    書き方は fill() と同じ。color(255, 0, 0)、color('red')、color(0, 100) など。
    colorMode(HSB) のときは、色相・彩度・明るさとして読む。
    """
    r, g, b, a = p5._rgba(args, 'color')
    clean = lambda v: int(round(v)) if abs(v - round(v)) < 1e-9 else v
    return {'r': clean(r), 'g': clean(g), 'b': clean(b), 'a': clean(a)}

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
    """プログラムを動かし始めてからのミリ秒（p5.js の millis と同じ）"""
    start = p5.start_time or _ec_time.time()
    return (_ec_time.time() - start) * 1000

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


def no_loop():
    """draw() のくり返しを止める（p5.js の noLoop と同じ）"""
    p5._looping = False
    return None


def loop():
    """止めた draw() のくり返しを、もう一度動かす（p5.js の loop と同じ）"""
    p5._looping = True
    return None


def is_looping():
    """今 draw() がくり返されているか（p5.js の isLooping と同じ）"""
    return p5._looping


def _easycode_sync_size():
    """width と height を、今のキャンバスの大きさに合わせる

    p5.js では width / height がそのまま使えるので、こちらでも同じにする。
    windowWidth / windowHeight も、ここではキャンバスの大きさにしておく。
    """
    for name in ('width', 'windowWidth', 'window_width'):
        globals()[name] = p5.width
    for name in ('height', 'windowHeight', 'window_height'):
        globals()[name] = p5.height


# いま押されているキーの番号。drawing.js から _ec_set_keys などで入れる
_ec_keys_down = set()


def _ec_key_down(code):
    """キーが押されたことを覚える（drawing.js から呼ぶ）"""
    _ec_keys_down.add(int(code))


def _ec_key_up(code):
    """キーが離されたことを覚える（drawing.js から呼ぶ）"""
    _ec_keys_down.discard(int(code))


def _ec_set_keys(codes):
    """いま押されているキーの番号を、まとめて入れ直す（drawing.js から毎コマ呼ぶ）"""
    _ec_keys_down.clear()
    _ec_keys_down.update(int(c) for c in codes)


def key_is_down(code):
    """そのキーが今押されているか（p5.js の keyIsDown と同じ。keyIsDown(LEFT_ARROW) など）"""
    return int(code) in _ec_keys_down


# p5.js と同じ名前で使えるようにしておく値。
# マウスとキーの値は、draw() のたびに drawing.js から入れ直される。
# frame_count のような snake_case のつづりも、p5.js のつづりと同じ値を入れておく。
# （ただの変数なので、drawing.js が毎コマ両方を入れ直す）
_easycode_sync_size()
frame_count = 0
delta_time = 0
mouseX = 0
mouseY = 0
mouse_x = 0
mouse_y = 0
pmouseX = 0
pmouseY = 0
pmouse_x = 0
pmouse_y = 0
mouseIsPressed = False
mouse_is_pressed = False
mouseButton = LEFT  # LEFT / RIGHT / CENTER
mouse_button = LEFT
key = ''
keyCode = 0
key_code = 0
keyIsPressed = False
key_is_pressed = False
p5._looping = True


# p5.js のリファレンスは circle(200, 200, 80) のように前置きなしで書く。
# 教材やチュートリアルもその形なので、そのまま写して動くようにしておく。
# p5.circle(...) の書き方も今までどおり使える。
#
# ただし abs / max / min / pow / round は Python にもとからある関数なので、
# こちらで上書きすると max(リスト) のような書き方が壊れてしまう。上書きしない。
_EASYCODE_KEEP_BUILTINS = {'abs', 'max', 'min', 'pow', 'round'}
_easycode_builtin_map = __builtins__['map'] if isinstance(__builtins__, dict) else __builtins__.map


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

# Processing（Java）のサンプルは size(400, 400) と書く。
# 中身は createCanvas と同じものにしておく。
size = p5.create_canvas

`;
