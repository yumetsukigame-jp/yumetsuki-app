"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import GachaResultsBrowser from "../components/GachaResultsBrowser";
import LoadingState from "@/app/components/LoadingState";

function ResultsContent() {
  const searchParams = useSearchParams();

  return (
    <GachaResultsBrowser
      filterCode={searchParams.get("code") ?? undefined}
    />
  );
}

export default function GachaResultsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResultsContent />
    </Suspense>
  );
}
