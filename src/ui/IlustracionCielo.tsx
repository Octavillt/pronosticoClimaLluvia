import type { NivelLluvia } from '../utils/lluvia';

const lluviaAlta = [
  [262, 150, 254, 170],
  [286, 158, 278, 178],
  [310, 146, 302, 166],
  [334, 156, 326, 176],
  [358, 148, 350, 168],
  [274, 190, 266, 210],
  [322, 192, 314, 212],
  [346, 188, 338, 208],
] as const;
const lluviaMedia = [
  [272, 152, 264, 172],
  [310, 148, 302, 168],
  [346, 158, 338, 178],
] as const;

export function IlustracionCielo({ nivel }: { nivel: NivelLluvia }) {
  const conLluvia = nivel === 'alta' || nivel === 'media';
  const opacidadNubes = nivel === 'media' ? 0.95 : 1;
  return (
    <svg
      className="cielo__ilustracion" viewBox="0 0 390 260" preserveAspectRatio="xMaxYMin meet"
      aria-hidden="true" focusable="false" data-nivel={nivel}
    >
      {conLluvia ? (
        <>
          <g className="ilustracion__nube-lejana" fillOpacity={opacidadNubes}>
            <circle cx="262" cy="104" r="30" />
            <circle cx="300" cy="86" r="42" />
            <circle cx="342" cy="106" r="30" />
            <rect x="248" y="104" width="124" height="30" rx="15" />
          </g>
          <g className="ilustracion__nube-clara" fillOpacity={opacidadNubes}>
            <circle cx="286" cy="64" r="22" />
            <circle cx="314" cy="56" r="26" />
            <rect x="270" y="64" width="72" height="20" rx="10" />
          </g>
          <g className="ilustracion__lluvia" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round">
            {(nivel === 'alta' ? lluviaAlta : lluviaMedia).map(([x1, y1, x2, y2]) => (
              <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
        </>
      ) : nivel === 'baja' ? (
        <>
          <circle className="ilustracion__sol" cx="322" cy="84" r="34" />
          <circle className="ilustracion__halo" cx="322" cy="84" r="52" fillOpacity="0.18" />
          <g className="ilustracion__nube-clara">
            <circle cx="270" cy="102" r="24" />
            <circle cx="300" cy="90" r="32" />
            <rect x="250" y="102" width="86" height="24" rx="12" />
          </g>
        </>
      ) : (
        <>
          <circle className="ilustracion__sol" cx="318" cy="92" r="44" />
          <circle className="ilustracion__halo" cx="318" cy="92" r="66" fillOpacity="0.2" />
        </>
      )}
    </svg>
  );
}
