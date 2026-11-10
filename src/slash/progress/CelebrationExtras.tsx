import { useSession } from "../session.tsx";
import type { CelebrationNews, TrophyTint } from "../types.ts";
import { Badge } from "./Badge.tsx";
import { StepPips } from "./parts.tsx";
import "./progress.css";

/**
 * What progress adds under a celebration: the patches just earned, the step
 * just reached, and the smaller news that came with it. Draws nothing for a
 * celebration that has none of those.
 */
export function CelebrationExtras({ celebration }: { celebration: CelebrationNews }) {
  const { data } = useSession();
  const trophies = (celebration.trophies || []).slice(0, 3);
  const level = celebration.level;
  const also = celebration.also || [];
  const tintOf = (id: string): TrophyTint => data?.shelf?.find((item) => item.id === `level-${id}`)?.tint || "coral";
  if (!trophies.length && !level && !also.length) return null;
  return (
    <div className="pg-news">
      {trophies.length ? (
        <div className="pg-news-badges">
          {trophies.map((trophy) => (
            <Badge key={trophy.id} art={trophy.art} tint={trophy.tint} size={trophies.length > 1 ? 68 : 92} label={trophy.title} />
          ))}
        </div>
      ) : level ? (
        <div className="pg-news-step">
          <Badge art={`level:${level.id}`} tint={tintOf(level.id)} size={64} label={level.name} />
          <StepPips step={level.step} />
        </div>
      ) : null}
      {also.length ? (
        <ul className="pg-also">
          {also.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
