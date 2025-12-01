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
 * - Optionally remove quotes from single-word arguments (no spaces, dashes, or minuses)
 * - Handle escaping when content contains quote characters
 */
function formatMacroArguments(
  macroContent: string,
  options: FormatterOptions
): string {
  const quoteStyle = options.quoteStyle ?? "double";

  // Pattern to match quoted arguments (single or double quotes)
  // Also captures escaped quotes within the string
  return macroContent.replace(
    /(['"])((?:[^'"\\]|\\.|(?!\1)['"])*)\1/g,
    (match, quote, content) => {
      // Check if content is a single word (no spaces, dashes, or minuses)
      // Also check the unescaped content for this test
      const unescapedContent = content
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
      if (
        options.stripSingleWordQuotes &&
        /^[^\s\-]+$/.test(unescapedContent)
      ) {
        // Remove quotes for single-word arguments
        // Return unescaped content since quotes are being removed
        return unescapedContent;
      }

      return formatQuotedString(quote, content, quoteStyle);
    }
  );
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
 * Tokenize a line into macro tags and text content
 */
interface Token {
  value: string;
  type: "opening-macro" | "closing-macro" | "text";
  macroName?: string;
}

function tokenizeLine(line: string, options: FormatterOptions): Token[] {
  const tokens: Token[] = [];
  // Match: closing tags <</name>>, opening tags <<name...>>, or text content
  const pattern = /<<\/(\w+)>>|<<(\w+)[^>]*>>|[^<]+|</g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    const fullMatch = match[0].trim();
    if (!fullMatch) {
      continue;
    }

    if (match[1]) {
      // Closing tag <</name>>
      tokens.push({
        value: fullMatch,
        type: "closing-macro",
        macroName: match[1],
      });
    } else if (match[2]) {
      // Opening tag <<name...>>
      const macroName = match[2];
      // Format macro arguments (convert quotes, remove unnecessary quotes)
      const formattedValue = formatMacroArguments(fullMatch, options);
      tokens.push({
        value: formattedValue,
        type: "opening-macro",
        macroName,
      });
    } else {
      // Text content
      tokens.push({
        value: fullMatch,
        type: "text",
      });
    }
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
  // Merge provided options with defaults
  const mergedOptions: FormatterOptions = { ...defaultOptions, ...options };

  // First pass: detect all block macros (those with closing tags)
  const blockMacros = detectBlockMacros(text);

  const lines = text.split("\n");
  const outputLines: string[] = [];
  let indentLevel = 0;
  const indentStr = "    "; // 4 spaces

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

    // Preserve empty lines
    if (trimmedLine === "") {
      formattedLinesBySource.set(lineIndex, [""]);
      outputLines.push("");
      continue;
    }

    // Passage headers - no indentation, reset indent level
    if (trimmedLine.startsWith("::")) {
      // Ensure exactly 2 empty lines before passage headers (except at start of file)
      if (outputLines.length > 0) {
        // Count trailing empty lines
        let trailingEmptyCount = 0;
        for (let i = outputLines.length - 1; i >= 0; i--) {
          if (outputLines[i] === "") {
            trailingEmptyCount++;
          } else {
            break;
          }
        }

        // Adjust to exactly 2 empty lines
        if (trailingEmptyCount < 2) {
          // Add missing empty lines to the previous source line's output
          const emptyLinesToAdd = 2 - trailingEmptyCount;
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
        } else if (trailingEmptyCount > 2) {
          // Remove excess empty lines
          const excessLines = trailingEmptyCount - 2;
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
        } else if (indentLevel > 0) {
          // Non-block macro inside a block - output at parent level (like <<else>>)
          const prevIndent = indentLevel - 1;
          formattedLine = indentStr.repeat(prevIndent) + token.value;
          outputForThisLine.push(formattedLine);
          outputLines.push(formattedLine);
        } else {
          // Non-block macro at top level - output at current level
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
