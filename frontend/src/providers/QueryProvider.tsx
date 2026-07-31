'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { createQueryClient } from '@/shared/api/query-client'

// Las devtools son una herramienta de desarrollo: no deben viajar al navegador de
// un usuario. `process.env.NODE_ENV` se sustituye en tiempo de compilación, así
// que en el build de producción esta rama queda muerta y webpack ni siquiera
// emite el import dinámico del paquete.
//
// El paquete v5 ya se auto-anula fuera de `development` (exporta `() => null`),
// pero eso es un detalle interno suyo: dejarlo explícito aquí garantiza que el
// bundle de producción no dependa de que la próxima versión lo siga haciendo.
const ReactQueryDevtools =
  process.env.NODE_ENV === 'production'
    ? null
    : dynamic(
        () => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools),
        { ssr: false },
      )

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
