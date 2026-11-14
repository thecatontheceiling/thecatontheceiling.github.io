// Screen melt, the loading screen effect from Doom! A button in the footer triggers it.
// I decided to leave a bunch of comments that explains some things because I think the effect is very fascinating.
//
// How it works:
// 1. The real page is hidden with CSS. The `data-melt` attribute on `<html>` turns this on.
// 2. The code makes a copy of the page and cuts it into thin vertical slices, like the columns in Doom.
// 3. Each slice shakes, then falls off the bottom of the screen after its own delay.
// 4. A bar at the bottom of the screen says "press any key".
// 5. On a key press or a click, a new copy of the page drops in from above. Then the real page returns.
//
// The copy of the page is large, and each vertical slice needs its own copy of it. 
// For this reason, each slice replaces most elements far from its strip with empty boxes of the same size. 
// The layout stays the same, and the browser has less to draw.

// The two elements that melt. Everything else in `body` stays in place, for example the background
// and the shared mouse cursors.
const ROOTS = ['#menubar', '#wrapper'];

// Doom's melt has 160 columns, so I just matched that.
const MAX_SLICES = 160;
// The time in milliseconds (ms) that one slice needs to fall below the screen.
const FALL_MS = 820;
// The extra start delay of the slice that is farthest from the click. A slice at half that distance
// waits half as long. This makes the melt spread out from the click like a wave (see `schedule`).
const WAVE_MS = 760;
// Each step of the random walk adds this delay to a slice (see `schedule`).
const WALK_MS = 28;
// The random walk has at most this many steps. Its largest delay is 14 * 28 = 392 ms.
const WALK_MAX = 14;
// Each slice also gets a random delay from 0 to this value. It makes the delays of neighbors differ a little.
const JITTER_MS = 20;
// Before a fall, each slice shakes from side to side for this long.
const SHUDDER_MS = 140;
// The shake changes position this often. 140 / 35 = 4 positions.
const SHUDDER_FLIP_MS = 35;
// Each shake position is this many CSS pixels to the left or to the right of the true position.
const SHUDDER_PX = 2;

