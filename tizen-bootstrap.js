(function() {
  var doc = document;
  var root = doc.documentElement;

  function addClass(node, className) {
    if (!node) return;
    if (node.classList) {
      node.classList.add(className);
      return;
    }
    if ((' ' + node.className + ' ').indexOf(' ' + className + ' ') === -1) {
      node.className += (node.className ? ' ' : '') + className;
    }
  }

  function applyTvMode() {
    addClass(root, 'tv-layout');
    addClass(root, 'tizen-tv-export');
    if (doc.body) addClass(doc.body, 'tizen-tv-export');
    root.style.fontSize = window.innerWidth >= 3000 ? '18px' : '16px';
  }

  function injectBaseStyles() {
    var style = doc.createElement('style');
    style.type = 'text/css';
    style.textContent = 'html.tizen-tv-export, body.tizen-tv-export { overscroll-behavior: none; }' +
      'html.tizen-tv-export *:focus { outline: none; }' +
      'html.tizen-tv-export ::-webkit-scrollbar { width: 0; height: 0; }';
    (doc.head || doc.documentElement).appendChild(style);
  }

  injectBaseStyles();
  applyTvMode();
  window.addEventListener('resize', applyTvMode);
})();
