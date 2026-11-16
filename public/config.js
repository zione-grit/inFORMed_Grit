// Where the website sends chat, voice and document requests: inFORMed's function in Johannesburg.
// The Firebase project id is read from the website's own address (informed-grit.web.app gives
// "informed-grit"), so a different project id needs no change here. When inFORMed gets its own web
// address, put the project id in PROJECT_FOR_OWN_DOMAIN.
// If the chat does not answer on the live site, put the "Function URL" printed by "firebase deploy" in
// API_OVERRIDE (for example 'https://api-abc123-bq.a.run.app') and deploy again.
// On your own computer (node server.js) this is not used.
(function () {
  var API_OVERRIDE = '';
  var PROJECT_FOR_OWN_DOMAIN = 'informed-grit';
  var m = location.hostname.match(/^(.+?)\.(web\.app|firebaseapp\.com)$/);
  var project = m ? m[1] : PROJECT_FOR_OWN_DOMAIN;
  window.INFORMED_API = API_OVERRIDE || 'https://africa-south1-' + project + '.cloudfunctions.net/api';
})();
