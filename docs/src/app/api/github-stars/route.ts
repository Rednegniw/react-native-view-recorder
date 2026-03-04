export async function GET() {
  const res = await fetch("https://api.github.com/repos/Rednegniw/react-native-view-recorder", {
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return Response.json({ stars: null }, { status: 502 });
  }

  const data = await res.json();
  const stars = data.stargazers_count;

  return Response.json(
    { stars },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
