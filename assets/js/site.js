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
