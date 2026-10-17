import { useState } from 'react';
import { Button, Dialog, MockBadge, Notice } from './ui';
import { useApp } from '../app/context';
import type { SimMode } from '../types';

const MODES: { value: SimMode; label: string; help: string }[] = [
  { value: 'normal', label: 'Normal', help: 'Short simulated delay, then data.' },
  { value: 'slow', label: 'Slow network', help: 'About 2.6 seconds per request so loading states stay visible.' },
  { value: 'error', label: 'Server errors', help: 'Every request fails, so you can see error and retry states.' },
  { value: 'empty', label: 'No data', help: 'Every list comes back empty, so you can see empty states.' },
];

/** Prototype-only controls for demonstrating loading, empty and error states. Not part of the real product. */
export function DemoControlsButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { mode, setMode, resetDemoData } = useApp();
  return (
    <>
      <Button variant="ghost" size="sm" icon="sliders" className={className} onClick={() => setOpen(true)} aria-label="Prototype controls">
        <span className="demo-btn-label">Demo controls</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Prototype controls">
        <MockBadge label="Stage 1 prototype only" />
        <p className="muted">Everything in this build runs on fictional data in your browser. Use these controls to see how each screen behaves when the network is slow, fails, or returns nothing.</p>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          <legend className="label" style={{ fontWeight: 650, marginBottom: 6 }}>Simulate</legend>
          {MODES.map((m) => (
            <label key={m.value} className="check">
              <input type="radio" name="sim-mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
              <span><strong>{m.label}</strong><br /><span className="faint">{m.help}</span></span>
            </label>
          ))}
        </fieldset>
        <Notice>Resetting clears the posts, reactions, RSVPs and introduction requests you made in this browser. It does not sign you out.</Notice>
        <div className="row-wrap">
          <Button variant="secondary" onClick={() => resetDemoData()}>Reset demo data</Button>
        </div>
      </Dialog>
    </>
  );
}
