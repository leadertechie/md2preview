import { Composer } from '@leadertechie/md2compose';
import { getMarkdownPipeline, applyBases } from './markdown-pipeline';

export type Md2PreviewLoadSource = (path: string) => Promise<string | null>;

export interface PreviewRenderOptions {
  viewPath: string;
  value: string;
  bases: Record<string, string>;
  context: Record<string, unknown>;
  loadSource?: Md2PreviewLoadSource;
}

export interface PreviewRenderResult {
  html: string;
  context: Record<string, unknown>;
}

export async function renderPreview(options: PreviewRenderOptions): Promise<PreviewRenderResult> {
  const { viewPath, value, bases, context, loadSource } = options;
  const composer = new Composer({
    loader: async (path: string) => {
      if (path === viewPath) return value;
      return loadSource ? loadSource(path) : null;
    },
    uiBaseUrl: '',
  });

  const composed = await composer.compose(viewPath);
  const markdown = applyBases(composed, bases);
  const html = getMarkdownPipeline().renderMarkdown(markdown);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  return {
    html: getPreviewBody(doc),
    context: getPreviewContext(doc, context),
  };
}

export function prependAssetStylesheet(container: HTMLElement, assetBase?: string): void {
  if (!assetBase) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${assetBase.replace(/\/+$/, '')}/core.css`;
  container.insertBefore(link, container.firstChild);
}

function getPreviewContext(doc: Document, context: Record<string, unknown>): Record<string, unknown> {
  const ctxScript = doc.querySelector('script[data-mfe-context]');
  if (!ctxScript?.textContent) return { ...context };

  try {
    return { ...JSON.parse(ctxScript.textContent), ...context };
  } catch {
    return { ...context };
  }
}

function getPreviewBody(doc: Document): string {
  doc
    .querySelectorAll('script[type="module"], script[type="importmap"]')
    .forEach((script) => script.remove());

  return doc.body ? doc.body.innerHTML : '';
}
