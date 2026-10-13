// The page as the game's code uses it: an element found by id or selector is taken for what the game
// knows it is (a button, a field, the canvas), so its value, dataset or width are there without a cast on
// every line. For the type check only (jsconfig.json); nothing of it is shipped.

interface Element {
  dataset: DOMStringMap;
  style: CSSStyleDeclaration;
  hidden: boolean;
  disabled: boolean;
  value: string;
  title: string;
  placeholder: string;
  offsetParent: Element | null;
  click(): void;
  focus(): void;
}

// an event's target is an element of the page
interface EventTarget {
  id: string;
  closest(selectors: string): Element | null;
}

interface HTMLElement {
  value: string;
  disabled: boolean;
  width: number;
  height: number;
  getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D;
}

// the game's own page (index.html) always has the elements the code asks for by id
interface Document {
  getElementById(elementId: string): HTMLElement;
}

interface Window {
  // the Android app's native bridge (Capacitor), when the game runs as the app
  Capacitor?: any;
  // older Safari's name for AudioContext
  webkitAudioContext?: typeof AudioContext;
  toastTimeout?: any;
}
