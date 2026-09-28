import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { EMOJIS } from '../shared/emojis';
import Excavator, { trackLinkTransform } from './Excavator';

/** Eingaben des Felds; Wahrscheinlichkeiten und Prozentwerte verwenden unterschiedliche Skalen. */
type Props = {
  /** Bewertungen nach Katalog-ID im Bereich [0, 1]; null zeigt den Zustand ohne Ergebnis. */
  scores: Record<string, number> | null;
  /** Inklusive Treffergrenze in Prozent. */
  threshold: number;
  /** Meldet die angeklickte Katalog-ID an die Detailanzeige der Oberfläche. */
  onSelect: (id: string) => void;
};
/**
 * Ordnet Treffer oberhalb des Bodens an und simuliert die übrigen Emojis mit Matter.js.
 * React verwaltet die bedienbaren Buttons; der Animationsloop aktualisiert ihre DOM-Positionen.
 * Bei reduzierter Bewegung werden feste Positionen ohne Physikschritte verwendet.
 */
export default function EmojiField({ scores, threshold, onSelect }: Props) {
  const container = useRef<HTMLElement>(null);
  const excavator = useRef<HTMLDivElement>(null);
  // DOM-Referenzen erlauben Positionsupdates pro Frame ohne zusätzliche React-Renderings.
  const elements = useRef(new Map<string, HTMLButtonElement>());
  // Der langlebige Animationsloop liest aktuelle Props, ohne die Physikwelt neu aufzubauen.
  const latest = useRef({ scores, threshold });
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    latest.current = { scores, threshold };
  }, [scores, threshold]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** Übernimmt die Systemeinstellung auch bei Änderungen während der Nutzung. */
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    // Alle Positionen sind Pixel relativ zum Feld; die y-Achse zeigt nach unten.
    let width = host.clientWidth,
      height = host.clientHeight;
    let searchBottom = 380;
    // Nur abgeholte Überschüsse werden zum Ziel geführt; danach übernimmt wieder die Schwerkraft.
    const grading = new Map<
      number,
      {
        from: Matter.Vector;
        to: Matter.Vector;
        angle: number;
        turn: number;
        started: number;
        duration: number;
        lift: number;
      }
    >();
    // Aus der Trefferliste entfernte Emojis lösen zeitversetzt eine Baggerfahrt aus.
    let previousSelected = new Set<string>();
    let cleanupDue: number | null = null;
    // Simulationszeit in Millisekunden; große reale Frame-Pausen werden im tick begrenzt.
    let elapsed = 0;
    // Merkt eine frühere Baggerfahrt, damit Größenänderungen eine neue Einebnung anstoßen können.
    let hasGraded = false;
    // Geglättete Höhe und Neigung für die dekorative Fahrt über den Emoji-Haufen.
    let machineY: number | null = null;
    let machineTilt = 0;
    let previousMachineX: number | null = null;
    let trackDistance = 0;
    const trackLinks = Array.from(
      excavator.current?.querySelectorAll<SVGGElement>('[data-track-link]') ??
        [],
      (element) => ({ element, offset: Number(element.dataset.trackLink) }),
    );
    // Pro Fahrt: Startzeit, Dauer, Zielpositionen und ursprüngliche x-Positionen zur Abholung.
    let sweep: {
      started: number;
      duration: number;
      targets: Map<number, Matter.Vector>;
      pickup: Map<number, number>;
    } | null = null;
    /** Erzeugt zentrierte Bodenreihen mit deterministischem Versatz für reduzierte Bewegung. */
    const floorLayout = (indices: number[]) => {
      const spacing = width < 600 ? 27 : 35;
      const columns = Math.max(1, Math.floor((width - 40) / spacing));
      return new Map(
        indices.map((index, order) => {
          const row = Math.floor(order / columns);
          const count = Math.min(columns, indices.length - row * columns);
          return [
            index,
            {
              x:
                width / 2 +
                ((order % columns) - (count - 1) / 2) * spacing +
                Math.sin(index * 17) * 3,
              y: height - 22 - row * spacing + Math.cos(index * 11) * 3,
            },
          ];
        }),
      );
    };
    // Der Bagger verschiebt Unterlagen bei deaktivierten Kollisionen. Schlafende Körper
    // würden deren Wegfall nicht bemerken; deshalb bleibt die Simulation für alle aktiv.
    const engine = Matter.Engine.create({ enableSleeping: false });
    engine.gravity.y = 1.3;
    // Die Array-Indizes entsprechen dem Katalog und bleiben während dieser Physikwelt stabil.
    const bodies = EMOJIS.map((_, i) =>
      Matter.Bodies.circle(
        24 + ((i * 67) % Math.max(1, width - 48)),
        height - 260 - Math.floor(i / 20) * 34,
        17,
        {
          restitution: 0.38,
          friction: 0.45,
          frictionAir: 0.025,
          angle: ((i % 7) - 3) * 0.17,
        },
      ),
    );
    Matter.Composite.add(engine.world, bodies);
    /**
     * Teilt den Haufen in Spalten entlang der x-Achse und plant Ziele nur für überzählige Körper.
     * Bevorzugt die leerste, bei Gleichstand die nächstgelegene Spalte; verändert noch keine Körper.
     */
    const roughTargets = (resting: number[]) => {
      const diameter = width < 600 ? 24 : 34;
      const count = Math.max(1, Math.floor((width - 40) / (diameter * 1.15)));
      const binWidth = (width - 40) / count;
      const bins: number[][] = Array.from({ length: count }, () => []);
      resting.forEach((i) => {
        bins[
          Math.max(
            0,
            Math.min(
              count - 1,
              Math.floor((bodies[i].position.x - 20) / binWidth),
            ),
          )
        ].push(i);
      });
      const capacity = Math.ceil(resting.length / count) + 1;
      const targets = new Map<number, Matter.Vector>();
      bins.forEach((bin, source) => {
        // Untere Körper liegen weiter unten auf der y-Achse; nur die höchsten Spitzen abtragen.
        bin.sort((a, b) => bodies[b].position.y - bodies[a].position.y);
        while (bin.length > capacity) {
          const i = bin.pop();
          if (i === undefined) break;
          let destination = source;
          bins.forEach((candidate, index) => {
            if (
              candidate.length < bins[destination].length ||
              (candidate.length === bins[destination].length &&
                Math.abs(index - source) < Math.abs(destination - source))
            )
              destination = index;
          });
          const level = bins[destination].length;
          targets.set(i, {
            x:
              20 +
              (destination + 0.5) * binWidth +
              Math.sin(i * 17) * binWidth * 0.12,
            y: height - diameter / 2 - level * diameter * 0.88,
          });
          bins[destination].push(i);
        }
      });
      return targets;
    };
    let walls: Matter.Body[] = [];
    /** Passt Boden, Seitenwände und Körperradien an das Layout an und verwirft alte Fahrziele. */
    const rebuildWalls = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      // Die Unterkante der Suche begrenzt das Trefferraster, damit Buttons frei zugänglich bleiben.
      const search = host.parentElement?.querySelector('.search-zone');
      if (search)
        searchBottom =
          search.getBoundingClientRect().bottom -
          host.getBoundingClientRect().top +
          30;
      Matter.Composite.remove(engine.world, walls);
      walls = [
        Matter.Bodies.rectangle(width / 2, height + 32, width + 180, 80, {
          isStatic: true,
        }),
        Matter.Bodies.rectangle(-32, height / 2, 80, height * 3, {
          isStatic: true,
        }),
        Matter.Bodies.rectangle(width + 32, height / 2, 80, height * 3, {
          isStatic: true,
        }),
      ];
      Matter.Composite.add(engine.world, walls);
      if (hasGraded || grading.size || sweep) cleanupDue = elapsed + 300;
      grading.clear();
      sweep = null;
      machineY = null;
      machineTilt = 0;
      previousMachineX = null;
      if (excavator.current) excavator.current.dataset.active = 'false';
      bodies.forEach((body, i) => {
        if (!previousSelected.has(EMOJIS[i].id)) {
          Matter.Body.setStatic(body, false);
          body.collisionFilter.mask = 0xffffffff;
        }
        const radius = width < 600 ? 12 : 17;
        const scale = radius / (body.circleRadius || radius);
        if (Math.abs(scale - 1) > 0.01) Matter.Body.scale(body, scale, scale);
        Matter.Body.setPosition(body, {
          x: Math.max(20, Math.min(width - 20, body.position.x)),
          y: Math.min(height - 24, body.position.y),
        });
        Matter.Sleeping.set(body, false);
      });
    };
    // Auch Änderungen der Suchhöhe (z. B. umgebrochene Fehlermeldungen) beeinflussen das Raster.
    const observer = new ResizeObserver(rebuildWalls);
    observer.observe(host);
    const search = host.parentElement?.querySelector('.search-zone');
    if (search) observer.observe(search);
    rebuildWalls();
    let frame = 0,
      previous = 0;
    /**
     * Ein Animationsschritt: Treffer bestimmen, Physik/Sortierung anwenden und DOM aktualisieren.
     * @param time Monotoner requestAnimationFrame-Zeitstempel in Millisekunden.
     */
    const tick = (time: number) => {
      // Maximal einen 60-Hz-Schritt nachholen, damit Tab-Pausen keine Physiksprünge verursachen.
      const delta = previous ? Math.min(time - previous, 1000 / 60) : 1000 / 60;
      previous = time;
      elapsed += delta;
      const { scores: current, threshold: limit } = latest.current;
      const selected = current
        ? EMOJIS.filter((emoji) => current[emoji.id] >= limit / 100).sort(
            (a, b) => current[b.id] - current[a.id],
          )
        : [];
      const indices = new Map(selected.map((emoji, i) => [emoji.id, i]));
      const selectedIds = new Set(indices.keys());
      // Zurückfallenden Treffern 900 ms Zeit geben, bevor die nächste Fahrt beginnen darf.
      if ([...previousSelected].some((id) => !selectedIds.has(id)))
        cleanupDue = elapsed + 900;
      previousSelected = selectedIds;
      const resting = bodies
        .map((_, i) => i)
        .filter((i) => !selectedIds.has(EMOJIS[i].id));
      if (!reduced && !sweep && cleanupDue !== null && elapsed >= cleanupDue) {
        const targets = roughTargets(resting.filter((i) => !grading.has(i)));
        sweep = {
          started: elapsed,
          duration: Math.max(4200, Math.min(6800, width * 5)),
          targets,
          pickup: new Map(
            [...targets.keys()].map((i) => [i, bodies[i].position.x]),
          ),
        };
        cleanupDue = null;
        machineY = null;
        machineTilt = 0;
        previousMachineX = null;
        hasGraded = true;
        if (excavator.current) excavator.current.dataset.active = 'true';
      }
      const sweepProgress = sweep
        ? Math.min(1, (elapsed - sweep.started) / sweep.duration)
        : 0;
      const machineSize = width < 600 ? 116 : 154;
      const bucketX = -machineSize + (width + machineSize * 2) * sweepProgress;
      const reducedTargets = reduced ? floorLayout(resting) : null;
      // Auf großen Ansichten bleibt rechts Platz für den Ergebnisinspektor.
      const availableWidth = width >= 960 ? width - 320 : width;
      const gridWidth = Math.min(
        availableWidth - 40,
        selected.length > 80 ? 720 : 490,
      );
      const columns = Math.max(4, Math.floor(gridWidth / 46));
      const rows = Math.ceil(selected.length / columns);
      const startY = searchBottom;
      const floorSpacing = width < 600 ? 27 : 35;
      const floorRows = Math.ceil(
        resting.length / Math.max(1, Math.floor((width - 40) / floorSpacing)),
      );
      // Unter dem Trefferraster Raum für einen unebenen Haufen und den Bagger reservieren.
      const reserve = Math.max(
        width < 960 ? 90 : 110,
        floorRows * floorSpacing + (width < 960 ? 70 : 90),
      );
      const playground = host.parentElement;
      // CSS nutzt diese Werte als Mindesthöhe und als Abstand für den Feldhinweis.
      playground?.style.setProperty(
        '--emoji-field-min-height',
        `${Math.ceil(startY + Math.max(rows, 1) * 30 + reserve)}px`,
      );
      playground?.style.setProperty('--emoji-floor-height', `${reserve}px`);
      const step = Math.min(
        45,
        Math.max(10, (height - startY - reserve) / Math.max(rows, 1)),
      );
      if (!reduced) Matter.Engine.update(engine, delta);
      bodies.forEach((body, i) => {
        const id = EMOJIS[i].id;
        const selectedIndex = indices.get(id);
        const reducedTarget = reducedTargets?.get(i);
        const sweepTarget = sweep?.targets.get(i);
        const pickupX = sweep?.pickup.get(i);
        // Treffer verlassen die Kollisionssimulation und bewegen sich zum sortierten Raster.
        if (selectedIndex !== undefined) {
          grading.delete(i);
          sweep?.targets.delete(i);
          if (!body.isStatic) Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
          const inRow = Math.min(
            columns,
            selected.length - Math.floor(selectedIndex / columns) * columns,
          );
          const targetX =
            availableWidth / 2 +
            ((selectedIndex % columns) - (inRow - 1) / 2) * 45;
          const targetY = startY + Math.floor(selectedIndex / columns) * step;
          // Exponentielle Annäherung berücksichtigt die Frame-Dauer; reduzierte Bewegung springt direkt.
          const ease = reduced ? 1 : 1 - Math.exp(-delta / 95);
          Matter.Body.setPosition(body, {
            x: body.position.x + (targetX - body.position.x) * ease,
            y: body.position.y + (targetY - body.position.y) * ease,
          });
          Matter.Body.setAngle(body, body.angle * (1 - ease));
        } else if (reducedTarget) {
          Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
          Matter.Body.setPosition(body, reducedTarget);
          Matter.Body.setAngle(body, Math.sin(i * 7) * 0.3);
        } else if (
          sweepTarget &&
          pickupX !== undefined &&
          bucketX >= pickupX &&
          !grading.has(i)
        ) {
          // Die Bahn nur einmal bei Schaufelkontakt planen, nicht in jedem Frame neu starten.
          const radius = body.circleRadius || 17;
          const to = { ...sweepTarget };
          // Oberhalb der vorhandenen Unterlage absetzen, statt in den Haufen einzutauchen.
          resting.forEach((j) => {
            if (j === i) return;
            const other = bodies[j];
            const reserved = grading.get(j)?.to;
            if (
              !reserved &&
              (sweep?.targets.has(j) || Math.abs(other.velocity.y) > 2)
            )
              return;
            const support = reserved ?? other.position;
            const gap = radius + (other.circleRadius || 17) + 2;
            const dx = Math.abs(to.x - support.x);
            if (dx < gap && support.y > height - reserve)
              to.y = Math.min(to.y, support.y - Math.sqrt(gap * gap - dx * dx));
          });
          const distance = Math.hypot(
            to.x - body.position.x,
            to.y - body.position.y,
          );
          const desiredAngle = Math.sin(i * 7) * 0.35;
          grading.set(i, {
            from: { ...body.position },
            to,
            angle: body.angle,
            // Auch nach mehreren Umdrehungen immer den kurzen Drehweg verwenden.
            turn: Math.atan2(
              Math.sin(desiredAngle - body.angle),
              Math.cos(desiredAngle - body.angle),
            ),
            started: elapsed,
            duration: 650 + distance * 3,
            lift: Math.min(radius * 0.7, distance * 0.08),
          });
          if (!body.isStatic) Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
        } else if (body.isStatic && !grading.has(i)) {
          // Ehemalige Treffer ohne Baggerführung wieder als kollidierende, fallende Körper freigeben.
          body.collisionFilter.mask = 0xffffffff;
          Matter.Body.setStatic(body, false);
          Matter.Sleeping.set(body, false);
          Matter.Body.setVelocity(body, { x: ((i % 5) - 2) * 0.4, y: 0 });
        }
        const motion = grading.get(i);
        if (motion && selectedIndex === undefined) {
          const progress = Math.min(
            1,
            (elapsed - motion.started) / motion.duration,
          );
          // S-Kurve: Geschwindigkeit und Beschleunigung starten und enden bei null.
          const ease = progress ** 3 * (10 + progress * (-15 + 6 * progress));
          const arc = 16 * progress ** 2 * (1 - progress) ** 2;
          const previousPosition = { ...body.position };
          const previousAngle = body.angle;
          Matter.Body.setPosition(body, {
            x: motion.from.x + (motion.to.x - motion.from.x) * ease,
            y:
              motion.from.y +
              (motion.to.y - motion.from.y) * ease -
              motion.lift * arc,
          });
          Matter.Body.setAngle(body, motion.angle + motion.turn * ease);
          // Kurz vor dem Stillstand mit dem letzten Bewegungsimpuls an die Physik übergeben.
          if (progress >= 0.94) {
            grading.delete(i);
            sweep?.targets.delete(i);
            Matter.Body.setStatic(body, false);
            body.collisionFilter.mask = 0xffffffff;
            Matter.Sleeping.set(body, false);
            // Matter erwartet Geschwindigkeiten pro 60-Hz-Schritt, unabhängig von der Bildrate.
            const velocityScale = 1000 / 60 / delta;
            Matter.Body.setVelocity(body, {
              x: (body.position.x - previousPosition.x) * velocityScale,
              y: (body.position.y - previousPosition.y) * velocityScale,
            });
            Matter.Body.setAngularVelocity(
              body,
              (body.angle - previousAngle) * velocityScale,
            );
          }
        }
        const el = elements.current.get(id);
        if (el)
          el.style.fontSize =
            selectedIndex !== undefined
              ? `${Math.min(width < 600 ? 26 : 30, step + 4)}px`
              : `${width < 600 ? 24 : 30}px`;
        // Matter positioniert den Mittelpunkt; der 40-px-Button wird über seine linke obere Ecke versetzt.
        if (el)
          el.style.transform = `translate(${body.position.x - 20}px, ${body.position.y - 20}px) rotate(${body.angle}rad)`;
      });
      if (sweep && excavator.current) {
        const scale = machineSize / 180;
        const machineX = bucketX - machineSize * 0.9;
        /** Schätzt die Oberkante ruhender, lokal gestützter Körper unter einer Raupenposition. */
        const surfaceAt = (x: number) => {
          if (x < 8 || x > width - 8) return height - 8;
          const sampleX = x;
          let surface = height - 8;
          resting.forEach((i) => {
            const body = bodies[i];
            const radius = body.circleRadius || 17;
            const distance = Math.abs(body.position.x - sampleX);
            // Bewegte oder gerade geführte Emojis bilden keine verlässliche Fahrbahn.
            if (
              !grading.has(i) &&
              distance < radius + 4 &&
              body.position.y > height - reserve &&
              Math.abs(body.velocity.y) < 2
            ) {
              // Bodenkontakt oder ein naher Körper darunter genügt als lokale Stützheuristik.
              const supported =
                body.position.y + radius >= height - 12 ||
                resting.some((j) => {
                  const below = bodies[j];
                  const dy = below.position.y - body.position.y;
                  return (
                    !grading.has(j) &&
                    dy > radius * 0.5 &&
                    dy < radius * 2.5 &&
                    Math.abs(below.position.x - body.position.x) < radius * 1.8
                  );
                });
              if (!supported) return;
              const top =
                body.position.y -
                Math.sqrt(Math.max(0, radius * radius - distance * distance));
              surface = Math.min(surface, top);
            }
          });
          return surface;
        };
        // Die ganze Auflagefläche überbrückt Lücken zwischen einzelnen Emojis.
        const supports = [30, 41, 53, 64, 75, 87, 98].map((x) => ({
          offset: (x - 64) * scale,
          y: surfaceAt(machineX + x * scale),
        }));
        const back = Math.min(...supports.slice(0, 3).map((point) => point.y));
        const front = Math.min(...supports.slice(-3).map((point) => point.y));
        const slope = Math.max(
          -0.24,
          Math.min(0.24, Math.atan2(front - back, 46 * scale)),
        );
        const ease = 1 - Math.exp(-delta / 120);
        machineTilt += (slope - machineTilt) * ease;
        const targetY =
          Math.min(
            ...supports.map(
              (point) => point.y - Math.sin(machineTilt) * point.offset,
            ),
          ) -
          116.5 * scale +
          2;
        // Hindernisse sofort aufnehmen, nach einer Kuppe gedämpft absenken.
        machineY =
          machineY === null
            ? targetY
            : Math.min(targetY, machineY + (targetY - machineY) * ease);
        if (previousMachineX !== null) {
          const dx = machineX - previousMachineX;
          // Federbewegungen dürfen die Kette nicht zusätzlich beschleunigen.
          trackDistance += dx / (scale * Math.cos(machineTilt));
        }
        previousMachineX = machineX;
        for (const { element, offset } of trackLinks)
          element.setAttribute(
            'transform',
            trackLinkTransform(offset + trackDistance),
          );
        excavator.current.style.setProperty(
          '--drive-angle',
          `${trackDistance / 10}rad`,
        );
        excavator.current.style.setProperty(
          '--roller-angle',
          `${trackDistance / 5.5}rad`,
        );
        excavator.current.style.transform = `translate(${machineX}px, ${machineY}px) rotate(${machineTilt}rad)`;
      }
      if (sweep && sweepProgress === 1) {
        sweep = null;
        if (excavator.current) excavator.current.dataset.active = 'false';
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Beim Unmount oder Wechsel der Bewegungseinstellung alle externen Ressourcen freigeben.
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      host.parentElement?.style.removeProperty('--emoji-field-min-height');
      host.parentElement?.style.removeProperty('--emoji-floor-height');
    };
  }, [reduced]);
  return (
    <section
      className="emoji-field"
      ref={container}
      aria-label="180 Emojis – passende steigen auf, übrige fallen nach unten"
    >
      <Excavator ref={excavator} />
      {/* Die Ref-Map folgt Mount und Unmount der Buttons; Labels bleiben über React aktuell. */}
      {EMOJIS.map((emoji) => {
        const score = scores?.[emoji.id];
        const selected = score !== undefined && score >= threshold / 100;
        return (
          <button
            type="button"
            key={emoji.id}
            ref={(el) => {
              if (el) elements.current.set(emoji.id, el);
              else elements.current.delete(emoji.id);
            }}
            className={`emoji ${selected ? 'is-match' : ''}`}
            aria-label={`${emoji.label}${score !== undefined ? `: ${Math.round(score * 100)} % Übereinstimmung` : ''}`}
            title={`${emoji.label}${score !== undefined ? ` · ${(score * 100).toFixed(1)} %` : ''}`}
            onClick={() => onSelect(emoji.id)}
          >
            <span aria-hidden="true">{emoji.symbol}</span>
          </button>
        );
      })}
    </section>
  );
}
