// The contract between the main app bundle and the lazily loaded immersive bundle (three.js + GSAP).
export interface SceneNode { id: string; name: string; accent: string; group: 'knowledge' | 'community' | 'work' | 'media'; related: string[] }
export interface SceneOptions {
  /** The fixed element the canvas is appended to. */
  stage: HTMLElement;
  /** The element that contains the chapter sections (each direct child section is one chapter). */
  journey: HTMLElement;
  nodes: SceneNode[];
  /** Accent colours for the identity rings. */
  identityColors: string[];
  /** Anchor elements to position over the 3D nodes, by node id. */
  labels: Record<string, HTMLElement>;
  quality: 'high' | 'medium' | 'low';
  /** Allow scroll-linked camera movement and pointer parallax. */
  scrollLinked: boolean;
  pointer: boolean;
  /** Continuous, time-based rotation speed multiplier (rings, shells, stars). 0 = still; 1 = full; ~0.3 = calm. */
  drift?: number;
  /** Called after a failure, so the app can fall back to the CSS version. */
  onError(e: unknown): void;
  /** Called once the first frame has been drawn. */
  onReady(): void;
}
export interface SceneHandle {
  dispose(): void;
  setHover(id: string | null): void;
  /** Pause or resume the render loop (focus mode, hidden tab, off-screen). */
  setPaused(p: boolean): void;
  stats(): { frames: number; geometries: number; textures: number; programs: number; chapter: number; paused: boolean; running: boolean; quality: string };
}
export interface ImmersiveApi { mount(o: SceneOptions): SceneHandle; version: string; /** Stats of the mounted scene, or null when none is mounted (used by the cleanup tests). */ liveStats(): ReturnType<SceneHandle['stats']> | null }
declare global { interface Window { FreeverseImmersive?: ImmersiveApi } }
