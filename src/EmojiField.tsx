import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { EMOJIS } from '../shared/emojis';

type Props = { scores: Record<string, number> | null; threshold: number; onSelect: (id: string) => void };
export default function EmojiField({ scores, threshold, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
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
    const engine = Matter.Engine.create({ enableSleeping: true });
    engine.gravity.y = 1.3;
    const bodies = EMOJIS.map((_, i) => Matter.Bodies.circle(24 + ((i * 67) % Math.max(1, width - 48)), height - 260 - Math.floor(i / 20) * 34, 17, { restitution: .38, friction: .45, frictionAir: .025, angle: (i % 7 - 3) * .17 }));
    Matter.Composite.add(engine.world, bodies);
    let walls: Matter.Body[] = [];
    const rebuildWalls = () => {
      width = host.clientWidth; height = host.clientHeight;
      const search = host.parentElement?.querySelector('.search-zone');
      if (search) searchBottom = search.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 30;
      Matter.Composite.remove(engine.world, walls);
      walls = [Matter.Bodies.rectangle(width / 2, height + 40, width + 180, 80, { isStatic: true }), Matter.Bodies.rectangle(-40, height / 2, 80, height * 3, { isStatic: true }), Matter.Bodies.rectangle(width + 40, height / 2, 80, height * 3, { isStatic: true })];
      Matter.Composite.add(engine.world, walls);
      bodies.forEach(body => {
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
      const { scores: current, threshold: limit } = latest.current;
      const selected = EMOJIS.filter(emoji => current && current[emoji.id] >= limit / 100).sort((a, b) => current![b.id] - current![a.id]);
      const indices = new Map(selected.map((emoji, i) => [emoji.id, i]));
      const availableWidth = width >= 960 ? width - 320 : width;
      const gridWidth = Math.min(availableWidth - 40, selected.length > 80 ? 720 : 490);
      const columns = Math.max(4, Math.floor(gridWidth / 46));
      const rows = Math.ceil(selected.length / columns);
      const startY = searchBottom;
      const reserve = selected.length > 100 ? 40 : 150;
      const step = Math.min(45, Math.max(10, (height - startY - reserve) / Math.max(rows, 1)));
      if (!reduced) Matter.Engine.update(engine, delta);
      let restingIndex = 0;
      bodies.forEach((body, i) => {
        const id = EMOJIS[i].id;
        const selectedIndex = indices.get(id);
        if (selectedIndex !== undefined) {
          if (!body.isStatic) Matter.Body.setStatic(body, true);
          body.collisionFilter.mask = 0;
          const inRow = Math.min(columns, selected.length - Math.floor(selectedIndex / columns) * columns);
          const targetX = availableWidth / 2 + ((selectedIndex % columns) - (inRow - 1) / 2) * 45;
          const targetY = startY + Math.floor(selectedIndex / columns) * step;
          const ease = reduced ? 1 : 1 - Math.exp(-delta / 95);
          Matter.Body.setPosition(body, { x: body.position.x + (targetX - body.position.x) * ease, y: body.position.y + (targetY - body.position.y) * ease });
          Matter.Body.setAngle(body, body.angle * (1 - ease));
        } else if (reduced) {
          body.collisionFilter.mask = 0;
          const cols = Math.max(1, Math.floor(width / 35));
          Matter.Body.setPosition(body, { x: 20 + (restingIndex % cols) * 35, y: height - 20 - Math.floor(restingIndex / cols) * 34 });
          Matter.Body.setAngle(body, 0); restingIndex++;
        } else if (body.isStatic) {
          body.collisionFilter.mask = 0xFFFFFFFF;
          Matter.Body.setStatic(body, false); Matter.Sleeping.set(body, false);
          Matter.Body.setVelocity(body, { x: (i % 5 - 2) * .4, y: 0 });
        }
        const el = elements.current.get(id);
        if (el) el.style.fontSize = selectedIndex !== undefined ? `${Math.min(width < 600 ? 26 : 30, step + 4)}px` : `${width < 600 ? 24 : 30}px`;
        if (el) el.style.transform = `translate(${body.position.x - 20}px, ${body.position.y - 20}px) rotate(${body.angle}rad)`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); Matter.Composite.clear(engine.world, false); Matter.Engine.clear(engine); };
  }, [reduced]);
  return <div className="emoji-field" ref={container} aria-label="180 Emojis – passende steigen auf, übrige fallen nach unten">
    {EMOJIS.map(emoji => {
      const score = scores?.[emoji.id];
      const selected = score !== undefined && score >= threshold / 100;
      return <button type="button" key={emoji.id} ref={el => { if (el) elements.current.set(emoji.id, el); else elements.current.delete(emoji.id); }} className={`emoji ${selected ? 'is-match' : ''}`} aria-label={`${emoji.label}${score !== undefined ? `: ${Math.round(score * 100)} % Übereinstimmung` : ''}`} title={`${emoji.label}${score !== undefined ? ` · ${(score * 100).toFixed(1)} %` : ''}`} onClick={() => onSelect(emoji.id)}><span aria-hidden="true">{emoji.symbol}</span></button>;
    })}
  </div>;
}
