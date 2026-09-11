// ============================================================================
// LanguageRunner — Strategy pattern for language-specific execution config
// ============================================================================
// Design decision: Use an interface + registry pattern rather than inheritance.
// Adding a new language means:
//   1. Create a new Docker image in sandbox-images/<lang>/Dockerfile
//   2. Add a new LanguageConfig entry to the registry below
// No changes to execution logic needed.
// ============================================================================

import { Language, LanguageConfig } from '../types';

/**
 * Registry of supported languages and their execution configurations.
 * Each entry maps a language name to its Docker image, file extension,
 * and the command needed to run user code.
 */
const languageRegistry: Record<Language, LanguageConfig> = {
  python: {
    language: 'python',
    dockerImage: 'codesphere-sandbox-python',
    fileExtension: '.py',
    runCommand: (filePath: string) => ['python3', filePath],
  },
  javascript: {
    language: 'javascript',
    dockerImage: 'codesphere-sandbox-javascript',
    fileExtension: '.js',
    runCommand: (filePath: string) => ['node', filePath],
  },
};

/**
 * Get the configuration for a given language.
 * Throws if the language is not supported.
 */
export function getLanguageConfig(language: Language): LanguageConfig {
  const config = languageRegistry[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}. Supported: ${Object.keys(languageRegistry).join(', ')}`);
  }
  return config;
}

/**
 * Get all supported language names.
 */
export function getSupportedLanguages(): Language[] {
  return Object.keys(languageRegistry) as Language[];
}

/**
 * Check if a language is supported.
 */
export function isLanguageSupported(language: string): language is Language {
  return language in languageRegistry;
}
