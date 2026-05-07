// === 因数分解アシスタント MVP ===
// 共通因数くくり ＋ a²−b² の2パターン対応

let pyodide = null;
let problem = null;       // 元の問題（文字列）
let currentExpr = null;   // 今扱っている式
let attempts = 0;
let abValues = null;
let userGCF = null;       // ユーザーが入力した共通因数

// ---------- Pyodide にロードする Python コード ----------
const PYTHON_CODE = `
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr, standard_transformations,
    implicit_multiplication_application, convert_xor
)

TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

def parse(s):
    if not s or not str(s).strip():
        return None
    try:
        return parse_expr(str(s), transformations=TRANSFORMS)
    except Exception:
        return None

def to_str(expr):
    if expr is None:
        return ""
    return str(expr)

def _monomial_gcf(expr):
    if not expr.is_Add:
        return None
    g = expr.args[0]
    for t in expr.args[1:]:
        g = sp.gcd(g, t)
    if g == 1 or g == -1:
        return None
    return g

def _binomial_gcf(expr_str):
    """4 項に対するグルーピングで共通になる 2 項式を返す"""
    expr = parse(expr_str)
    if expr is None or not expr.is_Add or len(expr.args) != 4:
        return None
    steps = grouping_steps(expr_str)
    if steps is None:
        return None
    return parse(steps[4])

def has_gcf(expr_str):
    expr = parse(expr_str)
    if expr is None or not expr.is_Add:
        return False
    if _monomial_gcf(expr) is not None:
        return True
    # 4 項なら 2 項式の共通因数も試す
    if len(expr.args) == 4 and _binomial_gcf(expr_str) is not None:
        return True
    return False

def gcf(expr_str):
    expr = parse(expr_str)
    if expr is None:
        return ""
    if not expr.is_Add:
        return to_str(expr)
    m = _monomial_gcf(expr)
    if m is not None:
        return to_str(m)
    if len(expr.args) == 4:
        b = _binomial_gcf(expr_str)
        if b is not None:
            return to_str(b)
    return ""

def factor_gcf_inside(expr_str):
    """共通因数でくくった「中身」を返す"""
    expr = parse(expr_str)
    if expr is None or not expr.is_Add:
        return ""
    m = _monomial_gcf(expr)
    if m is not None:
        return to_str(sp.expand(expr / m))
    if len(expr.args) == 4:
        b = _binomial_gcf(expr_str)
        if b is not None:
            inside = sp.cancel(expr / b)
            return to_str(inside)
    return to_str(expr)

def _all_integer_coeffs(expr):
    """式のすべての係数が整数か（多項式・複数文字対応）"""
    try:
        e = sp.sympify(expr)
        if e.is_Number:
            return bool(e.is_integer)
        # 各項の係数を直接チェック（Poly.all_coeffsは単変数のみ）
        if e.is_Add:
            for term in e.args:
                c = term.as_coeff_Mul()[0]
                if not c.is_integer:
                    return False
            return True
        # 単項式 (Mul / Symbol / Pow)
        c = e.as_coeff_Mul()[0]
        if not c.is_integer:
            return False
        return True
    except Exception:
        return False

def _safe_quotient(e, f):
    """e ÷ f を確実に展開して整理した形で返す。失敗時は None。"""
    try:
        e_exp = sp.expand(e)
        f_exp = sp.expand(f)
        # アプローチ1: 全体を simplify (cancel より積極的に約分)
        try:
            inside = sp.simplify(e_exp / f_exp)
            inside = sp.expand(inside)
            if sp.expand(inside * f_exp) == e_exp:
                return inside
        except Exception:
            pass
        # アプローチ2: 各項を個別に割って合計
        if e_exp.is_Add:
            try:
                terms = []
                for t in e_exp.args:
                    q = sp.simplify(t / f_exp)
                    terms.append(q)
                inside = sp.expand(sp.Add(*terms))
                if sp.expand(inside * f_exp) == e_exp:
                    return inside
            except Exception:
                pass
        # アプローチ3: 多項式除算
        try:
            syms = list((e_exp.free_symbols | f_exp.free_symbols))
            if syms:
                E = sp.Poly(e_exp, *syms)
                F = sp.Poly(f_exp, *syms)
                Q, R = sp.div(E, F)
                if R.as_expr() == 0:
                    return Q.as_expr()
        except Exception:
            pass
        return None
    except Exception:
        return None

def is_valid_gcf(user_str, expr_str):
    """ユーザーの入力が expr の共通因数として有効か"""
    f = parse(user_str)
    e = parse(expr_str)
    if f is None or e is None:
        return False
    if f == 0 or f == 1 or f == -1:
        return False
    try:
        inside = _safe_quotient(e, f)
        if inside is None:
            return False
        # 商が整数係数の多項式でなければ NG（=分数や根号が残る場合）
        if hasattr(inside, 'is_polynomial') and not inside.is_polynomial():
            return False
        if not _all_integer_coeffs(inside):
            return False
        return True
    except Exception:
        return False

def factor_with_gcf(expr_str, factor_str):
    """指定の共通因数でくくった中身を返す（整数係数チェック付き）"""
    e = parse(expr_str)
    f = parse(factor_str)
    if e is None or f is None or f == 0:
        return ""
    try:
        inside = _safe_quotient(e, f)
        if inside is None:
            return ""
        if hasattr(inside, 'is_polynomial') and not inside.is_polynomial():
            return ""
        if not _all_integer_coeffs(inside):
            return ""
        return to_str(inside)
    except Exception:
        return ""

def is_already_factored(expr_str):
    """これ以上因数分解できないか"""
    expr = parse(expr_str)
    if expr is None:
        return True
    if not expr.is_Add:
        return True
    factored = sp.factor(expr)
    return not (factored.is_Mul or factored.is_Pow)

def needs_parens(expr_str):
    """表示時に括弧が必要か（多項式なら True）"""
    expr = parse(expr_str)
    if expr is None:
        return False
    return expr.is_Add and len(expr.args) > 1

def count_terms(expr_str):
    expr = parse(expr_str)
    if expr is None:
        return 0
    expr = sp.expand(expr)
    if expr.is_Add:
        return len(expr.args)
    return 1

def diff_of_squares(expr_str):
    """a²-b² の (a, b) を返す。違えば None。factor() ベース。"""
    expr = parse(expr_str)
    if expr is None:
        return None
    expr = sp.expand(expr)
    if not expr.is_Add or len(expr.args) != 2:
        return None
    factored = sp.factor(expr)
    if factored == expr:
        # 因数分解できない
        return None
    # 因数を取り出す（定数 × 2項 × 2項 などの形を想定）
    args = sp.Mul.make_args(factored)
    binomials = []
    constants = []
    for f in args:
        if f.is_Add and len(f.args) == 2:
            binomials.append(f)
        else:
            constants.append(f)
    if len(binomials) != 2:
        return None
    const = sp.Mul(*constants) if constants else sp.S.One
    if const != 1:
        return None
    f1, f2 = binomials
    # (a+b)(a-b) なら a = (f1+f2)/2、b = (f1-f2)/2
    a = sp.simplify((f1 + f2) / 2)
    b = sp.simplify((f1 - f2) / 2)
    if b == 0:
        return None
    # 符号を整える（b が負なら反転）
    if b.could_extract_minus_sign():
        b = -b
    if sp.expand((a + b) * (a - b)) == expr:
        return [to_str(a), to_str(b)]
    return None

def is_diff_of_squares(expr_str):
    return diff_of_squares(expr_str) is not None

def equal_expr(a_str, b_str):
    a = parse(a_str)
    b = parse(b_str)
    if a is None or b is None:
        return False
    try:
        return sp.simplify(a - b) == 0
    except Exception:
        return False

def factored_eq_problem(student_str, problem_str):
    s = parse(student_str)
    p = parse(problem_str)
    if s is None or p is None:
        return False
    try:
        return sp.expand(s) == sp.expand(p)
    except Exception:
        return False

def factor_full(expr_str):
    """完全に因数分解した結果"""
    expr = parse(expr_str)
    if expr is None:
        return ""
    return to_str(sp.factor(expr))

def is_perfect_square_form(expr_str):
    """expr が (x+a)² の形か"""
    expr = parse(expr_str)
    if expr is None:
        return False
    expr_e = sp.expand(expr)
    factored = sp.factor(expr_e)
    return factored.is_Pow and factored.exp == 2

def sum_and_product(expr_str):
    """x² + bx + c から [b, c] を返す（b, c は 2 変数の場合 y を含む式）。
    先頭係数が 1 になる主変数を選ぶ（x優先）"""
    expr = parse(expr_str)
    if expr is None:
        return None
    expr_e = sp.expand(expr)
    if not expr_e.is_Add or len(expr_e.args) != 3:
        return None
    syms = list(expr_e.free_symbols)
    if not syms:
        return None
    # x を優先、その後アルファベット順
    syms.sort(key=lambda s: (0 if str(s) == 'x' else 1, str(s)))
    for x in syms:
        try:
            poly = sp.Poly(expr_e, x)
            coeffs = poly.all_coeffs()
            if len(coeffs) == 3 and coeffs[0] == 1:
                return [to_str(coeffs[1]), to_str(coeffs[2])]
        except Exception:
            continue
    return None

def factor_pair(expr_str):
    """x² + bx + c → (x+p)(x+q) の [p, q] を返す（同じなら [p, p]）。
    2 変数の場合 p, q は y などを含む式でも OK。"""
    sp_data = sum_and_product(expr_str)
    if sp_data is None:
        return None
    b = parse(sp_data[0])
    c = parse(sp_data[1])
    t = sp.Symbol('_t_internal')
    sols = sp.solve(t**2 - b*t + c, t)
    if not sols:
        return None
    if len(sols) == 1:
        s = sols[0]
        if 'sqrt' in str(s) or 'I' in str(s):
            return None
        return [to_str(s), to_str(s)]
    if len(sols) != 2:
        return None
    p, q = sols
    if 'sqrt' in str(p) or 'sqrt' in str(q):
        return None
    if 'I' in str(p) or 'I' in str(q):
        return None
    return [to_str(p), to_str(q)]

def is_factorable_4term(expr_str):
    """4 項で因数分解できるか"""
    expr = parse(expr_str)
    if expr is None:
        return False
    expr_e = sp.expand(expr)
    if not expr_e.is_Add or len(expr_e.args) != 4:
        return False
    factored = sp.factor(expr_e)
    return factored != expr_e and (factored.is_Mul or factored.is_Pow)

def grouping_steps(expr_str):
    """4 項を 2 項ずつに分け、共通因数でくくった中間結果を返す"""
    expr = parse(expr_str)
    if expr is None:
        return None
    expr_e = sp.expand(expr)
    if not expr_e.is_Add or len(expr_e.args) != 4:
        return None
    args_list = list(expr_e.args)
    from itertools import combinations

    candidates = []
    for pair_idx in combinations(range(4), 2):
        rest_idx = [i for i in range(4) if i not in pair_idx]
        p1 = args_list[pair_idx[0]] + args_list[pair_idx[1]]
        p2 = args_list[rest_idx[0]] + args_list[rest_idx[1]]
        f1 = sp.factor(p1)
        f2 = sp.factor(p2)
        f1_args = list(sp.Mul.make_args(f1)) if f1.is_Mul else [f1]
        f2_args = list(sp.Mul.make_args(f2)) if f2.is_Mul else [f2]
        f1_bins = [a for a in f1_args if a.is_Add]
        f2_bins = [a for a in f2_args if a.is_Add]
        for b1 in f1_bins:
            for b2 in f2_bins:
                if sp.expand(b1) == sp.expand(b2):
                    final = sp.factor(p1 + p2)
                    # 両方の組で実際にくくり出しが起きているものを優先
                    score = 0
                    if f1 != p1:
                        score += 1
                    if f2 != p2:
                        score += 1
                    candidates.append((score, p1, f1, p2, f2, b1, final))
    if not candidates:
        return None
    # 優先順位: ①両方の組で因数分解が起きる ②前2項で因数分解が起きる
    candidates.sort(key=lambda c: (-c[0], 0 if c[2] != c[1] else 1))
    _, p1, f1, p2, f2, common, final = candidates[0]
    return [
        to_str(p1),
        to_str(f1),
        to_str(p2),
        to_str(f2),
        to_str(common),
        to_str(final),
    ]

def factored_eq_target(student_str, target_str):
    """生徒の答えが対象式と展開して一致するか"""
    s = parse(student_str)
    t = parse(target_str)
    if s is None or t is None:
        return False
    try:
        return sp.expand(s) == sp.expand(t)
    except Exception:
        return False

def random_problem(level=1):
    import random
    x = sp.Symbol('x')
    y = sp.Symbol('y')
    if level == 1:
        # ax² + bx 型（共通因数あり）
        a = random.choice([2, 3, 4, 5])
        b = a * random.randint(2, 5)
        return to_str(a*x**2 + b*x)
    elif level == 2:
        # x² - n² または ax² - by²
        if random.random() < 0.6:
            c = random.choice([1, 4, 9, 16, 25, 36])
            return to_str(x**2 - c)
        else:
            a2 = random.choice([1, 4, 9])
            b2 = random.choice([1, 4, 9])
            return to_str(a2*x**2 - b2*y**2)
    elif level == 3:
        # x² + (p+q)x + pq または x² + (p+q)xy + pq*y²
        if random.random() < 0.7:
            p = random.choice([-5, -4, -3, -2, 2, 3, 4, 5])
            q = random.choice([-5, -4, -3, -2, 2, 3, 4, 5])
            return to_str(sp.expand((x + p)*(x + q)))
        else:
            p = random.choice([2, 3, 4, 5])
            q = random.choice([2, 3, 4, 5])
            return to_str(sp.expand((x + p*y)*(x + q*y)))
    else:
        # 4 項：(x+a)(y+b) = xy + bx + ay + ab
        a = random.choice([1, 2, 3])
        b = random.choice([1, 2, 3])
        return to_str(sp.expand((x + a)*(y + b)))

def random_problem_chain():
    """共通因数くくり後さらに因数分解できる問題（例: 2x² - 18 = 2(x+3)(x-3)）"""
    import random
    x = sp.Symbol('x')
    k = random.choice([2, 3, 4, 5])
    c = random.choice([1, 4, 9, 16, 25])
    return to_str(k*x**2 - k*c)
`;

