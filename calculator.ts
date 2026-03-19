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

export class CalculatorContext {
    layers: CalculatorContextLayer[] = [];

    addBlankLayer = () => {
        this.addLayer({
            variables: {},
            functions: {},
        });
    };

    addLayer = (layer: CalculatorContextLayer) => {
        this.layers.unshift(layer);
    };

    getVariable = (name: string) => {
        for (const l of this.layers) {
            if (l.variables[name]) return l.variables[name];
        }
        throw new CalculatorError(`Variable "${name}" not found!`);
    };

    getFunction = (name: string) => {
        for (const l of this.layers) {
            if (l.functions[name]) return l.functions[name];
        }
        throw new CalculatorError(`Function "${name}" not found!`);
    };

    copy = () => {
        const newCtx = new CalculatorContext();
        newCtx.layers = [...this.layers];
        return newCtx;
    };
}

export type CalculatorContextLayer = {
    variables: { [key: string]: Expression };
    functions: { [key: string]: Expression };
};

export class Expression {
    calculator: Calculator;

    element: HTMLElement | null = null;
    resultElement: HTMLElement | null = null;
    errorWrapper: HTMLElement | null = null;

    definedFunction: string | null = null;
    arguments: string[] = []; // Stores function arguments if this is a function. Kinda yucky

    definedVariable: string | null = null;

    expressionContent: string = ""; // Just the epxression itself, i.e. "5+x" in "f(x)=5+x"
    expressionString: string; // Stores the full string of this expression, including declarations
    value: number;

    // Gradually lowers when retrying
    complexityMultiplier = 1;
    coffeeMode: boolean;

    usedBy: Set<Expression> = new Set();

    template = document.querySelector(
        "#expression-template",
    ) as HTMLTemplateElement;

    errorButtonTemplate = document.querySelector(
        "#error-button-template",
    ) as HTMLTemplateElement;

    constructor(
        calculator: Calculator,
        expressionString: string,
        addVisual: boolean = true,
        coffeeMode: boolean = false, // whether laziness is possible
        requestingExpression: Expression = this, // if this is a hidden or intermediate expression (like a function argument), it may need to bring along a requesting expression
    ) {
        this.calculator = calculator;
        this.expressionString = expressionString;

        this.coffeeMode = coffeeMode;
        this.value = 0;

        if (coffeeMode) this.complexityMultiplier = 0;

        if (addVisual) {
            this.element = (
                this.template.content.cloneNode(true) as HTMLElement
            ).querySelector(".expression")!;

            this.resultElement =
                this.element.querySelector(".expression-result")!;
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
        }

        // Automatically parse and evaluate the expression
        this.update(requestingExpression);
    }

    showError = (e: Error) => {
        if (this.errorWrapper) {
            this.errorWrapper.classList.remove("hidden");
            this.errorWrapper.onclick = () => this.showErrorPopup(e);
        }
    };

    showErrorPopup = (e: Error) => {
        if (this.errorWrapper) {
            const popup = this.calculator.errorPopupElement;
            // Clear error popup content
            popup.innerHTML = "";
            // Position popup correctly
            popup.classList.remove("hidden");
            const errorWrapperRect = this.errorWrapper.getBoundingClientRect();
            console.log(errorWrapperRect);
            popup.style.top = errorWrapperRect.bottom + "px";
            popup.style.left =
                errorWrapperRect.left + errorWrapperRect.width * 0.5 + "px";

            if (e instanceof CalculatorError) {
                // Set error text to message
                popup.innerText = "ERROR: " + e.message;

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

                        this.calculator.errorPopupElement.appendChild(button);
                    }
                }
            } else if (e instanceof Error) {
                // Set error text to "INTERNAL ERROR: "+message
                popup.innerText = "INTERNAL ERROR: \n" + e.message;
            }
        }
    };

    hideError = () => {
        this.errorWrapper?.classList.add("hidden");
        // Also hides error popup, even if the popup isn't currently focused on the
        // expression
        // If this feels weird, make it so that the error only hides when on this
        this.calculator.errorPopupElement.classList.add("hidden");
    };

    showResult = (resultText: string) => {
        if (this.resultElement) {
            this.resultElement.innerText = resultText;
            this.resultElement.classList.remove("hidden");
        }
    };

    hideResult = () => {
        this.resultElement?.classList.add("hidden");
    };

    static getRoundedString = (x: number): string => {
        if (x > 100000000000) return "A lot";

        const rounded = x.toPrecision(4);
        return rounded.replace(/(\.)?0*$/, ""); // Remove trailing zeores and point if present
    };

    setContent = (
        newContent: string,
        requestingExpression: Expression = this,
    ) => {
        this.expressionString = newContent;
        this.update(requestingExpression);
    };

    update = (requestingExpression: Expression = this) => {
        this.hideError();
        this.hideResult();

        try {
            // FUNCTION MATCHER:
            // /^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)$/gmi

            // VARIABLE MATCHER:
            // /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$/gmi

            // If none of the above match, the expression is assumes to be a standalone expression.

            const typeMatcher =
                /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$|^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)/im;

            const typeMatch = this.expressionString.match(typeMatcher);

            if (typeMatch) {
                if (!typeMatch.groups)
                    throw new Error("Pre-evaluation regex match failed!");

                const { groups } = typeMatch;

                // Delete any old variable or function that this expression defined
                if (this.definedVariable) {
                    delete this.calculator.globalContext.layers[0].variables[
                        this.definedVariable
                    ];
                } else if (this.definedFunction) {
                    delete this.calculator.globalContext.layers[0].functions[
                        this.definedFunction
                    ];
                }

                // Check if the field declaration is a function or a variable
                if (groups.FNNAME) {
                    // Was a function. Don't evaluate, just store in the global calculator context
                    const fns =
                        this.calculator.globalContext.layers[0].functions;
                    if (fns[groups.FNNAME]) {
                        throw new CalculatorError(
                            `Function "${groups.FNNAME}" is already defined!`,
                        );
                    }
                    fns[groups.FNNAME] = this;
                    this.definedFunction = groups.FNNAME;
                    this.arguments = groups.FNARGS.split(",").map((e) =>
                        e.trim(),
                    );
                    this.expressionContent = groups.FNDEF;
                } else {
                    // Was a variable. Compute value, store self in global context
                    const vars =
                        this.calculator.globalContext.layers[0].variables;
                    if (vars[groups.VRNAME]) {
                        throw new CalculatorError(
                            `Variable ${groups.VRNAME} is already defined!`,
                        );
                    }
                    vars[groups.VRNAME] = this;
                    this.definedVariable = groups.VRNAME;

                    // Calculate the value of this expression
                    this.expressionContent = groups.VRDEF;
                    this.value = this.getValue(
                        requestingExpression,
                        this.calculator.globalContext,
                    );

                    // Show the result
                    this.showResult(
                        `${this.definedVariable} = ${Expression.getRoundedString(this.value)}`,
                    );
                }

                // Reevaluate all expressions that used this field
                for (const user of this.usedBy) {
                    user.update();
                }
            } else {
                this.expressionContent = this.expressionString;
                this.value = this.getValue(
                    requestingExpression,
                    this.calculator.globalContext,
                );
                this.showResult(`= ${Expression.getRoundedString(this.value)}`);
            }

            // Reset complexity multiplier if parse succeeded
            if (!this.coffeeMode) this.complexityMultiplier = 1;
        } catch (e) {
            // Don't catch if this expression doesn't have a visual to error on
            if (!this.element) throw e;
            if (!(e instanceof Error)) throw e;

            this.showError(e);
        }
    };

    getValue(
        requestingExpression: Expression,
        context: CalculatorContext,
    ): number {
        return new Parser(this.expressionContent).evaluate(
            requestingExpression,
            context,
        );
    }
}

