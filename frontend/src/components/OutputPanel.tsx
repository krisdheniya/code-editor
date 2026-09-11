import React from 'react';
import { Job, ExecutionResult } from '../types';
import { Clock, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

interface OutputPanelProps {
  job: Job | null;
  result: ExecutionResult | null;
  isRunning: boolean;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({ job, result, isRunning }) => {
  if (isRunning) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>
        <div style={{ marginBottom: '12px', fontSize: '14px' }}>Executing code safely inside Docker container...</div>
        <div className="badge badge-running">Running</div>
      </div>
    );
  }

  if (!job && !result) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
        Click <strong>Run Code</strong> to execute the snippet and view stdout, stderr, exit code, and execution latency.
      </div>
    );
  }

  const stdout = result ? result.stdout : job?.stdout || '';
  const stderr = result ? result.stderr : job?.stderr || '';
  const exitCode = result ? result.exitCode : job?.exitCode;
  const executionTimeMs = result ? result.executionTimeMs : job?.executionTimeMs;
  const status = job?.status || (result?.exitCode === 0 ? 'completed' : 'failed');
  const errorMsg = job?.errorMessage;

  const isSuccess = exitCode === 0 && !result?.timedOut && !result?.oomKilled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f0f6fc' }}>Execution Result</span>
        <span className={`badge badge-${status}`}>
          {status}
        </span>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(218, 54, 51, 0.15)', border: '1px solid #da3633', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', color: '#f85149', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={16} />
          {errorMsg}
        </div>
      )}

      <div>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '6px' }}>STDOUT</div>
        <div className="output-box">{stdout || <span style={{ color: '#484f58' }}>(empty)</span>}</div>
      </div>

      {stderr && (
        <div>
          <div style={{ fontSize: '12px', color: '#f85149', marginBottom: '6px' }}>STDERR</div>
          <div className="output-box" style={{ borderColor: 'rgba(218, 54, 51, 0.4)', color: '#ff7b72' }}>
            {stderr}
          </div>
        </div>
      )}

      <div className="output-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isSuccess ? <CheckCircle2 size={14} color="#3fb950" /> : <AlertTriangle size={14} color="#f85149" />}
          <span>Exit Code: {exitCode !== undefined && exitCode !== null ? exitCode : 'N/A'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={14} />
          <span>Latency: {executionTimeMs !== undefined && executionTimeMs !== null ? `${executionTimeMs}ms` : 'N/A'}</span>
        </div>
      </div>
    </div>
  );
};
