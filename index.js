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
        throw new CalculatorError(
          `Expected type ${type} but got ${token.type}!`
        );
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
            throw new CalculatorError(
              `Invalid token '${groups[type]}'!`
            );
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
        throw new CalculatorError(
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
        throw new CalculatorError("Expected RPAREN or END but got " + t);
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
      throw new CalculatorError(`Unexpected token ${t.type}`);
    }
    evaluateTree(expression, node) {
      if (node === void 0) return 0;
      if (typeof node === "string") {
        const dependency = expression.calculator.fieldDefinitions[node];
        if (!dependency)
          throw new CalculatorError(`Couldn't find field '${node}'!`);
        dependency.usedBy.add(expression);
        return dependency.value;
      }
      if (typeof node === "number") {
        return Number(node);
      }
      node = node;
      const v1 = this.evaluateTree(expression, node.value1);
      const v2 = this.evaluateTree(expression, node.value2);
      const v1Len = String(v1).length;
      const v2Len = String(v2).length;
      switch (node.operator) {
        case "ADD":
          this.checkGiveUp(expression, 0.1 * Math.min(v1Len, v2Len), [
            "Adding big numbers is boring",
            "Couldn't you add those things instead?"
          ]);
          return v1 + v2;
        case "SUB":
          this.checkGiveUp(expression, 0.15 * Math.min(v1Len, v2Len), [
            "Calculator doesn't like subtraction",
            "Too tired to figure out the carry rules"
          ]);
          return v1 - v2;
        case "DIV":
          this.checkGiveUp(expression, 0.8 - 5 / (v2Len + 5), [
            "Division is difficult",
            "Which one's the numerator again?"
          ]);
          return v1 / v2;
        case "MUL":
          this.checkGiveUp(expression, 0.05 * Math.max(v1Len, v2Len), [
            "Multiplication too difficult to do without pen and paper",
            "That's a lot of numbers to multiply"
          ]);
          return v1 * v2;
        case "EXP":
          this.checkGiveUp(
            expression,
            0.2 * Math.max(0.75 * v1Len, v2Len),
            [
              "Exponents are too difficult",
              "Could you try to simplify it a bit?"
            ]
          );
          return Math.pow(v1, v2);
      }
      throw new Error("Unknown operator " + node.operator);
    }
    checkGiveUp(expression, chance, errorTexts) {
      if (Math.random() < chance) {
        throw new LazyError(
          errorTexts[Math.floor(Math.random() * errorTexts.length)],
          [
            {
              name: "Try again",
              callback: expression.evaluate
            }
          ]
        );
      }
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
  var CalculatorError = class extends Error {
    constructor(message) {
      super(message);
    }
  };
  var LazyError = class extends CalculatorError {
    options = [];
    constructor(message, options) {
      super(message);
      this.options = options;
    }
  };
  var Expression2 = class {
    calculator;
    element;
    resultElement;
    errorWrapper;
    errorPopup;
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
        throw new CalculatorError(
          "Result element not found on expression template!"
        );
      this.errorWrapper = this.element.querySelector(
        ".expression-error-wrapper"
      );
      if (this.errorWrapper === null)
        throw new CalculatorError(
          "Error element not found on expression template!"
        );
      this.errorPopup = this.element.querySelector(
        ".expression-error-popup"
      );
      if (this.errorPopup === null)
        throw new CalculatorError(
          "Error popup not found on expression template!"
        );
      this.element.querySelector(
        ".expression-edit-field"
      ).onchange = (e) => {
        const target = e.target;
        this.setContent(target.value);
      };
      this.errorWrapper.onclick = () => {
        this.errorPopup.classList.toggle("hidden");
      };
      this.element.querySelector(
        ".remove-expression"
      ).onclick = () => {
        calculator2.removeExpression(this);
      };
      calculator2.expressionListElement.appendChild(this.element);
      this.evaluate();
    }
    showError(errorText) {
      this.errorWrapper.classList.remove("hidden");
      this.resultElement.classList.add("hidden");
      this.errorPopup.innerText = errorText;
    }
    hideError() {
      this.errorWrapper.classList.add("hidden");
      this.errorPopup.classList.add("hidden");
      this.resultElement.classList.remove("hidden");
    }
    setContent(newContent) {
      this.expressionString = newContent;
      this.evaluate();
    }
    evaluate() {
      this.hideError();
      try {
        const parts = this.expressionString.split("=");
        if (parts.length > 2)
          throw new CalculatorError("Too many equals signs!");
        const isFieldDefinition = parts.length === 2;
        const parser = new Parser(isFieldDefinition ? parts[1] : parts[0]);
        this.value = parser.evaluate(this);
        if (isFieldDefinition) {
          delete this.calculator.fieldDefinitions[this.definedField ?? ""];
          const leftSide = parts[0].trim();
          if (!leftSide.match(/^[A-Za-z]\w*$/g))
            throw new CalculatorError(
              `Invalid variable name '${leftSide}'!`
            );
          this.definedField = leftSide;
          if (this.calculator.fieldDefinitions[this.definedField])
            throw new CalculatorError(
              `Field '${this.definedField}' is already defined!`
            );
          this.calculator.fieldDefinitions[this.definedField] = this;
          for (const user of this.usedBy) {
            user.evaluate();
          }
        }
      } catch (e) {
        if (e instanceof CalculatorError) {
          this.showError("ERROR: " + e.message);
          if (e instanceof LazyError) {
          }
        } else if (e instanceof Error) {
          this.showError("INTERNAL ERROR: \n" + e.message);
        }
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
      const expression = new Expression2(this, "");
    }
    /**
     * Remove the given expression.
     * @param expression The expression to remove
     */
    removeExpression(expression) {
      this.expressionListElement.removeChild(expression.element);
      delete this.fieldDefinitions[expression.definedField ?? ""];
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
