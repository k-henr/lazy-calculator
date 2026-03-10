import { Parser } from "./parser";

export class CalculatorError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export type ErrorCallback = {
    name: string;
    callback: () => void;
};

export class LazyError extends CalculatorError {
    options: ErrorCallback[] = [];
    constructor(message: string, options: ErrorCallback[]) {
        super(message);
        this.options = options;
    }
}

export class Expression {
    calculator: Calculator;

    element: HTMLElement;
    resultElement: HTMLElement;
    errorWrapper: HTMLElement;
    errorPopup: HTMLElement;

    expressionString: string;
    definedField: string | null = null;
    value: number;

    // Gradually lowers when retrying
    complexityMultiplier = 1;

    usedBy: Set<Expression> = new Set();

    template = document.querySelector(
        "#expression-template",
    ) as HTMLTemplateElement;

    errorButtonTemplate = document.querySelector(
        "#error-button-template",
    ) as HTMLTemplateElement;

    constructor(calculator: Calculator, expressionString: string) {
        this.calculator = calculator;
        this.expressionString = expressionString;
        this.value = 0;

        this.element = (
            this.template.content.cloneNode(true) as HTMLElement
        ).querySelector(".expression")!;

        this.resultElement = this.element.querySelector(".expression-result")!;
        if (this.resultElement === null)
            throw new CalculatorError(
                "Result element not found on expression template!",
            );

        this.errorWrapper = this.element.querySelector(
            ".expression-error-wrapper",
        )!;
        if (this.errorWrapper === null)
            throw new CalculatorError(
                "Error element not found on expression template!",
            );

        this.errorPopup = this.element.querySelector(
            ".expression-error-popup",
        )!;
        if (this.errorPopup === null)
            throw new CalculatorError(
                "Error popup not found on expression template!",
            );

        // Add a listener to set the contents of the expression when it changes
        (this.element.querySelector(
            ".expression-edit-field",
        ) as HTMLInputElement)!.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            this.setContent(target.value);
        };

        // Add a listener for opening an error screen
        this.errorWrapper.onclick = () => {
            this.errorPopup.classList.toggle("hidden");
        };

        // Add a listener for removing the expression when the cross is clicked
        (this.element.querySelector(
            ".remove-expression",
        ) as HTMLElement)!.onclick = () => {
            calculator.removeExpression(this);
        };

        // Add the graphical expression to the DOM
        calculator.expressionListElement.appendChild(this.element);

        this.evaluate();
    }

    showError = (errorText: string) => {
        this.errorWrapper.classList.remove("hidden");
        this.resultElement.classList.add("hidden");
        this.errorPopup.innerText = errorText;
    };

    hideError = () => {
        this.errorWrapper.classList.add("hidden");
        this.errorPopup.classList.add("hidden");
        this.errorPopup.innerHTML = "";
        this.resultElement.classList.remove("hidden");
    };

    setContent = (newContent: string) => {
        this.expressionString = newContent;
        this.evaluate();
    };

    evaluate = () => {
        this.hideError();

        try {
            // Split into declaration and definition around an = sign (kinda yucky)
            const parts = this.expressionString.split("=");

            // todo: prep support for conditionals by using a regex matcher instead
            if (parts.length > 2)
                throw new CalculatorError("Too many equals signs!");

            const isFieldDefinition = parts.length === 2; // yucky code. Fix!

            const parser = new Parser(isFieldDefinition ? parts[1] : parts[0]);
            this.value = parser.evaluate(this);

            // Reset complexity multiplier if parse succeeded
            this.complexityMultiplier = 1;

            if (isFieldDefinition) {
                // Delete the old definition, if there is one
                if (this.definedField) {
                    delete this.calculator.fieldDefinitions[this.definedField];
                }

                // Get the defined field
                const leftSide = parts[0].trim();
                if (!leftSide.match(/^[A-Za-z]\w*$/g))
                    throw new CalculatorError(
                        `Invalid variable name '${leftSide}'!`,
                    );
                this.definedField = leftSide;

                if (this.calculator.fieldDefinitions[this.definedField])
                    throw new CalculatorError(
                        `Field '${this.definedField}' is already defined!`,
                    );

                this.calculator.fieldDefinitions[this.definedField] = this;

                // Reevaluate all expressions that used this variable
                for (const user of this.usedBy) {
                    user.evaluate();
                }
            }
        } catch (e) {
            if (e instanceof CalculatorError) {
                // Set error text to message
                this.showError("ERROR: " + e.message);

                // If it's a LazyError, add the option buttons with associated callbacks
                if (e instanceof LazyError) {
                    // Add response buttons
                    for (const option of e.options) {
                        // Create a new button
                        const button =
                            this.errorButtonTemplate.content.cloneNode(
                                true,
                            ) as HTMLElement;

                        const buttonElement =
                            button.firstElementChild as HTMLElement;
                        buttonElement.setAttribute("value", option.name);
                        buttonElement.onclick = option.callback;

                        this.errorPopup.appendChild(button);
                    }
                }
            } else if (e instanceof Error) {
                // Set error text to "INTERNAL ERROR: "+message
                this.showError("INTERNAL ERROR: \n" + e.message);
            }
        }

        // TODO: Smarter rounding with significant digits
        this.resultElement.innerText = `${this.definedField ?? ""} = ${Math.round(this.value * 1e6) / 1e6}`;
    };
}

export class Calculator {
    expressionListElement: HTMLElement;

    fieldDefinitions: { [key: string]: Expression } = {};

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
        // Remove any field definitions from the expression
        delete this.fieldDefinitions[expression.definedField ?? ""];
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
