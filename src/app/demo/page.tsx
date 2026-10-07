import { Suspense } from "react";
import { StartDemo } from "@/components/StartDemo";

/** /demo starts a fresh seeded session (/demo?mode=baseline for the comparison arm). */
export default function DemoPage() {
  return (
    <Suspense>
      <StartDemo />
    </Suspense>
  );
}
