import { MarkdownPipeline } from '@leadertechie/md2html';

let pipeline: MarkdownPipeline | null = null;

/**
 * Matches the production template engine in toldby.page.routing so the
 * preview projection is byte-for-byte the served page.
 * See toldby.page.routing/src/discovery/template-engine.ts (getPipeline).
 */
export function getMarkdownPipeline(): MarkdownPipeline {
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

export function applyBases(markdown: string, bases: Record<string, string>): string {
  let result = markdown;
  for (const [key, value] of Object.entries(bases)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}
