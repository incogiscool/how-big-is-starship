# How big is Starship?

A web app that opens your phone's camera and draws SpaceX's Starship (V3, full stack) on top of it at its real size: 124.4 m tall, 9 m wide.

## How it works

- The camera feed is the page background.
- A three.js scene is drawn on top, with the rocket modelled in code at real dimensions in metres.
- The phone's orientation sensors turn the virtual camera, so the rocket stays put in the world as you look around.
- The rocket stands on the ground at a distance you choose (30 m to 2 km, 200 m by default).

There is no build step and nothing is uploaded; it is plain static files.

## Controls

| Action | What it does |
|---|---|
| Drag | Slide the rocket left or right around you |
| Pinch / distance slider | Move it closer or farther |
| Twist with two fingers | Turn the rocket |
| Put it here | Stand it straight ahead of where you are pointing |
| Compare | Add the Statue of Liberty, Big Ben, Saturn V or Falcon 9 beside it |
| Options | Set which floor you are on, hide the ruler/person/bus, fine-tune size |
| Shutter | Save or share a photo |

Without a camera or motion sensors (for example on a laptop) it shows a simulated field and you drag to look around.

## Run it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Phones only allow camera access over HTTPS, so to try it on a phone, host it (below).

## Host it

Any static host works. With GitHub Pages: repository Settings → Pages → Deploy from a branch → pick the branch and `/ (root)`.

## Limits

- Real objects never hide the rocket: it is always drawn on top of the camera image.
- Sideways drift builds up slowly in the phone's sensors; tap "Put it here" to reset.
- Scale assumes a typical phone main camera (about 66° along the long side). "Fine-tune size" corrects for others.

## Files

- `index.html`, `css/style.css`: page and controls
- `js/main.js`: camera, sensors, gestures, render loop
- `js/starship.js`: the rocket model
- `js/scenery.js`: ruler, person, bus, comparison objects, no-camera world
- `vendor/three.module.min.js`: three.js r170 (MIT)
