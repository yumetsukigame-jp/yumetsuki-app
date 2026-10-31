import NeraiuchiSession from "@/components/neraiuchi/NeraiuchiSession";

export default function NeraiuchiLayout({ children }: { children: React.ReactNode }) {
  return <NeraiuchiSession>{children}</NeraiuchiSession>;
}
