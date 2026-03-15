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
        const dependency = expression.calculator.globalContext.tryGetVariable(node);
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
          this.checkGiveUp(
            expression,
            0.2 * Math.min(v1Len + 0.1 * v2Len, v2Len + 0.1 * v1Len),
            [
              "Adding big numbers is boring",
              "Couldn't you add those things instead?",
              "Forgot how addition works"
            ]
          );
          return v1 + v2;
        case "SUB":
          this.checkGiveUp(expression, 0.4 * Math.min(v1Len, v2Len), [
            "Calculator doesn't like subtraction",
            "Too tired to figure out the carry rules",
            "Scared of negative numbers"
          ]);
          return v1 - v2;
        case "DIV":
          this.checkGiveUp(expression, 0.5 * v2Len, [
            "Division is difficult",
            "Forgot which one was the numerator",
            "Doesn't want to risk infinite decimals",
            "Too tired to try long division"
          ]);
          return v1 / v2;
        case "MUL":
          this.checkGiveUp(expression, 0.5 * Math.max(v1Len, v2Len), [
            "Multiplication too difficult to do without pen and paper",
            "That's a lot of numbers to multiply",
            "Calculator isn't sure how lattice multiplication works; Scared of doing it wrong"
          ]);
          return v1 * v2;
        case "EXP":
          this.checkGiveUp(
            expression,
            0.8 * Math.max(0.75 * v1Len, (v2Len - 1) * v2Len),
            [
              "Exponents are too difficult",
              "Could you try to simplify the exponent a bit?",
              "Calculator last did powers in high school; never practiced since"
            ]
          );
          return Math.pow(v1, v2);
      }
      throw new Error("Unknown operator " + node.operator);
    }
    checkGiveUp(expression, chance, errorTexts) {
      if (Math.random() < chance * expression.complexityMultiplier) {
        const buttonContents = [
          "Try again!",
          "You can do this!",
          "Keep trying!",
          "Keep going!"
        ];
        const universalComplaints = [
          "Do I really need to do this?",
          "Calculator zoned out",
          "Calculator is tired today",
          "Maths is hard",
          "When will you ever use this in real life?",
          "Calculator too tired",
          "Calculator couldn't be bothered"
        ];
        const combinedErrorTexts = universalComplaints.concat(errorTexts);
        throw new LazyError(
          combinedErrorTexts[Math.floor(Math.random() * combinedErrorTexts.length)],
          [
            {
              name: buttonContents[Math.floor(Math.random() * buttonContents.length)],
              callback: () => {
                expression.complexityMultiplier *= 0.75;
                expression.evaluate();
              }
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
  var CalculatorContext = class {
    variables = {};
    functions = {};
    addField = (name, expression) => {
      this.variables[name] = expression;
    };
    removeField = (name) => {
      delete this.variables[name];
    };
    tryGetVariable = (name) => {
      return this.variables[name];
    };
  };
  var Expression2 = class {
    calculator;
    element;
    resultElement;
    errorWrapper;
    errorPopup;
    definedFunction = null;
    arguments = [];
    // Stores function arguments if this is a function. Kinda yucky
    fnDef = "";
    // Stores the function definition if this is a function. See above ^
    definedVariable = null;
    expressionString;
    // Stores the full string of this expression, including declarations
    value;
    // Gradually lowers when retrying
    complexityMultiplier = 1;
    usedBy = /* @__PURE__ */ new Set();
    template = document.querySelector(
      "#expression-template"
    );
    errorButtonTemplate = document.querySelector(
      "#error-button-template"
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
    showError = (errorText) => {
      this.errorWrapper.classList.remove("hidden");
      this.errorPopup.innerText = errorText;
    };
    hideError = () => {
      this.errorWrapper.classList.add("hidden");
      this.errorPopup.classList.add("hidden");
      this.errorPopup.innerHTML = "";
    };
    showResult = (resultText) => {
      this.resultElement.innerText = resultText;
      this.resultElement.classList.remove("hidden");
    };
    hideResult = () => {
      this.resultElement.classList.add("hidden");
    };
    getRoundedString = (x) => {
      return String(Math.round(x * 1e6) / 1e6);
    };
    setContent = (newContent) => {
      this.expressionString = newContent;
      this.evaluate();
    };
    evaluate = () => {
      this.hideError();
      this.hideResult();
      try {
        const typeMatcher = /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$|^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)/im;
        const typeMatch = this.expressionString.match(typeMatcher);
        console.log(typeMatch);
        if (typeMatch) {
          if (!typeMatch.groups)
            throw new Error("Pre-evaluation regex match failed!");
          const { groups } = typeMatch;
          if (this.definedVariable) {
            delete this.calculator.globalContext.variables[this.definedVariable];
          } else if (this.definedFunction) {
            delete this.calculator.globalContext.functions[this.definedFunction];
          }
          if (groups.FNNAME) {
            const fns = this.calculator.globalContext.functions;
            if (fns[groups.FNNAME]) {
              throw new CalculatorError(
                `Function "${groups.FNNAME}" is already defined!`
              );
            }
            fns[groups.FNNAME] = this;
            this.definedFunction = groups.FNNAME;
            this.arguments = groups.FNARGS.split(",").map(
              (e) => e.trim()
            );
            this.fnDef = groups.FNDEF;
          } else {
            const vars = this.calculator.globalContext.variables;
            if (vars[groups.VRNAME]) {
              throw new CalculatorError(
                `Variable ${groups.VRNAME} is already defined!`
              );
            }
            vars[groups.VRNAME] = this;
            this.definedVariable = groups.VRNAME;
            const parser = new Parser(groups.VRDEF);
            this.value = parser.evaluate(this);
            this.showResult(
              `${this.definedVariable} = ${this.getRoundedString(this.value)}`
            );
          }
          for (const user of this.usedBy) {
            user.evaluate();
          }
        } else {
          const parser = new Parser(this.expressionString);
          this.value = parser.evaluate(this);
          this.showResult(this.getRoundedString(this.value));
        }
        this.complexityMultiplier = 1;
      } catch (e) {
        if (e instanceof CalculatorError) {
          this.showError("ERROR: " + e.message);
          if (e instanceof LazyError) {
            for (const option of e.options) {
              const button = this.errorButtonTemplate.content.cloneNode(
                true
              );
              const buttonElement = button.firstElementChild;
              buttonElement.setAttribute("value", option.name);
              buttonElement.onclick = option.callback;
              this.errorPopup.appendChild(button);
            }
          }
        } else if (e instanceof Error) {
          this.showError("INTERNAL ERROR: \n" + e.message);
        }
      }
    };
  };
  var Calculator = class {
    expressionListElement;
    // fieldDefinitions: { [key: string]: Expression } = {};
    globalContext = new CalculatorContext();
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
      const definedField = expression.definedVariable;
      if (definedField) {
        this.globalContext.removeField(definedField);
      }
    }
    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression, newValue) {
      const definedField = expression.definedVariable;
      if (definedField) {
        this.globalContext.removeField(definedField);
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
