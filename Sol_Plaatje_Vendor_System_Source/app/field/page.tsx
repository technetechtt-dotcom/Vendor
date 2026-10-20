import Link from 'next/link';
import {FIELD_APP_ASSET_PATH, FIELD_APP_FILE, FIELD_APP_VERSION} from '../../lib/field-app';

export default function FieldHelp() {
  return (
    <main className="field-moved">
      <p className="eyebrow">LED FIELD VISITS</p>
      <h1>Install the field visits app</h1>
      <p>Site visits, card scans and notices are recorded in the Android app, version {FIELD_APP_VERSION}. The office register stays on this website.</p>
      <p><a className="primary" href={FIELD_APP_ASSET_PATH} download>Download {FIELD_APP_FILE}</a></p>
      <p className="hint">Use only a package approved and signed by the LED office. Ask your administrator if installation is blocked or the download is unavailable.</p>
      <h2>Setup</h2>
      <ul>
        <li>Install the versioned APK from the download link above, or the copy the LED office provides.</li>
        <li>Allow the camera permission for the card barcode, and location when a visit should store GPS.</li>
        <li>On first sign-in, enter the vendor register address. Use the address the office gave you, including <span className="mono">http://</span> or <span className="mono">https://</span>.</li>
        <li>A release build requires HTTPS. Local development accepts HTTP only for localhost, 127.0.0.1, the emulator address 10.0.2.2, and private network addresses.</li>
      </ul>
      <h2>Phone data</h2>
      <ul>
        <li>Draft visits, the send queue, cached vendor profiles and GPS findings stay on that phone in local storage for the signed-in official and register address.</li>
        <li>They are not the municipal register. Keep the phone locked.</li>
        <li>If a phone is lost, sign out its session from the office Sessions workspace and ask your device administrator to lock or erase that phone. Clearing a replacement phone does not erase the lost phone.</li>
        <li>Rejected visits stay until a corrected submission succeeds or an official dismisses them. Offline recovery remains available to review history even when nothing is waiting.</li>
      </ul>
      <h2>If something does not work</h2>
      <ul>
        <li>Camera denied: the app can still take a typed vendor ID from the card.</li>
        <li>Location denied: the visit can still be saved. The GPS line stays empty.</li>
        <li>No connection: an unsaved visit stays on that phone. Temporary server errors stay waiting for retry. A failed sign-in check does not remove a saved session.</li>
        <li>Map link fails: the coordinates remain on the visit record in the office.</li>
        <li>A document or PDF that does not open needs a signed-in session. Use Download or share PDF, then the Android share sheet.</li>
      </ul>
      <Link className="primary" href="/">Back to the vendor register</Link>
    </main>
  );
}
