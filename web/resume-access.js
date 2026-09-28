(() => {
  const prefix = '#resume=';
  const fragment = window.location.hash;
  if (!fragment.startsWith(prefix)) return;
  // Remove the capability from browser history before any network request.
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const token = fragment.slice(prefix.length);
  const section = document.getElementById('private-access');
  const status = document.getElementById('private-status');
  section.hidden = false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    status.textContent = '专属链接无效。';
    return;
  }
  fetch('/api/resume', {headers: {Authorization: `Bearer ${token}`}, cache: 'no-store', referrerPolicy: 'no-referrer'})
    .then(async response => {
      if (!response.ok) throw new Error('access denied');
      const blob = await response.blob();
      if (blob.type !== 'application/pdf') throw new Error('invalid file');
      const url = URL.createObjectURL(blob);
      for (const id of ['resume-open', 'resume-download']) {
        const link = document.getElementById(id);
        link.href = url;
        link.hidden = false;
      }
      status.textContent = '已验证专属链接。';
      window.addEventListener('pagehide', () => URL.revokeObjectURL(url), {once: true});
    })
    .catch(() => { status.textContent = '专属链接无效或暂时无法读取完整简历。'; });
})();
