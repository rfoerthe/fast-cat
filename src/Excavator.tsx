import type { Ref } from 'react';

/**
 * Dekorative Baggergrafik ohne eigene Physik oder Interaktion.
 * EmojiField steuert über ref die Position und data-active im selben Takt wie die Emojis;
 * CSS animiert Räder, Arm und Staub. aria-hidden hält die Dekoration aus dem Accessibility-Baum.
 */
export default function Excavator({ ref }: { ref: Ref<HTMLDivElement> }) {
  return <div ref={ref} className="excavator" data-active="false" aria-hidden="true">
    <span className="excavator-caption">Platz für neue Ideen.</span>
    <div className="excavator-dust"><i/><i/><i/></div>
    <svg viewBox="0 0 180 124" fill="none">
      <ellipse cx="85" cy="116" rx="70" ry="5" fill="#353047" opacity=".09"/>
      {/* Separate SVG-Gruppen erlauben CSS-Animationen um die jeweiligen Drehpunkte. */}
      <g className="excavator-chassis">
        <rect x="20" y="94" width="90" height="22" rx="11" fill="#414353"/>
        <rect x="27" y="99" width="76" height="12" rx="6" fill="#777785"/>
        {[35, 51, 67, 83, 99].map(x => <g key={x} className="excavator-wheel" style={{ transformOrigin: `${x}px 105px` }}><circle cx={x} cy="105" r="5" fill="#414353"/><path d={`M${x - 3} 105h6M${x} 102v6`} stroke="#c4bfce" strokeWidth="1.5"/></g>)}
        <path d="M25 77Q25 72 31 72H87L105 86V94H25Z" fill="#e5a848"/>
        <path d="M33 75V46Q33 41 39 41H66L77 76Z" fill="#f6c667"/>
        <path d="M40 48H61L68 68H40Z" fill="#68627d"/>
        <path d="M43 50H58L46 66H43Z" fill="#d9d2ec" opacity=".8"/>
        <path d="M32 80H77" stroke="#ffe2a0" strokeWidth="3" strokeLinecap="round"/>
        <rect x="26" y="64" width="6" height="15" rx="2" fill="#68627d"/>
        <rect x="40" y="35" width="12" height="6" rx="3" fill="#b0a0d0"/>
        <circle cx="89" cy="81" r="8" fill="#c58b36"/>
        <g className="excavator-arm">
          <path d="M88 79L113 30Q117 24 123 29L151 64" stroke="#bf8735" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M88 76L116 31L149 63" stroke="#f6c667" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M96 65L112 39M126 41L144 62" stroke="#777182" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="118" cy="31" r="4" fill="#fff0c0"/>
          <g className="excavator-bucket">
            <path d="M147 60L160 67L155 83L174 88Q169 104 150 100L138 89Z" fill="#686174"/>
            <path d="M143 88L153 94L169 92" stroke="#a59aae" strokeWidth="3" strokeLinecap="round"/>
          </g>
        </g>
      </g>
    </svg>
  </div>;
}
