// Applied before first paint so the shell never flashes the wrong theme.
// A separate file rather than an inline script so the Content Security Policy
// can forbid inline scripts entirely (deploy/headers.ts).
try {
  var stored = localStorage.getItem('ms.theme');
  var theme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
} catch (error) {
  document.documentElement.dataset.theme = 'light';
}
