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

class CalculatorContext {
    fields: { [key: string]: Expression } = {};

    addField = (name: string, expression: Expression) => {
        this.fields[name] = expression;
    };

    removeField = (name: string) => {
        delete this.fields[name];
    };

    tryGetField = (name: string): Expression | null => {
        return this.fields[name];
    };
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
            // Figure out if it's a field definition or not
            const preEvalMatch = this.expressionString.match(
                /^\s*(?<fieldName>[A-Za-z\d]\w*)\s*=(?<fieldContent>.*)/,
            );

            // Split into declaration and definition around an = sign (yucky code!)
            // todo: prep support for conditionals by using a regex matcher instead
            const parts = this.expressionString.split("=");
            if (parts.length > 2)
                throw new CalculatorError("Too many equals signs!");

            if (preEvalMatch) {
                if (!preEvalMatch.groups)
                    throw new Error("Error during parsing field declaration!");

                const { groups } = preEvalMatch;

                // Field definition
                const parser = new Parser(groups.fieldContent);
                this.value = parser.evaluate(this);

                // Delete the old definition, if there is one
                if (this.definedField) {
                    this.calculator.globalContext.removeField(
                        this.definedField,
                    );
                }

                // Get the defined field
                this.definedField = groups.fieldName;

                if (
                    this.calculator.globalContext.tryGetField(this.definedField)
                ) {
                    this.definedField = null;
                    throw new CalculatorError(
                        `Field '${this.definedField}' is already defined!`,
                    );
                }

                this.calculator.globalContext.addField(this.definedField, this);

                // Reevaluate all expressions that used this variable
                for (const user of this.usedBy) {
                    user.evaluate();
                }
            } else {
                const parser = new Parser(this.expressionString);
                this.value = parser.evaluate(this);
            }

            // Reset complexity multiplier if parse succeeded
            this.complexityMultiplier = 1;
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

    // fieldDefinitions: { [key: string]: Expression } = {};

    globalContext: CalculatorContext = new CalculatorContext();

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
        const definedField = expression.definedField;
        if (definedField) {
            this.globalContext.removeField(definedField);
        }
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
            this.globalContext.removeField(definedField);
        }

        expression.setContent(newValue);
    }
}
