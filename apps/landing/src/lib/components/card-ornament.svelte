<script lang="ts">
let { variant }: { variant: 'orbit' | 'sparkles' | 'sunburst' | 'security' } = $props()
</script>

<div class="pointer-events-none absolute inset-0" aria-hidden="true">
  <svg class="h-full w-full" viewBox="0 0 500 370" fill="none" preserveAspectRatio="xMidYMid slice">
    {#if variant === 'security'}
      <g stroke="#ce945b" stroke-opacity="0.28" stroke-width="1.2">
        <circle cx="250" cy="185" r="150" />
        <circle cx="250" cy="185" r="190" stroke-dasharray="3 9" />
        <path d="M250 18 393 70v94c0 90-64 153-143 188-79-35-143-98-143-188V70Z" />
      </g>
      <path
        d="M52 99v22m-11-11h22M445 270v18m-9-9h18"
        stroke="#ce945b"
        stroke-opacity="0.45"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="425" cy="70" r="5" fill="#ce945b" fill-opacity="0.4" />
    {:else if variant === 'orbit'}
      <g stroke="#819b67" stroke-opacity="0.25" stroke-width="1.2">
        <ellipse cx="250" cy="185" rx="225" ry="130" transform="rotate(-25 250 185)" />
        <ellipse cx="250" cy="185" rx="225" ry="165" transform="rotate(25 250 185)" />
      </g>
      <circle cx="62" cy="253" r="9" fill="#a9bc92" fill-opacity="0.55" />
      <circle cx="443" cy="115" r="6" fill="#a9bc92" fill-opacity="0.55" />
      <path
        d="M420 274v28m-14-14h28M67 70v18m-9-9h18"
        stroke="#819b67"
        stroke-opacity="0.45"
        stroke-width="2"
        stroke-linecap="round"
      />
    {:else if variant === 'sparkles'}
      <g stroke="#cf965d" stroke-opacity="0.28" stroke-width="1.2">
        <circle cx="250" cy="185" r="155" />
        <circle cx="250" cy="185" r="205" />
      </g>
      <g fill="#cf965d" fill-opacity="0.45">
        <path d="m442 68 7 21 21 7-21 7-7 21-7-21-21-7 21-7Z" />
        <path d="m61 270 5 15 15 5-15 5-5 15-5-15-15-5 15-5Z" />
      </g>
      <path
        d="m410 293 9 13m-351-228 11-9"
        stroke="#cf965d"
        stroke-opacity="0.55"
        stroke-width="3"
        stroke-linecap="round"
      />
    {:else}
      <g stroke="#9e80bc" stroke-opacity="0.3" stroke-width="1.2">
        <circle cx="250" cy="185" r="145" />
        {#each Array.from({ length: 20 }, (_, i) => i * 18) as angle}
          <path d="M250 17v26" transform={`rotate(${angle} 250 185)`} />
        {/each}
      </g>
      <path
        d="M45 100v24m-12-12h24M443 267v18m-9-9h18"
        stroke="#9e80bc"
        stroke-opacity="0.45"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="412" cy="55" r="5" fill="#9e80bc" fill-opacity="0.35" />
    {/if}
  </svg>
</div>
