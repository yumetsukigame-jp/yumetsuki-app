"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import LoadingState from "@/app/components/LoadingState";
import { useNeraiuchiAuth } from "./NeraiuchiCommon";

export default function NeraiuchiSession({ children }: { children: React.ReactNode }) {
  const { ready, uid } = useNeraiuchiAuth();
  const pathname = usePathname();
  if (!ready) return <LoadingState />;
  // Remount data-bearing screens on account changes; never retain another account's results.
  return <Fragment key={`${uid ?? "signed-out"}:${pathname}`}>{children}</Fragment>;
}
