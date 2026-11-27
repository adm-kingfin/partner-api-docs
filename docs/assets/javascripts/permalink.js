// Every heading has a link icon (toc permalink). Clicking it puts the link into the address
// bar, as before, and also copies the full URL, so a link to an endpoint is one click away.
document.addEventListener('click', function (event) {
  var link = event.target.closest && event.target.closest('a.headerlink');
  if (!link || !navigator.clipboard) return;
  navigator.clipboard.writeText(link.href).then(function () {
    link.classList.add('kf-copied');
    setTimeout(function () { link.classList.remove('kf-copied'); }, 1500);
  }, function () { /* no clipboard access: the address bar still has the link */ });
});
