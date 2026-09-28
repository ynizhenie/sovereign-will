# Sovereign Will

Canvas strategy/survival game: settlers gather resources, build, craft weapons and hold off enemy waves. Plain HTML/JS, no framework or bundler; Android build via [Capacitor](https://capacitorjs.com/).

## Running it

```bash
npm start
```

Then open http://localhost:8080. Any static server for `www/` works too.

## Building the APK

Needs Node.js, JDK 21 and the Android SDK (easiest via Android Studio).

```bash
npm install
npm run android:build
```

The debug APK lands in `android/app/build/outputs/apk/debug/`. `npm run android:open` opens the project in Android Studio instead.


## Tests

```bash
npx playwright install chromium   # once
npm test
```

The tests in `tests/` run the real game in headless Chromium on fixed seeds and check that enemies and settlers don't get stuck (open maps, rock mazes, walls, tree rings), that maps are reproducible, and that big waves stay cheap to simulate. They run on every pull request.