// ---------- Pyodide 初期化 ----------
async function initPyodide() {
  try {
    document.getElementById('loading-text').textContent = '⏳ Pyodide 読み込み中…';
    pyodide = await loadPyodide();
    document.getElementById('loading-text').textContent = '⏳ SymPy パッケージ読み込み中…';
    await pyodide.loadPackage('sympy');
    document.getElementById('loading-text').textContent = '⏳ 準備中…';
    pyodide.runPython(PYTHON_CODE);
    console.log('Pyodide + SymPy ready');
  } catch (e) {
    console.error('Pyodide init failed:', e);
    document.getElementById('loading-text').textContent =
      '❌ ライブラリの読み込みに失敗しました。ページを再読み込みしてください。';
    throw e;
  }
}

function py(funcName, ...args) {
  args.forEach((v, i) => pyodide.globals.set(`_arg${i}`, v));
  const argList = args.map((_, i) => `_arg${i}`).join(', ');
  let result = pyodide.runPython(`${funcName}(${argList})`);
  // PyProxy → JS 変換（Listなど）
  if (result && typeof result.toJs === 'function') {
    result = result.toJs();
  }
  return result;
}

// ---------- UI ヘルパー ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function setProgress(active, done = []) {
  $$('.step').forEach((el) => {
    const key = el.dataset.key;
    el.classList.remove('active', 'done');
    if (done.includes(key)) el.classList.add('done');
    if (key === active) el.classList.add('active');
  });
}

