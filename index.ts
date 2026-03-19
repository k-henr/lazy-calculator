import { Calculator } from "./calculator";

const expressionList = document.getElementById("expressions");
if (!expressionList) throw new Error("Couldn't find expression list!");

const errorPopupElement = document.getElementById("expression-error-popup");
if (!errorPopupElement) throw new Error("Couldn't find error popup!");

const calculator = new Calculator(expressionList, errorPopupElement);

// Add a listener to the add button
const expressionAdder = document.getElementById("expression-adder");
if (expressionAdder) expressionAdder.onclick = () => calculator.addExpression();

// Add a listener for collapsing and un-collapsing the introduction
const introCollapser = document.getElementById("collapse-intro");
const introduction = document.getElementById("introduction");
if (introCollapser && introduction)
    introCollapser.onclick = () => introduction.classList.toggle("hidden");

// Add a listener for hiding the error popup whenever clicking anywhere that isn't
// within its bounds
document.addEventListener("mousedown", (e) => {
    const bounds = errorPopupElement.getBoundingClientRect();
    const x = e.clientX,
        y = e.clientY;
    if (
        x < bounds.left ||
        x > bounds.right ||
        y < bounds.top ||
        y > bounds.bottom
    ) {
        errorPopupElement.classList.add("hidden");
    }
});

// Start with one empty expression
calculator.addExpression();
