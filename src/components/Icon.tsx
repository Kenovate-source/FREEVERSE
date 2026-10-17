import type { SVGProps } from 'react';

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  learn: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z M4 21.5V4.5 M9 7h7',
  briefcase: 'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 13h18',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  nova: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  message: 'M4 5h16v11H9l-5 4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6 8-6s8 2 8 6',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5 M16 11a3 3 0 1 0 0-6 M17 15c2.5.3 4 1.8 4 5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3 2.5 20h19z M12 10v4 M12 17.2v.1',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8v.1',
  lock: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3',
  plus: 'M12 5v14 M5 12h14',
  logout: 'M10 4H5v16h5 M15 8l4 4-4 4 M19 12H9',
  send: 'M3 11l18-8-8 18-2-8z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4v6 M9 14v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  pin: 'M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10z M12 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  video: 'M3 7h12v10H3z M15 11l6-3v8l-6-3',
  play: 'M8 5v14l11-7z',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  inbox: 'M3 13l3-8h12l3 8v6H3z M3 13h5l1 3h6l1-3h5',
  sparkles: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
