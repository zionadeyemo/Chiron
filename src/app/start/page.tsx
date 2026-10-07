import { Suspense } from "react";
import { Onboarding } from "@/components/Onboarding";

export default function StartPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
