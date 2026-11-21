// Which page this address opens, decided before anything is drawn (D-175).
//
// "On the landing page, I should be able to click on Open Studio … and if
// logged in, redirect to the designer view until signed out to come back to
// landing page." `/` is the landing page and `/studio` the editor. Signing in
// is on this device for now: a flag in this browser's storage (src/entry/session.ts).
//
// Decided here, in a plain script that runs as the page is read, so a person
// who is signed in never sees the landing page flash before the editor, and
// each page's code starts downloading at once: the build puts each page's
// `modulepreload` links in a <template> (vite.config.ts), and only the one for
// the page being opened is put to use. A separate file rather than an inline
// script so the security policy can forbid inline scripts (deploy/headers.ts).
//
// The editor's own parameters always open the editor, at `/` as at `/studio`:
// `npm run thumbs`, shared links and the whole visual suite are links like
// `/?template=…` (src/dev/renderParams.ts). Opening one does not sign in: a
// shared link is a look, not a visit. `/studio` itself does, as Open Studio
// does: it is where the installed app opens.
(function () {
  var EDITOR_PARAMS = ['template', 'scene', 'aspect', 'frozen', 'thumb', 'perf'];
  var SESSION_KEY = 'ms.session';
  var root = document.documentElement;
  var route = 'landing';
  try {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var params = new URLSearchParams(location.search);
    var linked = EDITOR_PARAMS.some(function (name) { return params.has(name); });
    var signedIn = false;
    try { signedIn = localStorage.getItem(SESSION_KEY) !== null; } catch (error) { signedIn = false; }

    if (path === '/studio') {
      route = 'studio';
      if (!linked && !signedIn) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ kind: 'device', since: Date.now() })); } catch (error) { /* still opens */ }
      }
    } else if (linked || signedIn) {
      route = 'studio';
      history.replaceState(history.state, '', '/studio' + location.search + location.hash);
    } else if (path !== '/' && path !== '/index.html') {
      // An address this app does not have is the landing page, not a blank one.
      history.replaceState(history.state, '', '/' + location.hash);
    }
  } catch (error) {
    route = 'landing';
  }
  root.dataset.route = route;

  var preload = document.getElementById(route + '-preload');
  if (preload && 'content' in preload) document.head.appendChild(preload.content.cloneNode(true));
})();
