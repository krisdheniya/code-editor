import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { AuthForms } from './components/AuthForms';
import { CodeEditor } from './components/CodeEditor';
import { OutputPanel } from './components/OutputPanel';
import { ExecutionHistory } from './components/ExecutionHistory';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './api/client';
import { Language, ExecutionMode, Job, ExecutionResult } from './types';
import { Play, Zap, Layers } from 'lucide-react';

const DEFAULT_PYTHON = `# Python CodeSphere Demo
import time

print("Hello from CodeSphere isolated Python sandbox!")
print("Calculating sum...")
total = sum(range(1, 1000000))
print(f"Sum 1 to 1,000,000 = {total}")
`;

const DEFAULT_JS = `// JavaScript CodeSphere Demo
console.log("Hello from CodeSphere isolated Node.js sandbox!");
const startTime = Date.now();

let count = 0;
for (let i = 0; i < 5000000; i++) {
  count += i;
}

console.log("Done calculation, count:", count);
console.log("Elapsed inside container:", Date.now() - startTime, "ms");
`;

const MainApp: React.FC = () => {
  const { user, token } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [language, setLanguage] = useState<Language>('python');
  const [mode, setMode] = useState<ExecutionMode>('repl');
  const [code, setCode] = useState(DEFAULT_PYTHON);
  const [activeTab, setActiveTab] = useState<'output' | 'history'>('output');

  const [isRunning, setIsRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [currentResult, setCurrentResult] = useState<ExecutionResult | null>(null);

  const [jobsHistory, setJobsHistory] = useState<Job[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { isConnected, latestJobUpdate, subscribeToJob } = useWebSocket(token);

  // Update language code default
  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    if (lang === 'python') setCode(DEFAULT_PYTHON);
    else setCode(DEFAULT_JS);
  };

  // Load history on login
  useEffect(() => {
    if (user) {
      loadHistory();
    } else {
      setJobsHistory([]);
    }
  }, [user]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getJobHistory();
      setJobsHistory(res.data.jobs);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Listen to WebSocket job updates for batch mode
  useEffect(() => {
    if (latestJobUpdate && currentJob && latestJobUpdate.jobId === currentJob.id) {
      const updatedJob = latestJobUpdate.data as Job;
      setCurrentJob(updatedJob);
      setIsRunning(false);
      loadHistory();
    }
  }, [latestJobUpdate]);

  const handleRunCode = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setIsRunning(true);
    setCurrentResult(null);
    setCurrentJob(null);
    setActiveTab('output');

    try {
      const res = await api.execute(language, code, mode);

      if (mode === 'repl') {
        setCurrentJob({
          id: res.data.jobId,
          userId: user.id,
          language,
          code,
          mode: 'repl',
          status: res.data.status,
          stdout: res.data.result?.stdout || null,
          stderr: res.data.result?.stderr || null,
          exitCode: res.data.result?.exitCode || 0,
          executionTimeMs: res.data.result?.executionTimeMs || 0,
          errorMessage: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        });
        setCurrentResult(res.data.result);
        setIsRunning(false);
        loadHistory();
      } else {
        // Batch mode: subscribe to WebSocket updates
        const jobId = res.data.jobId;
        subscribeToJob(jobId);

        setCurrentJob({
          id: jobId,
          userId: user.id,
          language,
          code,
          mode: 'batch',
          status: 'queued',
          stdout: null,
          stderr: null,
          exitCode: null,
          executionTimeMs: null,
          errorMessage: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        });
      }
    } catch (err: any) {
      setIsRunning(false);
      const errMsg = err.response?.data?.error || 'Execution failed';
      setCurrentResult({
        stdout: '',
        stderr: errMsg,
        exitCode: 1,
        executionTimeMs: 0,
      });
    }
  };

  return (
    <div className="app-container">
      <Header onOpenAuth={() => setShowAuthModal(true)} />

      <div className="main-content">
        {/* Left Side: Code Editor */}
        <div className="editor-section">
          <div className="toolbar">
            <div className="controls-left">
              <select
                className="select-input"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as Language)}
              >
                <option value="python">Python (3.11)</option>
                <option value="javascript">JavaScript (Node 20)</option>
              </select>

              <div className="mode-toggle">
                <button
                  className={`mode-btn ${mode === 'repl' ? 'active' : ''}`}
                  onClick={() => setMode('repl')}
                  title="REPL: Pre-warmed container, low-latency synchronous"
                >
                  <Zap size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  REPL Sync
                </button>
                <button
                  className={`mode-btn ${mode === 'batch' ? 'active' : ''}`}
                  onClick={() => setMode('batch')}
                  title="Batch: Redis Queue, asynchronous worker pool"
                >
                  <Layers size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Batch Async
                </button>
              </div>
            </div>

            <div className="controls-right">
              <button
                className="btn btn-success"
                onClick={handleRunCode}
                disabled={isRunning}
              >
                <Play size={14} />
                {isRunning ? 'Running...' : 'Run Code'}
              </button>
            </div>
          </div>

          <CodeEditor
            language={language}
            code={code}
            onChange={(val) => setCode(val || '')}
          />
        </div>

        {/* Right Side: Output & History */}
        <div className="sidebar-section">
          <div className="tab-header">
            <button
              className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`}
              onClick={() => setActiveTab('output')}
            >
              Console Output
            </button>
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Job History ({jobsHistory.length})
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'output' ? (
              <OutputPanel job={currentJob} result={currentResult} isRunning={isRunning} />
            ) : (
              <ExecutionHistory
                jobs={jobsHistory}
                onSelectJob={(j) => {
                  setCurrentJob(j);
                  setCurrentResult(null);
                  setActiveTab('output');
                }}
                isLoading={historyLoading}
              />
            )}
          </div>
        </div>
      </div>

      {showAuthModal && <AuthForms onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};