// Overrides the expression class to get JS(or TS)-defined functions to the calculator
class JSFunctionExpression extends Expression {
    runnable: Function;
    constructor(
        calculator: Calculator,
        fnArguments: string[],
        runnable: Function,
        addVisual: boolean = false,
        coffeeMode: boolean = true, // whether laziness is possible
    ) {
        super(calculator, "", addVisual, coffeeMode);
        this.arguments = fnArguments;
        this.runnable = runnable;
    }

    static simpleMaths(calc: Calculator, fn: Function): JSFunctionExpression {
        return new JSFunctionExpression(
            calc,
            ["x"],
            (e: Expression, ctx: CalculatorContext) =>
                fn(ctx.getVariable("x").getValue(e, ctx)),
        );
    }

    getValue = (
        requestingExpression: Expression,
        context: CalculatorContext,
    ) => {
        return this.runnable(requestingExpression, context);
    };
}

export class Calculator {
    expressionListElement: HTMLElement;
    errorPopupElement: HTMLElement;

    globalContext: CalculatorContext = new CalculatorContext();

    constructor(expressionList: HTMLElement, errorPopupElement: HTMLElement) {
        this.expressionListElement = expressionList;
        this.errorPopupElement = errorPopupElement;

        // Add some builtins
        this.globalContext.addLayer({
            functions: {
                sin: JSFunctionExpression.simpleMaths(this, Math.sin),
                cos: JSFunctionExpression.simpleMaths(this, Math.cos),
                tan: JSFunctionExpression.simpleMaths(this, Math.tan),
                arcsin: JSFunctionExpression.simpleMaths(this, Math.asin),
                arccos: JSFunctionExpression.simpleMaths(this, Math.acos),
                arctan: JSFunctionExpression.simpleMaths(this, Math.atan),
                abs: JSFunctionExpression.simpleMaths(this, Math.abs),
                round: JSFunctionExpression.simpleMaths(this, Math.round),
                ln: JSFunctionExpression.simpleMaths(this, Math.log),
                log: JSFunctionExpression.simpleMaths(this, Math.log10),
                sqrt: JSFunctionExpression.simpleMaths(this, Math.sqrt),
                cbrt: JSFunctionExpression.simpleMaths(this, Math.cbrt),
                round2: new JSFunctionExpression(
                    this,
                    ["x", "places"],
                    (e: Expression, ctx: CalculatorContext) => {
                        const p = Math.pow(
                            10,
                            ctx.getVariable("places").getValue(e, ctx),
                        );
                        return (
                            Math.round(
                                ctx.getVariable("x").getValue(e, ctx) * p,
                            ) / p
                        );
                    },
                ),
            },
            variables: {
                TAU: new Expression(
                    this,
                    "6.28318530717958647692528676655901",
                    false,
                    true,
                ),
                E: new Expression(
                    this,
                    "2.718281828459045235360287471352",
                    false,
                    true,
                ),
            },
        });
    }

    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
        new Expression(this, "");
    }

    /**
     * Remove the given expression.
     * @param expression The expression to remove
     */
    removeExpression(expression: Expression) {
        // Remove the element visual
        if (expression.element)
            this.expressionListElement.removeChild(expression.element);

        // Remove any field definitions from the expression
        if (expression.definedFunction) {
            delete this.globalContext.layers[0].functions[
                expression.definedFunction
            ];
        } else if (expression.definedVariable) {
            delete this.globalContext.layers[0].functions[
                expression.definedVariable
            ];
        }
    }

    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression: Expression, newValue: string) {
        expression.setContent(newValue);
    }
}
