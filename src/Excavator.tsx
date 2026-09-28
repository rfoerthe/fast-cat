import { type Ref, useId } from 'react';

const TRACK_STRAIGHT = 68;
const TRACK_RADIUS = 10;
const TRACK_LENGTH = 2 * TRACK_STRAIGHT + 2 * Math.PI * TRACK_RADIUS;
const TRACK_OFFSETS = Array.from(
  { length: 34 },
  (_, i) => (i * TRACK_LENGTH) / 34,
);

/** Kettenglieder laufen oben nach vorn und an der Auflagefläche nach hinten. */
export function trackLinkTransform(distance: number) {
  const d = ((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  const arc = Math.PI * TRACK_RADIUS;
  if (d < TRACK_STRAIGHT) return `translate(${30 + d} 94)`;
  if (d < TRACK_STRAIGHT + arc) {
    const angle = (d - TRACK_STRAIGHT) / TRACK_RADIUS - Math.PI / 2;
    return `translate(${98 + Math.cos(angle) * TRACK_RADIUS} ${104 + Math.sin(angle) * TRACK_RADIUS}) rotate(${(angle * 180) / Math.PI + 90})`;
  }
  if (d < 2 * TRACK_STRAIGHT + arc)
    return `translate(${98 - (d - TRACK_STRAIGHT - arc)} 114) rotate(180)`;
  const angle = (d - 2 * TRACK_STRAIGHT - arc) / TRACK_RADIUS + Math.PI / 2;
  return `translate(${30 + Math.cos(angle) * TRACK_RADIUS} ${104 + Math.sin(angle) * TRACK_RADIUS}) rotate(${(angle * 180) / Math.PI + 90})`;
}

/**
 * Dekorative Baggergrafik ohne eigene Physik oder Interaktion.
 * EmojiField steuert über ref die Position und data-active im selben Takt wie die Emojis;
 * der Fahrweg steuert Kettenglieder und Rollen. CSS animiert Aufbau, Arm und Staub.
 * aria-hidden hält die Dekoration aus dem Accessibility-Baum.
 */
export default function Excavator({ ref }: { ref: Ref<HTMLDivElement> }) {
  const trackId = useId();
  return (
    <div ref={ref} className="excavator" data-active="false" aria-hidden="true">
      <span className="excavator-caption">Platz für neue Ideen.</span>
      <div className="excavator-dust">
        <i />
        <i />
        <i />
      </div>
      <svg aria-hidden="true" viewBox="0 0 180 124" fill="none">
        <defs>
          <g id={trackId}>
            <path
              d="M30 94H98A10 10 0 0 1 98 114H30A10 10 0 0 1 30 94Z"
              fill="#363944"
              stroke="#252832"
              strokeWidth="5"
            />
            <path d="M30 104H98" stroke="#646571" strokeWidth="9" />
            {[30, 98, 44, 57, 71, 84].map((x, i) => (
              <g key={x}>
                <g
                  className={i < 2 ? 'excavator-drive' : 'excavator-roller'}
                  style={{ transformOrigin: `${x}px ${i < 2 ? 104 : 107}px` }}
                >
                  <circle
                    cx={x}
                    cy={i < 2 ? 104 : 107}
                    r={i < 2 ? 8 : 5.5}
                    fill={i === 1 ? '#ad874b' : '#777984'}
                    stroke="#20232c"
                    strokeWidth="1.5"
                  />
                  <path
                    d={`M${x - 4} ${i < 2 ? 104 : 107}h8M${x} ${i < 2 ? 100 : 103}v8`}
                    stroke="#3f424e"
                    strokeWidth="2"
                  />
                </g>
                <circle cx={x} cy={i < 2 ? 104 : 107} r="1.8" fill="#d3cbd0" />
              </g>
            ))}
            <path
              d="M40 99H88"
              stroke="#a29583"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {TRACK_OFFSETS.map((offset) => (
              <g
                key={offset}
                data-track-link={offset}
                transform={trackLinkTransform(offset)}
              >
                <rect
                  x="-2.5"
                  y="-2.5"
                  width="5"
                  height="5"
                  rx=".7"
                  fill="#595c68"
                  stroke="#282b35"
                  strokeWidth=".65"
                />
                <path d="M-1.5-2h3" stroke="#b2aeb7" strokeWidth="1" />
                <path d="M0-1v3" stroke="#85838d" strokeWidth=".8" />
              </g>
            ))}
          </g>
        </defs>
        <ellipse cx="68" cy="118" rx="52" ry="3" fill="#353047" opacity=".13" />
        <use href={`#${trackId}`} transform="translate(9 -7)" opacity=".65" />
        <path d="M36 88H98L106 99H30Z" fill="#55515d" />
        <use href={`#${trackId}`} />
        {/* Nur der gefederte Aufbau vibriert; die Raupen behalten ihren Bodenkontakt. */}
        <g className="excavator-chassis">
          <path d="M25 77Q25 72 31 72H87L105 86V94H25Z" fill="#e5a848" />
          <path d="M33 75V46Q33 41 39 41H66L77 76Z" fill="#f6c667" />
          <path d="M40 48H61L68 68H40Z" fill="#68627d" />
          <path d="M43 50H58L46 66H43Z" fill="#d9d2ec" opacity=".8" />
          <path
            d="M32 80H77"
            stroke="#ffe2a0"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="26" y="64" width="6" height="15" rx="2" fill="#68627d" />
          <rect x="40" y="35" width="12" height="6" rx="3" fill="#b0a0d0" />
          <circle cx="89" cy="81" r="8" fill="#c58b36" />
          <g className="excavator-arm">
            <path
              d="M88 79L113 30Q117 24 123 29L151 64"
              stroke="#bf8735"
              strokeWidth="13"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M88 76L116 31L149 63"
              stroke="#f6c667"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M96 65L112 39M126 41L144 62"
              stroke="#777182"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="118" cy="31" r="4" fill="#fff0c0" />
            <g className="excavator-bucket">
              <path
                d="M147 60L160 67L155 83L174 88Q169 104 150 100L138 89Z"
                fill="#686174"
              />
              <path
                d="M143 88L153 94L169 92"
                stroke="#a59aae"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
