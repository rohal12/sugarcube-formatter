// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { formatSugarCubeDocument } from "./formatter";
import { buildFormatterOptions, FormatterOptions } from "./config";
import { loadTweeConfig } from "./twee-config";

/**
 * Read formatter options from VS Code workspace configuration.
 * Automatically reads all options defined in defaultOptions.
 */
function getFormatterOptions(): FormatterOptions {
  const config = vscode.workspace.getConfiguration("sugarcubeFormatter");
  return buildFormatterOptions((key, defaultValue) =>
    config.get(key, defaultValue)
  );
}

/**
 * Get the workspace root directory for loading twee-config files.
 */
function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }
  return undefined;
}

/**
 * Load custom mid-block macros from twee-config files in the workspace root.
 */
function getCustomMidBlockMacros(): string[] {
  const rootDir = getWorkspaceRoot();
  if (!rootDir) {
    return [];
  }
  const tweeConfig = loadTweeConfig(rootDir);
  return tweeConfig.customMidBlockMacros;
}

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

        // Get formatter options and add custom mid-block macros from twee-config
        const options = getFormatterOptions();
        options.customMidBlockMacros = getCustomMidBlockMacros();

        // Format the document and get line mappings
        const { formattedLinesBySource } = formatSugarCubeDocument(
          text,
          options
        );

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
