# WormTrace — Contribution endpoint

The "☁️ Contribute this photo to WormTrace" button in the Worm Counter tab uploads a
user's labeled training data to a **cloud endpoint you control**, so labels from many
people can be pooled into a stronger shared model. Training data from one person is
tiny; pooled across users it becomes useful.

This doc gives you two ready-to-deploy backends. Pick one, deploy it, copy its URL,
and paste it into the app under **Worm Counter → 🧠 In-app learning → ⚙ Model,
contribute & export → Contribution endpoint**. (You can also bake the URL into the
build by setting `DEFAULT_ENDPOINT` in `js/Contribute.js`.)

## What the app sends

A single `POST` with a JSON body (sent as `text/plain` to avoid a CORS preflight):

```jsonc
{
  "type": "wormtrace-contribution",
  "version": 1,
  "token": "wt_…",                       // shared anti-spam token (matches SHARED_TOKEN in the app)
  "appVersion": 149,
  "clientId": "wt_<random-uuid>",        // anonymous per-device id, for de-duping. No PII.
  "ts": "2026-06-05T05:16:44.000Z",
  "features": 5,
  "counts": { "l4": 12, "egg": 3, ... },  // tally of this photo
  "labels": [ { "x": 412, "y": 88, "cat": "l4" }, ... ],  // click positions (image px)
  "rows":   [ { "f": [relMajor, relArea, aspect, fill, darkness], "cat": "l4" }, ... ],
  "image":  { "name": "...", "width": 4032, "height": 3024, "dataUrl": "data:image/jpeg;base64,..." }
                                          // null unless the user opted in to send the photo
}
```

- `rows` is what the current k-NN model learns from — always present.
- `image` is only included if the user ticked the consent box. Photos can be large, so
  size your storage accordingly (or strip/ignore `image` server-side if you only want
  feature rows).

---

## Option A — Google Apps Script Web App (free, zero infrastructure)

Gives you a public HTTPS URL with no server to host.

### Simplest (recommended): standalone, saves to Drive only

No spreadsheet, nothing to bind — every contribution becomes a JSON file in one Drive
folder. This is the least fiddly path and matches the "agree once, auto-collect" flow.

1. Go to **script.google.com → New project**.
2. Delete `function myFunction(){}` and paste:

