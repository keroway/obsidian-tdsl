import { MarkdownRenderChild, Plugin } from 'obsidian';
import init, { check_source, render_svg_from_source } from '@keroway/tdsl-wasm';
// esbuild inlines the WASM binary via `loader: { '.wasm': 'binary' }`
// so init() receives a BufferSource directly instead of fetching a URL.
import wasmBytes from '@keroway/tdsl-wasm/tdsl_wasm_bg.wasm';

let wasmReady = false;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  await init(wasmBytes as unknown as Parameters<typeof init>[0]);
  wasmReady = true;
}

class TdslPreview extends MarkdownRenderChild {
  private readonly source: string;

  constructor(container: HTMLElement, source: string) {
    super(container);
    this.source = source;
  }

  async onload(): Promise<void> {
    try {
      await ensureWasm();
      // check_source returns JSON array of diagnostics
      const diagnosticsJson = check_source(this.source);
      const diagnostics: Array<{ severity: string; message: string; line: number; col: number }> =
        JSON.parse(diagnosticsJson);
      const errors = diagnostics.filter((d) => d.severity === 'error');

      if (errors.length > 0) {
        this.showErrors(errors.map((e) => `Line ${e.line}: ${e.message}`));
        return;
      }

      const svg = render_svg_from_source(this.source, 0);
      const wrapper = this.containerEl.createDiv({ cls: 'tdsl-preview' });
      // Parse as SVG/XML (not HTML) to avoid innerHTML XSS concerns.
      // DOMParser with 'image/svg+xml' does not execute scripts or event handlers.
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const svgEl = doc.documentElement;
      if (svgEl instanceof SVGElement) {
        wrapper.appendChild(document.adoptNode(svgEl));
      } else {
        this.showErrors(['Internal error: renderer returned invalid SVG']);
      }
    } catch (e) {
      this.showErrors([String(e)]);
    }
  }

  private showErrors(messages: string[]): void {
    this.containerEl.createEl('pre', {
      text: `Timeline DSL error:\n${messages.join('\n')}`,
      cls: 'tdsl-error',
    });
  }
}

export default class TimelineDslPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerMarkdownCodeBlockProcessor('tdsl', (_source, el, ctx) => {
      const child = new TdslPreview(el, _source);
      ctx.addChild(child);
    });
  }
}
