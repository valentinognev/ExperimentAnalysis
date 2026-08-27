import { useState } from "react";
import ExperimentBar from "./components/ExperimentBar";

export default function App() {
  const [slug, setSlug] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <h1 className="px-4 pt-4 text-xl font-semibold">ExperimentAnalysis</h1>
      <ExperimentBar slug={slug} onSlugChange={setSlug} />
    </div>
  );
}
