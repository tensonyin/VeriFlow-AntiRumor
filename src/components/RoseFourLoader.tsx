import { useEffect, useRef } from "react";

const config = {
  rotate: true,
  particleCount: 78,
  trailSpan: 0.32,
  durationMs: 5400,
  rotationDurationMs: 28000,
  pulseDurationMs: 4500,
  strokeWidth: 4.6,
  roseA: 9.2,
  roseABoost: 0.6,
  roseBreathBase: 0.72,
  roseBreathBoost: 0.28,
  roseScale: 3.25,
  point(progress: number, detailScale: number) {
    const t = progress * Math.PI * 2;
    const a = config.roseA + detailScale * config.roseABoost;
    const r =
      a *
      (config.roseBreathBase + detailScale * config.roseBreathBoost) *
      Math.cos(4 * t);
    return {
      x: 50 + Math.cos(t) * r * config.roseScale,
      y: 50 + Math.sin(t) * r * config.roseScale,
    };
  },
};

function normalizeProgress(progress: number) {
  return ((progress % 1) + 1) % 1;
}

function getDetailScale(time: number) {
  const pulseProgress =
    (time % config.pulseDurationMs) / config.pulseDurationMs;
  const pulseAngle = pulseProgress * Math.PI * 2;
  return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
}

function getRotation(time: number) {
  if (!config.rotate) return 0;
  return (
    -((time % config.rotationDurationMs) / config.rotationDurationMs) * 360
  );
}

function buildPath(detailScale: number, steps = 480) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const point = config.point(index / steps, detailScale);
    return `${index === 0 ? "M" : "L"} ${point.x.toFixed(
      2
    )} ${point.y.toFixed(2)}`;
  }).join(" ");
}

function getParticle(index: number, progress: number, detailScale: number) {
  const tailOffset = index / (config.particleCount - 1);
  const point = config.point(
    normalizeProgress(progress - tailOffset * config.trailSpan),
    detailScale
  );
  const fade = Math.pow(1 - tailOffset, 0.56);
  return {
    x: point.x,
    y: point.y,
    radius: 0.9 + fade * 2.7,
    opacity: 0.04 + fade * 0.96,
  };
}

export default function RoseFourLoader({
  className = "",
  color = "#2C2C2C",
}: {
  className?: string;
  color?: string;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const circlesRef = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    const startedAt = performance.now();
    let animationFrameId: number;

    function render(now: number) {
      const time = now - startedAt;
      const progress = (time % config.durationMs) / config.durationMs;
      const detailScale = getDetailScale(time);

      if (groupRef.current) {
        groupRef.current.setAttribute(
          "transform",
          `rotate(${getRotation(time)} 50 50)`
        );
      }

      if (pathRef.current) {
        pathRef.current.setAttribute("d", buildPath(detailScale));
      }

      circlesRef.current.forEach((node, index) => {
        if (!node) return;
        const particle = getParticle(index, progress, detailScale);
        node.setAttribute("cx", particle.x.toFixed(2));
        node.setAttribute("cy", particle.y.toFixed(2));
        node.setAttribute("r", particle.radius.toFixed(2));
        node.setAttribute("opacity", particle.opacity.toFixed(3));
      });

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className={className} style={{ color }}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        className="w-full h-full overflow-visible"
      >
        <g id="group" ref={groupRef}>
          <path
            id="path"
            ref={pathRef}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.1"
          ></path>
          {Array.from({ length: config.particleCount }).map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                circlesRef.current[i] = el;
              }}
              fill="currentColor"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
