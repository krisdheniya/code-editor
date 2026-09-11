import React from 'react';
import Editor from '@monaco-editor/react';
import { Language } from '../types';

interface CodeEditorProps {
  language: Language;
  code: string;
  onChange: (value: string | undefined) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ language, code, onChange }) => {
  const monacoLanguage = language === 'python' ? 'python' : 'javascript';

  return (
    <div className="editor-container">
      <Editor
        height="100%"
        language={monacoLanguage}
        theme="vs-dark"
        value={code}
        onChange={onChange}
        options={{
          fontSize: 14,
          fontFamily: "'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12 },
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        }}
      />
    </div>
  );
};
