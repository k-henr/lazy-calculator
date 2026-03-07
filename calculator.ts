export type Expression = {
    expressionString: string;
    element: HTMLElement;
    computedValue: null | number;
};

/**
 * How do I store expressions neatly?
 *
 * Expressions need to be accessed at least once. I could sort them after
 * dependencies, so that any expression which defines a field that other expressions
 * use will come after their dependencies have already been calculated. That's not
 * very easily extendable though if I want recursion.
 *
 * I could store expressions by the field that they define, and store a calculated
 * value for the field if it's a variable. Then simply access that variable later.
 * The problem with that is that not all expressions give a value - should unlabeled
 * calculations get a dummy value like expression1, expression2 etc?
 *
 * I also need to handle situations where the user tries to define two values for
 * the same field. Maybe a combination is best - store everything in a list, but
 * also store quick-references for field names
 */

export class Calculator {
    expressionListElement: HTMLElement;

    constructor(expressionList: HTMLElement) {
        this.expressionListElement = expressionList;
    }

    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
        const template = document.getElementById(
            "expression-template",
        ) as HTMLTemplateElement;

        const exprElement: HTMLElement = (
            template.content.cloneNode(true) as HTMLElement
        ).querySelector(".expression")!;

        const expression: Expression = {
            expressionString: "",
            element: exprElement,
            computedValue: null,
        };

        // Add a listener to set the contents of the expression when it changes
        (exprElement.querySelector(
            ".expression-edit-field",
        ) as HTMLInputElement)!.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            this.setExpressionContent(expression, target.value);
        };

        // Add a listener for removing the expression when the cross is clicked
        (exprElement.querySelector(
            ".remove-expression",
        ) as HTMLElement)!.onclick = () => {
            this.removeExpression(expression);
        };

        // Add the graphical expression to the DOM
        this.expressionListElement.appendChild(exprElement);
    }

    /**
     * Remove the given expression.
     * @param expression The expression to remove
     */
    removeExpression(expression: Expression) {
        // Remove the element
        this.expressionListElement.removeChild(expression.element);
    }

    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression: Expression, newValue: string) {
        expression.expressionString = newValue;

        const parser = new Parser(newValue);
        expression.computedValue = parser.evaluate();
        console.log(expression.computedValue);
    }
}

class Parser {
    inputString: string;

    tokens: Token[] | null = null;
    peek(): Token {
        return this.tokens![this.tokens!.length - 1];
    }
    pop(): Token {
        return this.tokens!.pop()!;
    }
    expect(type: TokenType): Token {
        const token = this.pop()!;
        if (token.type !== type)
            throw new Error(`Expected type ${type} but got ${token.type}!`);
        return token;
    }

    astTree: DirtyAstTreeNode = 0;

    constructor(inputString: string) {
        this.inputString = inputString;
    }

    evaluate(): number | null {
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

        // Convert the tokens to an intermediate type
        const tokens: (Token | VariableToken | NumberToken)[] = [];
        for (const match of matchedTokens) {
            const { groups } = match;
            if (!groups) continue; // Ignore empty matches to get rid of warning

            // Find the type, chosen by the first group that matched
            const type = tokenPatterns.find(
                ({ type }) => groups[type] !== undefined,
            )?.type;
            if (!type) continue; // get rid of warning

            // Add the token, and additional info if needed
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
                "Expression tried to parse before being tokenized!",
            );

        this.astTree = this.getExpression();
    }

    getExpression(): DirtyAstTreeNode {
        let value1: DirtyAstTreeNode = this.getTerm();

        const tokenChecks: TokenType[] = ["ADD", "SUB"];
        while (tokenChecks.includes(this.peek().type)) {
            const operator = this.pop().type;
            const value2 = this.getTerm();
            value1 = {
                operator,
                value1,
                value2,
            };
        }

        // If the next token isn't RPAREN or END, the expression is malformed
        const t = this.peek().type;
        if (t !== "END" && t !== "RPAREN") {
            throw new Error("Expected RPAREN or END but got " + t);
        }

        return value1;
    }

    getTerm(): DirtyAstTreeNode {
        let value1: DirtyAstTreeNode = this.getFactor();

        const tokenChecks: TokenType[] = ["MUL", "DIV"];
        while (tokenChecks.includes(this.peek().type)) {
            const operator = this.pop().type;
            const value2 = this.getTerm();
            value1 = {
                operator,
                value1,
                value2,
            };
        }
        return value1;
    }

    // Exponentiation (right-associative)
    getFactor(): DirtyAstTreeNode {
        let value1: DirtyAstTreeNode = this.getUnary();

        const tokenChecks: TokenType[] = ["EXP"];
        if (tokenChecks.includes(this.peek().type)) {
            const operator = this.pop().type;
            const value2 = this.getFactor(); // right-associativity requires recursion rather than loops
            value1 = {
                operator,
                value1,
                value2,
            };
        }
        return value1;
    }

    // Unary minus
    getUnary(): DirtyAstTreeNode {
        if (this.peek().type === "SUB") {
            this.pop();
            return { operator: "SUB", value1: 0, value2: this.getPrimary() };
        } else return this.getPrimary();
    }

    getPrimary(): DirtyAstTreeNode {
        const t = this.pop();
        if (t.type === "NUM") {
            return (t as NumberToken).value;
        }
        if (t.type === "VAR") {
            return (t as VariableToken).variableName;
        }
        if (t.type === "LPAREN") {
            const expr = this.getExpression();
            this.expect("RPAREN");
            return expr;
        }
        throw new Error(`Unexpected token ${t}`);
    }

    evaluateTree(node: DirtyAstTreeNode | undefined): number {
        if (node === undefined) return 0;

        if (typeof node === "string") {
            return 0; // TODO: Variable lookups
        }
        if (typeof node === "number") {
            // not being caught
            return Number(node);
        }
        node = node as AstTreeNode;

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

        throw new Error("Unknown operator " + node.operator); // Something weird happened!
    }
}

// This is where tokens types are defined, by a matcher and a type
const tokenPatterns: { pattern: RegExp; type: TokenType }[] = [
    { pattern: /(?<VAR>[A-Za-z]\w*)/, type: "VAR" },
    { pattern: /(?<NUM>\d+)/, type: "NUM" },
    { pattern: /(?<ADD>\+)/, type: "ADD" },
    { pattern: /(?<SUB>-)/, type: "SUB" },
    { pattern: /(?<MUL>\*)/, type: "MUL" },
    { pattern: /(?<DIV>\/)/, type: "DIV" },
    { pattern: /(?<EXP>\^)/, type: "EXP" },
    { pattern: /(?<LPAREN>\()/, type: "LPAREN" },
    { pattern: /(?<RPAREN>\))/, type: "RPAREN" },
];

// Combine the token matchers to get a single tokenizer
const tokenizer = new RegExp(
    tokenPatterns.map(({ pattern }) => pattern.source).join("|"),
    "g",
);

type TokenType =
    | "VAR"
    | "NUM"
    | "ADD"
    | "SUB"
    | "MUL"
    | "DIV"
    | "EXP"
    | "LPAREN"
    | "RPAREN"
    | "END";
type Token = {
    type: TokenType;
};
type NumberToken = Token & { value: number };
type VariableToken = Token & { variableName: string };

type AstTreeNode = {
    operator: TokenType;
    value1?: DirtyAstTreeNode;
    value2?: DirtyAstTreeNode;
};
type DirtyAstTreeNode = AstTreeNode | number | string;
