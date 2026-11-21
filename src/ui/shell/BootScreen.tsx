/**
 * The start-up screen index.html opens with (D-112), drawn again by React
 * while this device's layout is still downloading (D-173), so the page shows
 * one unbroken "Getting the editor ready…" from the first byte to the editor.
 * Its styles are in index.html; the markup must stay the same as there.
 */
export function BootScreen(): React.JSX.Element {
  return (
    <div className="boot" role="status">
      <div>
        <img src="/brand-q.png" alt="" />
        <strong>Q Motion Studio</strong>
        Getting the editor ready…
        <div className="boot-bar" />
      </div>
    </div>
  );
}