function clearChat() {
  $('#chat').innerHTML = '';
  $('#chat').hidden = false;
}

function scrollToBottom() {
  // math-field など遅延レンダリングするカスタム要素に対応するため複数回スクロール
  const doScroll = () => window.scrollTo(0, document.documentElement.scrollHeight);
  requestAnimationFrame(() => requestAnimationFrame(doScroll));
  setTimeout(doScroll, 80);
  setTimeout(doScroll, 250);
}

function bubble(text, type = 'app') {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  div.textContent = text;
  $('#chat').appendChild(div);
  scrollToBottom();
}

function bubbleHTML(html, type = 'app') {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  div.innerHTML = html;
  $('#chat').appendChild(div);
  scrollToBottom();
}

function setInputArea(html) {
  $('#input-area').innerHTML = html;
  $('#input-area').hidden = false;
  scrollToBottom();
}

// ---------- 数式表示用整形 ----------
function pretty(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/(\*\*|\^)(\d+)/g, (_, _op, n) => {
      const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
      return n.split('').map(d => sup[parseInt(d)] || d).join('');
    })
    .replace(/\*/g, '')
    .replace(/-/g, '−')
    .replace(/\s+/g, ' ');
}

function readMathField(id) {
  const mf = document.getElementById(id);
  if (!mf) return '';
  let v = '';
  try {
    v = mf.getValue ? mf.getValue('ascii-math') : (mf.value || '');
  } catch (e) {
    v = mf.value || '';
  }
  return (v || '').trim();
}

