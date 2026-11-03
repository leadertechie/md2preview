import { Composer } from '@leadertechie/md2compose';
import { MarkdownPipeline } from '@leadertechie/md2html';
import { mountMFEs } from '@leadertechie/md2interact';

/**
 * Resolves non-view sources (base/layout/parent) during composition.
 * The host injects this because the renderer is storage-agnostic.
 */
export type Md2PreviewLoadSource = (path: string) => Promise<string | null>;

let pipeline: MarkdownPipeline | null = null;

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
 * Matches the production template engine in toldby.page.routing so the
 * preview projection is byte-for-byte the served page.
 * See toldby.page.routing/src/discovery/template-engine.ts (getPipeline).
 */
function getPipeline(): MarkdownPipeline {
  if (!pipeline) {
    pipeline = new MarkdownPipeline({
      preserveRawHTML: true,
      errorRecovery: 'warn',
      allowedHTMLTags: [
        'html', 'head', 'body', 'link', 'style', 'meta',
        'button', 'p', 'div', 'span', 'section', 'header', 'footer', 'main', 'nav',
        'img', 'a', 'hr', 'br', 'header-actions',
      ],
      allowedAttributes: {
        '*': ['id', 'class', 'style', 'slot', 'data-*'],
        script: ['type', 'src', 'nonce'],
        link: ['rel', 'href', 'type'],
        meta: ['name', 'content', 'charset'],
        a: ['href', 'target'],
        img: ['src', 'alt', 'width', 'height'],
        div: [
          'data-interaction', 'data-mfe-src', 'data-mfe-api', 'data-mfe-hash',
          'data-mfe-props', 'data-mfe-env',
        ],
      },
      allowedScriptTypes: ['importmap', 'module', 'application/json'],
      wrapHtmlDocument: true,
      styleOptions: {
        classPrefix: 'md-',
        addHeadingIds: true,
        emitScopeAnchors: true,
      },
    });
  }
  return pipeline;
}

function applyBases(markdown: string, bases: Record<string, string>): string {
  let result = markdown;
  for (const [key, value] of Object.entries(bases)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

const INTERACTIVE_SELECTOR = 'a[href], button, [role="button"], input[type="submit"], input[type="button"]';

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
  private _cleanup: (() => void) | null = null;
  private _alertTimer: number | undefined;

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

    // Capture phase so we intercept before any MFE-internal handler runs.
    this._root.addEventListener('click', this._onPreviewClick, true);
    this._root.addEventListener('submit', this._onPreviewSubmit, true);
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
    if (this._alertTimer !== undefined) {
      window.clearTimeout(this._alertTimer);
      this._alertTimer = undefined;
    }
  }

  private readonly _onPreviewClick = (event: Event): void => {
    // composedPath() reaches through nested MFE shadow roots, so we can see
    // the actual <a>/<button> that was clicked and block its default action.
    const path = event.composedPath() as EventTarget[];
    const interactive = path.find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.matches(INTERACTIVE_SELECTOR),
    );

    if (!interactive) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this._flashAlert();
  };

  private readonly _onPreviewSubmit = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    this._flashAlert();
  };

  private _flashAlert(): void {
    if (this._alertTimer !== undefined) window.clearTimeout(this._alertTimer);
    this._banner.classList.add('preview-alert--active');
    this._alertTimer = window.setTimeout(() => {
      this._banner.classList.remove('preview-alert--active');
      this._alertTimer = undefined;
    }, 1200);
  }

  /**
   * Compose + render the current value and mount the page MFEs in place.
   * Idempotent: re-rendering tears down the previous mount first.
   */
  async render(): Promise<void> {
    this._cleanup?.();
    this._cleanup = null;
    this._container.innerHTML = '';

    const viewPath = this.viewPath;
    const { value, bases, context, loadSource } = this;

    const composer = new Composer({
      loader: async (path: string) => {
        if (path === viewPath) return value;
        return loadSource ? loadSource(path) : null;
      },
      uiBaseUrl: '',
    });

    const composed = await composer.compose(viewPath);
    const withBases = applyBases(composed, bases);
    const html = getPipeline().renderMarkdown(withBases);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Merge caller context over the page's own context block.
    const ctxScript = doc.querySelector('script[data-mfe-context]');
    let ctx: Record<string, unknown> = { ...context };
    if (ctxScript?.textContent) {
      try {
        ctx = { ...JSON.parse(ctxScript.textContent), ...context };
      } catch {
        // Ignore malformed context — keep the caller-provided snapshot.
      }
    }

    // Drop the page's module/importmap bootstrap scripts: we boot the
    // contained MFEs via the scoped mountMFEs below instead.
    doc
      .querySelectorAll('script[type="module"], script[type="importmap"]')
      .forEach((s) => s.remove());

    this._container.innerHTML = doc.body ? doc.body.innerHTML : '';

    const assetBase = bases.ASSET_BASE;
    if (assetBase) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${assetBase.replace(/\/+$/, '')}/core.css`;
      this._container.insertBefore(link, this._container.firstChild);
    }

    this._cleanup = await mountMFEs({ root: this._container, context: ctx });
  }
}
