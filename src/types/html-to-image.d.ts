declare module 'html-to-image' {
  export function toPng(node: HTMLElement, options?: Record<string, unknown>): Promise<string>;
}
