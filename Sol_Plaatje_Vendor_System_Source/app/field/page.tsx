export default function FieldHelp() {
  return (
    <main className="field-moved">
      <p className="eyebrow">LED FIELD VISITS</p>
      <h1>Install the field visits app</h1>
      <p>Site visits, card scans and notices are recorded in the Android app, version 1.0.0. The office register stays on this website.</p>
      <h2>Setup</h2>
      <ul>
        <li>Install <span className="mono">Field_Officer_App/LED-Field-Visits.apk</span> from the project the LED office provides. The copy already on a phone does not gain file sharing until that app is rebuilt.</li>
        <li>Allow the camera permission for the card barcode, and location when a visit should store GPS.</li>
        <li>On first sign-in, enter the vendor register address. Use the address the office gave you, including <span className="mono">http://</span> or <span className="mono">https://</span>.</li>
        <li>A release build requires HTTPS. Local development accepts HTTP only for localhost, 127.0.0.1, the emulator address 10.0.2.2, and private network addresses.</li>
      </ul>
      <h2>If something does not work</h2>
      <ul>
        <li>Camera denied: the app can still take a typed vendor ID from the card.</li>
        <li>Location denied: the visit can still be saved. The GPS line stays empty.</li>
        <li>No connection: an unsaved visit stays on that phone for that vendor. It is sent when the register can be reached again. A failed sign-in check does not remove a saved session.</li>
        <li>Map link fails: the coordinates remain on the visit record in the office.</li>
        <li>A document or PDF that does not open needs a signed-in session. Use Download or share PDF, then the Android share sheet.</li>
      </ul>
      <a className="primary" href="/">Back to the vendor register</a>
    </main>
  );
}
