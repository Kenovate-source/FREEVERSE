import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface Toast { id: number; text: string; tone: 'ok' | 'error' | 'info' }
const Ctx = createContext<{ say: (t: string, tone?: Toast['tone']) => void }>({ say: () => {} });
export const useToast = () => useContext(Ctx);

/** Polite live region + visible toasts. Messages are short and say what happened. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]); const n = useRef(0);
  const say = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = ++n.current; setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const v = useMemo(() => ({ say }), [say]);
  return (
    <Ctx.Provider value={v}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}
