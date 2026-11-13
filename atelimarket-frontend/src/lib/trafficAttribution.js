const STORAGE_KEY = 'velqra_traffic_attribution';
const CAMPAIGN_FIELDS = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
  ['utm_term', 'term'],
  ['utm_content', 'content'],
  ['utm_id', 'campaignId']
];
let sessionFbclid = '';

const cleanValue = (value, maxLength = 256) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .trim()
  .slice(0, maxLength);

const readStoredAttribution = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn('Could not read saved traffic attribution:', error.name);
    return null;
  }
};

const readCookie = (name) => {
  const cookie = document.cookie.split('; ').find(part => part.startsWith(`${name}=`));
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return '';
  }
};

const cleanTouch = (touch) => {
  if (!touch || typeof touch !== 'object' || Array.isArray(touch)) return null;
  const cleaned = {};
  CAMPAIGN_FIELDS.forEach(([, key]) => {
    const value = cleanValue(touch[key]);
    if (value) cleaned[key] = value;
  });
  const landingPath = cleanValue(touch.landingPath, 512);
  if (landingPath.startsWith('/') && !landingPath.startsWith('//')) {
    cleaned.landingPath = landingPath;
  }
  if (touch.capturedAt && Number.isFinite(Date.parse(touch.capturedAt))) {
    cleaned.capturedAt = new Date(touch.capturedAt).toISOString();
  }
  return Object.keys(cleaned).length ? cleaned : null;
};

export function captureTrafficAttribution(search, pathname) {
  const params = new URLSearchParams(search);
  const touch = {};
  CAMPAIGN_FIELDS.forEach(([param, key]) => {
    const value = cleanValue(params.get(param));
    if (value) touch[key] = value;
  });
  const landingPath = cleanValue(pathname, 512);
  if (landingPath.startsWith('/') && !landingPath.startsWith('//')) {
    touch.landingPath = landingPath;
  }
  if (Object.keys(touch).some(key => key !== 'landingPath')) {
    touch.capturedAt = new Date().toISOString();
  }

  const stored = readStoredAttribution() || {};
  const fbclid = cleanValue(params.get('fbclid'), 256);
  if (fbclid) sessionFbclid = fbclid;

  if (Object.keys(touch).some(key => key !== 'landingPath')) {
    stored.firstTouch = cleanTouch(stored.firstTouch) || touch;
    stored.lastTouch = touch;
  }
  delete stored.fbp;
  delete stored.fbc;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.warn('Could not save traffic attribution:', error.name);
  }
}

export function getTrafficAttribution(shareWithMeta = false) {
  const stored = readStoredAttribution() || {};
  if (!shareWithMeta) {
    return {
      firstTouch: cleanTouch(stored.firstTouch),
      lastTouch: cleanTouch(stored.lastTouch)
    };
  }

  const fbp = cleanValue(readCookie('_fbp'), 256);
  let fbc = cleanValue(readCookie('_fbc'), 512);
  if (!fbc) {
    const fbclid = sessionFbclid ||
      cleanValue(new URLSearchParams(window.location.search).get('fbclid'), 256);
    if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }

  return {
    firstTouch: cleanTouch(stored.firstTouch),
    lastTouch: cleanTouch(stored.lastTouch),
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {})
  };
}
