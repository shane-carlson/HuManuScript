import { useEffect } from "react";
import { useHash } from "./route.ts";
import { Goals } from "./screens/Goals.tsx";
import { Ground } from "./screens/Ground.tsx";
import { GuidePage } from "./screens/Guide.tsx";
import { Home } from "./screens/Home.tsx";
import { More } from "./screens/More.tsx";
import { Onboarding } from "./screens/Onboarding.tsx";
import { Pair } from "./screens/Pair.tsx";
import { Profile } from "./screens/Profile.tsx";
import { Rewards } from "./screens/Rewards.tsx";
import { Assign, TaskDetail, Tasks } from "./screens/Tasks.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { useSession } from "./session.tsx";
import { Shell } from "./ui.tsx";

export function SlashApp() {
  useEffect(() => {
    document.title = "SlashConnect";
  }, []);
  const { token, data, loading } = useSession();
  const { parts } = useHash();

  if (loading && token && !data) {
    return (
      <Shell>
        <div className="pad">
          <p className="lead">One sec…</p>
        </div>
      </Shell>
    );
  }
  if (!token || !data) return <Welcome />;
  if (!data.me.onboardingComplete) return <Onboarding />;

  const [root, id] = parts;
  if (root === "tasks" && id) return <TaskDetail id={id} />;
  if (root === "tasks") return <Tasks />;
  if (root === "assign") return <Assign />;
  if (root === "goals") return <Goals />;
  if (root === "rewards") return <Rewards />;
  if (root === "pair") return <Pair />;
  if (root === "guide") return <GuidePage />;
  if (root === "ground") return <Ground />;
  if (root === "profile") return <Profile />;
  if (root === "more") return <More />;
  return <Home />;
}
