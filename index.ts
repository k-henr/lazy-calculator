import { Calculator } from "./calculator";

const expressionList = document.getElementById("expressions");
if (!expressionList) throw new Error("Couldn't find expression list!");

const calculator = new Calculator(expressionList);

// Add a listener to the add button
const expressionAdder = document.getElementById("expression-adder");
if (expressionAdder) expressionAdder.onclick = () => calculator.addExpression();

// Add a listener for collapsing and un-collapsing the introduction
const introCollapser = document.getElementById("collapse-intro");
const introduction = document.getElementById("introduction");
if (introCollapser && introduction)
    introCollapser.onclick = () => introduction.classList.toggle("hidden");

// Start with one empty expression
calculator.addExpression();
