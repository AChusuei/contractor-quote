interface Env {
  API_WORKER_URL: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const workerUrl = context.env.API_WORKER_URL
  if (!workerUrl) {
    return new Response("API_WORKER_URL not configured", { status: 502 })
  }
  const url = new URL(context.request.url)
  const target = workerUrl + url.pathname + url.search
  // Forward the request, preserving method, headers, body
  return fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  })
}
