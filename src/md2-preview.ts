import { Composer } from '@leadertechie/md2compose';
import { MarkdownPipeline } from '@leadertechie/md2html';
import { mountMFEs } from '@leadertechie/md2interact';

/**
 * Resolves non-view sources (base/layout/parent) during composition.
 * The host injects this because the renderer is storage-agnostic.
 */
export type Md2PreviewLoadSource = (path: string) => Promise<string | null>;

let pipeline: MarkdownPipeline | null = null;

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

/**
 * `<md2-preview>` — a renderer MFE.
 *
 * Projects a Markdown content bit through its layout shell and mounts the
 * resulting page's micro-frontends inside an isolated shadow-DOM container.
 * It never touches document-level wiring (fetch proxy, context bus, CSS), so
 * it is safe to embed inside another application.
 *
 * Hosts set the public fields below and call `render()`.
 */
export class Md2Preview extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['view-path'];
  }

  private readonly _root: ShadowRoot;
  private readonly _container: HTMLElement;
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
    this._container = document.createElement('div');
    this._container.setAttribute('part', 'preview');
    this._root.appendChild(this._container);
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