// Enter キーで送信 + 最初のフィールドにフォーカス
function bindEnterSubmit(fieldIds, submitFn) {
  setTimeout(() => {
    const ids = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
    ids.forEach((id) => {
      const mf = document.getElementById(id);
      if (!mf) return;
      mf.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          submitFn();
        }
      });
    });
    const first = document.getElementById(ids[0]);
    if (first) first.focus();
  }, 100);
}

// ---------- スタート画面 ----------
function showStart() {
  setProgress('start');
  clearChat();
  bubble('こんにちは！因数分解を一緒にやってみよう。\n問題を入力する？それとも、こちらで練習問題を出す？');
  setInputArea(`
    <div class="input-buttons">
      <button class="btn" onclick="startInput()">問題を入力する</button>
      <button class="btn btn-secondary" onclick="startRandom()">練習問題を出す</button>
    </div>
  `);
}

window.startInput = function() {
  bubble('問題を入力してね！(例: x^2-9, 2x^2+8x)', 'app');
  setInputArea(`
    <div class="input-row">
      <math-field id="problem-input" placeholder="例: x^2-9"></math-field>
      <button class="btn" onclick="submitProblem()">送信</button>
    </div>
  `);
  bindEnterSubmit('problem-input', window.submitProblem);
};

window.startRandom = function() {
  // 1=共通因数, 2=a²-b², 3=3項, 4=4項組み合わせ, 5=連鎖
  const r = Math.random();
  let probStr;
  if (r < 0.20) probStr = py('random_problem', 1);
  else if (r < 0.40) probStr = py('random_problem', 2);
  else if (r < 0.65) probStr = py('random_problem', 3);
  else if (r < 0.85) probStr = py('random_problem', 4);
  else probStr = py('random_problem_chain');
  bubbleHTML(`じゃあ、こちらの問題：<br><b style="font-size:1.2em">${pretty(probStr)} を因数分解</b>`, 'app');
  startSolving(probStr);
};

window.submitProblem = function() {
  const ascii = readMathField('problem-input');
  if (!ascii) { alert('式を入力してください'); return; }
  bubble(pretty(ascii), 'user');
  pyodide.globals.set('_chk', ascii);
  const valid = pyodide.runPython('parse(_chk) is not None');
  if (!valid) {
    bubble('うーん、その式は読み取れないよ。もう一度入力してみて。', 'app');
    return;
  }
  startSolving(ascii);
};

// ---------- ステップ ----------
function startSolving(probStr) {
  problem = probStr;
  currentExpr = probStr;
  attempts = 0;
  userGCF = null;
  askGCF();
}

function askGCF() {
  setProgress('gcf', ['start']);
  attempts = 0;
  bubbleHTML(`<b>${pretty(currentExpr)}</b> について、まず共通因数はある？`, 'app');
  setInputArea(`
    <div class="input-buttons">
      <button class="btn btn-yes" onclick="answerGCF(true)">はい</button>
      <button class="btn btn-no" onclick="answerGCF(false)">いいえ</button>
      <button class="btn-tell" onclick="tellGCF()">教えて</button>
    </div>
  `);
}

window.tellGCF = function() {
  bubble('教えて！', 'user');
  const has = py('has_gcf', currentExpr);
  if (has) {
    const g = py('gcf', currentExpr);
    const wrap = py('needs_parens', g);
    const display = wrap ? `(${pretty(g)})` : pretty(g);
    bubbleHTML(`実は共通因数があって、<b>${display}</b> だよ。`, 'hint');
    userGCF = g;
    setTimeout(() => factorOut(), 1700);
  } else {
    bubble('この式には共通因数はないんだ。次のステップへ進もう！', 'hint');
    setTimeout(() => goToTermsStep(), 1500);
  }
};

window.answerGCF = function(yes) {
  bubble(yes ? 'はい' : 'いいえ', 'user');
  const actual = py('has_gcf', currentExpr);
  if (yes && actual) {
    bubble('正解！', 'correct');
    askGCFValue();
  } else if (yes && !actual) {
    bubble(`実は ${pretty(currentExpr)} には共通因数がないんだ。よく見てみよう。`, 'hint');
    setTimeout(() => goToTermsStep(), 1200);
  } else if (!yes && actual) {
    bubble('実は共通因数があるよ！\n両方の項に共通する数や文字を探してみよう。', 'hint');
    askGCFValue();
  } else {
    bubble('正解！共通因数なしだね。', 'correct');
    setTimeout(() => goToTermsStep(), 600);
  }
};

