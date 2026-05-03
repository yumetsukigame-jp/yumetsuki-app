import fs from "fs";
import path from "path";
import EditRewardForm from "./EditRewardForm";

export default async function EditRewardPage({ params }) {
  const { id } = await params; // ← ★ Next.js 16 必須

  const rewardsDir = path.join(process.cwd(), "public", "rewards");
  const files = fs.readdirSync(rewardsDir);

  const images = files.filter((f) =>
    f.match(/\.(png|jpg|jpeg|gif|webp)$/i)
  );

  return <EditRewardForm id={id} images={images} />;
}
