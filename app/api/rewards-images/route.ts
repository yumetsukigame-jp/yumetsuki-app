export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // public/rewards の URL パスを直接返す
    const images = [
      "Fukuro.png",
      "PSA10.png",
      "Pay.png",
      "nanikaPSA.png"
    ].map((name) => `/rewards/${name}`);

    return Response.json(images);
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
