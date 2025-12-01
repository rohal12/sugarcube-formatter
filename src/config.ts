/**
 * Quote style options for macro arguments
 * - "double": Convert all quotes to double quotes (default)
 * - "single": Convert all quotes to single quotes
 * - "preserve": Keep the original quote style
 */
export type QuoteStyle = "double" | "single" | "preserve";

/**
 * Empty lines before passage headers option
 * - "preserve": Do not modify empty lines before passages
 * - 0: No empty lines before passages
 * - 1: One empty line before passages
 * - 2: Two empty lines before passages (default)
 */
export type EmptyLinesBeforePassages = "preserve" | 0 | 1 | 2;

/**
 * Formatter options that can be configured via VS Code settings.
 *
 * This interface is kept separate from vscode-specific code so it can be
 * used in tests without requiring the vscode module.
 */
export interface FormatterOptions {
  /** Remove quotes from single-word macro arguments (default: true) */
  stripSingleWordQuotes?: boolean;
  /** Quote style for macro arguments (default: "double") */
  quoteStyle?: QuoteStyle;
  /** Number of empty lines before passage headers (default: 2) */
  emptyLinesBeforePassages?: EmptyLinesBeforePassages;
}

/**
 * Default formatter options.
 * Add new options here and they will automatically be read from VS Code config.
 */
export const defaultOptions: Required<FormatterOptions> = {
  stripSingleWordQuotes: true,
  quoteStyle: "double",
  emptyLinesBeforePassages: 2,
};

/**
 * Type for a configuration getter function.
 * This abstraction allows config.ts to remain independent of vscode.
 */
type ConfigGetter = <T>(key: string, defaultValue: T) => T;

/**
 * Build FormatterOptions by reading from a configuration source.
 * Automatically iterates over all keys in defaultOptions.
 *
 * @param getter A function that reads a config value by key with a default fallback
 * @returns FormatterOptions populated from the configuration source
 */
export function buildFormatterOptions(getter: ConfigGetter): FormatterOptions {
  const options: FormatterOptions = {};
  for (const key of Object.keys(defaultOptions) as (keyof FormatterOptions)[]) {
    (options as Record<string, unknown>)[key] = getter(
      key,
      defaultOptions[key]
    );
  }
  return options;
}