const NAV_KEYS = new Set(['Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const BAR_TEXT = "It's all on the floor. Press any key to put it back.";

// Round a CSS length to a whole number of device pixels.
//
// A CSS pixel is the unit of CSS lengths. The device pixel ratio (`dpr`) is the number of device pixels
// in one CSS pixel.
//
// Example: with `dpr` 2, the length 10.3 is 20.6 device pixels. It rounds to 21, which is 10.5 CSS pixels.
//
// `snap` is for the position of a moving slice. `gridStep` is for the width of a slice.
const snap = (value, dpr) => Math.round(value * dpr) / dpr;

// Find the smallest width step for a slice, in CSS pixels. The step must be:
// 1. a multiple of 1/64 CSS pixel, and
// 2. a whole number of device pixels.
// Multiples of 1/64 are exact in floating point, so a product such as `i * stride` has no rounding error.
//
// Examples (device pixels = step * dpr):
//   dpr 1    gives a step of 1 px, which is 1 device pixel.
//   dpr 2    gives 0.5 px, which is 1 device pixel.
//   dpr 1.5  gives 2 px, which is 3 device pixels.
//   dpr 1.25 gives 4 px, which is 5 device pixels.
//
// The loop tries k = 1, 2, 3, ... and the step is k / 64. The gap of 1e-6 absorbs any floating point error.
// If no k up to 1024 works (for example dpr 1.33), the step is one device pixel, 1 / dpr.
function gridStep(dpr) {
  for (let k = 1; k <= 1024; k++) {
    const device = (k / 64) * dpr;
    if (Math.abs(device - Math.round(device)) < 1e-6) return k / 64;
  }
  return 1 / dpr;
}

// Measure the viewport and the text grid. This is called before the code clones the page.
// A hidden `span` with `width:1ch` and `height:1lh` gives the size of one text cell in the body font:
// `ch` is the width of one column and `lh` is the height of one row. My site uses a monospace font,
// so the text sits on a grid of these cells.
// `W` is the width of the viewport without the scrollbar. `H` is the height of the viewport.
// `scrollY` is how far the page scrolled. `dpr` is 1 if the browser reports no value.
function measure() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:1ch;height:1lh';
  document.body.append(probe);
  const box = probe.getBoundingClientRect();
  probe.remove();
  return {
    W: document.documentElement.clientWidth,
    H: window.innerHeight,
    scrollY: window.scrollY,
    dpr: window.devicePixelRatio || 1,
    ch: box.width,
    lh: box.height,
  };
}

const isFlex = (display) => display === 'flex' || display === 'grid' || display === 'inline-flex' || display === 'inline-grid';
const isBlock = (display) => display === 'block' || display === 'flow-root' || display === 'list-item' || display === 'flex' || display === 'grid';

// Page cloning
//
// Make a copy of each root in `ROOTS` and record facts about the layout of every element in the copy.
// `from` and `to` are lists of elements in the same order, so `to[i]` is the copy of `from[i]`. 
//
// In the loop, `a` is the original element and `b` is its copy. The code reads the style of `a` and changes `b`.
//
// Returns:
//   page    the `div` that holds the copies
//   info    a Map from each copy to its layout facts
//   sticky  pairs of [original, copy] for elements with `position: sticky`
function clonePage(trigger) {
  const page = document.createElement('div');
  page.className = 'melt-page';
  const info = new Map();
  const sticky = [];
  for (const selector of ROOTS) {
    const source = document.querySelector(selector);
    const copy = source.cloneNode(true);
    const from = [source, ...source.querySelectorAll('*')];
    const to = [copy, ...copy.querySelectorAll('*')];
    from.forEach((a, i) => {
      let b = to[i];
      // Scripts draw nothing, so the copy does not need it.
      if (a.localName === 'script') {
        b.remove();
        return;
      }
      // The stage ignores pointer events, so the pointer is never over the copy and the copy of the
      // button cannot get the hover style. `data-pressed` gives it the same look.
      if (a === trigger) b.setAttribute('data-pressed', '');
      if (a.localName.includes('-')) {
        // Custom element cloning.
        const plain = document.createElement('div');
        const own = getComputedStyle(a);
        plain.className = a.className;
        plain.style.cssText = `display:${own.display};max-width:${own.maxWidth}`;
        plain.append(...b.childNodes);
        b.replaceWith(plain);
        b = plain;
      } else if (a instanceof HTMLIFrameElement) {
        // The content of an iframe cannot be copied. Show an empty box with the same class instead.
        const hollow = document.createElement('div');
        hollow.className = `${a.className} melt-hollow`;
        b.replaceWith(hollow);
        b = hollow;
      } else if (a instanceof HTMLImageElement) {
        // Fix the copy to the size that the image has now, so the layout does not change while it loads.
        const box = a.getBoundingClientRect();
        b.style.width = `${box.width}px`;
        b.style.height = `${box.height}px`;
        // If the original finished loading, the copy must not wait. `eager` turns off lazy loading and
        // `sync` decodes the image in the same frame as the other content.
        if (a.complete) {
          b.loading = 'eager';
          b.decoding = 'sync';
        }
      }
      const style = getComputedStyle(a);
      if (style.animationName !== 'none') {
        // CSS animations always start at the beginning. 
        // This is a problem because the clone needs to copy the progress of the animation to not jarringly reset animations.
        //
        // `currentTime` counts from the start of the delay. So `currentTime - delay` is the time that the
        // animation already ran. A negative `animation-delay` of that size starts the copy that far in.
        //
        // Example: delay 200 ms and `currentTime` 500 ms. The animation ran 300 ms, so the copy gets -300ms.
        // Example: delay 200 ms and `currentTime` 100 ms. The animation still waits 100 ms, so the copy
        // gets 100ms.
        const running = a.getAnimations().filter((x) => x instanceof CSSAnimation);
        b.style.animationDelay = running.map((x) => `${-((Number(x.currentTime) || 0) - x.effect.getTiming().delay)}ms`).join(',');
      }
      // Layout facts for `survey` and `sliceCopy`. They decide which boxes can become empty boxes
      // (see `emptyBox`).
      //   item:     a flex item or grid item. Its size depends on its container and its siblings.
      //   out:      positioned `absolute` or `fixed`, so it is outside the normal flow.
      //   isolated: layout inside the box does not change layout outside it, except through the size of
      //             the box. These boxes are isolated: flex and grid containers, `flow-root`, items,
      //             out-of-flow boxes, `fieldset`, and boxes with `overflow` other than `visible` or
      //             `clip`. Margins of the children cannot pass out of such a box.
      //   sized:    the width of the box comes from its content, not from its parent, so `emptyBox`
      //             must fix the width.
      //   keep:     never empty this box. Baseline alignment and subgrids use the content of the box
      //             to place other boxes. An empty box has no text baseline and no content, and it
      //             moves them.
      const parentStyle = a.parentElement ? getComputedStyle(a.parentElement) : null;
      const parent = parentStyle ? parentStyle.display : '';
      const out = style.position === 'absolute' || style.position === 'fixed';
      const item = isFlex(parent) && !out;
      const clips = (axis) => axis !== 'visible' && axis !== 'clip';
      const subgrid = (s) => s && /subgrid/.test(s.gridTemplateColumns + s.gridTemplateRows);
      const baseline = item && (/baseline/.test(parentStyle.alignItems) || /baseline/.test(style.alignSelf));
      // `survey` pins the copies of sticky elements (i.e. sticky sidebars) to the position of the originals.
      if (style.position === 'sticky') sticky.push([a, b]);
      info.set(b, {
        display: style.display,
        isolated: isFlex(style.display) || style.display === 'flow-root' || item || out || a.localName === 'fieldset' || clips(style.overflowX) || clips(style.overflowY),
        sized: item || out,
        keep: baseline || subgrid(style) || subgrid(parentStyle),
      });
    });
    page.append(copy);
  }
  return { page, info, sticky };
}

// Measure the copy and decide which boxes can become empty boxes.
function survey(info, sticky) {
  // A sticky element sits at an offset that depends on the scroll position. The copy cannot show that
  // offset, because the code moves the copy with `top: -scrollY` and does not scroll it. 
  // To deal with this we need to pin each copy at the position of its original.
  // Step 1: make every copy `relative` with `top: 0`. This puts each copy at its normal position.
  for (const [, b] of sticky) {
    b.style.position = 'relative';
    b.style.top = '0px';
  }
  // Step 2: set `top` to the distance from the copy to its original. The loop goes in document order,
  // so a sticky copy inside another sticky copy is measured after the outer copy moved.
  // Example: the original is stuck to the top of the viewport at y = 0, and the copy is at y = 480.
  // Then `top` is 0 - 480 = -480px.
  for (const [a, b] of sticky) {
    b.style.top = `${a.getBoundingClientRect().top - b.getBoundingClientRect().top}px`;
  }

  // Save the box of every copy. The values are in viewport coordinates, because the copy of the page
  // is shifted up by `scrollY`. They match what the user saw while they clicked.
  for (const [b, meta] of info) meta.box = b.getBoundingClientRect();
  // A box is `emptiable` when `sliceCopy` can replace it with an empty box without a change in the
  // layout around it. The box must not be `keep`, and it must be block-level. In addition, one of
  // these must be true:
  //   - The box is isolated.
  //   - All its child elements are inline or `display: none`. The regex matches `inline`,
  //     `inline-block`, `inline-flex`, `inline-grid`, and `none`. Text nodes do not count.
  // Example: a `<p>` that holds only text and links is emptiable. A `<div>` that holds two `<p>` is
  // not emptiable (unless it is isolated), because the margins of the `<p>` elements can pass through
  // the `<div>`. An empty `<div>` loses these margins, and the boxes after it move. The two `<p>`
  // elements are emptiable.
  for (const [b, meta] of info) {
    const inlineOnly = [...b.children].every((child) => /^(inline|none)/.test(info.get(child).display));
    meta.emptiable = !meta.keep && isBlock(meta.display) && (meta.isolated || inlineOnly);
  }
}

// Make an empty copy of a box: the same element with the same attributes, and no children.
// The height is fixed to the measured height, so the empty box takes the same space as the contentful box.
// `min-height` and `max-height` get the same value, so no other rule can change the height.
// The width should be fixed only for `sized` boxes. Other blocks fill the width of their parent.
//
// Example: a paragraph that is 200 px high and far below the screen becomes the same `<p>` with no
// text and `height: 200px`.
function emptyBox(node, meta) {
  const copy = node.cloneNode(false);
  const style = copy.style;
  style.height = style.minHeight = style.maxHeight = `${meta.box.height}px`;
  if (meta.sized) style.width = style.minWidth = style.maxWidth = `${meta.box.width}px`;
  return copy;
}

// Copy the tree of the page for one slice. `win` is the part of the page that the slice can show:
// `l`, `r`, `t`, and `b` are the left, right, top, and bottom edges in viewport coordinates.
// The code handles each child in one of three ways:
//   - The child has no entry in `info`. Copy it.
//   - The child is `emptiable` and completely outside `win`. Nothing in it can show in the slice, so
//     replace it with an empty box.
//   - Otherwise, copy the child and go through its children.
//
// Example: the slice is at x = 800 to 808, `ch` is 8, and so `win.l` is 800 - 48 = 752. A sidebar that
// ends at x = 200 is outside `win`, so the slice gets an empty box for it.
function sliceCopy(node, info, win) {
  const copy = node.cloneNode(false);
  for (const child of node.childNodes) {
    const meta = info.get(child);
    if (!meta) copy.append(child.cloneNode(false));
    else if (meta.emptiable && (meta.box.right < win.l || meta.box.left > win.r || meta.box.bottom < win.t || meta.box.top > win.b)) copy.append(emptyBox(child, meta));
    else copy.append(sliceCopy(child, info, win));
  }
  return copy;
}

// The "stage": a layer that covers the viewport and holds one `div` for each slice.
function buildStage(view, trigger) {
  const { W, H, scrollY, ch, lh, dpr } = view;
  const step = gridStep(dpr);
  // `cells` is how many text cells wide each slice is. `W / ch` is the number of cells across the
  // screen. Dividing by `MAX_SLICES` gives the cells for each slice, and `ceil` makes sure that there
  // are at most `MAX_SLICES` slices.
  //
  // Example: W = 1280 and ch = 8 give 160 cells across. So `cells` is 1.
  // Example: W = 1920 and ch = 9.6 give 200 cells across. 200 / 160 = 1.25, so `cells` is 2.
  const cells = Math.ceil(W / (ch * MAX_SLICES));
  // `stride` is the slice width: `cells` cells, rounded to a whole number of steps (at least one step).
  //
  // For example, dpr 1.5 gives `step` 2. Two cells of 9.6 px are 19.2 px, which is 9.6 steps. This rounds
  // to 10 steps, so `stride` is 20 px.
  const stride = Math.max(1, Math.round((cells * ch) / step)) * step;
  // `count` is the number of slices. `W / stride` is usually not a whole number. The code rounds it,
  // and the last slice takes the rest of the width (see the loop below). So the last slice can be
  // narrower or wider than `stride`.
  // Example: W = 1005 and `stride` 8 give 125.6, so 126 slices. The last slice is 1005 - 125 * 8 = 5 px wide.
  // Example: W = 1001 gives 125.1, so 125 slices. The last slice is 1001 - 124 * 8 = 9 px wide.
  const count = Math.max(1, Math.round(W / stride));

  const addSlice = (left, width) => {
    const slice = document.createElement('div');
    slice.className = 'melt-slice';
    slice.style.cssText = `left:${left}px;width:${width}px`;
    stage.append(slice);
    return slice;
  };

  const stage = document.createElement('div');
  stage.className = 'melt-stage';
  // The stage is basically only a picture. `aria-hidden` makes screen readers skip it, and `inert` stops focus
  // and clicks.
  stage.setAttribute('aria-hidden', 'true');
  stage.setAttribute('inert', '');
  // Keep the stage invisible while the code builds it, so the user doesn't see any weirdness.
  stage.style.cssText = `width:${W}px;height:${H}px;visibility:hidden`;
  const { page, info, sticky } = clonePage(trigger);
  // Shift the copy up by the scroll position.
  page.style.cssText = `top:${-scrollY}px;width:${W}px`;
  // Put the whole copy on the stage in one piece. `survey` needs it at the full width to measure it.
  // Remove it after that, because each slice gets its own copy already.
  const whole = addSlice(0, W);
  whole.append(page);
  document.body.append(stage);
  survey(info, sticky);
  whole.remove();

  // The following code keeps a little extra page content around the slices.
  // This is necessary because boxes will get emptied if they are not directly inside the slice but are just outside, poking in a little.
  const reachX = ch * 6;
  const reachY = lh * 3;
  const slices = [];
  for (let i = 0; i < count; i++) {
    const left = i * stride;
    // The last slice can just take the rest of the width.
    const width = i === count - 1 ? W - left : stride;
    const copy = sliceCopy(page, info, { l: left - reachX, r: left + width + reachX, t: -reachY, b: H + reachY });
    // Move the copy left by the left edge of the slice, so the slice shows the correct strip.
    copy.style.left = `${-left}px`;
    const slice = addSlice(left, width);
    slice.append(copy);
    slices.push(slice);
  }
  // Show the stage.
  stage.style.visibility = '';
  return { stage, slices, stride };
}

// Stagger effect.
// Give each slice a start delay and a shake direction. The delay in ms has four parts:
//
//   delay = shudder + wave * WAVE_MS + walk * WALK_MS + random(0 to JITTER_MS)
//
// shudder: SHUDDER_MS for a fall, because the slice shakes first (see `play`). 0 for a rise.
// wave:    how far the slice is from the click, from 0 to 1. Slices near the click start first, so
//          the melt spreads out to both sides.
//          Example: W = 1000 and the click is at x = 300. `reach` is 700, the distance to the farther
//          side of the screen. A slice at x = 300 has wave 0 and no extra delay. A slice at x = 650
//          has 350 / 700 = 0.5 and waits 0.5 * 760 = 380 ms. A slice at x = 1000 has wave 1 and
//          waits 760 ms.
// walk:    a random walk. For each slice in order, it goes up by 1, goes down by 1, or stays the same.
//          It always stays from 0 to 14. Neighbors get nearly the same value, so the edge of the melt
//          is ragged but not noisy. Doom moves its columns in the same way.
//          Example: 0, 1, 1, 2, 1, 0, 0, 1 ... Each value times 28 ms is the extra delay.
// jitter:  a small random delay. It makes the delays of neighbors differ a little.
//
// The latest possible start is 140 + 760 + 14 * 28 + 20 = 1312 ms. That slice falls for 820 ms more,
// so the whole melt lasts 2132 ms at most.
function schedule(slices, stride, originX, W, rise) {
  // The distance from the click to the farther side of the screen. The 1 avoids a division by zero.
  const reach = Math.max(originX, W - originX, 1);
  let walk = 0;
  return slices.map((el, i) => {
    // Change the walk by -1, 0, or 1 (`Math.floor(Math.random() * 3) - 1`). Keep it from 0 to WALK_MAX.
    walk = Math.min(WALK_MAX, Math.max(0, walk + Math.floor(Math.random() * 3) - 1));
    // The distance from the click to the center of the slice, `(i + 0.5) * stride`, as a fraction of `reach`.
    const wave = Math.abs((i + 0.5) * stride - originX) / reach;
    // `sign` is -1 or 1 and sets the shake direction. Neighbors shake in opposite directions.
    // The other fields are the state of the slice for `play`: `pose` is the last `transform` that
    // the code wrote, `live` is true after the slice started, and `done` is true after it finished.
    return {
      el,
      delay: (rise ? 0 : SHUDDER_MS) + wave * WAVE_MS + walk * WALK_MS + Math.random() * JITTER_MS,
      sign: i & 1 ? 1 : -1,
      pose: '',
      live: false,
      done: false,
    };
  });
}

// Run the animation with a `requestAnimationFrame` loop. The promise resolves when all slices
// finished.
//
// The normal `element.animate()` was way too slow with this many slices. This loop is several orders of magnitude
// faster. It writes one `transform` for each slice in each frame, and only if the value changed.
//
// `t` is the time in ms since the slice started to fall. It is `elapsed - delay`.
//   t < 0               the slice waits. In a fall, the last SHUDDER_MS before t = 0 are the shudder.
//   0 <= t < FALL_MS    the slice moves.
//   t >= FALL_MS        the slice finished.
//
// A fall moves a slice down from its place to below the screen: y = rowsAt(t) * lh.
// A rise moves a slice down from one screen above its place to its place: y = (rowsAt(t) - rows) * lh.
function play(plan, view, rise, hurried) {
  // `rows` is the number of text rows that a slice must move to leave the screen. The extra row is a
  // margin for rounding.
  // Example: H = 800 and lh = 20 give 40 rows, plus 1 makes 41.
  const rows = Math.ceil(view.H / view.lh) + 1;
  // The time when the last slice finishes: the largest delay plus the fall time.
  const end = plan.reduce((latest, p) => Math.max(latest, p.delay), 0) + FALL_MS;
  // The number of rows that a slice fell at time `t`. The distance grows with the square of the time,
  // so the slice speeds up like a falling object. In the first half of the fall, the slice covers one
  // quarter of the distance. `Math.floor` makes the slice move in whole rows (like a terminal :eyes:).
  // Example with 41 rows and a fall of 820 ms:
  //   t = 205 ms: (205 / 820)^2 * 41 = 2.56, so 2 rows
  //   t = 410 ms: (410 / 820)^2 * 41 = 10.25, so 10 rows
  //   t = 615 ms: (615 / 820)^2 * 41 = 23.06, so 23 rows
  //   t = 820 ms: 41 rows
  //
  // The first two inequality cases are to make the values exact at both ends.
  // t <= 0 gives 0, and t >= FALL_MS gives `rows`.
  const rowsAt = (t) => (t <= 0 ? 0 : t >= FALL_MS ? rows : Math.floor((t / FALL_MS) ** 2 * rows));

  // In a rise, hide each slice until its start time. Without this, a slice shows its part of the page
  // at y = 0 before it starts to drop in.
  if (rise) for (const p of plan) p.el.style.display = 'none';

  // Move every slice to its position for the time `elapsed` (ms since the first frame).
  const apply = (elapsed) => {
    for (const p of plan) {
      if (p.done) continue;
      const t = elapsed - p.delay;
      // The slice has not started.
      if (t < (rise ? 0 : -SHUDDER_MS)) continue;
      
      if (!p.live) {
        p.live = true;
        p.el.style.display = '';
        p.el.style.willChange = 'transform';
      }
      // `x` is the sideways shake and `y` is the fall. `snap` puts both on whole device pixels.
      let x = 0;
      let y;
      if (rise) {
        y = snap((rowsAt(t) - rows) * view.lh, view.dpr);
      } else {
        // Shudder (t < 0): the slice jumps between two sideways positions. `(t + SHUDDER_MS) / SHUDDER_FLIP_MS`
        // is the number of 35 ms steps since the shudder began: 0, 1, 2, 3. An even step gives -1 and an
        // odd step gives +1. `sign` (-1 or 1) makes neighbors move in opposite directions.
        //
        // Example for a slice with `sign` 1: x = -2 px for t from -140 to -106, +2 px for -105 to -71,
        // -2 px for -70 to -36, and +2 px for -35 to -1.
        if (t < 0) x = snap((Math.floor((t + SHUDDER_MS) / SHUDDER_FLIP_MS) & 1 ? 1 : -1) * p.sign * SHUDDER_PX, view.dpr);
        y = snap(rowsAt(t) * view.lh, view.dpr);
      }
      // Hide slices under the screen once they're finished.
      if (t >= FALL_MS) {
        p.done = true;
        if (rise) p.el.style.willChange = '';
        else p.el.style.display = 'none';
      }

      // Write `transform` only when the text changed. 
      // Many frames will give the same value because rows are whole numbers.
      const pose = `translate3d(${x}px,${y}px,0)`;
      if (pose !== p.pose) {
        p.pose = pose;
        p.el.style.transform = pose;
      }
    }
  };

  return new Promise((resolve) => {
    let t0 = -1;
    const frame = (now) => {
      // `hurried()` is true after a skip was requested by the user (see `wake`). Stop at once.
      if (hurried()) return resolve();
      // Time 0 is the first frame.
      if (t0 < 0) t0 = now;
      const elapsed = now - t0;
      // Apply the positions for this frame before the end test, so the last frame draws the final positions.
      apply(elapsed);
      if (elapsed >= end) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// Set up the melt.
//
// `phase` holds the state:
//   idle     the page is normal.
//   falling  the slices fall. The user clicked the button.
//   gone     the page is off the screen and the bottom bar shows.
//   rising   the new copy of the page drops in.
//
// While `html.dataset.melt` is set, CSS hides the real page.
//
// In `falling` and `rising`, a key press, a click, or a resize sets `hurry`.
// `hurry` here means that the animation was requested to be skipped.
export function initMelt() {
  const item = document.querySelector('[data-melt-item]');
  const trigger = item?.querySelector('button');
  if (!trigger || !ROOTS.every((selector) => document.querySelector(selector))) return;

  const html = document.documentElement;
  // If the browser is asking for reduced motion, skip the animation.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let phase = 'idle';
  // The x position (in viewport CSS pixels) where the wave starts.
  let origin = 0;
  // True when `play` must stop at the next frame. `run` sets it to false before each animation.
  let hurry = false;
  // The "press any key" bar.
  let bar = null;

  // Play one animation.
  async function run(rise) {
    const view = measure();
    const { stage, slices, stride } = buildStage(view, trigger);
    const plan = schedule(slices, stride, origin, view.W, rise);
    // Hide the real page with CSS.
    html.dataset.melt = rise ? 'rising' : 'falling';
    // Clear old skip request.
    hurry = false;
    try {
      await play(plan, view, rise, () => hurry);
    } finally {
      // After a rise, show the real page and remove the stage. The slices end at y = 0, so they look the
      // same as the real page and the user should see no jumps. 
      
      // After a fall, `fall` sets `data-melt` to `gone`, and the real page stays hidden.
      if (rise) delete html.dataset.melt;
      stage.remove();
    }
  }

  // Handler for catching events that should skip the animation.
  function wake(event) {
    if (phase === 'idle') return;
    if (event.type === 'scroll') {
      // The fall ignores scrolls. The user cannot see the real page, and the copy shows a fixed picture, so it's not an issue.
      // However, a rise must end on the real page as it is currently, but the copy would have been built for the old scroll
      // position. Just skip to the end.
      if (phase === 'rising') hurry = true;
      return;
    }
    if (event.type === 'resize') {
      // The copy has the old width. In `falling` and `rising`, skip to the end.
      if (phase !== 'gone') hurry = true;
      return;
    }
    // `x` is where the wave starts. A key press has no position, so it reuses the old one.
    let x = origin;
    if (event.type === 'keydown') {
      // Ignore keys we shouldn't interfere with.
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      // Ignore keys like Shift or F5.
      if (event.key.length !== 1 && !NAV_KEYS.has(event.key)) return;
      // Stop the normal action of the key. For example, stops Space from scrolling the page.
      event.preventDefault();
    } else {
      // Left mouse button.
      if (event.button !== 0) return;
      x = event.clientX;
    }
    // From `gone`, start the rise. In `falling` or `rising`, skip to the end.
    if (phase === 'gone') rise(x);
    else hurry = true;
  }

  // Go back to `idle` and show the real page.
  function settle() {
    phase = 'idle';
    delete html.dataset.melt;
  }

  // Start the fall. `x` is the position where the wave starts.
  async function fall(x) {
    phase = 'falling';
    origin = x;
    try {
      if (!reduce.matches) await run(false);
    } catch (error) {
      // The animation failed for some reason. Show the real page again.
      console.error(error);
      settle();
      return;
    }
    // The page is mow off the screen. It stays hidden until the rise.
    phase = 'gone';
    html.dataset.melt = 'gone';
    // The first fall creates the bar and later falls can reuse it.
    if (!bar) {
      bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'melt-bar';
      bar.textContent = BAR_TEXT;
      // `wake` already starts the rise on `pointerdown`, before this click event arrives. The `phase`
      // test stops a second rise.
      bar.addEventListener('click', () => {
        if (phase === 'gone') rise(origin);
      });
      document.body.append(bar);
    }
    // Show the bar and move focus to it.
    bar.hidden = false;
    bar.focus({ preventScroll: true });
  }

  // Start the rise. The real page is still hidden. A new copy of the page drops in from above, and
  // then the real page replaces it.
  async function rise(x) {
    phase = 'rising';
    origin = x;
    bar.hidden = true;
    try {
      if (!reduce.matches) await run(true);
    } catch (error) {
      console.error(error);
    }
    // Show the real page again.
    // Also after an error.
    // Then return focus to the button that started the melt.
    settle();
    trigger.focus({ preventScroll: true });
  }

  // The button is hidden in the HTML. Show it only now, so a page without JavaScript has no dead button.
  item.hidden = false;
  trigger.addEventListener('click', (event) => {
    if (phase !== 'idle') return;
    // Where does the wave start? 
    //
    // A mouse click has `detail` of 1 or more and a real `clientX`, so that gives us the click position.
    // A keyboard activation (i.e. Enter or Space-ing the button) has `detail` 0 and no real pointer
    // position. Use the center of the button instead.
    const box = trigger.getBoundingClientRect();
    fall(event.detail > 0 ? event.clientX : box.left + box.width / 2);
  });

  window.addEventListener('keydown', wake, true);
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('scroll', wake);
  window.addEventListener('resize', wake);
}
