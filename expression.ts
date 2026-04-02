import {
    Calculator,
    CalculatorError,
    LazyError,
    CalculatorContext,
} from "./calculator";
import { Parser } from "./parser";

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

        // If the error wasn't lazy, we want to reevaluate it when
        // something changes in the rest of the calculator, so we add it
        // to the calculator's erroredExpression list if it wasn't already present
        if (!(e instanceof LazyError)) {
            if (this.calculator.erroredExpressions.indexOf(this) == -1) {
                this.calculator.erroredExpressions.push(this);
            }
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
        // If this expression was present in the errored expression list, remove it
        const i = this.calculator.erroredExpressions.indexOf(this);
        if (i > -1) {
            this.calculator.erroredExpressions.splice(i, 1);
        }

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

        let rounded = x.toPrecision(12);

        // Remove trailing zeroes and point if present
        rounded = rounded.replace(/\.0*$|(\.\d*?)0+$/, "$1");

        return rounded;
    };

    setContent = (
        newContent: string,
        requestingExpression: Expression = this,
    ) => {
        this.expressionString = newContent;
        if (this.update(requestingExpression)) {
            // If the update succeeded, also update all errored expressions in the
            // calculator in case this line fixed the error
            for (const expr of [...this.calculator.erroredExpressions]) {
                console.log(expr.expressionString);
                expr.update();
            }
        }
    };

    update = (requestingExpression: Expression = this): boolean => {
        this.hideError();
        this.hideResult();

        try {
            // FUNCTION MATCHER:
            // /^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)$/gmi

            // VARIABLE MATCHER:
            // /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$/gmi

            // If none of the above match, the expression is assumed to be a standalone expression.

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
            } else {
                // Was just a normal expression

                // If it previously defined a variable, remove that binding
                const ctx = this.calculator.globalContext.layers[0];
                if (this.definedVariable) {
                    delete ctx.variables[this.definedVariable];
                } else if (this.definedFunction) {
                    delete ctx.functions[this.definedFunction];
                }

                this.expressionContent = this.expressionString;
                this.value = this.getValue(
                    requestingExpression,
                    this.calculator.globalContext,
                );
                this.showResult(`= ${Expression.getRoundedString(this.value)}`);
            }

            // Reevaluate all expressions that used this field
            for (const user of this.usedBy) {
                user.update();
            }

            // Reset complexity multiplier if parse succeeded
            if (!this.coffeeMode) this.complexityMultiplier = 1;

            // Return true, since the parse succeeded
            return true;
        } catch (e) {
            // Don't catch if this expression doesn't have a visual to error on
            if (!this.element) throw e;
            if (!(e instanceof Error)) throw e;

            this.showError(e);

            // Parse failed :(
            return false;
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
export class JSFunctionExpression extends Expression {
    runnable: Function;
    failChance: number;
    lazyErrorTexts: string[];

    constructor(
        calculator: Calculator,
        fnArguments: string[],
        runnable: Function,
        addVisual: boolean = false,
        coffeeMode: boolean = true, // whether laziness is possible
        failChance: number = 0, // the chance of a lazy error
        lazyErrorTexts: string[] = [], // Potential extra error messages to show when failing
    ) {
        super(calculator, "", addVisual, coffeeMode);
        this.arguments = fnArguments;
        this.runnable = runnable;
        this.failChance = failChance;
        this.lazyErrorTexts = lazyErrorTexts;
    }

    static simpleMaths(
        calc: Calculator,
        fn: Function,
        failChance: number = 0,
    ): JSFunctionExpression {
        return new JSFunctionExpression(
            calc,
            ["x"],
            (e: Expression, ctx: CalculatorContext) =>
                fn(ctx.getVariable("x").getValue(e, ctx)),
            false,
            true,
            failChance,
        );
    }

    getValue = (
        requestingExpression: Expression,
        context: CalculatorContext,
    ) => {
        if (Math.random() < this.failChance)
            LazyError.throwNew([], () => {
                requestingExpression.update();
            });
        return this.runnable(requestingExpression, context);
    };
}
