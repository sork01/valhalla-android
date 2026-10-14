# Valhalla Rumble – Android client

Android WebView shell for the [Valhallasc](https://github.com/sork01/Valhallasc-AI) browser game (public server: https://gunning.se/Valhallasc/), with a touch overlay and gamepad support tuned for the AYN Odin 3. Controller input is read from Android events and injected as the keyboard/pointer events the game already handles, so no game or server changes are needed.

Status: builds; not yet verified on a physical Odin 3.

## Build / install
    cd android
    export JAVA_HOME=/path/to/jdk17 ANDROID_HOME=/path/to/android-sdk   # platform 34 + build-tools 34.0.0
    ./gradlew assembleDebug            # -> app/build/outputs/apk/debug/app-debug.apk
    adb install -r app/build/outputs/apk/debug/app-debug.apk
Use `-PserverUrl=http://host:port/` to target a local server. Debug builds allow `chrome://inspect` debugging of the WebView.

## Touch
Left joystick = walk (WASD). Right: big Attack (hold to keep swinging), Talk (F), Step (Shift, assassin), HP/Food/MP potions.
Side column: Menu (Esc), Quests, Chat, Ride. Tap the world to move/target as in the browser; the game's own
skill bar and HUD buttons are tappable. ◉ hides the overlay. Android Back = Esc.

## Controller (standard Android gamepad)
| Input | Action |
|---|---|
| Left stick | Move |
| A | Attack (hold = repeat) |
| B / X / Y | Menu·close / Talk (F) / Ride (H) |
| LB + A/B/X/Y | Skill slots 1–4 |
| RB + A/B/X/Y | Skill slots 5–8 |
| LT | Shift (assassin step) |
| Right stick + RT | Mouse cursor + click (click-to-target, menus, inventory, drag-to-walk when held) |
| D-pad ↑ ← → ↓ | HP potion, Food, Mana potion, Quests |
| Select / Start / L3 / R3 | Map / Character / Skills / Bags |
