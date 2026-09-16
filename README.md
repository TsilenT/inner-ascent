# BOOGER: INNER ASCENT

You are a tiny, sentient glob of mucus with completely unreasonable ambitions. Climb an enormous, strangely beautiful nose and touch the legendary golden booger. The nose remembers.

A complete single-level Three.js / WebXR prototype. Everything you see and hear is generated locally: geometry, organic surface textures, characters, particles, interface art, ambience, and sticky sound effects. No asset downloads, accounts, API keys, paid assets, or runtime services.

## Run locally

Use **Node.js 22.12+** (or Node 24+) and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**, then choose **BEGIN THE ASCENT**. Click the game to capture the mouse if the browser asks. The field guide is available from the title and pause screens. Sound starts with your first interaction.

```sh
npm run build    # creates the self-contained static site in dist/
npm run preview  # previews that build at http://localhost:4173
```

The dev server binds to all interfaces for headset access. Dependencies need the internet only during installation; the built game has no external network dependencies. `python -m http.server` on the source directory is not sufficient: build first, then serve `dist/` if using another static server.

## Desktop controls

| Input | Action |
| --- | --- |
| Mouse | Look; click the game to capture the pointer. Drag to look also works if capture is unavailable. |
| WASD | Move. While stuck, W pulls you upward and the other keys reposition you. |
| Space | Assisted climb to the next nearby ledge; otherwise jump. Tap again after landing. |
| Left mouse or E | Hold to stick your left mucus hand to the surface you aim at. Nearby ledges have gentle aim assistance. |
| Right mouse | Independently hold your right hand. |
| Shift while gripping | Stretch away from your anchor; release the mouse button / E to slingshot toward it. |
| Q | Cast a short elastic mucus thread at a surface up to 8 meters away. Press again to detach. |
| R | Return to your last sanctuary. |
| Escape | Pause / release the mouse. Choose Keep Climbing to resume. |
| M | Toggle sound. |

Desktop assistance makes the entire route beatable with mouse and keyboard, including the moving ledges. It is intentionally faster than climbing each hold by hand; experienced players can finish in a few minutes. The manual VR route is designed around a roughly 5–10 minute first ascent, but that pacing still needs human headset playtesting.

## Meta Quest / WebXR

Open the game in the **Quest Browser**, then press **ENTER VR**. It uses Three.js's stereo WebXR renderer, tracked controllers, controller grips, and optional haptics. A world-rendered status panel shows altitude, breathing, warnings, hand state, instructions, and the ending inside the headset.

WebXR needs a **secure context**. Plain `http://192.168.…` on a LAN does not qualify. Two local options:

**USB, recommended for development:** Enable developer mode / USB debugging on the Quest, connect it to your computer, approve its debugging prompt, and use Android platform tools:

```sh
npm run dev
# In another terminal:
adb reverse tcp:5173 tcp:5173
```

Open **http://localhost:5173** in the Quest Browser. Localhost qualifies as a secure context. This requires the headset's developer setup but no game login or backend.

**Local HTTPS:**

```sh
npm run dev:https
```

Open **https://YOUR_COMPUTER_LAN_IP:5173** from a headset on the same Wi-Fi. The server generates a local development certificate. Accept the browser's certificate warning if supported; browser security policy may still reject immersive XR with an untrusted certificate. If so, use the USB method or serve `dist/` from a properly trusted HTTPS origin. Do not run both dev commands on port 5173 simultaneously.

| Quest input | Action |
| --- | --- |
| Grip on either controller | Reach or aim at a surface and squeeze. Pull your real hand downward to lift your body. Each hand attaches independently. |
| Keep pulling, then release | Slight mucus elasticity builds stretch; releasing enough stretch launches you toward the hold. |
| Trigger on either controller | Cast / detach the elastic mucus thread. |
| Left thumbstick | Smooth movement relative to your view. |
| Right thumbstick left/right | 30-degree snap turning. |
| Right A | Jump / assisted climb, also useful for seated play. |
| Right B | Return to the last sanctuary. |
| A or either trigger after winning | Restart inside VR. |