function askGCFValue() {
  attempts = 0;
  bubble('共通因数は何かな？', 'app');
  setInputArea(`
    <div class="input-row">
      <math-field id="gcf-input" placeholder="共通因数を入力"></math-field>
      <button class="btn" onclick="submitGCF()">送信</button>
      <button class="btn-tell" onclick="tellGCFValue()">教えて</button>
    </div>
  `);
  bindEnterSubmit('gcf-input', window.submitGCF);
}

window.tellGCFValue = function() {
  bubble('教えて！', 'user');
  const g = py('gcf', currentExpr);
  const wrap = py('needs_parens', g);
  const display = wrap ? `(${pretty(g)})` : pretty(g);
  bubbleHTML(`共通因数は <b>${display}</b> だよ。`, 'hint');
  userGCF = g;
  setTimeout(() => factorOut(), 1500);
};

window.submitGCF = function() {
  const ascii = readMathField('gcf-input');
  if (!ascii) return;
  bubble(pretty(ascii), 'user');
  pyodide.globals.set('_a', ascii);
  pyodide.globals.set('_e', currentExpr);
  const ok = pyodide.runPython('is_valid_gcf(_a, _e)');
  if (ok) {
    userGCF = ascii;
    bubble(`正解！${pretty(ascii)} が共通因数だね。`, 'correct');
    factorOut();
  } else {
    attempts++;
    const correct = py('gcf', currentExpr);
    if (attempts < 2) {
      bubble('おしい！もう一度。各項を見て、共通の数・文字・かっこを探してみて。', 'hint');
      askGCFValue();
    } else {
      bubble(`正解は ${pretty(correct)} だよ。`, 'hint');
      userGCF = correct;
      setTimeout(() => factorOut(), 1200);
    }
  }
};

function factorOut() {
  const useGCF = userGCF || py('gcf', currentExpr);
  const inside = py('factor_with_gcf', currentExpr, useGCF);
  const wrap = py('needs_parens', useGCF);
  const gcfDisplay = wrap ? `(${pretty(useGCF)})` : pretty(useGCF);
  bubbleHTML(
    `共通因数 <b>${gcfDisplay}</b> でくくると：<br>` +
    `<b>${pretty(currentExpr)} = ${gcfDisplay}(${pretty(inside)})</b>`,
    'app'
  );
  currentExpr = inside;
  userGCF = null;
  // 中身が既に因数分解できないなら直接終了へ
  const done = py('is_already_factored', inside);
  if (done) {
    setTimeout(() => finalize(), 1500);
  } else {
    setTimeout(() => goToTermsStep(), 1500);
  }
}

function goToTermsStep() {
  setProgress('terms', ['start', 'gcf']);
  attempts = 0;
  const n = py('count_terms', currentExpr);
  if (n === 1) { finalize(); return; }
  bubbleHTML(`次は <b>${pretty(currentExpr)}</b> の項の数。何項？`, 'app');
  setInputArea(`
    <div class="input-buttons">
      <button class="btn" onclick="answerTerms(2, '2 項')">2 項</button>
      <button class="btn" onclick="answerTerms(3, '3 項')">3 項</button>
      <button class="btn" onclick="answerTerms(4, '4 項以上')">4 項以上</button>
      <button class="btn-tell" onclick="tellTerms()">教えて</button>
    </div>
  `);
}

window.tellTerms = function() {
  bubble('教えて！', 'user');
  const n = py('count_terms', currentExpr);
  const label = n >= 4 ? `${n} 項（4 項以上）` : `${n} 項`;
  bubble(`項の数は ${label} だよ。`, 'hint');
  setTimeout(() => {
    if (n === 2) askDiffOfSquares();
    else if (n === 3) askDoubleSquare();
    else if (n === 4) askGrouping();
    else finalize();
  }, 1500);
};

window.answerTerms = function(n, label) {
  bubble(label || `${n} 項`, 'user');
  const actual = py('count_terms', currentExpr);
  // 「4項以上」を選んだ場合: 実際の項数が 4 以上なら正解扱い
  const ok = (n >= 4) ? (actual >= 4) : (n === actual);
  if (ok) {
    const actualLabel = actual >= 4 ? `${actual} 項` : `${actual} 項`;
    bubble(`正解！${actualLabel}だね。`, 'correct');
  } else {
    bubble(`実は ${actual} 項だよ。`, 'hint');
  }
  if (actual === 2) {
    setTimeout(() => askDiffOfSquares(), 800);
  } else if (actual === 3) {
    setTimeout(() => askDoubleSquare(), 800);
  } else if (actual === 4) {
    setTimeout(() => askGrouping(), 800);
  } else {
    bubble('未対応のパターンです。', 'app');
    setTimeout(() => finalize(true), 1200);
  }
};

function askDiffOfSquares() {
  setProgress('formula', ['start', 'gcf', 'terms']);
  attempts = 0;
  bubbleHTML(`2 項なら、<b>a² − b²</b> の形になっているかチェック！<br><b>${pretty(currentExpr)}</b> は a² − b² の形になってる？`, 'app');
  setInputArea(`
    <div class="input-buttons">
      <button class="btn btn-yes" onclick="answerDiffSq(true)">はい</button>
      <button class="btn btn-no" onclick="answerDiffSq(false)">いいえ</button>
      <button class="btn-tell" onclick="tellDiffSq()">教えて</button>
    </div>
  `);
}

