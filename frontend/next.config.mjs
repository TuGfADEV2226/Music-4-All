/** @type {import('next').NextConfig} */
const nextConfig = {
  // El target `production` del Dockerfile copia `.next/standalone`, que solo se
  // genera con esta opción: sin ella la imagen de producción no se puede construir
  // (y CI no lo detectaba porque solo compila el target `builder`).
  output: 'standalone',
  async rewrites() {
    // OJO: esto se evalúa en `next build`, no al arrancar. El destino queda
    // horneado en routes-manifest.json, así que en la imagen de producción
    // BACKEND_URL debe pasarse como build arg (ver frontend/Dockerfile).
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
      // NOTA: no se define rewrite para /ws/:path*. El dev-server de Next.js 14.2
      // crashea al hacer proxy del upgrade WebSocket hacia una URL absoluta. En
      // desarrollo el cliente conecta directo al backend vía NEXT_PUBLIC_WS_URL
      // (ver shared/config/ws.config.ts); en producción nginx proxea /ws/ al backend.
    ]
  },
  // Optimizador de imágenes DESACTIVADO a propósito (evaluado en la Fase 0.B).
  // Las carátulas vienen del CDN de Tidal, que ya sirve tallas pre-renderizadas
  // (80/160/320/640/750/1080/1280) y las entrega directamente al navegador.
  // Activar `next/image` las haría pasar por nuestro servidor: CPU de redimensionado,
  // ancho de banda de salida y caché en disco en una VM gratuita, para reempaquetar
  // algo que el CDN ya da optimizado. En su lugar cada componente pide la talla que
  // necesita con `coverAtSize()` (shared/api/mappers.ts), que no nos cuesta nada.
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/blob-report/**',
        '**/tests/e2e/**',
      ],
    }
    return config
  },
}

export default nextConfig