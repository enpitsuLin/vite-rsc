import { createRoutes } from '@vite-rsc/framework'

export const routes = createRoutes([
  {
    id: 'shell',
    import: () => import('./layouts/default'),
    children: [
      {
        id: 'index',
        index: true,
        import: () => import('./pages/index'),
      },
    ],
  },
])
