import fs from "fs";
import path from "path";
import AddRewardForm from "./AddRewardForm";

export default function Page() {
  const rewardsDir = path.join(process.cwd(), "public", "rewards");
  const files = fs.readdirSync(rewardsDir);

  const images = files.filter((f) =>
    f.match(/\.(png|jpg|jpeg|gif|webp)$/i)
  );

  return <AddRewardForm images={images} />;
}