window.tellDiffSq = function() {
  bubble('教えて！', 'user');
  const ab = py('diff_of_squares', currentExpr);
  if (ab) {
    bubble(`a² − b² の形だよ。a = ${pretty(ab[0])}, b = ${pretty(ab[1])} で当てはまるよ。`, 'hint');
    setTimeout(() => askAB(ab), 1700);
  } else {
    bubble('a² − b² の形ではないんだ。これ以上は因数分解できないよ。', 'hint');
    setTimeout(() => finalize(), 1500);
  }
};

window.answerDiffSq = function(yes) {
  bubble(yes ? 'はい' : 'いいえ', 'user');
  const ab = py('diff_of_squares', currentExpr);
  const actual = ab !== null && ab !== undefined;
  if (yes && actual) {
    bubble('正解！', 'correct');
    setTimeout(() => askAB(ab), 600);
  } else if (yes && !actual) {
    bubble('実は a² − b² の形ではないんだ。', 'hint');
    setTimeout(() => finalize(true), 1200);
  } else if (!yes && actual) {
    bubble('実は a² − b² の形だよ！両方の項が「何かの 2 乗」になっているか見てみよう。', 'hint');
    setTimeout(() => askAB(ab), 1200);
  } else {
    bubble('そうだね、a² − b² ではないので、ここまでで終了！', 'correct');
    setTimeout(() => finalize(), 800);
  }
};

function askAB(ab) {
  abValues = ab;
  attempts = 0;
  bubble('では、a と b は何かな？\n（例: a = x, b = 3）', 'app');
  setInputArea(`
    <div class="input-row">
      <span class="label">a =</span>
      <math-field id="a-input" placeholder="a"></math-field>
      <span class="label">, b =</span>
      <math-field id="b-input" placeholder="b"></math-field>
      <button class="btn" onclick="submitAB()">送信</button>
      <button class="btn-tell" onclick="tellAB()">教えて</button>
    </div>
  `);
  bindEnterSubmit(['a-input', 'b-input'], window.submitAB);
}

window.tellAB = function() {
  bubble('教えて！', 'user');
  bubble(`a = ${pretty(abValues[0])}, b = ${pretty(abValues[1])} だよ。`, 'hint');
  setTimeout(() => askFinalForm(), 1500);
};

window.submitAB = function() {
  const a = readMathField('a-input');
  const b = readMathField('b-input');
  if (!a || !b) return;
  bubble(`a = ${pretty(a)}, b = ${pretty(b)}`, 'user');
  pyodide.globals.set('_ua', a);
  pyodide.globals.set('_ub', b);
  pyodide.globals.set('_xa', abValues[0]);
  pyodide.globals.set('_xb', abValues[1]);
  const aOK = pyodide.runPython('equal_expr(_ua, _xa) or equal_expr(_ua, "-(" + _xa + ")")');
  const bOK = pyodide.runPython('equal_expr(_ub, _xb) or equal_expr(_ub, "-(" + _xb + ")")');
  if (aOK && bOK) {
    bubble(`正解！a = ${pretty(abValues[0])}, b = ${pretty(abValues[1])} だね。`, 'correct');
    setTimeout(() => askFinalForm(), 600);
  } else {
    attempts++;
    if (attempts < 2) {
      bubble(`もう一度。${pretty(currentExpr)} を a² − b² の形にすると…？`, 'hint');
      askAB(abValues);
    } else {
      bubble(`正解は a = ${pretty(abValues[0])}, b = ${pretty(abValues[1])} だよ。`, 'hint');
      setTimeout(() => askFinalForm(), 1200);
    }
  }
};

function askFinalForm() {
  attempts = 0;
  bubble('a² − b² = (a + b)(a − b) に当てはめて、答えは？', 'app');
  setInputArea(`
    <div class="input-row">
      <math-field id="final-input" placeholder="例: (x+3)(x-3)"></math-field>
      <button class="btn" onclick="submitFinal()">送信</button>
      <button class="btn-tell" onclick="tellFinal()">教えて</button>
    </div>
  `);
  bindEnterSubmit('final-input', window.submitFinal);
}

window.tellFinal = function() {
  bubble('教えて！', 'user');
  const a = pretty(abValues[0]);
  const b = pretty(abValues[1]);
  bubble(`(${a} + ${b})(${a} − ${b}) だよ。`, 'hint');
  setTimeout(() => finalize(), 1500);
};

window.submitFinal = function() {
  const ans = readMathField('final-input');
  if (!ans) return;
  bubble(pretty(ans), 'user');
  pyodide.globals.set('_ans', ans);
  pyodide.globals.set('_target', currentExpr);
  pyodide.globals.set('_orig', problem);
  const ok = pyodide.runPython(
    'factored_eq_target(_ans, _target) or factored_eq_target(_ans, _orig)'
  );
  if (ok) {
    bubble('正解！🎉', 'correct');
    setTimeout(() => finalize(), 600);
  } else {
    attempts++;
    if (attempts < 2) {
      bubble(`もう一度。a = ${pretty(abValues[0])}, b = ${pretty(abValues[1])} を (a+b)(a−b) に入れてみて。`, 'hint');
      askFinalForm();
    } else {
      bubble(`答えは (${pretty(abValues[0])} + ${pretty(abValues[1])})(${pretty(abValues[0])} − ${pretty(abValues[1])}) だよ。`, 'hint');
      setTimeout(() => finalize(), 1200);
    }
  }
};

