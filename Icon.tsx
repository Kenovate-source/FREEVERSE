import type { SVGProps } from 'react';
const P = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', learn: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z M4 21.5V4.5 M9 7h7',
  briefcase: 'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 13h18', calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  nova: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z', message: 'M4 5h16v11H9l-5 4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6 8-6s8 2 8 6', users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5 M16 11a3 3 0 1 0 0-6 M17 15c2.5.3 4 1.8 4 5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', flag: 'M5 21V4 M5 4h12l-2 4 2 4H5', check: 'M5 12.5l4.5 4.5L19 7.5', alert: 'M12 3 2.5 20h19z M12 10v4 M12 17.2v.1',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8v.1', lock: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3', plus: 'M12 5v14 M5 12h14', logout: 'M10 4H5v16h5 M15 8l4 4-4 4 M19 12H9',
  send: 'M3 11l18-8-8 18-2-8z', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5z',
  compass2: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5', external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4v6 M9 14v6', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2', pin: 'M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10z M12 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  video: 'M3 7h12v10H3z M15 11l6-3v8l-6-3', play: 'M8 5v14l11-7z', arrowLeft: 'M19 12H5 M11 6l-6 6 6 6', arrowRight: 'M5 12h14 M13 6l6 6-6 6', inbox: 'M3 13l3-8h12l3 8v6H3z M3 13h5l1 3h6l1-3h5',
  sparkles: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4', bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4z M10 21h4', bookmark: 'M6 3h12v18l-6-4-6 4z', phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5a1 1 0 1 0 0-.1', store: 'M4 9l1-5h14l1 5 M4 9v11h16V9 M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0',
  game: 'M6 9h12a3 3 0 0 1 3 3v3a2 2 0 0 1-3.5 1.4L16 15H8l-1.5 1.4A2 2 0 0 1 3 15v-3a3 3 0 0 1 3-3z M8 11v2 M7 12h2 M16 11.5v.1 M18 13v.1', grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  council: 'M12 4a3 3 0 1 0 0 .1 M5 20a7 7 0 0 1 14 0 M4 9a2 2 0 1 0 0 .1 M20 9a2 2 0 1 0 0 .1', layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5', crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  scale: 'M12 4v16 M7 20h10 M5 8h14 M5 8l-3 7a3 3 0 0 0 6 0z M19 8l-3 7a3 3 0 0 0 6 0z', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4', x: 'M6 6l12 12 M18 6L6 18', menu: 'M4 7h16 M4 12h16 M4 17h16',
  more: 'M5 12h.1 M12 12h.1 M19 12h.1', trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13', edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18 M10.6 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8 M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4-.9', share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 10.5l6.8-3.9 M8.6 13.5l6.8 3.9',
  thumb: 'M7 11v9H4v-9z M7 11l4-7a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H7', chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3', key: 'M14 10a4 4 0 1 0-3 3.9L9 16v3h3v-2h2v-2h2l1.5-1.5', mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 21V5', download: 'M12 4v11 M7 11l5 5 5-5 M4 20h16', filter: 'M4 5h16l-6 8v6l-4-2v-4z', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', activity: 'M3 12h4l3-8 4 16 3-8h4', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  mask: 'M4 8c3-2 13-2 16 0v4a8 8 0 0 1-16 0z M8.5 11.5v.1 M15.5 11.5v.1 M9 15c1.5 1 4.5 1 6 0', hash: 'M5 9h14 M5 15h14 M10 4L8 20 M16 4l-2 16',
} as const;
export type IconName = keyof typeof P;
export function Icon({ name, size = 22, ...rest }: { name: IconName | string; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const d = (P as Record<string, string>)[name] ?? P.info;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}><path d={d} /></svg>;
}
