import { useEffect, useState } from 'react';

export default function ProtectedContent() {
  const [blurred, setBlurred] = useState(false);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    const handleKeyDown = event => {
      const key = String(event.key || '').toLowerCase();
      const screenshotShortcut = key === 'printscreen' ||
        (event.shiftKey && (event.metaKey || event.ctrlKey) && ['3', '4', '5', 's'].includes(key)) ||
        (event.ctrlKey && key === 'p');
      if (!screenshotShortcut) return;

      event.preventDefault();
      event.stopPropagation();
      setNotice(true);
      window.setTimeout(() => setNotice(false), 2400);
    };

    const handleVisibility = () => {
      setBlurred(document.hidden);
    };
    const handleBlur = () => setBlurred(true);
    const handleFocus = () => setBlurred(false);
    const handleContextMenu = event => event.preventDefault();

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <>
      {blurred && (
        <div className="velqra-protected-blur" aria-live="polite">
          <span>Page hidden while focus is lost</span>
        </div>
      )}
      {notice && (
        <div className="velqra-protected-notice" role="status">
          This browser may block supported screen-capture shortcuts
        </div>
      )}
    </>
  );
}
