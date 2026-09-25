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

