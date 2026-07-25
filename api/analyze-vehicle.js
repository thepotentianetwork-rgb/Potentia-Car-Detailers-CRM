// Vercel serverless function (zero-config: anything in /api is deployed as
// one). Keeps ANTHROPIC_API_KEY server-side - the browser never sees it.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { photoUrls, vehicle } = req.body || {};
  const hasPhotos = Array.isArray(photoUrls) && photoUrls.length > 0;
  if (!hasPhotos && !vehicle) {
    res.status(400).json({ error: "photoUrls or vehicle is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI analysis isn't configured yet - ANTHROPIC_API_KEY is missing." });
    return;
  }

  const vehicleContext = vehicle
    ? `Known details: ${[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")}.` +
      (vehicle.mileage ? ` Mileage: ${vehicle.mileage}.` : "") +
      (vehicle.condition ? ` Condition: ${vehicle.condition}.` : "") +
      (vehicle.exteriorColor ? ` Exterior color: ${vehicle.exteriorColor}.` : "") +
      (vehicle.features ? ` Features: ${vehicle.features}.` : "")
    : "";

  let content;
  if (hasPhotos) {
    const imageBlocks = photoUrls.slice(0, 6).map((url) => ({
      type: "image",
      source: { type: "url", url },
    }));
    const prompt = `You are helping a car dealership list a vehicle for sale. Look at these photos and extract listing details. ${vehicleContext}

Respond with ONLY a JSON object, no other text, in this exact shape:
{
  "exterior_color": "string or null",
  "interior_color": "string or null",
  "condition": "exactly one of: New, Certified Pre-Owned, Excellent, Good, Fair, Poor - or null",
  "features": ["short feature or trim detail", "..."],
  "description": "a compelling 2-3 sentence listing description a buyer would see"
}`;
    content = [...imageBlocks, { type: "text", text: prompt }];
  } else {
    const prompt = `You are helping a car dealership list a vehicle for sale. No photos are available yet. ${vehicleContext}

Write a compelling 2-3 sentence listing description a buyer would see, based only on the known details above.

Respond with ONLY a JSON object, no other text, in this exact shape:
{
  "description": "a compelling 2-3 sentence listing description a buyer would see"
}`;
    content = [{ type: "text", text: prompt }];
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: `AI analysis failed: ${errText}` });
      return;
    }

    const data = await anthropicRes.json();
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(502).json({ error: "AI response wasn't valid JSON." });
      return;
    }
    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
