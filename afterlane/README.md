# Afterlane

An in-browser driving game for solo runs and multiplayer races. You start in a silver-and-blue BMW M4 Competition on a four-lane route with bends, traffic, and changing weather and daylight.

## Run

Install Node.js 20 or newer, then run these commands from the project directory.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in a WebGL 2 browser. Set the PORT environment variable to change the port. Keep the Node process running during play.

### Deploy and play on a phone

Create a [Render Web Service](https://render.com/docs/web-services) connected to this repository. Select the Node runtime and the `main` branch. Use `npm ci` as the build command and `npm start` as the start command. The server uses Render's `PORT` and accepts [WebSocket connections](https://render.com/docs/websocket) for multiplayer.

Open the deployed HTTPS address on your phone and rotate to landscape. In iPhone Safari use **Share → Add to Home Screen → Open as Web App**. In Android Chrome use **More → Install and create shortcut** when available, or **Add to Home screen**. Solo saves and model cache are stored in the browser for that game address.

## Solo play

Earn **1 point every 15 m** and **10 points** for a close overtake. A crash ends the current run and keeps the points earned in your wallet. The garage, equipped vehicle, settings, and solo run progress are saved in this browser. Reloading opens the saved drive paused at the last saved position. Cached car, plant, and hand models are stored on the device using Cache Storage or IndexedDB.

Open the top-right menu to access Multiplayer, Settings, Garage, and the camera controls.

All thirteen garage vehicles are free to equip. First-gear speed at redline is calculated from the engine limit, gear ratios, overall final reduction, and nominal tire diameter. Automatic mode can shift before redline.

The Mercedes-AMG G63 is followed by the T+RDSTR in the garage. The T+RDSTR is a single-speed EV with a quiet electric motor. It can fly in solo play. Press **F** to take off or land, hold **T** to climb and **G** to descend, and tap an arrow to roll while airborne. On a phone, use the flight buttons and the Arrows steering controller. A full charge gives about 24 seconds of powered flight. The car lands when it empties and recharges on the road in about 12 seconds.

| Vehicle | Top speed | 1st at redline | Gear reference |
| --- | ---: | ---: | --- |
| BMW M4 Competition | 290 km/h | 58 km/h | [BMW M Steptronic specifications](https://newsroom.bmwgroup.com/americas/the-new-2025-bmw-m4-coupe-and-m4-convertible/) |
| 1970 Dodge Challenger R/T | 215 km/h | 82 km/h | Estimated for the [440 four-speed](https://over-drive-magazine.com/wp-content/uploads/2024/04/1970-DODGE-Challenge-1-38.pdf) |
| Lamborghini Gallardo | 309 km/h | 97 km/h | Early 5.0 [Gallardo gear ratios](https://www.carmanualsonline.info/lamborghini-gallardo-2009-workshop-manual/2/?srch=gear+ratio) with estimated overall final reduction |
| Nissan Skyline R34 GT-R | 250 km/h | 73 km/h | [Nissan V-spec II specifications](https://global.nissannews.com/en/releases/skyline-and-skyline-gt-r-undergo-minor-model-change) |
| Porsche 911 GT3 RSR | 295 km/h | 103 km/h | [Porsche Motorsport standard race gearing](https://members.rennlist.com/jandreas/PA09_0001_GT3_RSR2009_Handbook_PMNA.pdf) |
| Generic SUV ZYX0 | 175 km/h | 47 km/h | Fictional vehicle with simulated gearing |
| Chevrolet Camaro | 250 km/h | 98 km/h | Estimated in-game gearing |
| Classic Mini | 138 km/h | 43 km/h | Estimated in-game gearing |
| Jaguar XJR-9 | 386 km/h | 121 km/h | [Jaguar heritage](https://www.jaguar.com/en-gb/jdx/about-jaguar/jaguar-icons.html) with estimated in-game gearing |
| LaFerrari Restyled Concept | 350 km/h | 109 km/h | Estimated in-game gearing |
| Lamborghini Centenario | 350 km/h | 108 km/h | [Lamborghini specifications](https://www.lamborghini.com/en-en/history/few-off/centenario) with estimated in-game gearing |

The accelerator and brake respond to your input. Traffic collisions still end a solo run. Vehicle top speed is set by the selected model. Settings include traffic density, steering sensitivity, weather, wiper mode, cabin light, transmission, driving side, phone steering, audio, and graphics. Droplets build up quickly at speed and the wipers temporarily clear the path of each blade. The moon appears on clear nights. The dashboard clock and driver's watch show local time.

The route starts in the city. Cedar Woods starts at 1.24 km, followed by a 216 m crossing at North Channel Bridge at 2.11 km. Four-way junctions repeat every 5 km. Red Basin Desert starts at 15 km and has pyramids, cacti, agave, and dry grasses. After roughly three minutes of moving through the desert, Frostwood opens ahead with snow, icy pavement, and lower grip.

Paired streetlights line both sides of city and village streets. Overhead lines follow the road between poles and occasionally cross above it. The route mixes worn asphalt, patched cracks, and concrete slabs with expansion joints. Look for the first concrete stretch about 144 m into the city and on the North Channel Bridge.

Dynamic weather rolls through night, dawn, daylight, and dusk with rain at intervals. Clear Day keeps the sun up and Clear keeps the night sky. Red Basin stays dry and Frostwood has snow. Traffic headlights and taillights streak on wet pavement, and nearby glare is reduced in cabin view.

Open **Garage** to browse cars in a 360-degree studio view. Drag the car view or use its arrow keys to orbit and tilt. **Hear engine** plays a short rev preview. **Equip** becomes available when the selected preview is ready. Downloaded models are cached when the browser supports Cache Storage.

Press **C** until you reach Chase view. Drag with the mouse or swipe with one finger to orbit 60° to either side of the rear view and change height. Scroll or pinch to zoom, and use **Recenter camera** to return behind the car. In exterior views, the wheels roll with distance traveled and the front wheels turn with steering. The body's suspension moves independently from the wheels.

Traffic includes two saloons, a crossover, a double-cab pickup, a hatchback, a box truck and a city bus. Traffic signals 1.6 seconds before changing lanes, then checks the target lane again before moving.

Engine sounds use separate profiles for the inline-six, flat-six, diesel four-cylinder, V8, and V10. Sports-car exhaust pops follow hard acceleration at high RPM, especially on an upshift or throttle lift. **Settings → Driver cigarette** enables the optional resting-hand animation and smoke in the cockpit.

| Action | Controls |
| --- | --- |
| Accelerate and foot brake | W/S or Up/Down |
| Handbrake | Hold Space or the Handbrake button |
| Steer | A/D or Left/Right |
| Change camera | C |
| Shift manually | Shift/Ctrl |
| Cycle headlights | H |
| Toggle cabin light | L |
| Toggle automatic wipers | R |
| Indicators | Q/E |
| Pause or resume | Esc |

Turn the phone sideways for the landscape controls. Drag the wheel to steer, or choose **Arrows** under **Settings → Controller customization → Steering controller** for hold-to-steer buttons. The right cluster contains Gas, Brake, Handbrake, Smoke, and the gear shifter. Tap the gear readout to switch between automatic and manual. In manual mode, drag the shift knob through the center of the H gate to another gear or tap a gear position. The pattern matches the selected car's gear count and has separate positions for neutral and reverse. Open `/?phone=1` for a desktop preview of the landscape layout.

## Multiplayer

From Multiplayer, enter a name, choose paint and race mode, and create a room. Share the room code with up to seven friends. Friends use **Join room**. The host starts the countdown. Distance Race ends at 5 km. Score Attack ranks drivers by points after 3 minutes. The room uses its own leaderboard, shared weather and traffic. A traffic collision respawns the driver after a short delay and deducts up to 25 race points.

For LAN play, friends open the host computer's LAN IP address and port in a browser, for example http://192.168.1.20:3000. For online play, run the Node server on a host with public HTTPS and WebSocket support, and share that URL and room code. Room state is held in process memory and clears on restart.

## Optional vehicle assets

The GitHub build uses built-in fallback meshes for the optional local models `challenger-rt-1970`, `driver-hand`, `ice-cream-truck`, `jaguar-xjr9`, `lamborghini-centenario`, `rsr`, `suv`, and `volkswagen-bus`. Place your copies in `client/models/`, then restart the server and reload the game.

The Camaro and Classic Mini exteriors were adapted for Afterlane from [Camaro by seppel](https://www.blendswap.com/blends/view/42834) and [classic mini by z0li](https://www.blendswap.com/blends/view/68426), under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The LaFerrari exterior was adapted from [La ferrari 2013 concept restyled by zenox3d](https://www.blendswap.com/blends/view/74782) under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Its adapted GLB is available under the same license. The adaptations include material conversion, mesh reduction, and separate wheel meshes.

The garage and nearby traffic use bundled binary glTF exteriors. Each garage car has its own synthesized engine profile and can use model-specific engine recordings. Use these base filenames.

| Car | Asset name |
| --- | --- |
| BMW M4 Competition | starter-m4 |
| 1970 Dodge Challenger R/T | challenger-rt-1970 |

The Challenger exterior was converted from the supplied Blender scene. It uses the game's existing cabin and a synthesized V8 engine sound.

The four cars from the later attachment batch are also free to equip in the garage. Their speeds are gameplay estimates.

| Vehicle | Asset name | Top speed |
| --- | --- | --- |
| Lamborghini Gallardo | gallardo | 309 km/h |
| Nissan Skyline R34 GT-R | skyline | 250 km/h |
| Porsche 911 GT3 RSR | rsr | 295 km/h |
| Generic SUV ZYX0 | suv | 175 km/h |
| Chevrolet Camaro | camaro | 250 km/h |
| Classic Mini | classic-mini | 138 km/h |
| Jaguar XJR-9 | jaguar-xjr9 | 386 km/h |
| LaFerrari Restyled Concept | laferrari-restyled | 350 km/h |
| Lamborghini Centenario | lamborghini-centenario | 350 km/h |

Traffic also includes the attached Volkswagen bus and ice cream truck. Their source models have baked wheels. The intact SUV was exported without its snow layer.

### Supplied model credits

- **Lamborghini Gallardo** by veti, Blend Swap asset 76352, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- **Nissan Skyline R34 GT-R** by [tikiteyboo](https://blendswap.com/blend/21982), Blend Swap download 92438, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- **Porsche GT3 RSR – cycles** by [Neubi](https://www.blendswap.com/blends/view/50162), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The supplied license marks the Porsche as noncommercial fan art. The converted Porsche GLB is shared under CC BY-SA 3.0 subject to the supplied fan-art notice.

The conversions select the vehicle geometry, reduce mesh complexity, align the models with the road, and split or label wheel assemblies for animation.

Place an exterior at `client/models/<asset>.glb` with Y up and the nose facing negative Z. Restart the server after adding or replacing an exterior. Place loop-ready WAV idle and loaded engine clips at `client/audio/<asset>-idle.wav` and `client/audio/<asset>-load.wav`. The loaded recording should be closest to 60% of redline. The game crossfades the two clips as the engine revs and uses synthesis for any layer without a clip. Reload the browser after adding files.

Solo and multiplayer traffic load `road-saloon.glb`, `executive-saloon.glb`, `compact-crossover.glb`, `double-cab-pickup.glb`, `traffic-truck.glb`, `traffic-bus.glb`, and `traffic-hatchback.glb` from the same directory. Traffic displays imported models nearby and uses simpler geometry in the distance. Export separate wheel nodes named `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, and `Wheel_RR` to retain wheel motion on a replacement model.

The unbranded models are CC0 assets from 3DAssets.dev. They were rotated to face the driving direction and their wheel nodes were renamed for the game. [Road Car Showroom Lineup](https://3dassets.dev/packs/road-car-showroom-lineup) · [Car Park and Road Vehicle Fleet](https://3dassets.dev/packs/car-park-and-road-vehicle-fleet) · [Bus Station and City Transit](https://3dassets.dev/packs/bus-station-and-city-transit)

### BMW model credit

The bundled BMW exterior is [BMW M4 Competition M Package](https://sketchfab.com/3d-models/bmw-m4-competition-m-package-5c0a2dafb1ad408d9fc9eeef9aee531b) by [SRT Performance](https://sketchfab.com/TheRealSRT), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Afterlane uses the [optimized derivative](https://github.com/lukaizj/car-mod-saas/blob/main/public/models/ATTRIBUTION.md), rotated to face the driving direction.

### Environment texture credits

Roadside trees and shrubs use geometry and textures from the [Shapespark Low Poly Plants Kit](https://github.com/shapespark/shapespark-assets). The game bundles twelve tree variants and two shrubs with a shared texture atlas and cutout foliage. Frostwood uses a snow-tinted version of the same foliage.

The driver hands use the supplied `Hand.blend` model, reshaped to meet the cabin wrists, mirrored for the second hand, and finished with a matte tan skin material.

The asphalt, concrete, and forest ground textures are CC0 assets from Poly Haven. [Asphalt Track](https://polyhaven.com/a/asphalt_track), [Concrete Floor 01](https://polyhaven.com/a/concrete_floor_01), and [Forest Ground 06](https://polyhaven.com/a/forest_ground_06).

## Implementation

- client/ contains the Three.js scene, input and transmission, traffic, effects, browser profile, and Socket.IO room client.
- server/ serves the game, manages lobbies, and publishes shared race state and validation corrections.
- The current visuals use procedural meshes and a procedural sky, approximate wet surfaces, and droplets drawn directly on the windshield and side windows.
