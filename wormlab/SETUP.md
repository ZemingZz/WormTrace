# WormLab — Genetics Course Edition

A focused, two-function classroom app derived from WormTrace:

1. **🧫 Plate Tracker** — students create plates, pick a worm strain, set temperature,
   start the inoculation timer, and log observations (stage, worm/egg counts, food %,
   notes, photos).
2. **🔢 Worm Counter** — upload a plate photo, auto-mark worms (uses the trained
   WormTrace model), hand-correct by tapping, and save the count onto a plate.

**One app, two roles** chosen at the login screen:

- **👩‍🎓 Student** — joins with a *class code* + *group/bench name* + *member names*.
  Only four strains are selectable: **N2 ♀ (hermaphrodite)**, **N2 ♂ (male)**,
  **dpy-11**, and **dpy-13**. Every other strain is shown but **🔒 locked** (read-only
  info). Students do **not** get the simulation.
- **👨‍🏫 Teacher** — passcode-gated. Sees **every group** in the class, their member
  names, and all their plates/observations **live**, and can open the **Growth
  Simulation** for any plate to compare the model against what students reported.

---

## 1. Try it right now (no setup)

Just open `index.html` (or serve the folder). With no Firebase config yet it runs in
**local-only mode**: everything works on one device, but student phones and the
teacher phone won't sync to each other. Good for a first look. The default teacher
passcode is **`teach`**.

## 2. Turn on cross-device sync (Firebase — free, ~5 min, once)

So the teacher's phone can see every student group:

1. Go to <https://console.firebase.google.com> → **Add project** (any name).
2. **Build → Firestore Database → Create database** → *Production mode* → pick a region.
3. **Build → Authentication → Get started** → enable **Anonymous**.
4. Gear ⚙ **Project settings → Your apps →** click **`</>`** (Web) → register an app →
   copy the `firebaseConfig` object.
5. Paste it into **`firebase-config.js`** (replace every `PASTE_ME`). Change
   `TEACHER_PASSCODE` to whatever you'll give staff.
6. In **Firestore → Rules**, paste the rules below and **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Any signed-in (anonymous) user in the class may read/write group docs.
    // Simple model suited to a classroom; tighten later if needed.
    match /classes/{classCode}/groups/{groupId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

That's it — reload the app. The login screen will show **☁ Cloud sync on**.

> A Firebase **web** config is not a secret; it's meant to ship in the page. Access is
> controlled by the rules above, not by hiding the config.

## 3. Run a class

- Pick a **class code** (e.g. `BIO101`) and tell students.
- Each group opens the app → **Student** → enters the class code, their group/bench
  name, and member names → tracks plates & counts worms.
- You open the app → **Teacher** → class code + passcode → watch all groups live and
  hit **▶ Simulate** on any plate.

Groups are keyed by name, so a group using two phones converges to one shared record.

---

## Files

| File | Purpose |
|---|---|
| `firebase-config.js` | **You edit this.** Firebase config + teacher passcode. |
| `js/strains.js` | Which strains students may select (`STUDENT_STRAIN_IDS`). |
| `js/app.js` | Login gate, plate tracker, counter, teacher dashboard + simulator. |
| `js/cloud.js` | Firebase ↔ local sync layer. |
| `js/LifeCycle.js` | Strain data (N2 ♀/♂, dpy-11, dpy-13 + locked strains). |
| `js/PlateCanvas.js`, `WormCounter.js`, `WormDetector.js`, `WormLearner.js`, `WormLabeler.js`, `Toast.js` | Reused WormTrace engine. |
| `wormtrace-model.json` | Trained worm-detection model (auto-loaded for auto-mark). |

The simulation is a teaching projection from the C. elegans life-cycle model
(strain-specific timing, reproduction, food depletion, adult lifespan).
