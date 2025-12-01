// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { formatSugarCubeDocument } from "./formatter";

const documentSelector: vscode.DocumentSelector = [
  {
    language: "twee3-sugarcube-2",
  },
  {
    pattern: "**/*.{tw,twee}",
  },
  {
    language: "twee3",
  },
];

export const log = vscode.window.createOutputChannel(
  "SugarCube Formatter (Log)",
  { log: true }
);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  log.info("[Startup]\n\t\tActivating sugarcube-formatter extension");
  const disposable = vscode.languages.registerDocumentFormattingEditProvider(
    documentSelector,
    {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): vscode.TextEdit[] {
        const edits: vscode.TextEdit[] = [];
        const text = document.getText();

        // Format the document and get line mappings
        const { formattedLinesBySource } = formatSugarCubeDocument(text);

        // Generate edits for each source line that changed
        for (const [
          sourceLineIndex,
          formattedLines,
        ] of formattedLinesBySource.entries()) {
          const sourceLine = document.lineAt(sourceLineIndex);
          const formattedText = formattedLines.join("\n");

          // Only create an edit if the line changed
          if (sourceLine.text !== formattedText) {
            const range = sourceLine.rangeIncludingLineBreak;

            // If this is the last line, don't include a trailing newline in replacement
            // unless the formatted output has multiple lines
            if (sourceLineIndex === document.lineCount - 1) {
              edits.push(
                vscode.TextEdit.replace(sourceLine.range, formattedText)
              );
            } else {
              // Include the line break in the replacement
              edits.push(
                vscode.TextEdit.replace(
                  range,
                  formattedText.length > 0 ? formattedText + "\n" : ""
                )
              );
            }
          }
        }

        return edits;
      },
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
