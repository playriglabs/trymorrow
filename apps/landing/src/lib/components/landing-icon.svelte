<script lang="ts">
let { name = 'arrow', size = 24 }: { name?: string; size?: number } = $props()
const paths: Record<string, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  diagonal: 'M6 18 18 6M6 6h12v12',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',
  grow: 'M12 21v-9M12 16C4 17 3 10 3 7c6 0 9 3 9 9Zm0-4c0-6 4-9 9-9 0 6-3 9-9 9Z',
  plus: 'M12 5v14M5 12h14',
  chart: 'm3 17 6-6 4 3 8-10M15 4h6v6',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  check: 'm5 12 4 4L19 6',
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3V10Z',
  person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  send: 'm21 3-7 18-4-7-7-4 18-7ZM10 14 21 3',
  menu: 'M4 8h16M4 16h16',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM11 18h2',
  close: 'm6 6 12 12M6 18 18 6',
}
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name] ?? paths.arrow} /></svg
>
