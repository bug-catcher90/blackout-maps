const REPO = "bug-catcher90/blackout-maps"

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD")
    res.status(405).json({ error: "method_not_allowed" })
    return
  }

  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "blackoutmaps.com",
    "X-GitHub-Api-Version": "2022-11-28"
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN

  try {
    const response = await fetch("https://api.github.com/repos/" + REPO, {
      headers,
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) throw new Error("github " + response.status)
    const data = await response.json()
    const stars = data && data.stargazers_count
    if (!Number.isInteger(stars) || stars < 0) throw new Error("bad payload")
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400")
    res.status(200).json({ stars })
  } catch (error) {
    // Short edge cache so a GitHub outage or rate limit isn't hammered, without pinning a failure.
    res.setHeader("Cache-Control", "public, s-maxage=60")
    res.status(502).json({ error: "unavailable" })
  }
}