// ===== 3項パターン =====
let factorPair = null;
let isSameNumbers = false;

function askDoubleSquare() {
  setProgress('formula', ['start', 'gcf', 'terms']);
  attempts = 0;
  bubbleHTML(`3 項なら、まず両端を見よう！<br><b>${pretty(currentExpr)}</b> の両端は「2乗の数」になっている？`, 'app');
  setInputArea(`
    <div class="input-buttons">
      <button class="btn btn-yes" onclick="answerDoubleSquare(true)">はい</button>
      <button class="btn btn-no" onclick="answerDoubleSquare(false)">いいえ</button>
      <button class="btn-tell" onclick="tellDoubleSquare()">教えて</button>
    </div>
  `);
}

window.tellDoubleSquare = function() {
  bubble('教えて！', 'user');
  const isPS = py('is_perfect_square_form', currentExpr);
  if (isPS) {
    bubble('両端が2乗で、(x+a)² の形になるよ。', 'hint');
  } else {
    bubble('(x+a)(x+b) の形だよ。', 'hint');
  }
  setTimeout(() => askFactorPair(), 1500);
};

window.answerDoubleSquare = function(yes) {
  bubble(yes ? 'はい' : 'いいえ', 'user');
  const actualPS = py('is_perfect_square_form', currentExpr);
  if (yes && actualPS) {
    bubble('正解！(x+a)² の形になりそうだね。', 'correct');
  } else if (yes && !actualPS) {
    bubble('両端は2乗っぽいけど、(x+a)² の形にはならないよ。\n(x+a)(x+b) の形を探そう。', 'hint');
  } else if (!yes && actualPS) {
    bubble('実は両端2乗で、(x+a)² の形になるよ！', 'hint');
  } else {
    bubble('そうだね。(x+a)(x+b) の形を探そう。', 'correct');
  }
  setTimeout(() => askFactorPair(), 1100);
};

function askFactorPair() {
  attempts = 0;
  const sumProd = py('sum_and_product', currentExpr);
  if (!sumProd) {
    bubble('うーん、未対応のパターンかも。', 'app');
    setTimeout(() => finalize(true), 1200);
    return;
  }
  const [s, p] = sumProd;
  bubble(`では、たして ${pretty(s)}、かけて ${pretty(p)} になる 2 数は何かな？`, 'app');
  setInputArea(`
    <div class="input-row">
      <span class="label">2 数:</span>
      <math-field id="num1-input" placeholder="1つ目"></math-field>
      <span class="label">と</span>
      <math-field id="num2-input" placeholder="2つ目"></math-field>
      <button class="btn" onclick="submitFactorPair()">送信</button>
      <button class="btn-tell" onclick="tellFactorPair()">教えて</button>
    </div>
  `);
  bindEnterSubmit(['num1-input', 'num2-input'], window.submitFactorPair);
}

window.tellFactorPair = function() {
  bubble('教えて！', 'user');
  const correct = py('factor_pair', currentExpr);
  if (!correct) {
    bubble('未対応のパターンかも。', 'hint');
    setTimeout(() => finalize(true), 1200);
    return;
  }
  factorPair = correct;
  pyodide.globals.set('_c1', correct[0]);
  pyodide.globals.set('_c2', correct[1]);
  isSameNumbers = pyodide.runPython('equal_expr(_c1, _c2)');
  let msg = `${pretty(correct[0])} と ${pretty(correct[1])} だよ。`;
  if (isSameNumbers) msg += ' 同じ数だから (x+a)² の形だね！';
  bubble(msg, 'hint');
  setTimeout(() => askFinal3Term(), 1700);
};

window.submitFactorPair = function() {
  const n1 = readMathField('num1-input');
  const n2 = readMathField('num2-input');
  if (!n1 || !n2) return;
  bubble(`${pretty(n1)} と ${pretty(n2)}`, 'user');
  const correct = py('factor_pair', currentExpr);
  if (!correct) {
    bubble('うーん、未対応のパターンかも。', 'hint');
    setTimeout(() => finalize(true), 1200);
    return;
  }
  pyodide.globals.set('_n1', n1);
  pyodide.globals.set('_n2', n2);
  pyodide.globals.set('_c1', correct[0]);
  pyodide.globals.set('_c2', correct[1]);
  const ok = pyodide.runPython(
    '(equal_expr(_n1, _c1) and equal_expr(_n2, _c2)) or (equal_expr(_n1, _c2) and equal_expr(_n2, _c1))'
  );
  if (ok) {
    const same = pyodide.runPython('equal_expr(_c1, _c2)');
    factorPair = correct;
    isSameNumbers = same;
    let msg = `正解！${pretty(correct[0])} と ${pretty(correct[1])} だね。`;
    if (same) msg += '\n2 数が同じだから (x+a)² の形だね！';
    bubble(msg, 'correct');
    setTimeout(() => askFinal3Term(), 1200);
  } else {
    attempts++;
    if (attempts < 2) {
      const [s, p] = py('sum_and_product', currentExpr);
      bubble(`もう一度。たして ${pretty(s)}、かけて ${pretty(p)} になる数は？`, 'hint');
      askFactorPair();
    } else {
      bubble(`正解は ${pretty(correct[0])} と ${pretty(correct[1])} だよ。`, 'hint');
      factorPair = correct;
      isSameNumbers = pyodide.runPython('equal_expr(_c1, _c2)');
      setTimeout(() => askFinal3Term(), 1200);
    }
  }
};