```javascript
// WormTrace contribution receiver (standalone). Saves each upload as a JSON
// file in a Drive folder. No spreadsheet binding required.
const FOLDER_NAME = 'WormTrace Contributions';
// Anti-spam: must match SHARED_TOKEN in js/Contribute.js. Set '' to disable the check.
const SECRET = 'wt_f2c9748cbc2b5afd1045aa3d';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type !== 'wormtrace-contribution') return json_({ ok: false, error: 'bad type' });
    if (SECRET && data.token !== SECRET) return json_({ ok: false, error: 'unauthorized' });

    const folder = getFolder_(FOLDER_NAME);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fname = `contrib_${(data.clientId || 'anon').slice(0, 16)}_${stamp}.json`;
    folder.createFile(fname, JSON.stringify(data), 'application/json');
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
function getFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Deploy & authorize.

> **Updating an existing deployment:** after editing the code, you must publish a new
> version — **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy**.
> The `/exec` URL stays the same. (Editing the code alone does NOT update the live
> endpoint.)
4. Copy the Web app URL (ends in `/exec`). Paste it into the app, or bake it into
   `DEFAULT_ENDPOINT` in `js/Contribute.js` so every user contributes automatically.

To pool later: download the folder, feed each file's `rows` into
`WormLearner.importMerge()` (or re-extract features from the saved `image`s), and ship
the result as `wormtrace-model.json`.

### Variant: also log a summary row to a Sheet

If you'd like an at-a-glance table, create the script **from a Sheet** (open a new
Google Sheet → **Extensions → Apps Script**, which auto-binds it) and use this instead:

```javascript
// WormTrace contribution receiver.
// Saves each upload as a JSON file in a Drive folder + a summary row in the Sheet.
const FOLDER_NAME = 'WormTrace Contributions';
const SECRET = 'wt_f2c9748cbc2b5afd1045aa3d';   // must match SHARED_TOKEN in the app ('' disables)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type !== 'wormtrace-contribution') {
      return json_({ ok: false, error: 'bad type' });
    }
    if (SECRET && data.token !== SECRET) return json_({ ok: false, error: 'unauthorized' });

    const folder = getFolder_(FOLDER_NAME);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fname = `contrib_${(data.clientId || 'anon').slice(0, 16)}_${stamp}.json`;
    folder.createFile(fname, JSON.stringify(data), 'application/json');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['received', 'clientId', 'appVersion', 'rows', 'labels', 'hasImage', 'file']);
    }
    sheet.appendRow([
      new Date(), data.clientId, data.appVersion,
      (data.rows || []).length, (data.labels || []).length,
      data.image ? 'yes' : 'no', fname,
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → Web app**. Set *Execute as* = **Me**, *Who has access*
   = **Anyone**. Deploy and authorize.
4. Copy the **Web app URL** (ends in `/exec`) and paste it into the app.

> Note: the app sends the body as `text/plain` precisely so Apps Script's `doPost`
> receives it without a CORS preflight (Apps Script can't answer preflights). The app
> treats any `2xx` as success.

To later pool everything into a model, download the JSON files from the Drive folder
and feed their `rows` into `WormLearner.importMerge()` (or re-extract features from the
saved `image`s), then ship the result as `wormtrace-model.json`.

---

## Option B — Cloudflare Worker + R2 (also free tier)

```javascript
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (req.method !== 'POST') return cors(new Response('POST only', { status: 405 }));

    const SECRET = 'wt_f2c9748cbc2b5afd1045aa3d';   // must match SHARED_TOKEN in the app
    const data = await req.json();
    if (data?.type !== 'wormtrace-contribution') {
      return cors(Response.json({ ok: false, error: 'bad type' }, { status: 400 }));
    }
    if (SECRET && data.token !== SECRET) {
      return cors(Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }));
    }
    const key = `contrib/${(data.clientId || 'anon').slice(0, 16)}/${Date.now()}.json`;
    await env.WORMTRACE.put(key, JSON.stringify(data));   // R2 bucket bound as WORMTRACE
    return cors(Response.json({ ok: true }));
  },
};

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}
```

Bind an R2 bucket named `WORMTRACE` in the Worker settings, deploy, and use the
Worker URL as the endpoint.

---

## Pooling contributions into an improved model

Once contributions pile up in your Drive folder, turn them into a fresh shipped model:

1. Download the **WormTrace Contributions** folder from Drive (right-click → Download —
   you get a zip; unzip it to a local folder).
2. Run the bundled merge script:
   ```bash
   node tools/build-model.mjs path/to/unzipped-folder wormtrace-model.json
   ```
   It merges every contribution's feature rows, migrates old labels, de-duplicates, and
   caps the row count — the same logic the in-app learner uses.
3. Review the printed summary (photos, rows, per-category counts), then commit the
   updated `wormtrace-model.json` and bump the asset version (`v=NNN`) to release it.

Re-extracting features from the raw photos (for a stronger model than the current
5-feature k-NN) is a separate, heavier step and isn't done by this script.

## Anti-spam token

The public `/exec` URL is in the client source, so anyone could POST to it. Each
contribution includes a shared `token` (`SHARED_TOKEN` in `js/Contribute.js`) and the
endpoint rejects anything that doesn't match its `SECRET`. This is **not** real security
(the token is readable in the source) — it just stops casual/bot spam. To rotate it,
change both `SHARED_TOKEN` and the endpoint's `SECRET` to a new value and redeploy both.

## Privacy notes

- No name or email is collected. `clientId` is a random UUID generated once per device
  purely for server-side de-duping.
- Photos leave the device **only** when the user explicitly opts in via the consent
  checkbox. Make sure your contribution UI / about page tells users where the data goes.
- If you only want anonymous feature numbers, ignore or drop the `image` field
  server-side — the `rows` alone keep the current model working.
