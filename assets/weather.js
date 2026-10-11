// Forecasts are matched by calendar date in Manchester, never by array position.
(() => {
  'use strict';
  const cards = [...document.querySelectorAll('[data-weather-date]')];
  if (!cards.length) return;
  const DAY = 86400000;
  const HOUR = 3600000;
  const CACHE_KEY = 'manchester-stein-weather-v1';
  const endpoint = new URL('https://api.open-meteo.com/v1/forecast');
  endpoint.search = new URLSearchParams({
    latitude: '53.467', longitude: '-2.234', timezone: 'Europe/London',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '16', temperature_unit: 'celsius'
  }).toString();
  const conditions = new Map([
    [0, ['Clear sky', 'clear-day']], [1, ['Mainly clear', 'clear-day']],
    [2, ['Partly cloudy', 'partly-cloudy-day']], [3, ['Overcast', 'overcast']],
    [45, ['Fog', 'fog']], [48, ['Freezing fog', 'fog']],
    [51, ['Light drizzle', 'drizzle']], [53, ['Drizzle', 'drizzle']], [55, ['Heavy drizzle', 'drizzle']],
    [56, ['Light freezing drizzle', 'sleet']], [57, ['Freezing drizzle', 'sleet']],
    [61, ['Light rain', 'rain']], [63, ['Rain', 'rain']], [65, ['Heavy rain', 'rain']],
    [66, ['Light freezing rain', 'sleet']], [67, ['Freezing rain', 'sleet']],
    [71, ['Light snow', 'snow']], [73, ['Snow', 'snow']], [75, ['Heavy snow', 'snow']],
    [77, ['Snow grains', 'snow']], [80, ['Light rain showers', 'rain']],
    [81, ['Rain showers', 'rain']], [82, ['Heavy rain showers', 'rain']],
    [85, ['Light snow showers', 'snow']], [86, ['Heavy snow showers', 'snow']],
    [95, ['Thunderstorms', 'thunderstorms']], [96, ['Thunderstorms with hail', 'thunderstorms']],
    [99, ['Thunderstorms with heavy hail', 'thunderstorms']]
  ]);
  function localDate(now) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  const dayNumber = date => Date.parse(`${date}T00:00:00Z`) / DAY;
  function paragraph(text, className) {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    return p;
  }
  function status(card, text, state) {
    card.dataset.weatherState = state;
    card.querySelector('.weather-icon').src = 'assets/weather/not-available.svg';
    card.querySelector('.weather-report').replaceChildren(paragraph(text, 'weather-status'));
  }
  function validPayload(data) {
    const d = data?.daily;
    return data?.timezone === 'Europe/London' && data?.daily_units?.temperature_2m_max === '°C'
      && data?.daily_units?.temperature_2m_min === '°C' && Array.isArray(d?.time)
      && ['weather_code', 'temperature_2m_min', 'temperature_2m_max'].every(key => Array.isArray(d[key]));
  }
  function render(card, data, fetchedAt, now) {
    const d = data.daily;
    const i = d.time.indexOf(card.dataset.weatherDate);
    const low = d.temperature_2m_min[i], high = d.temperature_2m_max[i];
    const code = d.weather_code[i];
    if (i < 0 || !Number.isFinite(low) || !Number.isFinite(high) || low > high || !conditions.has(code)) {
      status(card, 'Forecast not yet available for this date.', 'unavailable');
      return;
    }
    const [label, icon] = conditions.get(code);
    card.dataset.weatherState = 'ready';
    card.querySelector('.weather-icon').src = `assets/weather/${icon}.svg`;
    const content = [paragraph(label, 'weather-condition'),
      paragraph(`High ${Math.round(high)}°C · Low ${Math.round(low)}°C`, 'weather-temperature')];
    const precipitation = d.precipitation_probability_max?.[i];
    if (Number.isFinite(precipitation) && precipitation >= 0 && precipitation <= 100) {
      content.push(paragraph(`Precipitation chance: ${Math.round(precipitation)}%`, 'weather-precipitation'));
    }
    if (dayNumber(card.dataset.weatherDate) - dayNumber(localDate(now)) > 6) {
      content.push(paragraph('Early outlook — likely to change.', 'weather-status'));
    }
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(fetchedAt);
    content.push(paragraph(`Checked ${time} (Manchester time)`, 'weather-updated'));
    card.querySelector('.weather-report').replaceChildren(...content);
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    const now = new Date();
    const today = localDate(now);
    const active = cards.filter(card => {
      const offset = dayNumber(card.dataset.weatherDate) - dayNumber(today);
      if (offset < 0) { status(card, 'This forecast date has passed.', 'past'); return false; }
      if (offset > 15) { status(card, 'Forecast available nearer the date.', 'future'); return false; }
      return Number.isFinite(offset);
    });
    if (!active.length) return; // No network calls months ahead or after the event.
    busy = true;
    try {
      let cache;
      try { cache = JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch { /* Storage is optional. */ }
      if (!cache || cache.day !== today || !Number.isFinite(cache.fetchedAt)
        || now.getTime() - cache.fetchedAt >= HOUR || cache.fetchedAt > now.getTime() || !validPayload(cache.data)) {
        active.forEach(card => status(card, 'Loading forecast…', 'loading'));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let data;
        try {
          const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit' });
          if (!response.ok) throw new Error('Weather service unavailable');
          data = await response.json();
          if (!validPayload(data)) throw new Error('Incomplete forecast');
        } finally { clearTimeout(timeout); }
        cache = { day: today, fetchedAt: Date.now(), data };
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* Still render without storage. */ }
      }
      active.forEach(card => render(card, cache.data, new Date(cache.fetchedAt), now));
    } catch {
      active.forEach(card => status(card, 'Forecast temporarily unavailable. Please try the link below.', 'error'));
    } finally { busy = false; }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, HOUR);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
