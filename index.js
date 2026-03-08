(() => {
  // parser.ts
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
    evaluate(expression) {
      this.tokenize();
      this.buildTree();
      return this.evaluateTree(expression, this.astTree);
    }
    /**
     * Tokenize this parser's expression.
     */
    tokenize() {
      const matchedTokens = this.inputString.matchAll(tokenizer);
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
          case "INVALID":
            throw new Error(`Invalid token '${groups[type]}'!`);
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
      if (this.peek().type === "END") {
        this.astTree = 0;
      } else {
        this.astTree = this.getExpression();
      }
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
      throw new Error(`Unexpected token ${t.type}`);
    }
    evaluateTree(expression, node) {
      if (node === void 0) return 0;
      if (typeof node === "string") {
        const dependency = expression.calculator.fieldDefinitions[node];
        if (!dependency) throw new Error(`Couldn't find field '${node}'!`);
        dependency.usedBy.add(expression);
        return dependency.value;
      }
      if (typeof node === "number") {
        return Number(node);
      }
      node = node;
      const v1 = this.evaluateTree(expression, node.value1);
      const v2 = this.evaluateTree(expression, node.value2);
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
    { pattern: /(?<NUM>\d+(\.\d+)?)/, type: "NUM" },
    { pattern: /(?<ADD>\+)/, type: "ADD" },
    { pattern: /(?<SUB>-)/, type: "SUB" },
    { pattern: /(?<MUL>\*)/, type: "MUL" },
    { pattern: /(?<DIV>\/)/, type: "DIV" },
    { pattern: /(?<EXP>\^)/, type: "EXP" },
    { pattern: /(?<LPAREN>\()/, type: "LPAREN" },
    { pattern: /(?<RPAREN>\))/, type: "RPAREN" },
    { pattern: /(?<INVALID>[^\s])/, type: "INVALID" }
  ];
  var tokenizer = new RegExp(
    tokenPatterns.map(({ pattern }) => pattern.source).join("|"),
    "g"
  );

  // calculator.ts
  var Expression = class {
    calculator;
    element;
    resultElement;
    expressionString;
    definedField = null;
    value;
    usedBy = /* @__PURE__ */ new Set();
    template = document.getElementById(
      "expression-template"
    );
    constructor(calculator2, expressionString) {
      this.calculator = calculator2;
      this.expressionString = expressionString;
      this.value = 0;
      this.element = this.template.content.cloneNode(true).querySelector(".expression");
      this.resultElement = this.element.querySelector(".expression-result");
      if (this.resultElement === null)
        throw new Error("Result element not found on expression template!");
      this.element.querySelector(
        ".expression-edit-field"
      ).onchange = (e) => {
        const target = e.target;
        this.setContent(target.value);
      };
      this.element.querySelector(
        ".remove-expression"
      ).onclick = () => {
        calculator2.removeExpression(this);
      };
      calculator2.expressionListElement.appendChild(this.element);
      this.evaluate();
    }
    setContent(newContent) {
      this.expressionString = newContent;
      this.evaluate();
    }
    evaluate() {
      const parts = this.expressionString.split("=");
      if (parts.length === 1) {
        const parser = new Parser(parts[0]);
        this.value = parser.evaluate(this) ?? 0;
      } else if (parts.length === 2) {
        delete this.calculator.fieldDefinitions[this.definedField ?? ""];
        const leftSide = parts[0].trim();
        if (!leftSide.match(/^[A-Za-z]\w*$/g))
          throw new Error(`Invalid variable name '${leftSide}'!`);
        this.definedField = leftSide;
        const parser = new Parser(parts[1]);
        this.value = parser.evaluate(this) ?? 0;
        if (this.calculator.fieldDefinitions[this.definedField])
          throw new Error(
            `Field '${this.definedField}' is already defined!`
          );
        this.calculator.fieldDefinitions[this.definedField] = this;
        for (const user of this.usedBy) {
          user.evaluate();
        }
      } else {
        throw new Error("Too many equals signs!");
      }
      this.resultElement.innerText = `${this.definedField ?? ""} = ${Math.round(this.value * 1e4) / 1e4}`;
    }
  };
  var Calculator = class {
    expressionListElement;
    fieldDefinitions = {};
    constructor(expressionList2) {
      this.expressionListElement = expressionList2;
    }
    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
      const expression = new Expression(this, "");
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
      const definedField = expression.definedField;
      if (definedField) {
        delete this.fieldDefinitions[definedField];
      }
      expression.setContent(newValue);
    }
  };

  // index.ts
  var expressionList = document.getElementById("expressions");
  if (!expressionList) throw new Error("Couldn't find expression list!");
  var calculator = new Calculator(expressionList);
  var expressionAdder = document.getElementById("expression-adder");
  if (expressionAdder) expressionAdder.onclick = () => calculator.addExpression();
  calculator.addExpression();
})();
