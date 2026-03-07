import { Calculator } from "./calculator";

const expressionList = document.getElementById("expressions");
if (!expressionList) throw new Error("Couldn't find expression list!");

const calculator = new Calculator(expressionList);

// Add a listener to the add button
const expressionAdder = document.getElementById("expression-adder");
if (expressionAdder) expressionAdder.onclick = () => calculator.addExpression();

// Start with one empty expression
calculator.addExpression();
