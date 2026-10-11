(() => {
  'use strict';
  const config = window.steinAnalytics || {};
  const buttons = [...document.querySelectorAll('.analytics-toggle')];
  const statuses = [...document.querySelectorAll('[data-analytics-status]')];
  const pageStatuses = [...document.querySelectorAll('[data-analytics-page-status]')];
  const key = 'manchester-stein-analytics-choice-v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const configured = /^[a-f0-9]{32}$/i.test(config.token || '') &&
    location.protocol === 'https:' && location.hostname === config.hostname;
  const browserOptOut = navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' || window.doNotTrack === '1';
  let allowed = false;
  let beacon = null;
  let loadFailed = false;
  let expiryTimer;
  let pageOptOut = false;

  function status(message) {
    statuses.forEach(node => { node.textContent = message; });
  }

  function readChoice() {
    if (pageOptOut) return { allowed: false };
    try {
      // A session-only choice is used if the browser cannot save local storage.
      const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
      if (raw === null) return { allowed: true };
      const choice = JSON.parse(raw);
      if (!choice || typeof choice.allowed !== 'boolean' || !Number.isFinite(choice.expires)) {
        return { allowed: false };
      }
      if (choice.expires <= Date.now()) return { allowed: true };
      if (choice.expires <= Date.now() + lifetime) return choice;
    } catch {}
    // If settings are unreadable, do not risk overriding a saved opt-out.
    return { allowed: false };
  }

  function render() {
    buttons.forEach(button => {
      button.hidden = !configured || browserOptOut;
      button.textContent = allowed ? 'Turn off analytics' : 'Turn on analytics';
      button.setAttribute('aria-pressed', String(allowed));
    });
    pageStatuses.forEach(node => {
      node.textContent = !configured ? 'Cloudflare Web Analytics is not currently active.' :
        browserOptOut ? 'Analytics is off in accordance with your browser privacy preference.' :
        allowed && loadFailed ? 'Analytics could not load; the website remains fully available.' :
        allowed ? 'Website statistics are on. You can turn them off using the footer control.' :
        'Website statistics are off in this browser. You can turn them on using the footer control.';
    });
    status(!configured ? 'Analytics is not active.' : browserOptOut ?
      'Off: browser privacy preference.' : allowed && loadFailed ? 'Analytics could not load.' :
      allowed ? 'Analytics on.' : 'Analytics off.');
  }

  // Do not transmit an end-of-page analytics beacon after a visitor opts out.
  const sendBeacon = navigator.sendBeacon?.bind(navigator);
  if (sendBeacon) {
    navigator.sendBeacon = (url, data) => {
      let analyticsRequest = false;
      try { analyticsRequest = new URL(url, location.href).hostname === 'cloudflareinsights.com'; } catch {}
      if (analyticsRequest && (!allowed || !readChoice()?.allowed)) return true;
      return sendBeacon(url, data);
    };
  }

  function start() {
    if (!configured || browserOptOut || !allowed || beacon) return;
    beacon = document.createElement('script');
    beacon.type = 'module';
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: config.token }));
    beacon.addEventListener('error', () => {
      loadFailed = true;
      render();
    });
    document.body.append(beacon);
  }

  function scheduleExpiry(choice) {
    clearTimeout(expiryTimer);
    if (!choice?.expires) return;
    // Timers longer than about 24 days overflow; recheck in bounded intervals.
    expiryTimer = setTimeout(sync, Math.min(choice.expires - Date.now() + 1, 24 * 60 * 60 * 1000));
  }

  function sync() {
    const choice = readChoice();
    allowed = configured && !browserOptOut && choice?.allowed === true;
    render();
    scheduleExpiry(choice);
    if (beacon && !allowed) {
      location.reload();
    } else start();
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    const next = !allowed;
    const value = JSON.stringify({ allowed: next, expires: Date.now() + lifetime });
    try {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } catch {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Never reload into the default-on state when an opt-out could not be saved.
        pageOptOut = true;
        allowed = false;
        render();
        status('Analytics off for this page; your browser could not save the choice.');
        return;
      }
    }
    pageOptOut = false;
    sync();
  }));
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) sync();
  });
  // Recheck preferences and expiry after restoring a page from the back/forward cache.
  window.addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  sync();
})();
