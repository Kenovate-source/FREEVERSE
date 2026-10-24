import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { Button, Dialog, TextField, errMsg } from '../ui/kit';
import { useSession } from './session';

const Ctx = createContext<{ ask: (why: string) => Promise<string> }>({ ask: () => Promise.reject(new Error('no step-up')) });
export const useStepUp = () => useContext(Ctx);

/** Sensitive actions re-confirm who you are. The grant is short-lived and is sent only with that one request. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { config } = useSession();
  const [why, setWhy] = useState<string | null>(null); const [secret, setSecret] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const pending = useRef<{ ok: (t: string) => void; no: (e: Error) => void } | null>(null);
  const ask = useCallback((reason: string) => new Promise<string>((ok, no) => { pending.current = { ok, no }; setSecret(''); setErr(null); setWhy(reason); }), []);
  const close = () => { pending.current?.no(new Error('Cancelled')); pending.current = null; setWhy(null); };
  const dev = config?.auth.kind === 'dev';
  const submit = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post<{ token: string }>('/api/me/step-up', { secret }); pending.current?.ok(r.token); pending.current = null; setWhy(null); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Ctx.Provider value={{ ask }}>
      {children}
      <Dialog open={why !== null} onClose={close} title="Confirm it’s you" actions={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" busy={busy} disabled={!secret} onClick={submit}>Confirm</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); if (secret) void submit(); }} className="stack-sm">
          <p className="muted">{why}</p>
          <TextField label={dev ? 'Your account email' : 'Your password'} type={dev ? 'email' : 'password'} autoComplete={dev ? 'email' : 'current-password'} value={secret} onChange={(e) => setSecret(e.target.value)} error={err ?? undefined} hint={dev ? 'Development sign-in does not check passwords, so type your email to confirm.' : undefined} autoFocus />
        </form>
      </Dialog>
    </Ctx.Provider>
  );
}
