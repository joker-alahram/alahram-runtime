const _pages = new Map();

export function registerPage(routeName, renderFn) {
  _pages.set(routeName, renderFn);
}

export function getPage(routeName) {
  return _pages.get(routeName);
}