function askFinal3Term() {
  attempts = 0;
  if (isSameNumbers) {
    bubble('(x+a)² の形に当てはめて、答えは？', 'app');
  } else {
    bubble('(x+a)(x+b) の形に当てはめて、答えは？', 'app');
  }
  setInputArea(`
    <div class="input-row">
      <math-field id="final3-input" placeholder="例: (x+2)(x+3)"></math-field>
      <button class="btn" onclick="submitFinal3()">送信</button>
      <button class="btn-tell" onclick="tellFinal3()">教えて</button>
    </div>
  `);
  bindEnterSubmit('final3-input', window.submitFinal3);
}

window.tellFinal3 = function() {
  bubble('教えて！', 'user');
  const ans = py('factor_full', currentExpr);
  bubble(`${pretty(ans)} だよ。`, 'hint');
  setTimeout(() => finalize(), 1500);
};

window.submitFinal3 = function() {
  const ans = readMathField('final3-input');
  if (!ans) return;
  bubble(pretty(ans), 'user');
  pyodide.globals.set('_ans', ans);
  pyodide.globals.set('_target', currentExpr);
  pyodide.globals.set('_orig', problem);
  const ok = pyodide.runPython(
    'factored_eq_target(_ans, _target) or factored_eq_target(_ans, _orig)'
  );
  if (ok) {
    bubble('正解！🎉', 'correct');
    setTimeout(() => finalize(), 600);
  } else {
    attempts++;
    const [a, b] = factorPair;
    if (attempts < 2) {
      bubble(`もう一度。${pretty(a)} と ${pretty(b)} を当てはめて。`, 'hint');
      askFinal3Term();
    } else {
      const correctForm = py('factor_full', problem);
      bubble(`答えは ${pretty(correctForm)} だよ。`, 'hint');
      setTimeout(() => finalize(), 1200);
    }
  }
};

// ===== 4項：組み合わせの因数分解 =====
function askGrouping() {
  setProgress('formula', ['start', 'gcf', 'terms']);
  attempts = 0;
  const steps = py('grouping_steps', currentExpr);
  if (!steps) {
    bubble('うーん、組み合わせの因数分解ができないみたい。', 'hint');
    setTimeout(() => finalize(true), 1200);
    return;
  }
  // steps = [pair1, pair1_factored, pair2, pair2_factored, common, final]
  const [p1, p1f, p2, p2f, common, final] = steps;
  bubbleHTML(
    `4 項のときは、<b>組み合わせの因数分解</b>！<br>` +
    `2 項ずつに分けて、共通因数でくくろう。`,
    'app'
  );
  bubbleHTML(
    `<b>${pretty(currentExpr)} = ${pretty(p1f)} + (${pretty(p2f)})</b> と変形できるね。<br>` +
    `<b>${pretty(common)}</b> が共通しているから、答えは？`,
    'app'
  );
  setInputArea(`
    <div class="input-row">
      <math-field id="grouping-input" placeholder="例: (x+1)(y+1)"></math-field>
      <button class="btn" onclick="submitGrouping()">送信</button>
      <button class="btn-tell" onclick="tellGrouping()">教えて</button>
    </div>
  `);
  bindEnterSubmit('grouping-input', window.submitGrouping);
}

window.tellGrouping = function() {
  bubble('教えて！', 'user');
  const ans = py('factor_full', currentExpr);
  bubble(`${pretty(ans)} だよ。`, 'hint');
  setTimeout(() => finalize(), 1500);
};

window.submitGrouping = function() {
  const ans = readMathField('grouping-input');
  if (!ans) return;
  bubble(pretty(ans), 'user');
  pyodide.globals.set('_ans', ans);
  pyodide.globals.set('_target', currentExpr);
  pyodide.globals.set('_orig', problem);
  const ok = pyodide.runPython(
    'factored_eq_target(_ans, _target) or factored_eq_target(_ans, _orig)'
  );
  if (ok) {
    bubble('正解！🎉', 'correct');
    setTimeout(() => finalize(), 600);
  } else {
    attempts++;
    if (attempts < 2) {
      bubble('もう一度。前 2 項と後 2 項に分けて、共通因数を取り出してまとめてみよう。', 'hint');
      askGrouping();
    } else {
      const correctForm = py('factor_full', problem);
      bubble(`答えは ${pretty(correctForm)} だよ。`, 'hint');
      setTimeout(() => finalize(), 1200);
    }
  }
};

function finalize(unfinished) {
  setProgress('done', ['start', 'gcf', 'terms', 'formula']);
  if (unfinished) {
    bubble('ここまで！次のパターン対応はこれから追加するね。', 'app');
  } else {
    const cantFactor = py('is_already_factored', problem);
    if (cantFactor) {
      bubbleHTML(`<b>${pretty(problem)}</b> はこれ以上因数分解できないね`, 'final');
    } else {
      const ans = py('factor_full', problem);
      bubbleHTML(`<b>${pretty(problem)} = ${pretty(ans)}</b>`, 'final');
    }
  }
  setInputArea(`
    <div class="input-buttons">
      <button class="btn" onclick="showStart()">もう一問</button>
    </div>
  `);
}

// ---------- 起動 ----------
(async () => {
  await initPyodide();
  $('#loading').hidden = true;
  showStart();
})();
