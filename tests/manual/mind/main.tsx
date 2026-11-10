import './environment';
import { useState } from 'react';
import { setReadFailure, setMissingDrawer } from './client';
import { createRoot } from 'react-dom/client';
import { AiAssistant } from '../../../src/components/ai-assistant/AiAssistant';
import '../../../src/index.css';

export default function ManualMind() {
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  return (
  <div className="h-screen flex flex-col">
    <p className="p-2 text-center text-sm bg-amber-100 text-amber-950">Mind UI test · UAE / AED · Sample data only · No shop account or network requests</p>
    <label className="text-center text-sm"><input type="checkbox" checked={failed} onChange={event => { setFailed(event.target.checked); setReadFailure(event.target.checked); }} /> Simulate data read failure</label>
    <label className="text-center text-sm"><input type="checkbox" checked={missing} onChange={event => { setMissing(event.target.checked); setMissingDrawer(event.target.checked); }} /> Simulate missing drawer</label>
    <div className="flex-1 min-h-0"><AiAssistant /></div>
  </div>
);
}
createRoot(document.getElementById('root')!).render(<ManualMind />);
