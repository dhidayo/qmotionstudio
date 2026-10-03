// Applied before first paint so the shell never flashes the wrong theme.
// A separate file rather than an inline script so the Content Security Policy
// can forbid inline scripts entirely (deploy/headers.ts).
try {
  var stored = localStorage.getItem('ms.theme');
  // Light unless someone has chosen dark (D-109): it reads better on phones,
  // in daylight, and is what most people expect of a creative tool.
  var theme = stored === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
} catch (error) {
  document.documentElement.dataset.theme = 'light';
}
