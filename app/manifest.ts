import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AlloCat',
    short_name: 'AlloCat',
    description: 'Minimalist, manual personal finance control system.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/android/launchericon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android/launchericon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android/launchericon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/ios/180.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Quick Spend',
        short_name: 'Spend',
        url: '/dashboard?focus=quick-spend',
        description: 'Log a transaction',
      },
      {
        name: 'Budget',
        short_name: 'Budget',
        url: '/budget',
        description: 'View this month’s budget',
      },
      {
        name: 'Goals',
        short_name: 'Goals',
        url: '/goals',
        description: 'Track savings goals',
      },
    ],
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
    },
  };
}
