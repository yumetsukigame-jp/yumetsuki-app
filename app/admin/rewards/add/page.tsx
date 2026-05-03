import AddRewardForm from "./AddRewardForm";

export default async function Page() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/rewards-images`, {
    cache: "no-store",
  });
  const images = await res.json();

  return <AddRewardForm images={images} />;
}
