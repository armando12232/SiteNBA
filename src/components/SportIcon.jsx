export function SportIcon({ name }) {
  const shapes = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
      </>
    ),
    basketball: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.2 10.2c5.2.1 9.5 4.4 10.6 10.2M20.8 13.8C15.6 13.7 11.3 9.4 10.2 3.6M12 3v18M3 12h18" />
      </>
    ),
    soccer: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 3.4 2.5-1.3 4h-4.2l-1.3-4L12 7ZM8.6 9.5 5 8.4M9.9 13.5 7.5 17M14.1 13.5l2.4 3.5M15.4 9.5 19 8.4" />
      </>
    ),
    gamepad: (
      <>
        <path d="M8.5 7h7c3.7 0 5.9 3.1 5.1 6.7l-.8 3.5c-.5 2.2-3.2 2.9-4.7 1.2L13.8 17h-3.6l-1.3 1.4c-1.5 1.7-4.2 1-4.7-1.2l-.8-3.5C2.6 10.1 4.8 7 8.5 7Z" />
        <path d="M7.5 10.5v4M5.5 12.5h4M16.8 11.2h.1M18.8 13.8h.1" />
      </>
    ),
    americanFootball: (
      <>
        <path d="M4.5 17.8c-2.4-2.4-.7-7.9 3.5-12.1s9.7-5.9 12.1-3.5.7 7.9-3.5 12.1-9.7 5.9-12.1 3.5Z" />
        <path d="m8.5 15.5 7-7M10 10l4 4M11.7 8.3l4 4" />
      </>
    ),
    hockey: (
      <>
        <path d="m7 3 3 1.2-2.8 10.5c-.4 1.5.7 3 2.3 3h8.7" />
        <path d="M17 17.7h3.2V21H17zM3.5 20.5h9" />
      </>
    ),
    baseball: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M7.2 4.4c1.8 1.9 2.4 4.1 1.9 6.5-.5 2.3-1.9 4-4.2 5.2M16.8 19.6c-1.8-1.9-2.4-4.1-1.9-6.5.5-2.3 1.9-4 4.2-5.2M7.8 7.5l2 .6M6.8 10.3l2 .6M16.2 16.5l-2-.6M17.2 13.7l-2-.6" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        <path d="m3 8 6-4 6 6 6-5" />
      </>
    ),
    live: (
      <>
        <circle cx="12" cy="12" r="2.5" />
        <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" />
      </>
    ),
    medical: (
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" />
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),
  };

  return (
    <svg className="sport-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name] || shapes.chart}
    </svg>
  );
}



export function SidebarIcon({ name }) {
  const icons = {
    home: (
      <>
        <path d="m3.2 10.6 8.8-7 8.8 7v9.8a1.3 1.3 0 0 1-1.3 1.3H4.5a1.3 1.3 0 0 1-1.3-1.3z" fill="currentColor" />
        <path d="M9.3 21v-7.2h5.4V21" fill="none" stroke="#10151b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    radar: (
      <>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity=".65" />
        <path d="M12 12 18.4 5.7A9 9 0 0 1 21 12z" fill="currentColor" opacity=".38" />
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      </>
    ),
    nba: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <path d="M3.4 10.2c4.8.2 8.8 4.2 9.8 10.2M20.6 13.8c-4.8-.2-8.8-4.2-9.8-10.2M12 3v18M3 12h18" fill="none" stroke="#20160c" strokeWidth="1.25" strokeLinecap="round" />
      </>
    ),
    wnba: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <path d="M3.4 10.2c4.8.2 8.8 4.2 9.8 10.2M20.6 13.8c-4.8-.2-8.8-4.2-9.8-10.2M12 3v18M3 12h18" fill="none" stroke="#24121a" strokeWidth="1.25" strokeLinecap="round" />
        <path d="m17.7 2 .7 1.6 1.7.2-1.2 1.1.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.1 1.7-.2z" fill="#fff0f5" />
      </>
    ),
    football: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity=".26" />
        <path d="m12 6.8 3.7 2.7-1.4 4.4h-4.6l-1.4-4.4z" fill="currentColor" />
        <path d="m12 6.8 0-3.6M8.3 9.5 5 8.2M8.3 13.9l-2.2 3.2M14.3 13.9l2.2 3.2M15.7 9.5 19 8.2M12 17.2v3.6" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </>
    ),
    cs2: (
      <>
        <path d="M7.5 6.2h9c3.5 0 5.7 2.8 5 6.2l-.8 4c-.4 2.2-3.1 3-4.6 1.4l-2-2h-4.2l-2 2c-1.5 1.6-4.2.8-4.6-1.4l-.8-4c-.7-3.4 1.5-6.2 5-6.2Z" fill="currentColor" />
        <path d="M7 10v4M5 12h4" stroke="#111823" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="16.5" cy="10.8" r="1" fill="#111823" />
        <circle cx="18.5" cy="13.2" r="1" fill="#111823" />
      </>
    ),
    nfl: (
      <>
        <path d="M4.3 16.8C2.1 14.6 3.8 9.4 7.8 5.4s9.2-5.7 11.4-3.5 0 7.4-4 11.4-8.7 5.7-10.9 3.5Z" fill="currentColor" />
        <path d="m7.1 16.4 9.8-9.8M9.1 10.4l4.5 4.5M11.6 7.9l4.5 4.5" fill="none" stroke="#17140d" strokeWidth="1.35" strokeLinecap="round" />
      </>
    ),
    nhl: (
      <>
        <path d="m7 3 2.8 1.1-3.1 10.5c-.4 1.3.6 2.5 2 2.5h8.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.3 15.8h4.3v3.4h-4.3z" fill="currentColor" />
        <path d="M3 20.7h10.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="5.5" cy="20.7" r="1.2" fill="currentColor" />
      </>
    ),
    mlb: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" fill="currentColor" opacity=".18" />
        <path d="M7 4.5c2.1 2 2.8 4.4 2.2 7-.6 2.7-2.2 4.7-4.8 6M17 19.5c-2.1-2-2.8-4.4-2.2-7 .6-2.7 2.2-4.7 4.8-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="m6.3 8.1 2 .7M5.5 10.9l2 .7M17.7 15.9l-2-.7M18.5 13.1l-2-.7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  };

  return (
    <svg className="sidebar-sport-icon" viewBox="0 0 24 24" aria-hidden="true">
      {icons[name] || icons.nba}
    </svg>
  );
}
