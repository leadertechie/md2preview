import { Md2Preview } from './md2-preview';

export { Md2Preview } from './md2-preview';
export type { Md2PreviewLoadSource } from './md2-preview';

if (typeof customElements !== 'undefined' && !customElements.get('md2-preview')) {
  customElements.define('md2-preview', Md2Preview);
}
