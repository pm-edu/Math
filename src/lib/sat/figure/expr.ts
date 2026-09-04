// coordinate_plane 곡선(`curves[].expr`)용 초소형 수식 평가기. 새 의존성 추가 금지라서
// 자체 구현 — x 변수, + - * / ^, 단항 마이너스, 괄호, sqrt/abs만 지원(다항·유리함수면 충분).

type Token = { type: "num"; value: number } | { type: "ident"; value: string } | { type: "op"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "num", value: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9]/.test(src[j])) j++;
      tokens.push({ type: "ident", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`알 수 없는 문자: "${ch}"`);
  }
  return tokens;
}

type Node =
  | { type: "num"; value: number }
  | { type: "var" }
  | { type: "call"; name: string; arg: Node }
  | { type: "unary"; op: "-"; arg: Node }
  | { type: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new Error("수식이 예상보다 짧음");
    this.pos++;
    return t;
  }
  private expectOp(op: string) {
    const t = this.next();
    if (t.type !== "op" || t.value !== op) throw new Error(`"${op}" 예상, "${JSON.stringify(t)}" 발견`);
  }

  parseExpr(): Node {
    let left = this.parseTerm();
    while (this.peek()?.type === "op" && ["+", "-"].includes((this.peek() as Token & { type: "op" }).value)) {
      const op = (this.next() as Token & { type: "op" }).value as "+" | "-";
      left = { type: "binary", op, left, right: this.parseTerm() };
    }
    return left;
  }

  private parseTerm(): Node {
    let left = this.parsePower();
    while (this.peek()?.type === "op" && ["*", "/"].includes((this.peek() as Token & { type: "op" }).value)) {
      const op = (this.next() as Token & { type: "op" }).value as "*" | "/";
      left = { type: "binary", op, left, right: this.parsePower() };
    }
    return left;
  }

  private parsePower(): Node {
    const base = this.parseUnary();
    if (this.peek()?.type === "op" && (this.peek() as Token & { type: "op" }).value === "^") {
      this.next();
      return { type: "binary", op: "^", left: base, right: this.parsePower() };
    }
    return base;
  }

  private parseUnary(): Node {
    if (this.peek()?.type === "op" && (this.peek() as Token & { type: "op" }).value === "-") {
      this.next();
      return { type: "unary", op: "-", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.next();
    if (t.type === "num") return { type: "num", value: t.value };
    if (t.type === "ident") {
      if (t.value === "x") return { type: "var" };
      // 함수 호출: name(expr)
      this.expectOp("(");
      const arg = this.parseExpr();
      this.expectOp(")");
      return { type: "call", name: t.value, arg };
    }
    if (t.type === "op" && t.value === "(") {
      const inner = this.parseExpr();
      this.expectOp(")");
      return inner;
    }
    throw new Error(`예상치 못한 토큰: ${JSON.stringify(t)}`);
  }
}

function evalNode(node: Node, x: number): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "var":
      return x;
    case "unary":
      return -evalNode(node.arg, x);
    case "call": {
      const arg = evalNode(node.arg, x);
      if (node.name === "sqrt") return arg < 0 ? NaN : Math.sqrt(arg);
      if (node.name === "abs") return Math.abs(arg);
      throw new Error(`지원하지 않는 함수: ${node.name}`);
    }
    case "binary": {
      const l = evalNode(node.left, x);
      const r = evalNode(node.right, x);
      if (node.op === "+") return l + r;
      if (node.op === "-") return l - r;
      if (node.op === "*") return l * r;
      if (node.op === "/") return r === 0 ? NaN : l / r;
      if (node.op === "^") return Math.pow(l, r);
      throw new Error(`지원하지 않는 연산자: ${node.op}`);
    }
  }
}

/** "x^2 - 3*x + 2" 같은 식을 파싱해서, x값을 넣으면 계산해주는 함수를 돌려준다. */
export function compileExpr(expr: string): (x: number) => number {
  const ast = new Parser(tokenize(expr)).parseExpr();
  return (x: number) => evalNode(ast, x);
}
