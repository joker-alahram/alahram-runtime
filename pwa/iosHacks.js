let _applied = false;

export function applyIOSHacks(pwaState) {
  if (_applied) return;
  if (!pwaState.isIOS) return;

  _applied = true;
  _fixViewportHeight();
  _fixKeyboardResize();
  _fixTouchDelay();
  _fixStatusBar();
  _fixStandaloneLinks();
  _fixRubberBand();
}

function _fixViewportHeight() {
  // Use -webkit-fill-available for iOS Safari 100vh issue
  document.documentElement.style.setProperty('min-height', '-webkit-fill-available');

  const setHeight = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
  };

  setHeight();
  window.addEventListener('resize', setHeight);
  window.addEventListener('orientationchange', () => setTimeout(setHeight, 300));
}

function _fixKeyboardResize() {
  if (!window.visualViewport) return;

  let previousHeight = window.visualViewport.height;

  const handleResize = () => {
    const currentHeight = window.visualViewport.height;
    const keyboardVisible = previousHeight - currentHeight > 150;

    if (keyboardVisible) {
      const offset = window.visualViewport.offsetTop;
      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
      document.documentElement.style.setProperty('--keyboard-height', `${previousHeight - currentHeight}px`);
      document.activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      document.documentElement.style.removeProperty('--keyboard-offset');
      document.documentElement.style.removeProperty('--keyboard-height');
    }

    previousHeight = currentHeight;
    document.documentElement.style.setProperty('--visual-viewport-height', `${currentHeight}px`);
  };

  window.visualViewport.addEventListener('resize', handleResize);
}

function _fixTouchDelay() {
  const style = document.createElement('style');
  style.textContent = `
    * { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    a, button, input, textarea, select { touch-action: manipulation; }
  `;
  document.head.appendChild(style);
}

function _fixStatusBar() {
  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (metaStatusBar) return;

  const meta = document.createElement('meta');
  meta.name = 'apple-mobile-web-app-status-bar-style';
  meta.content = pwaState.isStandalone ? 'black-translucent' : 'default';
  document.head.appendChild(meta);
}

function _fixStandaloneLinks() {
  if (!pwaState.isStandalone) return;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    if (link.getAttribute('target') === '_blank') return;
    if (link.hostname !== location.hostname) return;
    if (link.protocol === 'javascript:') return;

    const hash = link.getAttribute('href');
    if (hash && hash.startsWith('#')) return;

    e.preventDefault();
    location.href = link.href;
  }, true);
}

function _fixRubberBand() {
  const style = document.createElement('style');
  style.textContent = `
    html, body { overscroll-behavior-y: contain; }
    .v2-sf-shell, .v2-cart, .v2-co, .v2-search, .v2-product-list,
    .v2-invoices, .v2-invoice-detail {
      overscroll-behavior-y: contain;
    }
  `;
  document.head.appendChild(style);
}
