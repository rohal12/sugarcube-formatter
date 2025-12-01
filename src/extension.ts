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

/**
 * Format a single file and save it.
 * Returns true if the file was modified, false otherwise.
 */
async function formatAndSaveFile(uri: vscode.Uri): Promise<boolean> {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();

    // Get formatter options and add custom mid-block macros from twee-config
    const options = getFormatterOptions();
    options.customMidBlockMacros = getCustomMidBlockMacros();

    // Format the document
    const { formattedText } = formatSugarCubeDocument(text, options);

    // Only save if content changed
    if (text !== formattedText) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length)
      );
      edit.replace(uri, fullRange, formattedText);
      await vscode.workspace.applyEdit(edit);
      await document.save();
      return true;
    }
    return false;
  } catch (error) {
    log.error(`Failed to format ${uri.fsPath}: ${error}`);
    return false;
  }
}

/**
 * Find all .twee and .tw files in a directory or the entire workspace.
 */
async function findTweeFiles(directory?: vscode.Uri): Promise<vscode.Uri[]> {
  const pattern = directory
    ? new vscode.RelativePattern(directory, "**/*.{tw,twee}")
    : "**/*.{tw,twee}";

  return vscode.workspace.findFiles(pattern);
}

/**
 * Format multiple files with progress indication.
 */
async function formatFiles(files: vscode.Uri[], title: string): Promise<void> {
  if (files.length === 0) {
    vscode.window.showInformationMessage("No .twee or .tw files found.");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (progress, token) => {
      let formatted = 0;
      let skipped = 0;

      for (let i = 0; i < files.length; i++) {
        if (token.isCancellationRequested) {
          vscode.window.showWarningMessage(
            `Formatting cancelled. ${formatted} files formatted, ${skipped} unchanged.`
          );
          return;
        }

        const file = files[i];
        const fileName = vscode.workspace.asRelativePath(file);
        progress.report({
          message: `(${i + 1}/${files.length}) ${fileName}`,
          increment: 100 / files.length,
        });

        const wasModified = await formatAndSaveFile(file);
        if (wasModified) {
          formatted++;
        } else {
          skipped++;
        }
      }

      vscode.window.showInformationMessage(
        `Formatting complete: ${formatted} files formatted, ${skipped} unchanged.`
      );
    }
  );
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  log.info("[Startup]\n\t\tActivating sugarcube-formatter extension");

  // Command: Format all twee files in workspace
  const formatAllCommand = vscode.commands.registerCommand(
    "sugarcubeFormatter.formatAllFiles",
    async () => {
      const files = await findTweeFiles();
      await formatFiles(files, "Formatting all Twee files");
    }
  );
  context.subscriptions.push(formatAllCommand);

  // Command: Format twee files in a directory
  const formatDirectoryCommand = vscode.commands.registerCommand(
    "sugarcubeFormatter.formatDirectory",
    async (uri?: vscode.Uri) => {
      // If no URI provided (called from command palette), ask user to select
      if (!uri) {
        const folders = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Select Directory to Format",
        });
        if (!folders || folders.length === 0) {
          return;
        }
        uri = folders[0];
      }

      const files = await findTweeFiles(uri);
      const dirName = vscode.workspace.asRelativePath(uri);
      await formatFiles(files, `Formatting Twee files in ${dirName}`);
    }
  );
  context.subscriptions.push(formatDirectoryCommand);

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
