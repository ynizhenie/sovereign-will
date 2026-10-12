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
  click(): void;
  focus(): void;
}

interface HTMLElement {
  value: string;
  disabled: boolean;
  width: number;
  height: number;
  getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D;
}

interface Window {
  // the Android app's native bridge (Capacitor), when the game runs as the app
  Capacitor?: any;
  toastTimeout?: any;
}
