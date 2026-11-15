// "Open in Maps" links that land in the device's own map app (2026-11-15).
//   iPhone / iPad  -> Apple Maps (opens the Maps app directly)
//   Android        -> geo: link (Android opens the user's default map app, or asks)
//   computers      -> Google Maps in the browser
// A web page can't pick a user's preferred third-party app on iPhone (Google Maps,
// Waze); Apple Maps is the one every iPhone has. Used by the app (schedule-mobile.js)
// and the client portal (portal.js).
(function (root) {
  function isIOS() {
    var ua = navigator.userAgent || '';
    // iPadOS reports itself as a Mac; a touch screen gives it away.
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }
  function url(query) {
    var q = encodeURIComponent(String(query || '').trim());
    if (isIOS()) return 'https://maps.apple.com/?q=' + q;
    if (isAndroid()) return 'geo:0,0?q=' + q;
    return 'https://www.google.com/maps/search/?api=1&query=' + q;
  }
  // geo: links must open in place; web links open in a new tab.
  function opensNewTab() { return !isAndroid(); }
  root.SlaterMaps = { url: url, opensNewTab: opensNewTab };
})(window);
