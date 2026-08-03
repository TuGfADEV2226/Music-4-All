export const WS_ENDPOINT = '/ws/downloads'

/** Hosts desde los que el override de desarrollo tiene sentido. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname)
}

export function buildWsUrl(): string {
  // Override explícito (desarrollo): conectar directo al backend. El dev-server
  // de Next.js crashea al manejar el upgrade WS de un rewrite hacia una URL
  // absoluta ("Cannot read properties of undefined (reading 'bind')"), por lo que
  // en dev se apunta a ws://localhost:8000 saltándose el proxy de Next.
  //
  // Solo se aplica si la página se sirve desde la propia máquina. El override
  // nombra un host concreto, así que para cualquier cliente remoto apuntaría a
  // *su* localhost y el progreso no llegaría jamás: la descarga se quedaría
  // eternamente en "en cola" sin ningún error visible. Pasa de verdad en cuanto
  // se expone el Docker local por un túnel, y pasaría igual si la variable se
  // colara en un despliegue.
  const override = process.env.NEXT_PUBLIC_WS_URL
  if (override && (typeof window === 'undefined' || isLocalHostname(window.location.hostname))) {
    return `${override}${WS_ENDPOINT}`
  }

  // Mismo origen — nginx hace proxy de /ws/ al backend (music4all.conf).
  if (typeof window === 'undefined') return `ws://localhost:8000${WS_ENDPOINT}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${WS_ENDPOINT}`
}
