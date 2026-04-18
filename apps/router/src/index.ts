interface Env {
  PAGES_URL: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    url.hostname = new URL(env.PAGES_URL).hostname

    // Preserve the original hostname so the browser sees the correct URL
    // (Cloudflare Workers would otherwise overwrite Host with the fetch destination)
    const headers = new Headers(request.headers)
    headers.set("Host", new URL(request.url).hostname)

    return fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body ?? undefined,
      redirect: "manual",
    })
  },
}
