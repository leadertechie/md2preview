const INTERACTIVE_SELECTOR = 'a[href], button, [role="button"], input[type="submit"], input[type="button"]';

export class PreviewActionGuard {
  private alertTimer: number | undefined;

  constructor(
    private readonly root: ShadowRoot,
    private readonly banner: HTMLElement,
  ) {
    this.root.addEventListener('click', this.onClick, true);
    this.root.addEventListener('submit', this.onSubmit, true);
  }

  clearTimer(): void {
    if (this.alertTimer !== undefined) {
      window.clearTimeout(this.alertTimer);
      this.alertTimer = undefined;
    }
  }

  private readonly onClick = (event: Event): void => {
    // composedPath() reaches through nested MFE shadow roots to the clicked control.
    const interactive = event.composedPath().find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.matches(INTERACTIVE_SELECTOR),
    );

    if (!interactive) return;
    this.blockAction(event);
  };

  private readonly onSubmit = (event: Event): void => {
    this.blockAction(event);
  };

  private blockAction(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.flashAlert();
  }

  private flashAlert(): void {
    this.clearTimer();
    this.banner.classList.add('preview-alert--active');
    this.alertTimer = window.setTimeout(() => {
      this.banner.classList.remove('preview-alert--active');
      this.alertTimer = undefined;
    }, 1200);
  }
}
