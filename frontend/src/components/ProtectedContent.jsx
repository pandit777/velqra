import { useEffect, useMemo, useState } from 'react';

export default function ProtectedContent({ protectedView, identity }) {
  const [blurred, setBlurred] = useState(false);
  const [notice, setNotice] = useState(false);
  const watermark = useMemo(() => {
    const parts = [
      identity?.email,
      identity?.phone,
      identity?.id
    ].filter(Boolean).map(value => String(value).trim()).filter(Boolean);
    return parts.length ? parts.join('  •  ') : 'VELQRA';
  }, [identity]);

  useEffect(() => {
    if (!protectedView) return undefined;

    const handleKeyDown = event => {
      const key = String(event.key || '').toLowerCase();
      if (key === 'printscreen' ||
          (event.ctrlKey && event.key === 'Escape') ||
          (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(event.key)) ||
          (event.altKey && key === 'printscreen') ||
          (event.ctrlKey && event.shiftKey && key === 's')) {
        event.preventDefault();
        setNotice(true);
        window.setTimeout(() => setNotice(false), 2400);
      }
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
  }, [protectedView]);

  if (!protectedView) return null;

  return (
    <>
      {blurred && (
        <div className="velqra-protected-blur" aria-live="polite">
          <span>VELQRA protected content</span>
        </div>
      )}
      {notice && (
        <div className="velqra-protected-notice" role="status">
          Screenshots and screen capture are restricted
        </div>
      )}
      <div className="velqra-protection-watermark" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, index) => (
          <span key={index}>{watermark}</span>
        ))}
      </div>
    </>
  );
}
