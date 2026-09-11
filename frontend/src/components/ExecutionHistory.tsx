import React from 'react';
import { Job } from '../types';
import { Clock, Code } from 'lucide-react';

interface ExecutionHistoryProps {
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  isLoading: boolean;
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({ jobs, onSelectJob, isLoading }) => {
  if (isLoading) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e' }}>Loading history...</div>;
  }

  if (jobs.length === 0) {
    return (
      <div style={{ padding: '30px 10px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
        No execution history yet. Submit code to see past runs here.
      </div>
    );
  }

  return (
    <div>
      {jobs.map((job) => (
        <div key={job.id} className="history-item" onClick={() => onSelectJob(job)}>
          <div className="history-header">
            <span style={{ fontWeight: 600, color: '#f0f6fc', textTransform: 'capitalize' }}>
              {job.language} ({job.mode.toUpperCase()})
            </span>
            <span className={`badge badge-${job.status}`}>{job.status}</span>
          </div>

          <div className="history-code">{job.code}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: '#8b949e' }}>
            <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
            {job.executionTimeMs && <span>{job.executionTimeMs}ms</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
