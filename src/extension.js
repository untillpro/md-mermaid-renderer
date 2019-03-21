const vscode = require('vscode');
const renderMermaid = require('./mermaid_renderer');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
const activate = (context) => {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	var cfg = vscode.workspace.getConfiguration('untillpro');

	// The commands has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let commands = [
		vscode.commands.registerCommand('markdown-mermaid-renderer.renderMermaid',  function() {
			renderMermaid();
		}),
	]

	context.subscriptions.concat(commands);
};

exports.activate = activate;

// this method is called when your extension is deactivated
const deactivate = () => {
};

exports.deactivate = deactivate;
