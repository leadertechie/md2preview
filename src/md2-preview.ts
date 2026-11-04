import { mountMFEs } from '@leadertechie/md2interact';
import { PreviewActionGuard } from './preview-action-guard';
import { prependAssetStylesheet, renderPreview } from './preview-renderer';
import type { Md2PreviewLoadSource } from './preview-renderer';

export type { Md2PreviewLoadSource } from './preview-renderer';

const STYLES = `
:host {
  display: block;
  min-width: 0;
}

.preview-alert {
  padding: 0.6lh 1lh;
  border-bottom: 1px solid color-mix(in srgb, var(--warning-color, #d97706), transparent 60%);
  background: color-mix(in srgb, var(--warning-color, #d97706), transparent 90%);
  color: color-mix(in srgb, var(--warning-color, #d97706), #000 35%);
  font-size: var(--font-size-small, 0.875rem);
  font-weight: 600;
  text-align: center;
  transition: background-color 120ms ease;
}

.preview-alert--active {
  background: color-mix(in srgb, var(--warning-color, #d97706), transparent 72%);
}
`;

/**
 * `<md2-preview>` — a renderer MFE.
 *
 * Projects a Markdown content bit through its layout shell and mounts the
 * resulting page's micro-frontends inside an isolated shadow-DOM container.
 * It never touches document-level wiring (fetch proxy, context bus, CSS), so
 * it is safe to embed inside another application.
 *
 * In preview mode, interactive actions inside the composed page (links,
 * buttons, form submits) are intercepted: their default is prevented and an
 * alert is shown at the top of the preview.
 */
export class Md2Preview extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['view-path'];
  }

  private readonly _root: ShadowRoot;
  private readonly _container: HTMLElement;
  private readonly _banner: HTMLElement;
  private readonly _actionGuard: PreviewActionGuard;
  private _cleanup: (() => void) | null = null;

  /** The unsaved Markdown source for the view being previewed. */
  value = '';
  /** base_urls map (ASSET_BASE, HEADER_BASE, …). */
  bases: Record<string, string> = {};
  /** Context snapshot merged over the composed page's data-mfe-context. */
  context: Record<string, unknown> = {};
  /** Resolves the layout/parent for the given view. */
  loadSource?: Md2PreviewLoadSource;

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this._root.appendChild(style);

    this._banner = document.createElement('div');
    this._banner.className = 'preview-alert';
    this._banner.setAttribute('part', 'preview-alert');
    this._banner.textContent = 'Preview only — actions are disabled.';
    this._root.appendChild(this._banner);

    this._container = document.createElement('div');
    this._container.setAttribute('part', 'preview');
    this._root.appendChild(this._container);

    this._actionGuard = new PreviewActionGuard(this._root, this._banner);
  }

  get viewPath(): string {
    return this.getAttribute('view-path') ?? '';
  }

  set viewPath(value: string) {
    this.setAttribute('view-path', value);
  }

  disconnectedCallback(): void {
    this._cleanup?.();
    this._cleanup = null;
    this._actionGuard.clearTimer();
  }

  /**
   * Compose + render the current value and mount the page MFEs in place.
   * Idempotent: re-rendering tears down the previous mount first.
   */
  async render(): Promise<void> {
    this._cleanup?.();
    this._cleanup = null;
    this._container.innerHTML = '';

    const bases = this.bases;
    const { html, context } = await renderPreview({
      viewPath: this.viewPath,
      value: this.value,
      bases,
      context: this.context,
      loadSource: this.loadSource,
    });
    this._container.innerHTML = html;
    prependAssetStylesheet(this._container, bases.ASSET_BASE);

    this._cleanup = await mountMFEs({ root: this._container, context });
  }
}
