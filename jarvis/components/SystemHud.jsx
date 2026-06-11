'use client';

import { useEffect, useState } from 'react';

// A live "systems" panel: clock, battery, network and geolocation weather,
// rendered as glowing HUD gauges around the reactor.
const WMO = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Hailstorm',
};

export default function SystemHud() {
  const [time, setTime] = useState('');
  const [battery, setBattery] = useState(null); // { level, charging }
  const [net, setNet] = useState({ online: true, type: '' });
  const [weather, setWeather] = useState(null); // { temp, label }
  const [wxState, setWxState] = useState('idle'); // idle | loading | denied | error

  // Clock
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Battery
  useEffect(() => {
    let battRef;
    let cleanup = () => {};
    if (typeof navigator !== 'undefined' && navigator.getBattery) {
      navigator
        .getBattery()
        .then((b) => {
          battRef = b;
          const update = () => setBattery({ level: b.level, charging: b.charging });
          update();
          b.addEventListener('levelchange', update);
          b.addEventListener('chargingchange', update);
          cleanup = () => {
            b.removeEventListener('levelchange', update);
            b.removeEventListener('chargingchange', update);
          };
        })
        .catch(() => {});
    }
    return () => cleanup();
  }, []);

  // Network
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const update = () =>
      setNet({ online: navigator.onLine, type: conn?.effectiveType || '' });
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    conn?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      conn?.removeEventListener?.('change', update);
    };
  }, []);

  const loadWeather = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setWxState('error');
      return;
    }
    setWxState('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(
              3
            )}&longitude=${longitude.toFixed(3)}&current=temperature_2m,weather_code`
          );
          const data = await res.json();
          const c = data?.current;
          if (c) {
            setWeather({
              temp: Math.round(c.temperature_2m),
              label: WMO[c.weather_code] || '—',
            });
            setWxState('ok');
          } else {
            setWxState('error');
          }
        } catch {
          setWxState('error');
        }
      },
      () => setWxState('denied'),
      { timeout: 8000 }
    );
  };

  const wxText =
    wxState === 'ok' && weather
      ? `${weather.temp}°C ${weather.label}`
      : wxState === 'loading'
      ? 'Locating…'
      : wxState === 'denied'
      ? 'Tap to allow'
      : wxState === 'error'
      ? 'Unavailable'
      : 'Tap to load';

  return (
    <div className="panel pointer-events-auto absolute left-1 top-1 z-20 w-[150px] rounded-md p-2.5 sm:left-2 sm:top-2">
      <span className="bracket tl" />
      <span className="bracket br" />
      <p className="hud-mono mb-2 text-[8px] tracking-[0.3em] text-cyan-300/50">SYSTEMS</p>
      <Gauge label="TIME" value={time || '—'} />
      <Gauge
        label="PWR"
        value={
          battery
            ? `${Math.round(battery.level * 100)}%${battery.charging ? ' ⚡' : ''}`
            : '—'
        }
        bar={battery ? battery.level : null}
      />
      <Gauge
        label="NET"
        value={net.online ? `ONLINE${net.type ? ' ' + net.type.toUpperCase() : ''}` : 'OFFLINE'}
        ok={net.online}
      />
      <button
        onClick={loadWeather}
        className="block w-full text-left"
        title="Use your location for live weather"
      >
        <Gauge label="WX" value={wxText} />
      </button>
    </div>
  );
}

function Gauge({ label, value, bar = null, ok = true }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="hud-mono text-[8px] tracking-[0.2em] text-cyan-300/40">{label}</span>
        <span
          className={`hud-mono truncate text-[10px] tracking-wider ${
            ok ? 'text-cyan-100/90' : 'text-amber-300'
          }`}
        >
          {value}
        </span>
      </div>
      {bar !== null && (
        <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-cyan-300/10">
          <div
            className="h-full rounded-full bg-cyan-300/70"
            style={{ width: `${Math.max(2, Math.round(bar * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}
