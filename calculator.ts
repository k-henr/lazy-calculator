import { Parser } from "./parser";

class Expression {
    calculator: Calculator;

    element: HTMLElement;
    resultElement: HTMLElement;

    expressionString: string;
    definedField: string | null = null;

    template = document.getElementById(
        "expression-template",
    ) as HTMLTemplateElement;

    constructor(calculator: Calculator, expressionString: string) {
        this.calculator = calculator;
        this.expressionString = expressionString;

        this.element = (
            this.template.content.cloneNode(true) as HTMLElement
        ).querySelector(".expression")!;

        this.resultElement = this.element.querySelector(".expression-result")!;
        if (this.resultElement === null)
            throw new Error("Result element not found on expression template!");

        // Add a listener to set the contents of the expression when it changes
        (this.element.querySelector(
            ".expression-edit-field",
        ) as HTMLInputElement)!.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            this.setContent(target.value);
        };

        // Add a listener for removing the expression when the cross is clicked
        (this.element.querySelector(
            ".remove-expression",
        ) as HTMLElement)!.onclick = () => {
            calculator.removeExpression(this);
        };

        // Add the graphical expression to the DOM
        calculator.expressionListElement.appendChild(this.element);

        this.evaluate;
    }

    setContent(newContent: string) {
        this.expressionString = newContent;
        this.evaluate();
    }

    evaluate() {
        // Split into declaration and definition around an = sign (kinda yucky)
        const parts = this.expressionString.split("=");

        let computedValue = 0;

        if (parts.length === 1) {
            // Simple expression
            const parser = new Parser(parts[0]);
            computedValue = parser.evaluate(this.calculator) ?? 0;
        } else if (parts.length === 2) {
            delete this.calculator.fieldDefinitions[this.definedField ?? ""];

            // Field definition
            const leftSide = parts[0].trim();
            if (!leftSide.match(/^[A-Za-z]\w*$/g))
                throw new Error(`Invalid variable name '${leftSide}'!`);
            this.definedField = leftSide;

            const parser = new Parser(parts[1]);
            computedValue = parser.evaluate(this.calculator) ?? 0;

            if (this.calculator.fieldDefinitions[this.definedField])
                throw new Error(
                    `Field '${this.definedField}' is already defined!`,
                );
            else
                this.calculator.fieldDefinitions[this.definedField] =
                    computedValue;

            // TODO: Reevaluate all expressions that used this expression
        } else {
            throw new Error("Too many equals signs!");
        }

        this.resultElement.innerText = `${this.definedField ?? ""} = ${Math.round(computedValue * 1e4) / 1e4}`;
    }
}

export class Calculator {
    expressionListElement: HTMLElement;

    fieldDefinitions: { [key: string]: number } = {};

    constructor(expressionList: HTMLElement) {
        this.expressionListElement = expressionList;
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
        const definedField = expression.definedField;

        // Clear the defined field if there is one
        if (definedField) {
            delete this.fieldDefinitions[definedField];
        }

        expression.setContent(newValue);
    }
}
