import React from 'react';

export default function IngmelecLogo({ className = "h-12", variant = "dark" }) {
  const isLight = variant === "light";
  return (
    <svg viewBox="0 0 500 170" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Curved swooshes */}
      <path d="M20 125 C 130 175, 300 175, 450 125" stroke="#F28524" strokeWidth="5" strokeLinecap="round" opacity="0.4" />
      <path d="M30 140 C 140 190, 290 190, 440 140" stroke="#F28524" strokeWidth="3" strokeLinecap="round" opacity="0.25" />

      {/* Typography - Ingmelec */}
      <text
        x="25"
        y="85"
        fontFamily="'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="68"
        fontWeight="900"
        fill={isLight ? "#FFFFFF" : "#1E293B"}
        letterSpacing="-2"
      >
        Ingmelec
      </text>

      {/* Typography - DOMINICANA */}
      <text
        x="130"
        y="118"
        fontFamily="'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="20"
        fontWeight="800"
        fill="#F28524"
        letterSpacing="6"
      >
        DOMINICANA
      </text>

      {/* Atom / Energy symbol */}
      <g transform="translate(410, 80)">
        <circle cx="0" cy="0" r="10" fill="#F28524" />
        <ellipse cx="0" cy="0" rx="38" ry="14" stroke={isLight ? "#94A3B8" : "#1E293B"} strokeWidth="2.5" transform="rotate(-30)" />
        <ellipse cx="0" cy="0" rx="38" ry="14" stroke={isLight ? "#94A3B8" : "#1E293B"} strokeWidth="2.5" transform="rotate(30)" />
        <ellipse cx="0" cy="0" rx="38" ry="14" stroke="#F28524" strokeWidth="2.5" transform="rotate(90)" />
        <circle cx="32" cy="-18" r="4" fill={isLight ? "#FFFFFF" : "#1E293B"} />
        <circle cx="-32" cy="18" r="4" fill="#F28524" />
      </g>
    </svg>
  );
}
