import { FormatterOptions, defaultOptions, QuoteStyle } from "./config";

/**
 * Escape quotes in content when converting to a different quote style.
 * Uses backslash escaping for the target quote character.
 */
function escapeQuotes(content: string, targetQuote: string): string {
  // Unescape any existing escaped quotes first, then escape the target quote
  // This handles cases where content already has escaped quotes
  const unescaped = content.replace(/\\'/g, "'").replace(/\\"/g, '"');

  if (targetQuote === '"') {
    return unescaped.replace(/"/g, '\\"');
  } else {
    return unescaped.replace(/'/g, "\\'");
  }
}

/**
 * Format a quoted string according to the quote style option.
 * Handles escaping when the content contains the target quote character.
 */
function formatQuotedString(
  originalQuote: string,
  content: string,
  quoteStyle: QuoteStyle
): string {
  if (quoteStyle === "preserve") {
    // Keep the original quote style, but ensure proper escaping
    return `${originalQuote}${escapeQuotes(
      content,
      originalQuote
    )}${originalQuote}`;
  }

  const targetQuote = quoteStyle === "single" ? "'" : '"';
  const escapedContent = escapeQuotes(content, targetQuote);
  return `${targetQuote}${escapedContent}${targetQuote}`;
}

/**
 * Format macro arguments:
 * - Convert quotes according to quoteStyle setting
 * - Optionally remove quotes from single-word arguments that are passage names
 * - Preserve quotes for string values (after 'to' keyword in assignments)
 * - Handle escaping when content contains quote characters
 */
function formatMacroArguments(
  macroContent: string,
  options: FormatterOptions
): string {
  const quoteStyle = options.quoteStyle ?? "double";

  // Pattern to match quoted arguments (single or double quotes)
  // Group 1: the quote character
  // Group 2: the quoted content
  let lastIndex = 0;
  let result = "";

  const quotePattern = /(['"])((?:[^'"\\]|\\.|(?!\1)['"])*)\1/g;
  let match;

  while ((match = quotePattern.exec(macroContent)) !== null) {
    const quote = match[1];
    const content = match[2];
    const matchStart = match.index;

    // Add everything before this match
    result += macroContent.slice(lastIndex, matchStart);

    // Check if content is a single word (no spaces, dashes, slashes, or backslashes)
    const unescapedContent = content.replace(/\\'/g, "'").replace(/\\"/g, '"');

    // Check the context before the match to see if it's after 'to' keyword
    const contextBefore = macroContent.slice(
      Math.max(0, matchStart - 10),
      matchStart
    );
    const isAfterTo = /\bto\s*$/.test(contextBefore);

    // Check if the content looks like a SugarCube variable (starts with $ or _)
    const looksLikeVariable = /^[$_]/.test(unescapedContent);

    // Check if we're inside a function call (preceded by '(' or ',')
    const isInsideFunctionCall = /[\(,]\s*$/.test(contextBefore);

    if (
      options.stripSingleWordQuotes &&
      /^[^\s\-\/\\]+$/.test(unescapedContent) &&
      !isAfterTo &&
      !looksLikeVariable &&
      !isInsideFunctionCall
    ) {
      // Remove quotes for single-word passage names
      result += unescapedContent;
    } else {
      result += formatQuotedString(quote, content, quoteStyle);
    }

    lastIndex = matchStart + match[0].length;
  }

  // Add remaining content after last match
  result += macroContent.slice(lastIndex);

  return result;
}

/**
 * Detect all block macro names by finding closing tags <</tagname>>
 */
function detectBlockMacros(text: string): Set<string> {
  const blockMacros = new Set<string>();
  const closingTagPattern = /<<\/(\w+)>>/g;
  let match;

  while ((match = closingTagPattern.exec(text)) !== null) {
    blockMacros.add(match[1]);
  }

  return blockMacros;
}

/**
 * Try to convert JavaScript object literal notation to JSON.
 * This handles unquoted keys and trailing commas.
 */
function jsObjectToJson(content: string): string {
  // Quote unquoted keys (identifiers followed by :)
  // This regex matches: start of line/after { or , followed by whitespace, then an identifier, then :
  let result = content.replace(
    /(?<=^|[{,[\s])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/gm,
    '"$1":'
  );

  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1");

  return result;
}

/**
 * Convert JSON back to JavaScript object literal notation.
 * This unquotes keys that are valid identifiers.
 */
function jsonToJsObject(jsonContent: string, indentStr: string): string {
  // Unquote keys that are valid identifiers
  // Match: "identifier": at the start of a line (after whitespace)
  return jsonContent.replace(
    /^(\s*)"([a-zA-Z_$][a-zA-Z0-9_$]*)"\s*:/gm,
    "$1$2:"
  );
}

/**
 * Try to format content as JSON if it's valid JSON.
 * Returns the formatted JSON string or null if the content is not valid JSON.
 */
function tryFormatJson(content: string, indentStr: string): string | null {
  const trimmed = content.trim();

  // Quick check: must start with { or [
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    // Use the indent string for JSON formatting
    const jsonIndent = indentStr || "    ";
    return JSON.stringify(parsed, null, jsonIndent);
  } catch {
    return null;
  }
}

/**
 * Try to format content as JavaScript object literal (used in Twee metadata passages).
 * This handles unquoted keys and trailing commas.
 * Returns the formatted content or null if it's not a valid JS object literal.
 */
function tryFormatJsObject(content: string, indentStr: string): string | null {
  const trimmed = content.trim();

  // Quick check: must start with { or [
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  // Check if it looks like JS object literal (has unquoted keys)
  // Pattern: identifier followed by colon (not inside quotes)
  const hasUnquotedKeys = /(?:^|[{,[\s])\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/m.test(
    trimmed
  );

  if (!hasUnquotedKeys) {
    return null;
  }

  try {
    // Convert to JSON, parse, and format
    const jsonContent = jsObjectToJson(trimmed);
    const parsed = JSON.parse(jsonContent);
    const jsonIndent = indentStr || "    ";
    const formatted = JSON.stringify(parsed, null, jsonIndent);

    // Convert back to JS object literal notation
    return jsonToJsObject(formatted, indentStr);
  } catch {
    return null;
  }
}

/**
 * Tokenize a line into macro tags and text content
 */
interface Token {
  value: string;
  type: "opening-macro" | "closing-macro" | "text";
  macroName?: string;
}

function tokenizeLine(line: string, options: FormatterOptions): Token[] {
  const tokens: Token[] = [];

  // Split by macro tags <<...>> only, preserving the delimiters
  // This ensures HTML tags with single <> are not split
  // Pattern allows > characters inside macros (e.g., >= comparisons)
  const macroPattern = /(<<(?:\/?\w+)(?:[^>]|>[^>])*>>)/g;
  const parts = line.split(macroPattern);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    // Check if this is a closing macro tag <</name>>
    const closingMatch = trimmed.match(/^<<\/(\w+)>>$/);
    if (closingMatch) {
      tokens.push({
        value: trimmed,
        type: "closing-macro",
        macroName: closingMatch[1],
      });
      continue;
    }

    // Check if this is an opening macro tag <<name...>>
    // Pattern allows > characters inside macros (e.g., >= comparisons)
    const openingMatch = trimmed.match(/^<<(\w+)((?:[^>]|>[^>])*)>>$/);
    if (openingMatch) {
      const macroName = openingMatch[1];
      // Format macro arguments (convert quotes, remove unnecessary quotes)
      const formattedValue = formatMacroArguments(trimmed, options);
      tokens.push({
        value: formattedValue,
        type: "opening-macro",
        macroName,
      });
      continue;
    }

    // Text content (includes HTML tags with single <>)
    tokens.push({
      value: trimmed,
      type: "text",
    });
  }

  return tokens;
}

export interface FormatResult {
  formattedText: string;
  formattedLinesBySource: Map<number, string[]>;
}

/**
 * Format a SugarCube/Twee document
 * Returns formatted text and a mapping of source line index to formatted lines
 */
export function formatSugarCubeDocument(
  text: string,
  options: FormatterOptions = defaultOptions
): FormatResult {
  // Normalize line endings (CRLF -> LF) to handle Windows files
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Merge provided options with defaults
  const mergedOptions: FormatterOptions = { ...defaultOptions, ...options };

  // First pass: detect all block macros (those with closing tags)
  const blockMacros = detectBlockMacros(normalizedText);

  // Build mid-block macros set (built-in SugarCube 2 + custom from twee-config)
  // These are macros that divide a container block into sections (like <<else>> in <<if>>)
  // Built-in children from: https://github.com/cyrusfirheir/twee3-language-tools/blob/master/src/sugarcube-2/macros.json
  const midBlockMacros = new Set([
    // <<if>> children
    "else",
    "elseif",
    // <<switch>> children
    "case",
    "default",
    // <<repeat>> children (<<stop>> terminates the repeat)
    "stop",
    // <<timed>> children (<<next>> starts next timed section)
    "next",
    // <<listbox>>, <<cycle>>, <<linkbox>> children (<<option>> defines options)
    "option",
    "optionsfrom",
    // <<createaudiogroup>> children
    "track",
    // Note: <<break>> and <<continue>> are NOT mid-block macros - they're just
    // statements valid inside <<for>> loops and should be indented normally
    // Custom from twee-config files
    ...(mergedOptions.customMidBlockMacros ?? []),
  ]);

  const lines = normalizedText.split("\n");
  const outputLines: string[] = [];
  let indentLevel = 0;

  // Build indent string based on settings
  const indentStr = mergedOptions.indentationEnabled
    ? mergedOptions.indentationStyle === "tabs"
      ? "\t"
      : " ".repeat(mergedOptions.indentationSize ?? 4)
    : "";

  let seenFirstPassage = false;

  // Track which source line each output line comes from
  const formattedLinesBySource = new Map<number, string[]>();

  // Initialize all source lines with empty arrays
  for (let i = 0; i < lines.length; i++) {
    formattedLinesBySource.set(i, []);
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const trimmedLine = rawLine.trim();
    const outputForThisLine: string[] = [];

    // Skip leading empty lines before the first passage header
    if (trimmedLine === "" && !seenFirstPassage) {
      formattedLinesBySource.set(lineIndex, []);
      continue;
    }

    // Preserve empty lines (after first passage)
    if (trimmedLine === "") {
      formattedLinesBySource.set(lineIndex, [""]);
      outputLines.push("");
      continue;
    }

    // Passage headers - no indentation, reset indent level
    if (trimmedLine.startsWith("::")) {
      const isFirstPassage = !seenFirstPassage;
      seenFirstPassage = true;
      const emptyLinesSetting = mergedOptions.emptyLinesBeforePassages;

      // Adjust empty lines before passage headers (except for the first passage)
      // Skip adjustment if "preserve" is set
      if (!isFirstPassage && emptyLinesSetting !== "preserve") {
        const targetEmptyLines = emptyLinesSetting as number;

        // Count trailing empty lines
        let trailingEmptyCount = 0;
        for (let i = outputLines.length - 1; i >= 0; i--) {
          if (outputLines[i] === "") {
            trailingEmptyCount++;
          } else {
            break;
          }
        }

        // Adjust to target number of empty lines
        if (trailingEmptyCount < targetEmptyLines) {
          // Add missing empty lines to the previous source line's output
          const emptyLinesToAdd = targetEmptyLines - trailingEmptyCount;
          for (let i = 0; i < emptyLinesToAdd; i++) {
            outputLines.push("");
            // Add to the previous non-empty source line's formatted output
            for (let j = lineIndex - 1; j >= 0; j--) {
              const prevOutput = formattedLinesBySource.get(j);
              if (
                prevOutput &&
                prevOutput.length > 0 &&
                prevOutput[prevOutput.length - 1] !== ""
              ) {
                prevOutput.push("");
                break;
              } else if (prevOutput && prevOutput.length > 0) {
                prevOutput.push("");
                break;
              }
            }
          }
        } else if (trailingEmptyCount > targetEmptyLines) {
          // Remove excess empty lines
          const excessLines = trailingEmptyCount - targetEmptyLines;
          for (let i = 0; i < excessLines; i++) {
            outputLines.pop();
          }
          // Update the source line mappings for empty lines
          for (let j = lineIndex - 1; j >= 0 && excessLines > 0; j--) {
            const prevOutput = formattedLinesBySource.get(j);
            if (
              prevOutput &&
              prevOutput.length > 0 &&
              prevOutput.every((l) => l === "")
            ) {
              formattedLinesBySource.set(j, []);
            }
          }
        }
      }

      outputForThisLine.push(trimmedLine);
      outputLines.push(trimmedLine);
      formattedLinesBySource.set(lineIndex, outputForThisLine);
      indentLevel = 0;

      // Check if this passage contains JSON content
      if (mergedOptions.formatJsonPassages) {
        // Find the end of this passage (next :: or end of file)
        let passageEndIndex = lines.length;
        for (let i = lineIndex + 1; i < lines.length; i++) {
          if (lines[i].trim().startsWith("::")) {
            passageEndIndex = i;
            break;
          }
        }

        // Collect passage content (skip leading/trailing empty lines for JSON detection)
        const contentLines: string[] = [];
        const contentStartIndex = lineIndex + 1;
        for (let i = contentStartIndex; i < passageEndIndex; i++) {
          contentLines.push(lines[i]);
        }

        // Try to format as JSON or JS object literal (metadata passages)
        const contentStr = contentLines.join("\n");
        const formattedJson =
          tryFormatJson(contentStr, indentStr) ??
          tryFormatJsObject(contentStr, indentStr);

        if (formattedJson !== null) {
          // This is a JSON passage - output formatted JSON
          const jsonLines = formattedJson.split("\n");

          // Process each content line, mapping to formatted JSON
          for (let i = contentStartIndex; i < passageEndIndex; i++) {
            const jsonLineIndex = i - contentStartIndex;
            if (jsonLineIndex < jsonLines.length) {
              const jsonLine = jsonLines[jsonLineIndex];
              formattedLinesBySource.set(i, [jsonLine]);
              outputLines.push(jsonLine);
            } else {
              // Extra source lines map to empty (JSON is more compact)
              formattedLinesBySource.set(i, []);
            }
          }

          // If JSON has more lines than source, add them to the last source line
          if (
            jsonLines.length > contentLines.length &&
            contentLines.length > 0
          ) {
            const lastSourceIndex = passageEndIndex - 1;
            const existingLines =
              formattedLinesBySource.get(lastSourceIndex) || [];
            for (let i = contentLines.length; i < jsonLines.length; i++) {
              existingLines.push(jsonLines[i]);
              outputLines.push(jsonLines[i]);
            }
            formattedLinesBySource.set(lastSourceIndex, existingLines);
          }

          // Skip to end of passage (will be incremented by loop)
          lineIndex = passageEndIndex - 1;
          continue;
        }
      }

      continue;
    }

    // Tokenize the line
    const tokens = tokenizeLine(trimmedLine, mergedOptions);

    // Process each token
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let formattedLine: string;

      if (token.type === "closing-macro") {
        // Closing tag - decrease indent before outputting
        if (blockMacros.has(token.macroName!)) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        formattedLine = indentStr.repeat(indentLevel) + token.value;
        outputForThisLine.push(formattedLine);
        outputLines.push(formattedLine);
      } else if (token.type === "opening-macro") {
        if (blockMacros.has(token.macroName!)) {
          // Block macro - output at current level, then increase indent
          formattedLine = indentStr.repeat(indentLevel) + token.value;
          outputForThisLine.push(formattedLine);
          outputLines.push(formattedLine);
          indentLevel++;
        } else if (indentLevel > 0 && midBlockMacros.has(token.macroName!)) {
          // Mid-block macro (else, elseif, case, default, or custom) - output at parent level
          const prevIndent = indentLevel - 1;
          formattedLine = indentStr.repeat(prevIndent) + token.value;
          outputForThisLine.push(formattedLine);
          outputLines.push(formattedLine);
        } else {
          // Regular macro - output at current indent level (like text content)
          formattedLine = indentStr.repeat(indentLevel) + token.value;
          outputForThisLine.push(formattedLine);
          outputLines.push(formattedLine);
        }
      } else {
        // Text content
        formattedLine = indentStr.repeat(indentLevel) + token.value;
        outputForThisLine.push(formattedLine);
        outputLines.push(formattedLine);
      }
    }

    formattedLinesBySource.set(lineIndex, outputForThisLine);
  }

  return {
    formattedText: outputLines.join("\n"),
    formattedLinesBySource,
  };
}
