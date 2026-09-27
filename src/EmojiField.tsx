import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { EMOJIS } from '../shared/emojis';
import Excavator from './Excavator';

type Props = { scores: Record<string, number> | null; threshold: number; onSelect: (id: string) => void };
export default function EmojiField({ scores, threshold, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const excavator = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef({ scores, threshold });
  const [reduced, setReduced] = useState(false);
  useEffect(() => { latest.current = { scores, threshold }; }, [scores, threshold]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let width = host.clientWidth, height = host.clientHeight;
    let searchBottom = 380;
    // Only guide surplus emojis while the bucket passes; physics settles them afterwards.
    const grading = new Map<number, Matter.Vector>();
    let previousSelected = new Set<string>();
    let cleanupDue: number | null = null;
    let elapsed = 0;
    let hasGraded = false;
    let machineY: number | null = null;
    let machineTilt = 0;
    let sweep: { started: number; duration: number; targets: Map<number, Matter.Vector>; pickup: Map<number, number> } | null = null;
    const floorLayout = (indices: number[]) => {
      const spacing = width < 600 ? 27 : 35;
      const columns = Math.max(1, Math.floor((width - 40) / spacing));
      return new Map(indices.map((index, order) => {
        const row = Math.floor(order / columns);
        const count = Math.min(columns, indices.length - row * columns);
        return [index, {
          x: width / 2 + (order % columns - (count - 1) / 2) * spacing + Math.sin(index * 17) * 3,
          y: height - 22 - row * spacing + Math.cos(index * 11) * 3,
        }];
      }));
    };
    // The excavator moves supports directly and disables their collisions. Sleeping
    // bodies do not wake when that support disappears, so keep gravity active.
    const engine = Matter.Engine.create({ enableSleeping: false });
    engine.gravity.y = 1.3;
    const bodies = EMOJIS.map((_, i) => Matter.Bodies.circle(24 + ((i * 67) % Math.max(1, width - 48)), height - 260 - Math.floor(i / 20) * 34, 17, { restitution: .38, friction: .45, frictionAir: .025, angle: (i % 7 - 3) * .17 }));
    Matter.Composite.add(engine.world, bodies);
    const roughTargets = (resting: number[]) => {
      const diameter = width < 600 ? 24 : 34;
      const count = Math.max(1, Math.floor((width - 40) / (diameter * 1.15)));
      const binWidth = (width - 40) / count;
      const bins: number[][] = Array.from({ length: count }, () => []);
      resting.forEach(i => bins[Math.max(0, Math.min(count - 1, Math.floor((bodies[i].position.x - 20) / binWidth)))].push(i));
      const capacity = Math.ceil(resting.length / count) + 1;
      const targets = new Map<number, Matter.Vector>();
      bins.forEach((bin, source) => {
        // Leave the lower bed where it landed and shave just the excess off each peak.
        bin.sort((a, b) => bodies[b].position.y - bodies[a].position.y);
        while (bin.length > capacity) {
          const i = bin.pop()!;
          let destination = source;
          bins.forEach((candidate, index) => {
            if (candidate.length < bins[destination].length ||
                (candidate.length === bins[destination].length && Math.abs(index - source) < Math.abs(destination - source))) destination = index;
          });
          const level = bins[destination].length;
          targets.set(i, {
            x: 20 + (destination + .5) * binWidth + Math.sin(i * 17) * binWidth * .12,
            y: height - diameter / 2 - level * diameter * .88,
          });
          bins[destination].push(i);
        }
      });
      return targets;
    };
    let walls: Matter.Body[] = [];
    const rebuildWalls = () => {
      width = host.clientWidth; height = host.clientHeight;
      const search = host.parentElement?.querySelector('.search-zone');
      if (search) searchBottom = search.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 30;
      Matter.Composite.remove(engine.world, walls);
      walls = [Matter.Bodies.rectangle(width / 2, height + 32, width + 180, 80, { isStatic: true }), Matter.Bodies.rectangle(-32, height / 2, 80, height * 3, { isStatic: true }), Matter.Bodies.rectangle(width + 32, height / 2, 80, height * 3, { isStatic: true })];
      Matter.Composite.add(engine.world, walls);
      if (hasGraded || grading.size || sweep) cleanupDue = elapsed + 300;
      grading.clear();
      sweep = null;
      machineY = null;
      if (excavator.current) excavator.current.dataset.active = 'false';
      bodies.forEach((body, i) => {
        if (!previousSelected.has(EMOJIS[i].id)) {
          Matter.Body.setStatic(body, false);
          body.collisionFilter.mask = 0xFFFFFFFF;
        }
        const radius = width < 600 ? 12 : 17;
        const scale = radius / (body.circleRadius || radius);
        if (Math.abs(scale - 1) > .01) Matter.Body.scale(body, scale, scale);
        Matter.Body.setPosition(body, { x: Math.max(20, Math.min(width - 20, body.position.x)), y: Math.min(height - 24, body.position.y) });
        Matter.Sleeping.set(body, false);
      });
    };
    const observer = new ResizeObserver(rebuildWalls); observer.observe(host);
    const search = host.parentElement?.querySelector('.search-zone');
    if (search) observer.observe(search);
    rebuildWalls();
    let frame = 0, previous = 0;
    const tick = (time: number) => {
      const delta = previous ? Math.min(time - previous, 1000 / 60) : 1000 / 60; previous = time;
      elapsed += delta;
      const { scores: current, threshold: limit } = latest.current;
      const selected = EMOJIS.filter(emoji => current && current[emoji.id] >= limit / 100).sort((a, b) => current![b.id] - current![a.id]);
      const indices = new Map(selected.map((emoji, i) => [emoji.id, i]));
      const selectedIds = new Set(indices.keys());
      if ([...previousSelected].some(id => !selectedIds.has(id))) cleanupDue = elapsed + 900;
      previousSelected = selectedIds;
      const resting = bodies.map((_, i) => i).filter(i => !selectedIds.has(EMOJIS[i].id));
      if (!reduced && !sweep && cleanupDue !== null && elapsed >= cleanupDue) {
        const targets = roughTargets(resting);
        sweep = {
          started: elapsed,
          duration: Math.max(4200, Math.min(6800, width * 5)),
          targets,
          pickup: new Map([...targets.keys()].map(i => [i, bodies[i].position.x])),
        };
        cleanupDue = null;
        machineY = null;
        hasGraded = true;
        if (excavator.current) excavator.current.dataset.active = 'true';
      }
      const sweepProgress = sweep ? Math.min(1, (elapsed - sweep.started) / sweep.duration) : 0;
      const machineSize = width < 600 ? 116 : 154;
      const bucketX = -machineSize + (width + machineSize * 2) * sweepProgress;
      const reducedTargets = reduced ? floorLayout(resting) : null;
      const availableWidth = width >= 960 ? width - 320 : width;
      const gridWidth = Math.min(availableWidth - 40, selected.length > 80 ? 720 : 490);
      const columns = Math.max(4, Math.floor(gridWidth / 46));
      const rows = Math.ceil(selected.length / columns);
      const startY = searchBottom;
      const floorSpacing = width < 600 ? 27 : 35;
      const floorRows = Math.ceil(resting.length / Math.max(1, Math.floor((width - 40) / floorSpacing)));
      // Allow a loose, uneven bed and enough headroom for the machine above it.
      const reserve = Math.max(150, floorRows * floorSpacing + 130);
      const playground = host.parentElement;
      playground?.style.setProperty('--emoji-field-min-height', `${Math.ceil(startY + Math.max(rows, 1) * 30 + reserve)}px`);
      playground?.style.setProperty('--emoji-floor-height', `${reserve}px`);
      const step = Math.min(45, Math.max(10, (height - startY - reserve) / Math.max(rows, 1)));
      if (!reduced) Matter.Engine.update(engine, delta);
      bodies.forEach((body, i) => {
        const id = EMOJIS[i].id;
        const selectedIndex = indices.get(id);
        if (selectedIndex !== undefined) {
          grading.delete(i);
          sweep?.targets.delete(i);
          if (!body.isStatic) Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
          const inRow = Math.min(columns, selected.length - Math.floor(selectedIndex / columns) * columns);
          const targetX = availableWidth / 2 + ((selectedIndex % columns) - (inRow - 1) / 2) * 45;
          const targetY = startY + Math.floor(selectedIndex / columns) * step;
          const ease = reduced ? 1 : 1 - Math.exp(-delta / 95);
          Matter.Body.setPosition(body, { x: body.position.x + (targetX - body.position.x) * ease, y: body.position.y + (targetY - body.position.y) * ease });
          Matter.Body.setAngle(body, body.angle * (1 - ease));
        } else if (reduced) {
          Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
          Matter.Body.setPosition(body, reducedTargets!.get(i)!);
          Matter.Body.setAngle(body, Math.sin(i * 7) * .3);
        } else if (sweep?.targets.has(i) && bucketX >= sweep.pickup.get(i)!) {
          grading.set(i, sweep.targets.get(i)!);
          if (!body.isStatic) Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
        } else if (body.isStatic && !grading.has(i)) {
          body.collisionFilter.mask = 0xFFFFFFFF;
          Matter.Body.setStatic(body, false); Matter.Sleeping.set(body, false);
          Matter.Body.setVelocity(body, { x: (i % 5 - 2) * .4, y: 0 });
        }
        const floorTarget = grading.get(i);
        if (floorTarget && selectedIndex === undefined) {
          const ease = 1 - Math.exp(-delta / 150);
          Matter.Body.setPosition(body, {
            x: body.position.x + (floorTarget.x - body.position.x) * ease,
            y: body.position.y + (floorTarget.y - body.position.y) * ease,
          });
          Matter.Body.setAngle(body, body.angle + (Math.sin(i * 7) * .35 - body.angle) * ease);
          if (Math.hypot(floorTarget.x - body.position.x, floorTarget.y - body.position.y) < 1) {
            grading.delete(i);
            sweep?.targets.delete(i);
            Matter.Body.setStatic(body, false);
            body.collisionFilter.mask = 0xFFFFFFFF;
            Matter.Sleeping.set(body, false);
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
          }
        }
        const el = elements.current.get(id);
        if (el) el.style.fontSize = selectedIndex !== undefined ? `${Math.min(width < 600 ? 26 : 30, step + 4)}px` : `${width < 600 ? 24 : 30}px`;
        if (el) el.style.transform = `translate(${body.position.x - 20}px, ${body.position.y - 20}px) rotate(${body.angle}rad)`;
      });
      if (sweep && excavator.current) {
        const scale = machineSize / 180;
        const machineX = bucketX - machineSize * .9;
        const surfaceAt = (x: number) => {
          const sampleX = Math.max(25, Math.min(width - 25, x));
          let surface = height;
          resting.forEach(i => {
            const body = bodies[i];
            const radius = body.circleRadius || 17;
            const distance = Math.abs(body.position.x - sampleX);
            // Airborne emojis are not ground. The tracks follow the settled pile.
            if (!grading.has(i) && distance < radius + 4 && body.position.y > height - reserve && Math.abs(body.velocity.y) < 2) {
              const supported = body.position.y + radius >= height - 12 || resting.some(j => {
                const below = bodies[j];
                const dy = below.position.y - body.position.y;
                return !grading.has(j) && dy > radius * .5 && dy < radius * 2.5 && Math.abs(below.position.x - body.position.x) < radius * 1.8;
              });
              if (!supported) return;
              const top = body.position.y - Math.sqrt(Math.max(0, radius * radius - distance * distance));
              surface = Math.min(surface, top);
            }
          });
          return surface;
        };
        const back = surfaceAt(machineX + 35 * scale);
        const front = surfaceAt(machineX + 95 * scale);
        const targetY = Math.min(back, front) - 116 * scale + 7;
        const ease = 1 - Math.exp(-delta / 85);
        machineY = machineY === null ? targetY : machineY + (targetY - machineY) * ease;
        const slope = Math.max(-.18, Math.min(.18, Math.atan2(front - back, 60 * scale)));
        machineTilt += (slope - machineTilt) * ease;
        excavator.current.style.transform = `translate(${machineX}px, ${machineY}px) rotate(${machineTilt}rad)`;
      }
      if (sweep && sweepProgress === 1) {
        sweep = null;
        if (excavator.current) excavator.current.dataset.active = 'false';
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      host.parentElement?.style.removeProperty('--emoji-field-min-height');
      host.parentElement?.style.removeProperty('--emoji-floor-height');
    };
  }, [reduced]);
  return <div className="emoji-field" ref={container} aria-label="180 Emojis – passende steigen auf, übrige fallen nach unten">
    <Excavator ref={excavator}/>
    {EMOJIS.map(emoji => {
      const score = scores?.[emoji.id];
      const selected = score !== undefined && score >= threshold / 100;
      return <button type="button" key={emoji.id} ref={el => { if (el) elements.current.set(emoji.id, el); else elements.current.delete(emoji.id); }} className={`emoji ${selected ? 'is-match' : ''}`} aria-label={`${emoji.label}${score !== undefined ? `: ${Math.round(score * 100)} % Übereinstimmung` : ''}`} title={`${emoji.label}${score !== undefined ? ` · ${(score * 100).toFixed(1)} %` : ''}`} onClick={() => onSelect(emoji.id)}><span aria-hidden="true">{emoji.symbol}</span></button>;
    })}
  </div>;
}
