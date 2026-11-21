import { useEffect, useState } from 'react';

export default function ProtectedContent() {
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

    const handleContextMenu = event => event.preventDefault();

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <>
      {notice && (
        <div className="velqra-protected-notice" role="status">
          This browser may block supported screen-capture shortcuts
        </div>
      )}
    </>
  );
}
