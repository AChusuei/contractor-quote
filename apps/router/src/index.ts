interface Env {
  PAGES_URL: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    url.hostname = new URL(env.PAGES_URL).hostname

    return fetch(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body ?? undefined,
      redirect: "manual",
    })
  },
}
