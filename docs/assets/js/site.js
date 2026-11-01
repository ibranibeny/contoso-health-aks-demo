// Small progressive enhancements: copy buttons and the mobile menu. The guide works without JavaScript.
document.querySelectorAll('.code').forEach(function (block) {
  var btn = block.querySelector('.copy');
  var pre = block.querySelector('pre');
  if (!btn || !pre || !navigator.clipboard) { if (btn) btn.remove(); return; }
  btn.addEventListener('click', function () {
    navigator.clipboard.writeText(pre.innerText).then(function () {
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
    });
  });
});
var menu = document.querySelector('.menu-btn');
if (menu) menu.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });

// Narration language for the videos: swaps the source, poster, download link, size, transcript and chapter times. Remembers the choice.
(function () {
  var groups = document.querySelectorAll('.lang-switch');
  var video = document.querySelector('.player video');
  if (!groups.length || !video) return;
  function apply(lang, resume) {
    var src = video.getAttribute('data-src-' + lang);
    if (!src) return;
    var source = video.querySelector('source');
    if (source && source.getAttribute('src') !== src) {
      var playing = !video.paused;
      source.setAttribute('src', src);
      var poster = video.getAttribute('data-poster-' + lang);
      if (poster) video.setAttribute('poster', poster);
      // subtitles are timed to one narration, so the track follows the language
      video.querySelectorAll('track').forEach(function (t) { t.remove(); });
      var vtt = video.getAttribute('data-vtt-' + lang);
      if (vtt) {
        var tr = document.createElement('track');
        tr.kind = 'subtitles'; tr.srclang = lang; tr.src = vtt;
        tr.label = video.getAttribute('data-vttlabel-' + lang) || lang;
        video.appendChild(tr);
      }
      video.load();
      if (playing && resume) video.play();
    }
    groups.forEach(function (g) {
      g.querySelectorAll('button[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    });
    var meta = document.querySelector('.player-meta .v-meta');
    if (meta && video.getAttribute('data-meta-' + lang)) meta.textContent = video.getAttribute('data-meta-' + lang);
    var dl = document.querySelector('.player-meta .v-dl');
    if (dl) dl.setAttribute('href', src);
    document.querySelectorAll('[data-lang-block]').forEach(function (el) { el.hidden = el.getAttribute('data-lang-block') !== lang; });
    document.querySelectorAll('.chapters button').forEach(function (b) {
      var label = b.getAttribute('data-label-' + lang);
      if (label) b.querySelector('.t').textContent = label;
    });
    document.documentElement.setAttribute('data-narration', lang);
    try { localStorage.setItem('narration-lang', lang); } catch (e) { /* storage unavailable */ }
  }
  groups.forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]');
      if (b) apply(b.getAttribute('data-lang'), true);
    });
  });
  document.querySelectorAll('.chapters button').forEach(function (b) {
    b.addEventListener('click', function () {
      var lang = document.documentElement.getAttribute('data-narration') || 'en';
      var t = parseFloat(b.getAttribute('data-t-' + lang));
      if (isNaN(t)) return;
      video.currentTime = t;
      video.play();
      video.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  var saved = null;
  try { saved = localStorage.getItem('narration-lang'); } catch (e) { /* storage unavailable */ }
  if (saved && saved !== 'en' && video.getAttribute('data-src-' + saved)) apply(saved, false);
  else document.documentElement.setAttribute('data-narration', 'en');
})();
