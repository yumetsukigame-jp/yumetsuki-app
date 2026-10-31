import NeraiuchiSession from "@/components/neraiuchi/NeraiuchiSession";

export default function AdminNeraiuchiLayout({ children }: { children: React.ReactNode }) {
  return <NeraiuchiSession>{children}</NeraiuchiSession>;
}
