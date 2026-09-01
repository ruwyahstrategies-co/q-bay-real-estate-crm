// Parses coordinates out of a pasted Google Maps share/location URL.
// No Google Maps API key involved - just regexes over the URL shapes Google
// itself produces, plus a server-side redirect follow (see the
// resolve-maps-link edge function) for shortened maps.app.goo.gl links.

export function looksLikeGoogleMapsLink(input: string): boolean {
  const v = input.trim();
  return /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(v);
}

export function isShortenedGoogleMapsLink(input: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(input.trim());
}

const COORD_PATTERNS: RegExp[] = [
  // Precise "pin" coordinates Google embeds in complex place URLs.
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  // ?q=lat,lng or &q=lat,lng
  /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  // /@lat,lng,zoom
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  // ?ll=lat,lng
  /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  // /place/lat,lng
  /\/place\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
];

export function parseGoogleMapsCoordinates(input: string): { lat: number; lng: number } | null {
  const url = input.trim();
  if (!url) return null;
  for (const re of COORD_PATTERNS) {
    const m = url.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}
