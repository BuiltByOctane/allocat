# Pull-to-refresh cat animation

Drop a Lottie file here named **`cat-refresh.lottie`** (dotLottie) — or change
`CAT_LOTTIE_SRC` in `components/PullToRefresh.tsx` to a `.json` if you use raw
Lottie JSON.

Until a file exists, the component falls back to a built-in monochrome SVG cat
(no breakage).

## Get a free cat loader
1. Open a free cat animation, e.g.
   https://lottiefiles.com/free-animation/cat-loader-F4ZybShCAh
2. Click **Download → dotLottie** (`.lottie`) or **Lottie JSON** (`.json`).
3. Save it here as `cat-refresh.lottie` (or `cat-refresh.json` + update the path).

The cat only plays during an active refresh, which only runs while online, so a
runtime-fetched asset is fine for the offline-first PWA.