The sticky reach extends up to 3.4 meters to make the tiny creature's elastic hands forgiving. Tracked hand motion, not thumbstick motion, drives manual climbing. Room-scale play should stay within your headset's boundary. There is no artificial head bob or camera shake in VR; controller feedback accompanies the sneeze blast. Desktop adds a small environmental wobble during its warning.

Exiting VR returns to a paused desktop game. **Continue in VR** re-enters the same run on a compatible headset. The headset system menu is available normally.

## The ascent

One continuous, 96-meter vertical cavern contains 65 climbable ledges and six regions:

1. **Nostril Entrance** — warmer light, giant hairs, an introduction to adhesion, and one ominous visit from The Great Picker.
2. **The Hair Forest** — grab enormous swaying hairs and use their motion to swing between holds.
3. **The Drip** — a huge suspended drop, gently moving ledges, and periodically slick blue surfaces.
4. **The Wind Tunnel** — stronger breathing forces. Release on the inhale; hold on through the exhale.
5. **The Sinus Cavern** — an expanded chamber of luminous turquoise growths and quieter visual space.
6. **The Final Ascent** — combine your abilities and meet the crowned, glowing golden booger at 96 meters.

Touch the golden booger to win: synthesized music swell, golden particles, slow-motion particle drift, **YOU HAVE ASCENDED. THE NOSE REMEMBERS.**, run statistics, and restart. Best completion time is stored locally when browser storage is available. Checkpoints last for the current run, not across reloads.

Breathing runs on a readable 14-second inhale / pause / exhale / pause rhythm; every fifth cycle is a large breath. Air moves particles, hairs, loose strands, and airborne players. Wind is stronger in the Wind Tunnel. Directional breath audio is spatialized above the player. The first sneeze has a 52-second grace period, a 4.5-second warning, a short outward blast, and a long cooldown. Grip something and keep holding. Slick blue holds release after about 1.7 seconds when runny. Threads last 4.5 seconds, with a six-second cooldown from casting.

Glowing ringed sanctuary ledges save your progress about every 15 meters. Falling far enough automatically returns you to your most recent sanctuary; R / B does it immediately. There are no lives or irreversible fail states. Optional pollen rewards exploration and appears in your ending statistics.

## Verification

```sh
npm test
npx playwright install chromium
# On Linux, if the browser reports missing libraries:
npx playwright install-deps chromium
npm run test:browser
npm run build
```

The unit suite covers breathing, sneeze timing, route reachability, safe checkpoints, swept landing collisions, slickness, and bounded spring forces. Browser tests exercise actual keyboard input, grabs, slingshots, threads, pause / recovery, and a complete ascent through to the ending and restart. Screenshots are written to the ignored `artifacts/` directory. Browser tests use Chromium's software renderer when hardware acceleration is unavailable.

Physical Quest hardware is not available in this development environment. The XR input and rendering paths are implemented, but controller feel, comfort, framerate, and 5–10 minute pacing require a real-headset playtest. This prototype approximates elasticity and hair bending; it is not a general soft-body physics simulation.

## Implementation / performance

Vite + plain JavaScript + Three.js, without a framework or physics engine. `src/main.js` owns input, simulation, UI, and XR; `world.js` creates the procedural level; `physics.js` contains shared rules; `audio.js` synthesizes sound. Physics uses bounded substeps and swept vertical landings. Decoration uses instancing and merged geometry. Rendering avoids realtime shadows, transmission passes, postprocessing, and external model loaders; pixels are capped on desktop, with a reduced XR framebuffer scale and foveation where supported. Particle buffers are reused.

The development server exposes `window.__BOOGER__` for inspection and automated tests; production builds omit it. The existing GitHub Pages workflow now installs dependencies, checks the game rules, builds `dist/`, preserves `CNAME`, and uploads only the built site. No deployment is performed by local build commands.

Three.js WebXR integration follows the [official WebXRManager documentation](https://threejs.org/docs/pages/WebXRManager.html).
