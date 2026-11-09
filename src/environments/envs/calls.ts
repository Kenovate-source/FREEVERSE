import type { EnvDef } from '../types';
import { COL, clamp, dot, ease, glow, line, ring } from '../kit';
// CALLS: two endpoints and a connection that lives through its whole life: ringing, connecting, speaking, disconnecting.
// Endpoints are abstract light, never a gendered or photographic figure.
export const calls: EnvDef = {
  id: 'calls', label: 'Live connection', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const CYCLE = 18;
    return {
      resize(w, h) { W = w; H = h; },
      draw(t) {
        const A = [W * 0.2, H * 0.68] as const, B = [W * 0.8, H * 0.34] as const; const s = t % CYCLE;
        const conn = clamp((s - 5) / 2), talk = s > 7 && s < 14.5, end = clamp((s - 14.5) / 3.5); const answered = s > 5.5 && end < 1;
        const bCol = answered ? COL.green : COL.steel;
        glow(c, A[0], A[1], 46, COL.amber, 0.28 * (1 - end)); glow(c, B[0], B[1], 46, bCol, (answered ? 0.3 : 0.12) * (1 - end * 0.5));
        dot(c, A[0], A[1], 7, COL.amber, 0.7); dot(c, B[0], B[1], 7, bCol, 0.7);
        if (s < 5) for (let k = 0; k < 3; k++) { const p = (s * 0.8 + k / 3) % 1; ring(c, A[0], A[1], 12 + p * 150, COL.amber, 0.4 * (1 - p), 1.4); } // ringing: rings leave the caller
        if (s > 5 && s < 14.5) { // connecting: the line draws itself towards the callee, who answers with a pulse
          const u = ease(conn); const x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u;
          line(c, A[0], A[1], x, y, COL.green, 0.25 + 0.25 * conn, 1.4);
          if (conn < 1) glow(c, x, y, 14, COL.green, 0.6); else { const p = ((s - 6.8) * 0.9) % 1; ring(c, B[0], B[1], 10 + p * 70, COL.green, 0.4 * (1 - p)); }
        }
        if (talk) { // speaking: two voices as waves that swell and fall, in opposite phases
          const n = 90; const dx = B[0] - A[0], dy = B[1] - A[1]; const len = Math.hypot(dx, dy) || 1; const nx = -dy / len, ny = dx / len;
          for (const [col, ph, amp] of [[COL.cyan, 0, 16], [COL.pink, 2.2, 11]] as const) {
            const k = c.ctx; k.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.5)`; k.lineWidth = 1.5; k.beginPath();
            for (let i = 0; i <= n; i++) { const u = i / n; const env = Math.sin(u * Math.PI); const voice = 0.55 + 0.45 * Math.sin(t * 2.3 + ph); const w = Math.sin(u * 26 - t * 6 + ph) * amp * env * voice; const x = A[0] + dx * u + nx * w, y = A[1] + dy * u + ny * w; if (i) k.lineTo(x, y); else k.moveTo(x, y); }
            k.stroke();
          }
        }
        if (end > 0 && end < 1) { // disconnecting: the line retracts and the callee's glow collapses
          const x = A[0] + (B[0] - A[0]) * (1 - end), y = A[1] + (B[1] - A[1]) * (1 - end);
          line(c, A[0], A[1], x, y, COL.coral, 0.4 * (1 - end), 1.4); ring(c, B[0], B[1], 70 * (1 - end), COL.coral, 0.4 * (1 - end));
        }
      },
    };
  },
};
