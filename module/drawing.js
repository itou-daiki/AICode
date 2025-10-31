// module/drawing.js - 描画モード用のメインモジュール

let pyodide;
let editor;
let canvas;
let ctx;

// p5.jsライクな描画ライブラリをPythonで実装
const P5_PYTHON_LIBRARY = `
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
        self.no_fill = False
        self.no_stroke = False
        
        # 角度モード（度数法/ラジアン）
        self.angle_mode = 'radians'
        
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
        
    def fill(self, r, g=None, b=None):
        """塗りつぶし色を設定"""
        if g is None and b is None:
            # グレースケール
            self.fill_color = f'rgb({r},{r},{r})'
        else:
            self.fill_color = f'rgb({r},{g},{b})'
        self.no_fill = False
        
    def no_fill(self):
        """塗りつぶしを無効にする"""
        self.no_fill = True
        
    def stroke(self, r, g=None, b=None):
        """輪郭色を設定"""
        if g is None and b is None:
            # グレースケール
            self.stroke_color = f'rgb({r},{r},{r})'
        else:
            self.stroke_color = f'rgb({r},{g},{b})'
        self.no_stroke = False
        
    def no_stroke(self):
        """輪郭を無効にする"""
        self.no_stroke = True
        
    def stroke_weight(self, weight):
        """輪郭の太さを設定"""
        self.stroke_width = weight
        
    def circle(self, x, y, diameter):
        """円を描画"""
        radius = diameter / 2
        self.ctx.beginPath()
        self.ctx.arc(x, y, radius, 0, 2 * 3.14159)
        
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()
            
        if not self.no_stroke:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def ellipse(self, x, y, width, height):
        """楕円を描画"""
        self.ctx.save()
        self.ctx.beginPath()
        self.ctx.translate(x, y)
        self.ctx.scale(width/2, height/2)
        self.ctx.arc(0, 0, 1, 0, 2 * 3.14159)
        self.ctx.restore()
        
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()
            
        if not self.no_stroke:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def rect(self, x, y, width, height):
        """四角形を描画"""
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fillRect(x, y, width, height)
            
        if not self.no_stroke:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.strokeRect(x, y, width, height)
            
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
        
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()
            
        if not self.no_stroke:
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
        
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()
            
        if not self.no_stroke:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def arc(self, x, y, width, height, start_angle, end_angle):
        """弧を描画"""
        import math
        
        if self.angle_mode == 'degrees':
            start_angle = math.radians(start_angle)
            end_angle = math.radians(end_angle)
            
        self.ctx.save()
        self.ctx.beginPath()
        self.ctx.translate(x, y)
        self.ctx.scale(width/2, height/2)
        self.ctx.arc(0, 0, 1, start_angle, end_angle)
        self.ctx.restore()
        
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fill()
            
        if not self.no_stroke:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.stroke()
            
    def text(self, text_string, x, y):
        """テキストを描画"""
        if not self.no_fill:
            self.ctx.fillStyle = self.fill_color
            self.ctx.fillText(str(text_string), x, y)
            
        if not self.no_stroke:
            self.ctx.strokeStyle = self.stroke_color
            self.ctx.lineWidth = self.stroke_width
            self.ctx.strokeText(str(text_string), x, y)
            
    def text_size(self, size):
        """テキストサイズを設定"""
        self.ctx.font = f'{size}px Arial'
        
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
        tabSize: 4
    });
    
    // キャンバスの初期化
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // UI の表示
    document.getElementById('loader').style.display = 'none';
    document.getElementById('run-btn').disabled = false;
}

// イベントリスナーの設定
function setupEventListeners() {
    // 実行ボタン
    document.getElementById('run-btn').addEventListener('click', runDrawingCode);
    
    // クリアボタン
    document.getElementById('clear-btn').addEventListener('click', clearCanvas);
    
    // サンプルコードの挿入
    document.querySelectorAll('.example-code').forEach(example => {
        example.addEventListener('click', () => {
            const code = example.textContent.split(' //')[0].trim(); // コメント部分を除去
            const cursor = editor.getCursor();
            editor.replaceRange(code + '\\n', cursor);
            editor.focus();
        });
    });
}

// 描画コードの実行
async function runDrawingCode() {
    const outputEl = document.getElementById('output');
    outputEl.textContent = '実行中...\\n';
    
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
${code.split('\\n').map(l => l.trim() ? '    ' + l : '').join('\\n')}
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

// DOM読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', () => {
    initDrawingEditor();
});

// エクスポート（必要に応じて他のモジュールから使用）
export { initDrawingEditor, runDrawingCode, clearCanvas };