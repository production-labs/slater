// iPhone / iPad only: stop Safari zooming in when a field under 16px gets
// focus (it never zooms back out, pushing buttons off screen). maximum-scale=1
// stops that auto-zoom; since iOS 10 Safari still allows pinch-zoom by hand.
// Not on Android: there it would block pinch-zoom, and Android doesn't
// auto-zoom anyway. Loaded in <head> right after the viewport meta (external
// file because the client portal's CSP allows no inline scripts).
(function () {
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var meta = document.querySelector('meta[name="viewport"]');
  if (ios && meta && !/maximum-scale/.test(meta.content)) meta.content += ', maximum-scale=1';
})();
