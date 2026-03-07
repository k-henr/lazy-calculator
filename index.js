(() => {
  // calculator.ts
  var Calculator = class {
    expressionListElement;
    constructor(expressionList2) {
      this.expressionListElement = expressionList2;
    }
    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
      const template = document.getElementById(
        "expression-template"
      );
      const exprElement = template.content.cloneNode(true).querySelector(".expression");
      const expression = {
        expressionString: "",
        element: exprElement,
        computedValue: null
      };
      exprElement.querySelector(
        ".expression-edit-field"
      ).onchange = (e) => {
        const target = e.target;
        this.setExpressionContent(expression, target.value);
      };
      exprElement.querySelector(
        ".remove-expression"
      ).onclick = () => {
        this.removeExpression(expression);
      };
      this.expressionListElement.appendChild(exprElement);
    }
    /**
     * Remove the given expression.
     * @param expression The expression to remove
     */
    removeExpression(expression) {
      this.expressionListElement.removeChild(expression.element);
    }
    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression, newValue) {
      expression.expressionString = newValue;
      const parser = new Parser(newValue);
      expression.computedValue = parser.evaluate();
      console.log(expression.computedValue);
    }
  };
  var Parser = class {
    inputString;
    tokens = null;
    peek() {
      return this.tokens[this.tokens.length - 1];
    }
    pop() {
      return this.tokens.pop();
    }
    expect(type) {
      const token = this.pop();
      if (token.type !== type)
        throw new Error(`Expected type ${type} but got ${token.type}!`);
      return token;
    }
    astTree = 0;
    constructor(inputString) {
      this.inputString = inputString;
    }
    evaluate() {
      this.tokenize();
      console.log(this.tokens);
      this.buildTree();
      console.log(this.astTree);
      return this.evaluateTree(this.astTree);
    }
    /**
     * Tokenize this parser's expression.
     * @returns The parsed result, or null if the expression gives no result
     */
    tokenize() {
      const matchedTokens = this.inputString.matchAll(tokenizer);
      if (!matchedTokens) return [];
      const tokens = [];
      for (const match of matchedTokens) {
        const { groups } = match;
        if (!groups) continue;
        const type = tokenPatterns.find(
          ({ type: type2 }) => groups[type2] !== void 0
        )?.type;
        if (!type) continue;
        switch (type) {
          case "VAR":
            tokens.unshift({ type, variableName: groups[type] });
            break;
          case "NUM":
            tokens.unshift({ type, value: Number(groups[type]) });
            break;
          default:
            tokens.unshift({ type });
        }
      }
      tokens.unshift({ type: "END" });
      this.tokens = tokens;
    }
    // Convert to AST tree
    buildTree() {
      if (!this.tokens)
        throw new Error(
          "Expression tried to parse before being tokenized!"
        );
      this.astTree = this.getExpression();
    }
    getExpression() {
      let value1 = this.getTerm();
      const tokenChecks = ["ADD", "SUB"];
      while (tokenChecks.includes(this.peek().type)) {
        const operator = this.pop().type;
        const value2 = this.getTerm();
        value1 = {
          operator,
          value1,
          value2
        };
      }
      const t = this.peek().type;
      if (t !== "END" && t !== "RPAREN") {
        throw new Error("Expected RPAREN or END but got " + t);
      }
      return value1;
    }
    getTerm() {
      let value1 = this.getFactor();
      const tokenChecks = ["MUL", "DIV"];
      while (tokenChecks.includes(this.peek().type)) {
        const operator = this.pop().type;
        const value2 = this.getTerm();
        value1 = {
          operator,
          value1,
          value2
        };
      }
      return value1;
    }
    // Exponentiation (right-associative)
    getFactor() {
      let value1 = this.getUnary();
      const tokenChecks = ["EXP"];
      if (tokenChecks.includes(this.peek().type)) {
        const operator = this.pop().type;
        const value2 = this.getFactor();
        value1 = {
          operator,
          value1,
          value2
        };
      }
      return value1;
    }
    // Unary minus
    getUnary() {
      if (this.peek().type === "SUB") {
        this.pop();
        return { operator: "SUB", value1: 0, value2: this.getPrimary() };
      } else return this.getPrimary();
    }
    getPrimary() {
      const t = this.pop();
      if (t.type === "NUM") {
        return t.value;
      }
      if (t.type === "VAR") {
        return t.variableName;
      }
      if (t.type === "LPAREN") {
        const expr = this.getExpression();
        this.expect("RPAREN");
        return expr;
      }
      throw new Error(`Unexpected token ${t}`);
    }
    evaluateTree(node) {
      if (node === void 0) return 0;
      if (typeof node === "string") {
        return 0;
      }
      if (typeof node === "number") {
        return Number(node);
      }
      node = node;
      const v1 = this.evaluateTree(node.value1);
      const v2 = this.evaluateTree(node.value2);
      switch (node.operator) {
        case "ADD":
          return v1 + v2;
        case "SUB":
          return v1 - v2;
        case "DIV":
          return v1 / v2;
        case "MUL":
          return v1 * v2;
        case "EXP":
          return Math.pow(v1, v2);
      }
      throw new Error("Unknown operator " + node.operator);
    }
  };
  var tokenPatterns = [
    { pattern: /(?<VAR>[A-Za-z]\w*)/, type: "VAR" },
    { pattern: /(?<NUM>\d+)/, type: "NUM" },
    { pattern: /(?<ADD>\+)/, type: "ADD" },
    { pattern: /(?<SUB>-)/, type: "SUB" },
    { pattern: /(?<MUL>\*)/, type: "MUL" },
    { pattern: /(?<DIV>\/)/, type: "DIV" },
    { pattern: /(?<EXP>\^)/, type: "EXP" },
    { pattern: /(?<LPAREN>\()/, type: "LPAREN" },
    { pattern: /(?<RPAREN>\))/, type: "RPAREN" }
  ];
  var tokenizer = new RegExp(
    tokenPatterns.map(({ pattern }) => pattern.source).join("|"),
    "g"
  );

  // index.ts
  var expressionList = document.getElementById("expressions");
  if (!expressionList) throw new Error("Couldn't find expression list!");
  var calculator = new Calculator(expressionList);
  var expressionAdder = document.getElementById("expression-adder");
  if (expressionAdder) expressionAdder.onclick = () => calculator.addExpression();
  calculator.addExpression();
})();
