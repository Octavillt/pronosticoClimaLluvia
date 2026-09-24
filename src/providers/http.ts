export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} al pedir ${url}`);
    this.name = 'HttpError';
  }
}

export async function fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(url, { signal: controlador.signal });
    if (!respuesta.ok) {
      throw new HttpError(respuesta.status, url);
    }
    return (await respuesta.json()) as unknown;
  } finally {
    clearTimeout(temporizador);
  }
}
